import type { ContentEntry, RegimenContent } from "../content/types";
import type { PersonalizationFilter } from "../intake/schema";

export interface SlideBeat {
  entryId: string;
  startSeconds: number;
  headline: string;
  body: string;
}

export interface NarrationPlan {
  /** Full narration text sent to TTS, verbatim canonical text joined + citation markers stripped. */
  script: string;
  /** Same narration text as SSML, with an <mark> before each slide's text so TTS can report real per-slide timing. */
  ssml: string;
  slides: SlideBeat[];
  totalSeconds: number;
}

/** A single point in time TTS reported for an SSML <mark>, keyed by its name. */
export interface NarrationTimepoint {
  markName: string;
  timeSeconds: number;
}

function escapeSsml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Narration speaking-rate assumption for slide-cue timing, in words/second.
// Matches typical unhurried narrated-slide pacing (~150 wpm). This only
// affects when a slide *changes on screen* relative to the narration audio,
// not the audio itself (which comes from the real TTS call) — approximate
// timing is acceptable for v1's narrated-slides format.
const WORDS_PER_SECOND = 2.5;

function cleanForSpeechAndDisplay(text: string): string {
  // Display/narration cleanup only — never changes a claim or its phrasing,
  // just the raw-markdown formatting from docs/content/*.md that isn't
  // meaningful spoken/rendered as literal characters (neither the TTS voice
  // nor the plain-<p> slide component interprets markdown).
  return text
    .replace(/^\s*-\s+/gm, "") // leading bullet markers
    .replace(/\s*\n+\s*/g, " ") // newlines -> single space (do this before **/` stripping below, since those spans can be hard-wrapped across lines in the source markdown)
    .replace(/\s*\[[A-Za-z0-9,\s]+\]/g, "") // citation markers like "[S1, S2]"
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1") // **bold**
    .replace(/`([^`]*)`/g, "$1") // `code`
    .replace(/\s{2,}/g, " ")
    .trim();
}

function entryHeadline(entry: ContentEntry): string {
  if (entry.name) return entry.name;
  return entry.sectionId
    .split("_")
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

function entryNarrationText(entry: ContentEntry, includeDetail: boolean): string {
  const parts = [cleanForSpeechAndDisplay(entry.plain)];
  if (includeDetail && entry.detail) parts.push(cleanForSpeechAndDisplay(entry.detail));
  return parts.join(" ");
}

/**
 * Builds narration script + slide cues by concatenating the canonical `plain`
 * (+ `detail`, if requested) text for each selected entry, in the order given.
 * Deterministic — no LLM involved here, so the guardrail holds regardless of
 * how `entryIds` was produced.
 */
export function buildNarrationPlan(
  content: RegimenContent,
  entryIds: string[],
  filter: PersonalizationFilter,
): NarrationPlan {
  const byId = new Map(content.entries.map((e) => [e.id, e]));

  const scriptParts: string[] = [];
  const ssmlParts: string[] = [];
  const slides: SlideBeat[] = [];
  let cumulativeSeconds = 0;

  for (const id of entryIds) {
    const entry = byId.get(id);
    if (!entry) continue;

    const text = entryNarrationText(entry, filter.includeDetail);
    if (!text) continue;

    slides.push({
      entryId: entry.id,
      startSeconds: cumulativeSeconds,
      headline: entryHeadline(entry),
      body: text,
    });

    scriptParts.push(text);
    ssmlParts.push(`<mark name="${entry.id}"/>${escapeSsml(text)}`);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    cumulativeSeconds += wordCount / WORDS_PER_SECOND;
  }

  return {
    script: scriptParts.join(" "),
    ssml: `<speak>${ssmlParts.join(" ")}</speak>`,
    slides,
    totalSeconds: cumulativeSeconds,
  };
}

/**
 * Replaces the word-count-estimated slide timing with real TTS timepoints
 * (one per slide, matched by entryId === SSML mark name) and the actual
 * rendered audio duration — this is what keeps narration and on-screen text
 * in sync instead of drifting apart as script length grows.
 */
export function applyTimepoints(
  plan: NarrationPlan,
  timepoints: NarrationTimepoint[],
  audioDurationSeconds: number,
): NarrationPlan {
  const timeByMark = new Map(timepoints.map((t) => [t.markName, t.timeSeconds]));

  return {
    ...plan,
    slides: plan.slides.map((slide) => ({
      ...slide,
      startSeconds: timeByMark.get(slide.entryId) ?? slide.startSeconds,
    })),
    totalSeconds: audioDurationSeconds,
  };
}
