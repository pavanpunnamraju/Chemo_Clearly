/** Explicit day/week mentions only. Duration phrases such as "3-week cycle"
 * must not become a fabricated ordinal "week 3". All times use narration seconds. */
export interface ScheduleNumberCue {
  unit: "day" | "week";
  numbers: number[];
  startSeconds: number;
  endSeconds: number;
  sourceRef: string;
  text: string;
}
export interface ScheduleWord { text: string; startSeconds: number; endSeconds: number }
const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50 };

/** Call with a selected source entry's aligned words, not unscoped recognition. */
export function scheduleCuesFromWords(words: readonly ScheduleWord[], sourceRef: string, endSeconds: number): ScheduleNumberCue[] {
  const atoms = words.flatMap((word, wordIndex) => (word.text.toLowerCase().match(/\d+(?:\.\d+)?|[a-z]+|[–—-]/g) ?? [])
    .map(text => ({ text, wordIndex })));
  function readNumber(index: number): { value: number; last: number } | null {
    const token = atoms[index]?.text;
    if (!token) return null;
    if (/^\d+$/.test(token)) return { value: Number(token), last: index };
    let value = numberWords[token];
    if (!value) return null;
    let last = index;
    if (value >= 20) {
      const next = atoms[index + 1]?.text === "-" ? index + 2 : index + 1;
      const ones = numberWords[atoms[next]?.text ?? ""];
      if (ones && ones < 10) { value += ones; last = next; }
    }
    return { value, last };
  }
  const cues: ScheduleNumberCue[] = [];
  for (let index = 0; index < atoms.length; index++) {
    const unit = atoms[index]!.text;
    if (!/^(days?|weeks?)$/.test(unit)) continue;
    const first = readNumber(index + 1);
    if (!first) continue;
    let last = first;
    if (/^(to|through|–|—|-)$/.test(atoms[first.last + 1]?.text ?? "")) {
      const endpoint = readNumber(first.last + 2);
      if (!endpoint) continue;
      last = endpoint;
    }
    // Reject malformed/out-of-grid inputs instead of clamping medical numbers.
    if (first.value < 1 || last.value < first.value || last.value > 52) continue;
    const firstWord = atoms[index]!.wordIndex;
    const finalWord = atoms[last.last]!.wordIndex;
    // Do not match across a sentence boundary or a long unrelated pause.
    if (words[finalWord]!.endSeconds - words[firstWord]!.startSeconds > 5 ||
      words.slice(firstWord, finalWord).some(word => /[.!?;]/.test(word.text))) continue;
    const startSeconds = words[finalWord]!.startSeconds;
    if (!Number.isFinite(startSeconds) || endSeconds <= startSeconds) continue;
    cues.push({ unit: unit.startsWith("day") ? "day" : "week",
      numbers: Array.from({ length: last.value - first.value + 1 }, (_, offset) => first.value + offset),
      startSeconds, endSeconds, sourceRef, text: words.slice(firstWord, finalWord + 1).map(word => word.text).join(" ") });
    index = last.last;
  }
  return cues.map((cue, index) => ({ ...cue, endSeconds: Math.min(cue.endSeconds, cues[index + 1]?.startSeconds ?? endSeconds) }));
}

export const SCHEDULE_FADE_SECONDS = .4;
/** Previous range fades out at its end; the next fades in from its spoken cue.
 * Reduced motion changes information at the same cue with no animated fade. */
export function scheduleNumberState(cues: readonly ScheduleNumberCue[], seconds: number, reducedMotion = false): {
  unit: "day" | "week" | null; numbers: { value: number; opacity: number }[];
} {
  const active = cues.filter(cue => cue.startSeconds <= seconds && seconds < cue.endSeconds);
  const current = active.at(-1);
  const outgoingCandidate = reducedMotion ? undefined : cues.filter(cue => cue.endSeconds <= seconds && seconds < cue.endSeconds + SCHEDULE_FADE_SECONDS).at(-1);
  const followingUnit = outgoingCandidate && cues.find(cue => cue.startSeconds >= outgoingCandidate.endSeconds)?.unit;
  const outgoing = followingUnit && followingUnit !== outgoingCandidate?.unit ? undefined : outgoingCandidate;
  const unit = current?.unit ?? outgoing?.unit ?? null;
  const values = new Map<number, number>();
  if (outgoing?.unit === unit) for (const value of outgoing.numbers) values.set(value, 1 - (seconds - outgoing.endSeconds) / SCHEDULE_FADE_SECONDS);
  if (current) {
    const nextUnit = cues.find(cue => cue.startSeconds >= current.endSeconds)?.unit;
    // Different units cannot share one label during a crossfade. Fade the old
    // unit before the boundary, then reveal the new unit on its spoken cue.
    const unitExit = nextUnit && nextUnit !== current.unit ? Math.min(1, (current.endSeconds - seconds) / SCHEDULE_FADE_SECONDS) : 1;
    const opacity = reducedMotion ? 1 : Math.min(1, (seconds - current.startSeconds) / SCHEDULE_FADE_SECONDS) * unitExit;
    for (const value of current.numbers) values.set(value, Math.max(values.get(value) ?? 0, opacity));
  }
  return { unit, numbers: [...values].sort(([a], [b]) => a - b).map(([value, opacity]) => ({ value, opacity })) };
}
