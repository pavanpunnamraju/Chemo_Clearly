import type { WordOffset } from "./align";
import { matchTimestamps } from "./narration";
import type { Caption } from "@remotion/captions";
import { assertReliableTiming, type DirectedTiming, type TimedScriptWord } from "./timing";

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

export interface DirectedCaptionDiagnostics {
  valid: boolean;
  maxCharactersPerLine: number;
  maxLines: number;
  fastestCharactersPerSecond: number;
  issues: { cueIndex: number; code: string; message: string; severity: "error" | "warning" }[];
}

export interface DirectedCaptionTrack {
  /** Same units as the existing renderer. Newlines are deliberate line breaks. */
  captions: TimedCaption[];
  /** Remotion's Caption JSON schema. Cues retain exact narration punctuation. */
  captionJson: Caption[];
  vtt: string;
  diagnostics: DirectedCaptionDiagnostics;
}

function wrapCaption(text: string, maxCharactersPerLine: number): string {
  if (text.length <= maxCharactersPerLine) return text;
  const spaces = [...text.matchAll(/ /g)].map((m) => m.index!);
  let best: number | undefined;
  for (const space of spaces) {
    if (space <= maxCharactersPerLine && text.length - space - 1 <= maxCharactersPerLine &&
      (best === undefined || Math.abs(space - text.length / 2) < Math.abs(best - text.length / 2))) best = space;
  }
  return best === undefined ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`;
}

/**
 * Caption pages use the same verified word clock as direction. Each cue is at
 * most two explicit lines; short/fast cues are reported instead of hidden by
 * merging unlimited text or displaying a guessed caption through an ASR gap.
 */
export function buildDirectedCaptionTrack(timing: DirectedTiming): DirectedCaptionTrack {
  assertReliableTiming(timing);
  const lineLimit = 38;
  const groups: TimedScriptWord[][] = [];
  let group: TimedScriptWord[] = [];
  const flush = () => { if (group.length) groups.push(group); group = []; };
  for (const [index, word] of timing.words.entries()) {
    const previous = group[group.length - 1];
    const canSplit = !previous || word.startSeconds >= previous.endSeconds - 0.001;
    const candidate = [...group, word].map((w) => w.text).join(" ");
    const wrapped = wrapCaption(candidate, lineLimit);
    if (group.length && canSplit && (wrapped.split("\n").some((line) => line.length > lineLimit) ||
      word.endSeconds - group[0]!.startSeconds > 6 || word.entryId !== group[0]!.entryId ||
      word.startSeconds - previous!.endSeconds > 0.8)) flush();
    group.push(word);
    const next = timing.words[index + 1];
    if (/[.!?;]$/.test(word.text) && group.map((w) => w.text).join(" ").length >= 24 &&
      word.endSeconds - group[0]!.startSeconds >= 1.1 && (!next || next.startSeconds >= word.endSeconds)) flush();
  }
  flush();
  const issues: DirectedCaptionDiagnostics["issues"] = [];
  let fastestCharactersPerSecond = 0;
  const captionJson: Caption[] = groups.map((words, cueIndex) => {
    const startSeconds = words[0]!.startSeconds;
    const actualEnd = words[words.length - 1]!.endSeconds;
    const nextStart = groups[cueIndex + 1]?.[0]?.startSeconds ?? timing.audioDurationSeconds;
    const endSeconds = Math.min(nextStart, timing.audioDurationSeconds, Math.max(actualEnd + 0.15, startSeconds + 1.33));
    const text = wrapCaption(words.map((word) => word.text).join(" "), lineLimit);
    const cps = text.length / (endSeconds - startSeconds);
    fastestCharactersPerSecond = Math.max(fastestCharactersPerSecond, cps);
    if (text.split("\n").some((line) => line.length > lineLimit)) issues.push({ cueIndex, code: "caption-line-overflow", severity: "error", message: `Cue ${cueIndex} cannot fit two ${lineLimit}-character lines without splitting a timed word span.` });
    if (endSeconds <= startSeconds || endSeconds < actualEnd - 0.001) issues.push({ cueIndex, code: "caption-time-conflict", severity: "error", message: `Cue ${cueIndex} has conflicting speech timing.` });
    if (cps > 22) issues.push({ cueIndex, code: "caption-reading-speed", severity: cps > 28 ? "error" : "warning", message: `Cue ${cueIndex} requires ${cps.toFixed(1)} characters per second; inspect delivery and readability.` });
    if (endSeconds - startSeconds < 1) issues.push({ cueIndex, code: "brief-caption", severity: "warning", message: `Cue ${cueIndex} is visible for less than one second.` });
    const confidences = words.map((w) => w.confidence).filter((c): c is number => c !== null);
    return { text, startMs: Math.round(startSeconds * 1000), endMs: Math.round(endSeconds * 1000),
      timestampMs: null, confidence: confidences.length ? Math.min(...confidences) : null };
  });
  const captions = captionJson.map((cue) => ({ text: cue.text, startSeconds: cue.startMs / 1000, endSeconds: cue.endMs / 1000 }));
  return { captions, captionJson, vtt: captionsToVtt(captionJson), diagnostics: {
    valid: !issues.some((issue) => issue.severity === "error"), maxCharactersPerLine: lineLimit, maxLines: 2,
    fastestCharactersPerSecond, issues,
  } };
}

function vttTimestamp(ms: number): string {
  const value = Math.max(0, Math.round(ms));
  return `${String(Math.floor(value / 3_600_000)).padStart(2, "0")}:${String(Math.floor(value / 60_000) % 60).padStart(2, "0")}:${String(Math.floor(value / 1000) % 60).padStart(2, "0")}.${String(value % 1000).padStart(3, "0")}`;
}

export function captionsToVtt(captions: Caption[]): string {
  const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `WEBVTT\n\n${captions.map((cue, index) => `${index + 1}\n${vttTimestamp(cue.startMs)} --> ${vttTimestamp(cue.endMs)}\n${escapeText(cue.text)}\n`).join("\n")}`;
}
