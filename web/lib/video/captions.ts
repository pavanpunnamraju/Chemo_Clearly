import type { WordOffset } from "./align";
import { matchTimestamps } from "./narration";

export interface TimedCaption {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

// BBC pre-recorded-caption norm: ≤2 lines × ~37 chars/line. Used as a total
// budget per cue (not enforced per-line — the renderer wraps at box width).
const CAPTION_CHAR_BUDGET = 74;
// Don't close a cue on a trivial early comma — require this much text first.
const MIN_CUE_CHARS = 30;
const CLAUSE_BOUNDARY_PUNCTUATION = /[.,;—]$/;
const COORDINATING_CONJUNCTIONS = new Set(["and", "but"]);

/**
 * Groups words into cues at sentence/clause boundaries (punctuation or a
 * leading coordinating conjunction) once a cue has a reasonable minimum
 * length, or at the char budget if no boundary arrives first — instead of
 * chopping every N words regardless of where a sentence falls.
 */
function buildCaptionGroups(words: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];

  for (const word of words) {
    const isConjunction = COORDINATING_CONJUNCTIONS.has(word.toLowerCase());
    const currentLength = current.join(" ").length;

    // Close before a conjunction that starts a new clause.
    if (isConjunction && current.length > 0 && currentLength >= MIN_CUE_CHARS) {
      groups.push(current);
      current = [];
    }

    // Close if adding this word would blow the char budget.
    const projectedLength = current.length > 0 ? currentLength + 1 + word.length : word.length;
    if (current.length > 0 && projectedLength > CAPTION_CHAR_BUDGET) {
      groups.push(current);
      current = [];
    }

    current.push(word);

    // Close after a clause-ending punctuation mark.
    if (CLAUSE_BOUNDARY_PUNCTUATION.test(word) && current.join(" ").length >= MIN_CUE_CHARS) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}
// WCAG 2.1 AA-informed minimum display time (per logic-agent's gap-audit
// research) — a chunk stays on screen at least this long even if that means
// merging in the next chunk, so fast-spoken passages don't flash captions
// too quickly to read.
const MIN_DISPLAY_SECONDS = 1.33;
// Netflix TTSG max-duration guideline — caps a chunk's display window
// regardless of why it got long (e.g. its start fell back to prevEnd because
// STT dropped its leading words, then its end inherited a distant real
// match). Applied universally after start/end resolution rather than
// special-casing fallback chunks, so it also covers any other pathological
// gap the same way.
const MAX_DISPLAY_SECONDS = 7;
// Independent stop condition for the merge-forward loop below, on top of
// MIN_DISPLAY_SECONDS: when matchTimestamps fails on many consecutive groups
// (their resolved starts all collapse near the same point, so their apparent
// duration reads as ~0), the loop would otherwise keep absorbing groups
// indefinitely, chaining their *text* into one mega-caption. Capping
// accumulated text at ~2x the chunk budget makes that structurally
// impossible regardless of how many matches fail in a row — a short cue is
// preferred over a long unreadable one, so this never backfills duration.
const MERGE_TEXT_CEILING = 150;

/**
 * Groups the known narration script (not Speech-to-Text's transcription —
 * see below) into timed caption chunks, using the same content-based
 * word-matching (narration.ts's matchTimestamps) already used to time slide
 * beats and component overlays.
 *
 * Caption *text* comes from the verbatim script, not from `alignedWords`.
 * Speech-to-Text sometimes fails to recognize uncommon terms outright
 * (verified live: it dropped an entire run of chemo drug names —
 * "Cyclophosphamide, doxorubicin ... vincristine ... Prednisone" — from its
 * word list for this exact script) rather than mis-hearing them, so a
 * caption track built from its output can silently omit real content. That
 * fails the 99%+ transcript-accuracy bar this goal requires. Using the
 * script as the source of truth and alignment only for *timing* guarantees
 * caption text always matches what's said, at the cost of a chunk
 * occasionally starting at its predecessor's end (see resolvedStarts below)
 * when a chunk's leading words happen to be exactly the ones STT missed.
 */
export function buildCaptionTrack(
  script: string,
  alignedWords: WordOffset[],
  audioDurationSeconds: number,
): TimedCaption[] {
  const words = script.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const groups = buildCaptionGroups(words);

  const starts = matchTimestamps(
    groups.map((g) => g.join(" ")),
    alignedWords,
  );

  // Unmatched anchor (the chunk's leading words weren't found in the
  // aligned word list) starts immediately where the previous chunk ended,
  // keeping timing monotonic instead of collapsing to 0.
  const resolvedStarts: number[] = [];
  let prevEnd = 0;
  for (const s of starts) {
    const start = s ?? prevEnd;
    resolvedStarts.push(start);
    prevEnd = start;
  }

  const captions: TimedCaption[] = [];
  let i = 0;
  while (i < groups.length) {
    let j = i;
    const startSeconds = resolvedStarts[i]!;
    let endSeconds = j + 1 < groups.length ? resolvedStarts[j + 1]! : audioDurationSeconds;
    // Merge forward chunks whose real display window would fall under the
    // minimum, so every caption gets its full read time — but stop early if
    // absorbing the next group would blow the text ceiling (see
    // MERGE_TEXT_CEILING), even if duration is still short.
    while (
      endSeconds - startSeconds < MIN_DISPLAY_SECONDS &&
      j + 1 < groups.length &&
      groups.slice(i, j + 2).flat().join(" ").length <= MERGE_TEXT_CEILING
    ) {
      j++;
      endSeconds = j + 1 < groups.length ? resolvedStarts[j + 1]! : audioDurationSeconds;
    }
    // Split into MAX_DISPLAY_SECONDS-long segments (repeating the same text)
    // rather than truncating and dropping the remainder — a single capped
    // cue previously left a blank gap between its cut-off end and the next
    // chunk's real start whenever the natural window (this chunk's start to
    // the next chunk's start) ran past the cap, e.g. from a chunk whose
    // start fell back to prevEnd and whose end then inherited a distant real
    // match (see MAX_DISPLAY_SECONDS's comment above). Caught live: a ~3s
    // blank span mid-narration with no caption despite continuous speech.
    const text = groups.slice(i, j + 1).flat().join(" ");
    let segStart = startSeconds;
    do {
      const segEnd = Math.min(endSeconds, segStart + MAX_DISPLAY_SECONDS);
      captions.push({ text, startSeconds: segStart, endSeconds: Math.max(segEnd, segStart) });
      segStart = segEnd;
    } while (segStart < endSeconds);
    i = j + 1;
  }
  return captions;
}
