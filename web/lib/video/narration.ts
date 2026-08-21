import type { ContentEntry, RegimenContent, Tier } from "../content/types";
import type { PersonalizationFilter } from "../intake/schema";

export interface SlideBeat {
  entryId: string;
  /** The entry's section (e.g. "side_effects", "overview") — used to pick
   * which curated illustration folder a slide draws from. Threaded from
   * `ContentEntry.sectionId` at construction time rather than re-derived
   * from `entryId` string-parsing (entryId's shape is an implementation
   * detail, not a contract). */
  sectionId: string;
  startSeconds: number;
  headline: string;
  body: string;
  /** The entry's own tags (`ContentEntry.tags`) — used by the Scene archetype's
   * tag-driven `side_effects` subject rule (video-composition/SlideVideo.tsx),
   * not derived from narration text like the old keyword-trigger mechanism was. */
  tags: string[];
  /** The entry's own `tier` (video_visual_system.md's Alert archetype) — which
   * `emergency`-section entries get a fixed-slot card vs. the section's plain
   * framing/closing beats. Threaded from `ContentEntry.tier`, same pattern as `tags`. */
  tier?: Tier;
  /** Alert archetype closing split-card text — only set on the `emergency`
   * section's closing entry. Threaded from `ContentEntry.call911`/`callTeam`. */
  call911?: string;
  callTeam?: string;
}

export interface NarrationPlan {
  /** Full narration text sent to TTS, verbatim canonical text joined + citation markers stripped. */
  script: string;
  slides: SlideBeat[];
  totalSeconds: number;
}

// Narration speaking-rate assumption for slide-cue timing, in words/second.
// Matches typical unhurried narrated-slide pacing (~150 wpm). This only
// affects when a slide *changes on screen* relative to the narration audio,
// not the audio itself (which comes from the real TTS call) — approximate
// timing is acceptable for v1's narrated-slides format.
const WORDS_PER_SECOND = 2.5;

export function cleanForSpeechAndDisplay(text: string): string {
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

export interface RewrittenChunk {
  entryId: string;
  text: string;
}

/**
 * Builds narration script + slide cues from the LLM-rewritten chunks
 * (lib/video/rewrite.ts, #3c) instead of verbatim source text — same shape
 * as buildNarrationPlan (used by the deterministic no-rewrite path), just a
 * different text source. Headline still comes from the canonical entry
 * (rewrite.ts doesn't invent entry names), one slide per chunk, same order.
 */
export function buildNarrationPlanFromChunks(
  chunks: RewrittenChunk[],
  entries: ContentEntry[],
): NarrationPlan {
  const byId = new Map(entries.map((e) => [e.id, e]));

  const scriptParts: string[] = [];
  const slides: SlideBeat[] = [];
  let cumulativeSeconds = 0;

  for (const chunk of chunks) {
    const entry = byId.get(chunk.entryId);
    if (!entry || !chunk.text.trim()) continue;

    slides.push({
      entryId: chunk.entryId,
      sectionId: entry.sectionId,
      startSeconds: cumulativeSeconds,
      headline: entryHeadline(entry),
      body: chunk.text,
      tags: entry.tags,
      tier: entry.tier,
      call911: entry.call911,
      callTeam: entry.callTeam,
    });

    scriptParts.push(chunk.text);
    const wordCount = chunk.text.split(/\s+/).filter(Boolean).length;
    cumulativeSeconds += wordCount / WORDS_PER_SECOND;
  }

  return {
    script: scriptParts.join(" "),
    slides,
    totalSeconds: cumulativeSeconds,
  };
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
  const slides: SlideBeat[] = [];
  let cumulativeSeconds = 0;

  for (const id of entryIds) {
    const entry = byId.get(id);
    if (!entry) continue;

    const text = entryNarrationText(entry, filter.includeDetail);
    if (!text) continue;

    slides.push({
      entryId: entry.id,
      sectionId: entry.sectionId,
      startSeconds: cumulativeSeconds,
      headline: entryHeadline(entry),
      body: text,
      tags: entry.tags,
      tier: entry.tier,
      call911: entry.call911,
      callTeam: entry.callTeam,
    });

    scriptParts.push(text);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    cumulativeSeconds += wordCount / WORDS_PER_SECOND;
  }

  return {
    script: scriptParts.join(" "),
    slides,
    totalSeconds: cumulativeSeconds,
  };
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** First index in `[from, to)` where `haystack` contains `needle` as a contiguous run, or -1. */
function findPhrase(haystack: string[], needle: string[], from: number, to: number = haystack.length): number {
  if (needle.length === 0) return -1;
  const limit = Math.min(to, haystack.length) - needle.length;
  for (let i = from; i <= limit; i++) {
    let matches = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return i;
  }
  return -1;
}

/**
 * Replaces the word-count-estimated slide timing with real per-word
 * timestamps from Speech-to-Text alignment (see lib/video/align.ts) and the
 * actual rendered audio duration — this is what keeps narration and
 * on-screen text in sync instead of drifting apart as script length grows.
 *
 * Matches by word *content*, not position: for each slide, scans forward
 * (never backward, so slide order is preserved) from the previous match for
 * a run of the slide's first 3 words appearing consecutively in the aligned
 * word list — falling back to 2 words, then 1, only if a 3-word run isn't
 * found. Content-based because raw word-count position drifts — Speech-to-Text
 * expands things like "100.4°F" into several spoken words ("one hundred
 * point four degrees fahrenheit"), while our script is one whitespace token,
 * so index position and STT position diverge more with every number/symbol
 * in the text.
 *
 * Requires a multi-word run, not just any single matching word: a single
 * common word (e.g. "days", "your") recurs throughout the whole script, so
 * matching on it alone can find a false hit inside an *earlier* slide's
 * still-playing audio — collapsing that earlier slide's on-screen duration
 * and making the next slide appear to jump in early/skip content. A 3-word
 * run repeating by chance is far less likely.
 */
export function applyTimepoints(
  plan: NarrationPlan,
  alignedWords: { word: string; startSeconds: number }[],
  audioDurationSeconds: number,
): NarrationPlan {
  const matches = matchTimestamps(
    plan.slides.map((s) => s.body),
    alignedWords,
  );

  // Narration is spoken in a fixed, strictly sequential order, so a later
  // slide's real start can never precede an earlier slide's. Without this
  // guard, a slide whose own text failed to find a real word-alignment match
  // (short/generic bodies are the common case — see matchTimestamps' docs on
  // the 1/2-word fallback's limited lookahead) keeps its word-count
  // *estimate* instead, which is scaled to the estimated total duration, not
  // the real one — mixing that estimate in among neighbors that DID get real
  // (differently-scaled) matches can put it out of order. On screen that
  // shows up as the affected slide flashing for ~1 frame while its
  // predecessor holds far too long (SlideVideo.tsx derives each slide's
  // duration from the next slide's startSeconds). Clamping forward instead
  // of trusting the raw value can't undo a wrong estimate, but it guarantees
  // the sequence never runs backward.
  let previousStart = -Infinity;
  const slides = plan.slides.map((slide, i) => {
    const matched = matches[i];
    const candidate = matched == null ? slide.startSeconds : matched;
    const startSeconds = Math.max(candidate, previousStart);
    previousStart = startSeconds;
    return { ...slide, startSeconds };
  });

  return { ...plan, slides, totalSeconds: audioDurationSeconds };
}

/**
 * Content-based text-to-timestamp matching, shared by applyTimepoints
 * (slide cues) and components.ts (icon placement) — same 3/2/1-word
 * forward-scanning strategy documented above, generalized to any ordered
 * list of anchor texts instead of just slide bodies. Returns one result per
 * anchor, in order; `null` where no match was found (caller decides the
 * fallback — a slide keeps its word-count estimate, a component is simply
 * not placed).
 */
// 1-word and 2-word fallback matches are weak signals — ordinary words and
// short phrases recur throughout a script, so unbounded, either can
// spuriously match far ahead of where the anchor is actually spoken.
// Because the cursor only moves forward and never backtracks, one bad jump
// strands every later anchor behind it with no way to recover (verified
// live: a chain of unbounded 1- and 2-word matches dragged the cursor to
// word ~1300-1384 of 1386 while still describing content from well earlier
// in the narration, leaving nothing left to match against for the rest of
// the script). Cap how far ahead a weak fallback may look; beyond that,
// treat it as no match (existing null handling — caller keeps its estimate)
// rather than accepting a far-flung guess. Legitimate adjacent-anchor jumps
// in this codebase's real narration data are consistently under ~15 words;
// these caps are generous multiples of that, tight enough to reject the
// observed false jumps (jumps of 50-500+ words) without rejecting real
// matches after a short run of consecutive failures. The 3-word match isn't
// bounded — an exact 3-word run repeating by chance is far less likely.
const MAX_1WORD_LOOKAHEAD = 40;
const MAX_2WORD_LOOKAHEAD = 60;

export function matchTimestamps(
  anchorTexts: string[],
  alignedWords: { word: string; startSeconds: number }[],
): (number | null)[] {
  const normalizedAligned = alignedWords.map((w) => normalizeWord(w.word));
  let cursor = 0;

  return anchorTexts.map((text) => {
    const words = text.split(/\s+/).filter(Boolean).map(normalizeWord).filter(Boolean);

    let matchIndex = -1;
    for (const phraseLength of [3, 2, 1]) {
      if (words.length < phraseLength) continue;
      const to =
        phraseLength === 1
          ? cursor + MAX_1WORD_LOOKAHEAD
          : phraseLength === 2
            ? cursor + MAX_2WORD_LOOKAHEAD
            : normalizedAligned.length;
      matchIndex = findPhrase(normalizedAligned, words.slice(0, phraseLength), cursor, to);
      if (matchIndex !== -1) break;
    }
    if (matchIndex === -1) return null;

    cursor = matchIndex;
    return alignedWords[matchIndex]!.startSeconds;
  });
}
