import { getGenAIClient } from "../gemini/client";
import { matchTimestamps } from "./narration";

// Component Placer (design doc §3, new for #3c). Deterministic keyword
// match decides WHICH side effects get a visual component — no LLM
// judgment call on whether to show something.
//
// Keyword lists are a maintained vocabulary, not derived from content —
// they need to catch how an LLM rewrite is likely to phrase a mention, not
// just the source's exact wording.
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

// Only 3 generic side-effect illustrations exist today (not one per
// symptom) — assigned round-robin across whatever triggers fire in a given
// render. Swapping in a real per-tag mapping later is a change to this one
// array/function, nothing else.
const ILLUSTRATIONS = [
  "illustrations/side_effects/side_effects__tiredness-pana.svg",
  "illustrations/side_effects/side_effects__stress-bro.svg",
  "illustrations/side_effects/side_effects__sleep-analysis-pana.svg",
];

function illustrationForOrdinal(ordinal: number): string {
  return ILLUSTRATIONS[ordinal % ILLUSTRATIONS.length]!;
}

// Every other narrated section (see select.ts's NARRATED_SECTIONS) has its
// own curated 2-3 file folder under public/illustrations/ (see MANIFEST.md)
// — one illustration per SlideBeat in that section, round-robin by the
// slide's position within its section. side_effects is deliberately absent
// here — it uses the finer per-keyword-trigger mechanism above instead.
const SECTION_ILLUSTRATIONS: Record<string, string[]> = {
  overview: [
    "illustrations/overview/overview__doctor-bro.svg",
    "illustrations/overview/overview__doctor-pana.svg",
    "illustrations/overview/overview__online-doctor-bro.svg",
  ],
  timeline: [
    "illustrations/timeline/timeline__calendar-pana.svg",
    "illustrations/timeline/timeline__timeline-bro.svg",
    "illustrations/timeline/timeline__schedule-pana.svg",
  ],
  daily_life: [
    "illustrations/daily_life/daily_life__healthy-lifestyle-bro.svg",
    "illustrations/daily_life/daily_life__training-at-home-pana.svg",
    "illustrations/daily_life/daily_life__stretching-exercises-bro.svg",
  ],
  fertility_intimacy: [
    "illustrations/fertility_intimacy/fertility_intimacy__family-bro.svg",
    "illustrations/fertility_intimacy/fertility_intimacy__asian-family-pana.svg",
  ],
  emergency: [
    "illustrations/emergency/emergency__call-center-bro.svg",
    "illustrations/emergency/emergency__hospital-building-pana.svg",
  ],
  patient_voices: [
    "illustrations/patient_voices/patient_voices__community-pana.svg",
    "illustrations/patient_voices/patient_voices__active-support-bro.svg",
    "illustrations/patient_voices/patient_voices__online-review-pana.svg",
  ],
};

/**
 * Which illustration a given section's Nth slide (0-based, within that
 * section) should show — round-robin through that section's own folder.
 * Returns null for a section with no curated folder (currently just
 * side_effects, handled separately by findComponentTriggers instead).
 */
export function illustrationForSlide(sectionId: string, indexInSection: number): string | null {
  const files = SECTION_ILLUSTRATIONS[sectionId];
  if (!files || files.length === 0) return null;
  return files[indexInSection % files.length]!;
}

export interface ComponentTrigger {
  tag: string;
  illustrationSrc: string;
  /** Character offset into the full script where the match begins. */
  matchIndex: number;
  /** The keyword phrase that matched, for debugging/traceability. */
  matchedKeyword: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds every mention of every side-effect tag's keyword vocabulary in the
 * script, in speaking order. No longer deduped to one-per-tag — a symptom
 * mentioned three times gets three triggers. Each tag's keywords are
 * matched via a single alternation regex (longest keyword first) so an
 * overlapping shorter keyword (e.g. "ache" inside "aches") doesn't produce
 * a duplicate match at the same position.
 */
export function findComponentTriggers(script: string): ComponentTrigger[] {
  const lowerScript = script.toLowerCase();
  const matches: { tag: string; matchIndex: number; matchedKeyword: string }[] = [];

  for (const [tag, keywords] of Object.entries(KEYWORDS)) {
    const sortedKeywords = [...keywords].sort((a, b) => b.length - a.length);
    const regex = new RegExp(sortedKeywords.map(escapeRegExp).join("|"), "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(lowerScript))) {
      matches.push({ tag, matchIndex: match.index, matchedKeyword: match[0] });
    }
  }

  matches.sort((a, b) => a.matchIndex - b.matchIndex);
  return matches.map((m, i) => ({ ...m, illustrationSrc: illustrationForOrdinal(i) }));
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
  illustrationSrc: string;
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
    if (startSeconds !== null) timed.push({ tag: c.tag, illustrationSrc: c.illustrationSrc, startSeconds });
  });
  return timed;
}
