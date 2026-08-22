import type { ContentEntry } from "../content/types";
import type { PersonalizationFilter } from "../intake/schema";
import { getGenAIClient } from "../gemini/client";
import { checkEntityDiff, checkReadingLevel, checkTtsSafety } from "./guardrail";
import { cleanForSpeechAndDisplay } from "./narration";

// Narration Rewriter (#3c) — takes all selected entries together and
// produces one continuous, natural-sounding narration script. GUARDRAIL:
// output is validated to cover exactly the given entries (same ids, same
// order) and to introduce no fact/number/name absent from the source union
// (see guardrail.ts). Retries once on failure; throws on a second failure —
// callers (the API route) must turn that into a 404, never a silent
// fallback to unrewritten content, per the design doc.

const MODEL = "gemini-2.5-flash";

// Content-framing tone — distinct from tts.ts's VOICE_TONE_STYLES, which
// only affects vocal delivery. Both are applied; this one changes the
// actual wording.
const VOICE_TONE_GUIDANCE: Record<string, string> = {
  neutral: "Plain, direct, matter-of-fact language. State things clearly without emotional framing either way.",
  friendly: "Warm, conversational, second-person (\"you'll notice...\", \"you might feel...\"). Talk like a friend explaining calmly, not a pamphlet.",
  hopeful: "Forward-looking language that emphasizes recovery and support without minimizing what's happening — frame side effects alongside how they're manageable.",
};

const EDUCATION_LEVEL_GUIDANCE: Record<string, string> = {
  basic: "Short sentences, everyday words. If a medical term is unavoidable, explain it in plain words right after.",
  some_college: "Clear, everyday language. Common medical terms are fine without over-explaining them.",
  advanced: "Standard clinical terminology is fine where it's the natural word choice.",
};

export interface RewrittenChunk {
  entryId: string;
  text: string;
}

export interface RewriteResult {
  chunks: RewrittenChunk[];
  script: string;
}

// Phase 2a goal 1: per-entry length budgets so the rewrite targets a
// noticeably shorter total script (rough NHS-benchmark ~7min spoken ≈
// ~1000-1100 words/regimen) instead of rewriting every entry at roughly
// full length. `emergency`-tier and orienting content (`overview`,
// `emergency` section) stay uncompressed — safety-critical/orienting
// content isn't where the length problem is, and it shouldn't be.
function lengthGuidance(entry: ContentEntry): string {
  if (entry.sectionId === "emergency" || entry.sectionId === "overview") {
    return "full length, no compression — safety-critical/orienting content.";
  }
  if (entry.sectionId === "side_effects") {
    if (entry.tier === "emergency") return "full detail, no compression — emergency-tier side effect.";
    if (entry.tier === "call_team") return "moderate length — keep the call-your-team guidance intact, trim padding.";
    return "brief — 1-2 sentences covering what it is and self-care.";
  }
  if (entry.sectionId === "patient_voices") {
    return "very brief, 1-3 sentences — a short reassurance mention (\"other patients feel this too\"), not a full anecdote quoted verbatim.";
  }
  if (entry.sectionId === "fertility_intimacy") {
    return "brief, but keep every distinct instruction the source gives (fertility preservation, birth control, breastfeeding, and any \"ask your team\" caveat) — compress the explanation/reasoning around each, never merge or drop the instructions themselves.";
  }
  return "normal length — concise but no special compression.";
}

function buildPrompt(entries: ContentEntry[], filter: PersonalizationFilter, retryFeedback?: string): string {
  const source = entries.map((e) => ({
    entryId: e.id,
    name: e.name,
    plain: cleanForSpeechAndDisplay(e.plain),
    detail: filter.includeDetail && e.detail ? cleanForSpeechAndDisplay(e.detail) : undefined,
    lengthGuidance: lengthGuidance(e),
  }));

  const tone = VOICE_TONE_GUIDANCE[filter.voiceTone] ?? VOICE_TONE_GUIDANCE.neutral;
  const readingLevel = EDUCATION_LEVEL_GUIDANCE[filter.educationLevel] ?? EDUCATION_LEVEL_GUIDANCE.some_college;

  return [
    "You are rewriting pre-approved patient-education content into a single,",
    "natural spoken narration script for a video. You are NOT adding any new",
    "information — every fact, number, and name in your output must already",
    "appear in the source content below.",
    "",
    `Tone: ${tone}`,
    `Reading level: ${readingLevel}`,
    "",
    "Overall target: the whole script should land close to ~1000-1100 words",
    "total (roughly a 7-minute narration) — noticeably tighter than a full",
    "unweighted rewrite of every entry. Each source entry below carries a",
    "`lengthGuidance` field telling you how much to compress that entry;",
    "follow it per-entry so the total lands near that target.",
    "",
    "Rules:",
    "- Rewrite each source entry below, keeping order, so the whole set reads as",
    "  one continuous, flowing narration with natural transitions between topics.",
    "- Follow each entry's `lengthGuidance` — compress where it says to compress,",
    "  keep full length where it says not to compress.",
    "- Never introduce a number, statistic, drug name, or fact absent from the",
    "  source entries.",
    "- Never drop safety-critical content (emergency / call-your-team instructions)",
    "  if the entry has it, even when compressing.",
    "- Write flowing spoken sentences only — never a numbered or bulleted list,",
    "  even when the source entries below read like one (e.g. a run of short",
    "  side-effect entries). A voice narrates this; list markers like \"1.\" or",
    "  \"11.\" are read aloud as literal numbers and also trip the fact-checking",
    "  guardrail downstream.",
    "- Return exactly one rewritten chunk per entry, same ids, same order as given.",
    "",
    retryFeedback ? `Your previous attempt was rejected: ${retryFeedback} Try again, following the rules above.\n` : "",
    "Source entries (JSON):",
    JSON.stringify(source, null, 2),
    "",
    'Respond with ONLY a JSON array like [{"entryId": "...", "text": "..."}], one object per source entry, no prose, no markdown fences.',
  ].join("\n");
}

async function callRewrite(
  entries: ContentEntry[],
  filter: PersonalizationFilter,
  retryFeedback?: string,
): Promise<RewrittenChunk[] | null> {
  const ai = await getGenAIClient();
  if (!ai) return null;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: buildPrompt(entries, filter, retryFeedback) }] }],
  });

  const text = response.text?.trim() ?? "";
  const jsonText = text.replace(/^```json\s*|```$/g, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    if (process.env.REWRITE_DEBUG) console.error("REWRITE_DEBUG raw response:", text);
    return null;
  }
  if (!Array.isArray(parsed)) {
    if (process.env.REWRITE_DEBUG) console.error("REWRITE_DEBUG not an array:", parsed);
    return null;
  }

  const chunks: RewrittenChunk[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) {
      if (process.env.REWRITE_DEBUG) console.error("REWRITE_DEBUG item not an object:", item);
      return null;
    }
    const entryId = (item as Record<string, unknown>).entryId;
    const chunkText = (item as Record<string, unknown>).text;
    if (typeof entryId !== "string" || typeof chunkText !== "string" || !chunkText.trim()) {
      if (process.env.REWRITE_DEBUG) console.error("REWRITE_DEBUG bad item shape:", item);
      return null;
    }
    chunks.push({ entryId, text: chunkText });
  }
  if (process.env.REWRITE_DEBUG) {
    console.error(
      "REWRITE_DEBUG chunk ids vs entry ids:",
      chunks.map((c) => c.entryId),
      entries.map((e) => e.id),
    );
  }
  return chunks;
}

/** Structural guardrail: same entries, same ids, same order as given. */
export function hasExpectedStructure(chunks: RewrittenChunk[], entries: ContentEntry[]): boolean {
  if (chunks.length !== entries.length) return false;
  return chunks.every((c, i) => c.entryId === entries[i]!.id);
}

// Adversarial safety critic (#3c follow-up): a second, more expensive LLM
// pass that catches what the deterministic entity-diff guardrail can't —
// facts borrowed from the wrong entry, meaning-inverting rewrites (a
// contrast/negation/instruction flip with no invented fact), and dropped
// emergency-tier safety instructions. Runs only after all the cheap
// deterministic checks pass, per the "cheap check first, expensive semantic
// check second" ordering.

interface CriticItem {
  entryId: string;
  tier: string;
  sourcePlain: string;
  sourceDetail?: string;
  rewriteText: string;
}

function buildCriticPrompt(entries: ContentEntry[], chunks: RewrittenChunk[]): string {
  const items: CriticItem[] = entries.map((e, i) => ({
    entryId: e.id,
    tier: e.tier ?? "self_care",
    sourcePlain: cleanForSpeechAndDisplay(e.plain),
    sourceDetail: e.detail ? cleanForSpeechAndDisplay(e.detail) : undefined,
    rewriteText: chunks[i]!.text,
  }));

  return [
    "You are a safety reviewer for patient-education video narration. A source",
    "passage (pre-approved, clinically reviewed) was rewritten into spoken",
    "narration.",
    "",
    "Check the rewrite against the source for these problems:",
    "",
    "1. Invented or misattributed facts: any number, statistic, drug/proper",
    "   name, or claim in the rewrite that isn't in the source for that entry —",
    "   including a fact that's true of a *different* entry but has been",
    "   attached to the wrong one.",
    "2. Meaning inversion: does the rewrite change what the patient is being",
    "   told to DO or BELIEVE, even when no fact/number/name was altered?",
    "   Specifically:",
    "   - Contrast inversion: the source draws a contrast (X is an emergency,",
    "     not Y) and the rewrite flattens, reverses, or drops which side is true.",
    '   - Negation change: the source says "do X" / "this is true" and the',
    '     rewrite introduces or removes a "not," "don\'t," "isn\'t," etc. that',
    "     changes the claim.",
    "   - Instruction/imperative change: the source tells the patient to take",
    "     an action (call your team, go to the ER, take a medication a certain",
    "     way) and the rewrite softens, drops, delays, or redirects it.",
    '3. Omission — only for entries marked tier "emergency": does the rewrite',
    "   still contain the safety-critical action and any concrete threshold",
    '   from the source (e.g. "call your care team immediately, day or',
    '   night," a specific temperature/timing threshold)? Flag if that',
    "   instruction is missing, vaguer, or delayed in the rewrite, even if",
    "   nothing was technically contradicted. Do not apply this check to",
    "   call_team or self_care tier entries — condensing/summarizing",
    "   non-emergency detail is expected and fine.",
    "",
    "Do not flag: paraphrasing, tone changes, sentence reordering, or anything",
    "that preserves the same facts and the same instruction/belief in different",
    "words.",
    "",
    "Entries to review (JSON array, each with the entry's severity tier — treat",
    '"emergency" tier violations (checks 1, 2, and 3) as automatic failures,',
    '"call_team" and "self_care" tier violations (checks 1 and 2 only) as',
    "failures only if a fact or the instruction itself changes, not for tone):",
    "",
    JSON.stringify(items, null, 2),
    "",
    "Respond with ONLY JSON, no prose, no markdown fences:",
    '{"pass": true}',
    "or",
    '{"pass": false, "violations": [{"entryId": "...", "issue": "one sentence describing what changed and which rule it broke"}]}',
  ].join("\n");
}

interface CriticResult {
  pass: boolean;
  /** Human-readable summary of violations, present only when pass is false. */
  feedback?: string;
}

async function callCritic(entries: ContentEntry[], chunks: RewrittenChunk[]): Promise<CriticResult | null> {
  const ai = await getGenAIClient();
  if (!ai) return null;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: buildCriticPrompt(entries, chunks) }] }],
    config: { temperature: 0 },
  });

  const text = response.text?.trim() ?? "";
  const jsonText = text.replace(/^```json\s*|```$/g, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    if (process.env.REWRITE_DEBUG) console.error("CRITIC_DEBUG raw response:", text);
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const pass = (parsed as Record<string, unknown>).pass;
  if (typeof pass !== "boolean") return null;
  if (pass) return { pass: true };

  const violations = (parsed as Record<string, unknown>).violations;
  if (!Array.isArray(violations)) return null;
  const feedback = violations
    .map((v) =>
      typeof v === "object" && v !== null
        ? `${(v as Record<string, unknown>).entryId}: ${(v as Record<string, unknown>).issue}`
        : null,
    )
    .filter((s): s is string => Boolean(s))
    .join("; ");

  return { pass: false, feedback: feedback || "the critic flagged an unspecified issue" };
}

export async function rewriteNarration(
  entries: ContentEntry[],
  filter: PersonalizationFilter,
): Promise<RewriteResult> {
  let retryFeedback: string | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    const chunks = await callRewrite(entries, filter, retryFeedback);

    if (!chunks || !hasExpectedStructure(chunks, entries)) {
      retryFeedback =
        "the response wasn't valid JSON in the required shape (one object per source entry, same ids, same order).";
      console.warn(`Narration rewrite attempt ${attempt + 1} rejected: ${retryFeedback}`);
      continue;
    }

    const script = chunks.map((c) => c.text).join(" ");

    const entityDiff = checkEntityDiff(script, entries);
    if (!entityDiff.ok) {
      retryFeedback = `it introduced content not present in the source: ${entityDiff.introduced.join(", ")}.`;
      console.warn(`Narration rewrite attempt ${attempt + 1} rejected: ${retryFeedback}`);
      if (process.env.REWRITE_DEBUG) console.error("REWRITE_DEBUG failing script:", script);
      continue;
    }

    const ttsSafety = checkTtsSafety(script);
    if (!ttsSafety.ok) {
      retryFeedback = `it isn't safe for speech synthesis (${ttsSafety.issues.join(", ")}) — plain prose only, no markdown or stage directions.`;
      console.warn(`Narration rewrite attempt ${attempt + 1} rejected: ${retryFeedback}`);
      continue;
    }

    if (filter.educationLevel === "basic") {
      const readingLevel = checkReadingLevel(script);
      if (!readingLevel.ok) {
        retryFeedback = `sentences are too long for a basic reading level (avg ${readingLevel.avgWordsPerSentence.toFixed(1)} words/sentence) — use shorter sentences.`;
        console.warn(`Narration rewrite attempt ${attempt + 1} rejected: ${retryFeedback}`);
        continue;
      }
    }

    const critic = await callCritic(entries, chunks);
    if (!critic) {
      retryFeedback = "the safety critic response wasn't valid JSON in the required shape.";
      console.warn(`Narration rewrite attempt ${attempt + 1} rejected: ${retryFeedback}`);
      continue;
    }
    if (!critic.pass) {
      retryFeedback = `a safety reviewer found issues: ${critic.feedback}`;
      console.warn(`Narration rewrite attempt ${attempt + 1} rejected: ${retryFeedback}`);
      continue;
    }

    return { chunks, script };
  }

  throw new Error("Narration rewrite failed validation/guardrail after retry.");
}
