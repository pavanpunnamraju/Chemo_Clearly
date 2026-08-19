import type { WordOffset } from "./align";
import { matchTimestamps } from "./narration";

export interface TimedCaption {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

// Readable caption norm: a handful of words per line/chunk.
const MAX_WORDS_PER_CAPTION = 8;
// WCAG 2.1 AA-informed minimum display time (per logic-agent's gap-audit
// research) — a chunk stays on screen at least this long even if that means
// merging in the next chunk, so fast-spoken passages don't flash captions
// too quickly to read.
const MIN_DISPLAY_SECONDS = 1.33;

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

  const groups: string[][] = [];
  for (let i = 0; i < words.length; i += MAX_WORDS_PER_CAPTION) {
    groups.push(words.slice(i, i + MAX_WORDS_PER_CAPTION));
  }

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
    // minimum, so every caption gets its full read time.
    while (endSeconds - startSeconds < MIN_DISPLAY_SECONDS && j + 1 < groups.length) {
      j++;
      endSeconds = j + 1 < groups.length ? resolvedStarts[j + 1]! : audioDurationSeconds;
    }
    captions.push({
      text: groups.slice(i, j + 1).flat().join(" "),
      startSeconds,
      endSeconds,
    });
    i = j + 1;
  }
  return captions;
}
