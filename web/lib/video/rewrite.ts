import type { ContentEntry } from "../content/types";
import type { PersonalizationFilter } from "../intake/schema";
import { getGenAIClient } from "../gemini/client";
import { checkAnchorPhrases, checkEntityDiff, checkProtectedNumbers, checkReadingLevel, checkTtsSafety } from "./guardrail";
import { requiredAnchorPhrase } from "./narration";
import { buildSourcePacket } from "./source-packet";
import { hasExactEntryCoverage } from "./select";

export const NARRATION_REWRITE_VERSION = "complete-source-detail-instructions-v2";

// Narration Rewriter — takes one ordered section of selected entries and
// produces one continuous, natural-sounding narration script. GUARDRAIL:
// output must cover exactly the given entries (same unique ids/order).
// Per-entry quantity/entity checks precede semantic source-passage review.
// Three attempts are allowed; failed validation never becomes a silent fallback.

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

// Phase 2a goal #10b: readability gate, per education level — was basic-only,
// now blocks for every level (advanced stays effectively uncapped since
// clinical terminology is explicitly allowed there per EDUCATION_LEVEL_GUIDANCE).
// Reuses checkReadingLevel's existing avg-words/sentence proxy, no new library.
const READING_LEVEL_MAX_AVG_WORDS_PER_SENTENCE: Record<string, number> = {
  basic: 20,
  some_college: 25,
  advanced: 1000,
};

// Concision guidance has flexible duration: no sentence budget may force
// omission of a distinct source instruction, regardless of severity tier.
function lengthGuidance(entry: ContentEntry): string {
  if (entry.sectionId === "emergency" || entry.sectionId === "overview") {
    return "full length, no compression — safety-critical/orienting content.";
  }
  if (entry.sectionId === "side_effects") {
    if (entry.tier === "emergency") return "full detail, no compression — emergency-tier side effect.";
    if (entry.tier === "call_team") return "Concise sentences; preserve every call-your-team instruction, condition, threshold, cross-reference and self-care action. No sentence cap; trim only padding.";
    return "Briefly explain what it is, then preserve every distinct self-care action and call-team condition. Use as many short sentences as those instructions need.";
  }
  if (entry.sectionId === "patient_voices") {
    return "Preserve every distinct source experience and its attribution, including the specific anecdote details and qualifications. Keep individual experiences attributed to those patients; never turn them into general advice, a promise, or an unsupported claim about how many patients feel this way. Short attributed paraphrases are allowed; you do not need to repeat long quotations verbatim. Introduce an individual experience with 'A patient...' rather than numerical attribution such as 'One patient...'. Use concise, short sentences with a flexible sentence count; no sentence cap. Trim repetition and padding, not distinct experiences, and do not pack all details into a long sentence.";
  }
  if (entry.sectionId === "fertility_intimacy") {
    return "keep every distinct instruction the source gives (fertility preservation, birth control, breastfeeding, and any \"ask your team\" caveat) as a short clause each, including the essential reason if the source states one (e.g. why breastfeeding is unsafe) — cut only extra explanation beyond that, never merge or drop the instructions themselves.";
  }
  return "concise — trim padding and restated context; no sentence-count cap, but every sentence should carry a distinct fact.";
}

export function buildRewritePrompt(entries: ContentEntry[], filter: PersonalizationFilter, retryFeedback?: string): string {
  const source = entries.map((e) => ({
    ...buildSourcePacket(e, filter.includeDetail),
    lengthGuidance: lengthGuidance(e),
    // A video beat times itself off this exact phrase surviving into the
    // rewrite (narration.ts's requiredAnchorPhrase/checkAnchorPhrases) —
    // undefined for every entry except overview once it carries the
    // countdown-cards beat's 3 fields.
    requiredPhrase: requiredAnchorPhrase(e),
  }));

  const tone = VOICE_TONE_GUIDANCE[filter.voiceTone] ?? VOICE_TONE_GUIDANCE.neutral;
  const readingLevel = EDUCATION_LEVEL_GUIDANCE[filter.educationLevel] ?? EDUCATION_LEVEL_GUIDANCE.some_college;

  return [
    "You are rewriting supplied patient-education source content into a single,",
    "natural spoken narration script for a video. You are NOT adding any new",
    "information — every fact, number, and name in your output must already",
    "appear in the source content below.",
    "",
    `Tone: ${tone}`,
    `Reading level: ${readingLevel}`,
    "",
    "This request may contain only one section of a longer video; do not add",
    "a whole-video introduction, conclusion, or a fixed total word target.",
    filter.includeDetail
      ? "Depth: detailed. Explain the supplied detail passages in the requested language level, while keeping every core instruction."
      : "Depth: short. Remove repetition and extra explanation, with flexible runtime. Never shorten by omitting distinct instructions or thresholds.",
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
    "- Read EVERY supplied passage, including selfCare, callTeamIf, call911 and",
    "  callTeam. Preserve all distinct instructions, alternatives, timing, thresholds,",
    "  negations, caveats and essential reasons in plain and action passages, at EVERY tier.",
    "  Rephrase naturally; do not repeat identical instructions duplicated across fields.",
    "- detailContext is the full original detail at either depth, so references",
    "  in detailInstruction excerpts can be understood. At short depth preserve",
    "  each excerpt's patient instruction and conditions; omit its optional statistics",
    "  and explanation. Also preserve any distinct patient safety instruction in",
    "  detailContext that the conservative excerpt extraction missed.",
    "- Retain every numerical quantity from the entry name, plain and action passages",
    "  with its original units and conditions. Keep numbers as digits for reliable checking.",
    "- Source fidelity is the task; source passages have not been established as clinically approved.",
    "- Write flowing spoken sentences only — never a numbered or bulleted list,",
    "  even when the source entries below read like one (e.g. a run of short",
    "  side-effect entries). A voice narrates this; list markers like \"1.\" or",
    "  \"11.\" are read aloud as literal numbers and also trip the fact-checking",
    "  guardrail downstream.",
    "- Return exactly one rewritten chunk per entry, same ids, same order as given.",
    "- If an entry's `requiredPhrase` field is set, your rewritten text for that",
    "  entry MUST contain that exact phrase, verbatim, word-for-word — a",
    "  downstream system times video visuals off finding it literally in your",
    "  output. You may still rephrase everything around it; just don't",
    "  paraphrase the phrase itself away.",
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
    contents: [{ role: "user", parts: [{ text: buildRewritePrompt(entries, filter, retryFeedback) }] }],
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
  if (!hasExactEntryCoverage(chunks.map((chunk) => chunk.entryId), entries)) return false;
  return chunks.every((c, i) => c.entryId === entries[i]!.id);
}

// Adversarial safety critic (#3c follow-up): a second, more expensive LLM
// pass that catches what the deterministic entity-diff guardrail can't —
// facts borrowed from the wrong entry, meaning-inverting rewrites (a
// contrast/negation/instruction flip with no invented fact), and dropped
// distinct source instructions at every tier. Runs only after all the cheap
// deterministic checks pass, per the "cheap check first, expensive semantic
// check second" ordering.

export function buildCriticPrompt(entries: ContentEntry[], chunks: RewrittenChunk[], includeDetail = true): string {
  const items = entries.map((e, i) => ({
    ...buildSourcePacket(e, includeDetail),
    rewriteText: chunks[i]!.text,
  }));

  return [
    "You are a safety reviewer for patient-education video narration. A source",
    "packet was rewritten into spoken narration. Check fidelity to the supplied",
    "source; do not imply the source has been clinically approved.",
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
    "3. Omission — apply to ALL tiers, including untiered entries. For EVERY",
    "   plain, selfCare, callTeamIf, call911, callTeam and detailInstruction passage, enumerate its",
    "   distinct instructions and check that each survives with its conditions,",
    "   alternatives, units, threshold comparisons, timing, negations, caveats,",
    "   essential reasons and urgency. A compact sentence can preserve several",
    "   instructions. Repeated instructions across fields need only appear once.",
    "   Do not accept a retained number if it is attached to the wrong condition.",
    "   Distinct source messages and specific patient experiences must remain;",
    "   generic reassurance is not a substitute. Detail explanation may be",
    "   summarized, but any distinct instruction inside it must still survive.",
    "   Use full detailContext to resolve references. For detailInstruction, check",
    "   the instruction and its conditions, not optional surrounding statistics.",
    "   Independently scan detailContext for patient safety instructions the excerpt",
    "   extractor missed: flag a missing instruction as a violation even when all",
    "   listed passages are preserved. Never require all contextual statistics",
    "   or mechanism explanations in a short version.",
    "",
    "Do not flag: paraphrasing, tone changes, sentence reordering, or anything",
    "that preserves the same facts and the same instruction/belief in different",
    "words.",
    "",
    "All three checks apply to every entry regardless of severity tier.",
    "Entries to review (JSON array):",
    "",
    JSON.stringify(items, null, 2),
    "",
    "Respond with ONLY JSON, no prose, no markdown fences:",
    'Return {"pass": true|false, "checks": [{"sourceRef": "entry:field", "preserved": true|false, "issue": "brief reason if false"}]}.',
    "Include exactly one check for every sourceRef supplied in passages. A",
    "passage is preserved only when all its distinct instructions survive and",
    "none of its facts is changed or misattributed. Set pass false for any",
    "invented claim in the rewrite, even if the source passages are preserved.",
    'For invented claims, additionally return "violations": [{"entryId": "...", "issue": "..."}].',
  ].join("\n");
}

export interface CriticResult {
  pass: boolean;
  /** Human-readable summary of violations, present only when pass is false. */
  feedback?: string;
}

/** Reject incomplete review reports; a bare pass boolean cannot prove source coverage. */
export function validateCriticResponse(parsed: unknown, entries: ContentEntry[], includeDetail: boolean): CriticResult | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const report = parsed as Record<string, unknown>;
  if (typeof report.pass !== "boolean" || !Array.isArray(report.checks)) return null;
  const expected = new Set(entries.flatMap((entry) => buildSourcePacket(entry, includeDetail).passages.map((p) => p.sourceRef)));
  const seen = new Set<string>();
  const failures: string[] = [];
  for (const item of report.checks) {
    if (typeof item !== "object" || item === null) return null;
    const check = item as Record<string, unknown>;
    if (typeof check.sourceRef !== "string" || typeof check.preserved !== "boolean" ||
      !expected.has(check.sourceRef) || seen.has(check.sourceRef)) return null;
    seen.add(check.sourceRef);
    if (!check.preserved) failures.push(`${check.sourceRef}: ${typeof check.issue === "string" ? check.issue : "source instruction or meaning was not preserved"}`);
  }
  if (seen.size !== expected.size) return null;
  if (Array.isArray(report.violations)) {
    for (const item of report.violations) {
      if (typeof item !== "object" || item === null) return null;
      const violation = item as Record<string, unknown>;
      if (typeof violation.entryId !== "string" || typeof violation.issue !== "string") return null;
      failures.push(`${violation.entryId}: ${violation.issue}`);
    }
  }
  if (!report.pass || failures.length) return { pass: false, feedback: failures.join("; ") || "reviewer rejected source fidelity" };
  return { pass: true };
}

async function callCritic(entries: ContentEntry[], chunks: RewrittenChunk[], includeDetail: boolean): Promise<CriticResult | null> {
  const ai = await getGenAIClient();
  if (!ai) return null;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: buildCriticPrompt(entries, chunks, includeDetail) }] }],
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
  return validateCriticResponse(parsed, entries, includeDetail);
}

export interface NarrationValidationResult {
  pass: boolean;
  feedback?: string;
}

/** Shared validation for newly generated and retained narration candidates.
 * Rechecking an unchanged script does not require regenerating its audio. */
export async function validateRewrittenNarration(
  entries: ContentEntry[],
  filter: PersonalizationFilter,
  chunks: RewrittenChunk[],
): Promise<NarrationValidationResult> {
  if (!Array.isArray(chunks) || chunks.some((chunk) => !chunk || typeof chunk.entryId !== "string" || typeof chunk.text !== "string" || !chunk.text.trim()) || !hasExpectedStructure(chunks, entries)) {
    return { pass: false, feedback: "the response wasn't valid JSON in the required shape (one object per source entry, same ids, same order)." };
  }
  const script = chunks.map((c) => c.text).join(" ");
  // Check each entry against its own complete packet; another entry's
  // number/name cannot legitimize a misattribution here.
  const introduced = chunks.flatMap((chunk, index) =>
    checkEntityDiff(chunk.text, [entries[index]!], filter.includeDetail).introduced.map((item) => `${chunk.entryId}: ${item}`),
  );
  if (introduced.length) return { pass: false, feedback: `it introduced content not present in the source: ${introduced.join(", ")}.` };

  const protectedNumbers = checkProtectedNumbers(chunks, entries);
  if (!protectedNumbers.ok) return { pass: false, feedback: `it dropped or changed required source quantities: ${protectedNumbers.missing.map((item) => `${item.entryId}: ${item.numbers.join(", ")}`).join("; ")}. Preserve quantities with their units and conditions.` };

  const anchorPhrases = checkAnchorPhrases(chunks, entries);
  if (!anchorPhrases.ok) return { pass: false, feedback: `it dropped wording a video beat needs to time itself against, for: ${anchorPhrases.missing.join(", ")}. That entry's rewrite must include its \`requiredPhrase\` verbatim.` };

  const ttsSafety = checkTtsSafety(script);
  if (!ttsSafety.ok) return { pass: false, feedback: `it isn't safe for speech synthesis (${ttsSafety.issues.join(", ")}) — plain prose only, no markdown or stage directions.` };

  const maxAvgWordsPerSentence =
    READING_LEVEL_MAX_AVG_WORDS_PER_SENTENCE[filter.educationLevel] ??
    READING_LEVEL_MAX_AVG_WORDS_PER_SENTENCE.basic!;
  const readingLevel = checkReadingLevel(script, maxAvgWordsPerSentence);
  if (!readingLevel.ok) return { pass: false, feedback: `sentences are too long for a ${filter.educationLevel} reading level (avg ${readingLevel.avgWordsPerSentence.toFixed(1)} words/sentence) — use shorter sentences.` };

  const critic = await callCritic(entries, chunks, filter.includeDetail);
  if (!critic) return { pass: false, feedback: "the safety critic response wasn't valid JSON in the required shape." };
  if (!critic.pass) return { pass: false, feedback: `a safety reviewer found issues: ${critic.feedback}` };
  return { pass: true };
}

export async function rewriteNarration(
  entries: ContentEntry[],
  filter: PersonalizationFilter,
): Promise<RewriteResult> {
  let retryFeedback: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const chunks = await callRewrite(entries, filter, retryFeedback);
    const validation = await validateRewrittenNarration(entries, filter, chunks ?? []);
    if (validation.pass && chunks) return { chunks, script: chunks.map((chunk) => chunk.text).join(" ") };
    retryFeedback = validation.feedback;
    console.warn(`Narration rewrite attempt ${attempt + 1} rejected: ${retryFeedback}`);
    if (process.env.REWRITE_DEBUG) console.error("REWRITE_DEBUG rejected chunks:", JSON.stringify(chunks));
  }
  throw new Error("Narration rewrite failed validation/guardrail after retry.");
}
