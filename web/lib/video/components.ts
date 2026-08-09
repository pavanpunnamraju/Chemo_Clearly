import { SIDE_EFFECT_ICONS } from "./icons";
import { getGenAIClient } from "../gemini/client";
import { matchTimestamps } from "./narration";

// Component Placer (design doc §3, new for #3c). Deterministic keyword
// match decides WHICH side effects get a visual component — no LLM
// judgment call on whether to show something. Only tags with a registered
// icon (icons.ts) are matchable; every other tag is a deliberate no-icon
// outcome, not a bug.
//
// Keyword lists are a maintained vocabulary, not derived from content —
// they need to catch how an LLM rewrite is likely to phrase a mention, not
// just the source's exact wording. Grow this alongside icons.ts.
const KEYWORDS: Record<string, string[]> = {
  "nausea-appetite": ["nausea", "nauseous", "vomit", "vomiting", "queasy"],
  "infection-risk": ["infection", "neutropenic", "white blood cell", "infection-fighting"],
  // diarrhea/constipation deliberately excluded — they're bowel words, not
  // mouth words, and pairing them with a mouth icon reads as a mismatch.
  "mouth-digestion": ["mouth sore", "mouth sores"],
  "nerve-tingling": ["tingling", "numbness", "neuropathy"],
  urinary: ["bladder", "urinary", "urine"],
  "emotional-support": ["mood", "irritability", "anxiety", "emotional"],
  "aches-pain": ["joint pain", "muscle pain", "aches", "ache"],
};

export interface ComponentTrigger {
  tag: string;
  iconId: string;
  /** Character offset into the full script where the match begins. */
  matchIndex: number;
  /** The keyword phrase that matched, for debugging/traceability. */
  matchedKeyword: string;
}

/**
 * Finds the first mention of each side-effect tag in the script, in the
 * tag's known keyword vocabulary. Dedup is inherent: at most one trigger per
 * tag (its first meaningful mention), per the design doc.
 */
export function findComponentTriggers(script: string): ComponentTrigger[] {
  const lowerScript = script.toLowerCase();
  const triggers: ComponentTrigger[] = [];

  for (const [tag, iconId] of Object.entries(SIDE_EFFECT_ICONS)) {
    const keywords = KEYWORDS[tag] ?? [];
    let bestIndex = -1;
    let bestKeyword = "";

    for (const keyword of keywords) {
      const index = lowerScript.indexOf(keyword);
      if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
        bestIndex = index;
        bestKeyword = keyword;
      }
    }

    if (bestIndex !== -1) {
      triggers.push({ tag, iconId, matchIndex: bestIndex, matchedKeyword: bestKeyword });
    }
  }

  return triggers.sort((a, b) => a.matchIndex - b.matchIndex);
}

interface Sentence {
  text: string;
  start: number;
}

function splitSentences(script: string): Sentence[] {
  const sentences: Sentence[] = [];
  const regex = /[^.!?]+[.!?]+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(script))) {
    sentences.push({ text: match[0].trim(), start: match.index });
  }
  return sentences;
}

export interface PlacedComponent extends ComponentTrigger {
  /** Character offset actually used for on-screen placement — the keyword
   * match position, or a nearby sentence the timing step judged more
   * natural. Always a valid fallback even if the LLM call fails. */
  placementIndex: number;
}

const MODEL = "gemini-2.5-flash";

/**
 * Refines each trigger's on-screen timing to the best nearby sentence
 * (natural pause/beat) instead of the raw first-keyword-match offset.
 * Visual-timing only — never touches narration text, so it doesn't need the
 * entity-diff guardrail. On any failure (no client, bad/unparseable
 * response), every trigger silently falls back to its keyword matchIndex —
 * no retry, per the design doc; a slightly-off icon moment isn't worth
 * blocking generation over.
 */
export async function refineComponentTiming(script: string, triggers: ComponentTrigger[]): Promise<PlacedComponent[]> {
  const fallback: PlacedComponent[] = triggers.map((t) => ({ ...t, placementIndex: t.matchIndex }));
  if (triggers.length === 0) return fallback;

  const sentences = splitSentences(script);
  const windows = triggers.map((t) => {
    const centerIdx = sentences.findIndex((s, i) => {
      const next = sentences[i + 1];
      return t.matchIndex >= s.start && (!next || t.matchIndex < next.start);
    });
    const from = Math.max(0, centerIdx - 1);
    const to = Math.min(sentences.length - 1, centerIdx + 1);
    const candidates = sentences.slice(from, to + 1).map((s, i) => ({ index: from + i, text: s.text }));
    return { tag: t.tag, candidates };
  });

  try {
    const ai = await getGenAIClient();
    if (!ai) return fallback;

    const prompt = [
      "For each side-effect tag below, pick which candidate sentence is the most natural",
      "moment to show that side effect's icon on screen — usually the sentence that most",
      "directly/fully discusses it, not necessarily the first one mentioning it in passing.",
      "",
      JSON.stringify(windows, null, 2),
      "",
      'Respond with ONLY JSON: [{"tag": "...", "chosenIndex": <number>}], one per tag, no prose.',
    ].join("\n");

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const text = (response.text ?? "").trim().replace(/^```json\s*|```$/g, "").trim();
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return fallback;

    const chosenByTag = new Map<string, number>();
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const tag = (item as Record<string, unknown>).tag;
      const chosenIndex = (item as Record<string, unknown>).chosenIndex;
      if (typeof tag === "string" && typeof chosenIndex === "number") chosenByTag.set(tag, chosenIndex);
    }

    return triggers.map((t, i) => {
      const chosenIndex = chosenByTag.get(t.tag);
      const validIndices = new Set(windows[i]!.candidates.map((c) => c.index));
      if (chosenIndex === undefined || !validIndices.has(chosenIndex)) {
        return { ...t, placementIndex: t.matchIndex };
      }
      return { ...t, placementIndex: sentences[chosenIndex]!.start };
    });
  } catch {
    return fallback;
  }
}

export interface TimedComponent {
  tag: string;
  iconId: string;
  startSeconds: number;
}

/**
 * Converts each placed component's character offset into the script to a
 * real on-screen timestamp, using the same content-based word matching as
 * slide-cue alignment (narration.ts's matchTimestamps) — not proportional
 * guessing from the character offset, since alignment position and
 * character position diverge (numbers/units expand into several spoken
 * words). A component whose text isn't found in the aligned audio (rare —
 * e.g. Speech-to-Text misheard that stretch) is simply dropped rather than
 * placed at a guessed/wrong time — narration still covers it either way,
 * an icon is a bonus, not a fact that must display.
 */
export function placeComponentsInTime(
  script: string,
  placed: PlacedComponent[],
  alignedWords: { word: string; startSeconds: number }[],
): TimedComponent[] {
  const sorted = [...placed].sort((a, b) => a.placementIndex - b.placementIndex);
  const anchorTexts = sorted.map((c) => script.slice(c.placementIndex));
  const matches = matchTimestamps(anchorTexts, alignedWords);

  const timed: TimedComponent[] = [];
  sorted.forEach((c, i) => {
    const startSeconds = matches[i]!;
    if (startSeconds !== null) timed.push({ tag: c.tag, iconId: c.iconId, startSeconds });
  });
  return timed;
}
