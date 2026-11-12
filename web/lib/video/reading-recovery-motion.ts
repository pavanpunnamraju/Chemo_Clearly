export interface ReadingRecoveryCue {
  pageStartSeconds: number;
  pageEndSeconds: number;
  comfortStartSeconds: number;
  comfortEndSeconds: number;
  returnEndSeconds: number;
}

export const DEFAULT_READING_RECOVERY_CUE: ReadingRecoveryCue = {
  pageStartSeconds: 2,
  pageEndSeconds: 4.6,
  comfortStartSeconds: 5.2,
  comfortEndSeconds: 7.5,
  returnEndSeconds: 9,
};

export const READING_RECOVERY_ICONS = [
  "book",
  "contented-face",
  "heart",
  "warm-drink",
  "music",
  "leaf",
  "flower",
  "puzzle",
  "paint-palette",
  "home",
] as const;
export type ReadingRecoveryIcon = typeof READING_RECOVERY_ICONS[number];

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const clamp01 = (value: number) => clamp(Number.isFinite(value) ? value : 0, 0, 1);
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const span = (seconds: number, start: number, end: number) => end <= start ? Number(seconds >= end) : smooth((seconds - start) / (end - start));

export function normalizeReadingRecoveryCue(durationSeconds: number, cue: ReadingRecoveryCue = DEFAULT_READING_RECOVERY_CUE): ReadingRecoveryCue {
  const duration = Math.max(.2, Number.isFinite(durationSeconds) ? durationSeconds : 9.8);
  const pageStartSeconds = clamp(cue.pageStartSeconds, 0, duration);
  const pageEndSeconds = clamp(cue.pageEndSeconds, pageStartSeconds, duration);
  const comfortStartSeconds = clamp(cue.comfortStartSeconds, pageEndSeconds, duration);
  const comfortEndSeconds = clamp(cue.comfortEndSeconds, comfortStartSeconds, duration);
  const returnEndSeconds = clamp(cue.returnEndSeconds, comfortEndSeconds, duration);
  return {pageStartSeconds, pageEndSeconds, comfortStartSeconds, comfortEndSeconds, returnEndSeconds};
}

/** Transition centers. Short narration gets the approved three-icon story;
 * a long silent study traverses the complete deterministic ten-icon library. */
export function readingRecoveryIconTransitionTimes(durationSeconds: number, cue: ReadingRecoveryCue = DEFAULT_READING_RECOVERY_CUE): number[] {
  const duration = Math.max(.2, durationSeconds);
  const normalized = normalizeReadingRecoveryCue(duration, cue);
  if (duration < 20) {
    if (duration < .8) return [];
    const first = clamp(normalized.comfortStartSeconds + .35, .25, duration - .3);
    if (duration < 2.2) return [first];
    const second = Math.max(first + 1.3, normalized.comfortEndSeconds - .3);
    if (first + .4 > duration - .25) return [first];
    return [first, clamp(second, first + .4, duration - .25)];
  }
  const first = Math.max(2.6, normalized.comfortStartSeconds + .35);
  const last = duration - 3.2;
  return Array.from({length: READING_RECOVERY_ICONS.length - 1}, (_, index) =>
    first + (last - first) * index / (READING_RECOVERY_ICONS.length - 2));
}

export function readingRecoveryIconPopSampleTimes(durationSeconds: number, cue: ReadingRecoveryCue = DEFAULT_READING_RECOVERY_CUE): number[] {
  return readingRecoveryIconTransitionTimes(durationSeconds, cue).flatMap((center) =>
    [-.19, -.18, -.01, 0, .1, .2, .38, .39].map((offset) => clamp(center + offset, 0, durationSeconds)));
}

export interface ReadingRecoveryIconLayer {
  icon: ReadingRecoveryIcon;
  iconIndex: number;
  scale: number;
  role: "current" | "outgoing" | "incoming";
}

/** Bubble remains fully opaque and fixed. Only icon scale changes: old icon
 * contracts to zero; new icon expands with a restrained 12% overshoot. */
export function readingRecoveryIconLayers(seconds: number, durationSeconds: number, cue: ReadingRecoveryCue = DEFAULT_READING_RECOVERY_CUE): ReadingRecoveryIconLayer[] {
  const transitions = readingRecoveryIconTransitionTimes(durationSeconds, cue);
  const t = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const active = transitions.findIndex((time) => t >= time - .18 && t <= time + .38);
  if (active >= 0) {
    const center = transitions[active]!;
    const outgoingScale = 1 - span(t, center - .18, center);
    const grow = span(t, center, center + .2);
    const settle = span(t, center + .2, center + .38);
    const incomingScale = grow <= 0 ? 0 : 1.12 * grow - .12 * settle;
    return [
      {icon: READING_RECOVERY_ICONS[active]!, iconIndex: active, scale: outgoingScale, role: "outgoing"},
      {icon: READING_RECOVERY_ICONS[active + 1]!, iconIndex: active + 1, scale: incomingScale, role: "incoming"},
    ];
  }
  const index = transitions.filter((time) => t > time).length;
  return [{icon: READING_RECOVERY_ICONS[index]!, iconIndex: index, scale: 1, role: "current"}];
}

export type ReadingRecoveryPhase = "reading" | "anticipate" | "turn-page" | "paper-settle" | "contented" | "return-reading" | "hold";

export interface ReadingRecoveryMotionState {
  seconds: number;
  durationSeconds: number;
  characterSeconds: number;
  cycleIndex: number;
  characterCycleEligible: boolean;
  phase: ReadingRecoveryPhase;
  pageTurn: number;
  pageCurl: number;
  pageSettle: number;
  handDegrees: number;
  headDegrees: number;
  expression: number;
  cameraProgress: number;
  pageContactActive: boolean;
  iconTransitions: number[];
  iconLayers: ReadingRecoveryIconLayer[];
}

export function readingRecoveryMotionState(seconds: number, durationSeconds: number, reducedMotion = false,
  cue: ReadingRecoveryCue = DEFAULT_READING_RECOVERY_CUE): ReadingRecoveryMotionState {
  const duration = Math.max(.2, Number.isFinite(durationSeconds) ? durationSeconds : 9.8);
  const elapsed = clamp(Number.isFinite(seconds) ? seconds : 0, 0, duration);
  const normalized = normalizeReadingRecoveryCue(duration, cue);
  const {pageStartSeconds: pageStart, pageEndSeconds: pageEnd, comfortStartSeconds: comfortStart,
    comfortEndSeconds: comfortEnd, returnEndSeconds: returnEnd} = normalized;
  const requiredCharacterSeconds = Math.max(0, Number.isFinite(cue.returnEndSeconds) ? cue.returnEndSeconds : DEFAULT_READING_RECOVERY_CUE.returnEndSeconds);
  const proposedCycleIndex = duration >= 20 ? Math.floor(elapsed / 11) : 0;
  const proposedCycleStart = proposedCycleIndex * 11;
  const characterCycleEligible = !reducedMotion && proposedCycleStart + requiredCharacterSeconds <= duration;
  const characterSeconds = characterCycleEligible ? elapsed - proposedCycleStart : 0;
  const gazeFollow = characterCycleEligible ? span(characterSeconds, pageStart + .12, pageEnd) : 0;
  const expressionIn = characterCycleEligible ? span(characterSeconds, comfortStart, comfortStart + Math.min(.42, (comfortEnd - comfortStart) * .35)) : 0;
  const expressionOut = characterCycleEligible ? span(characterSeconds, comfortEnd, returnEnd) : 0;
  const expression = expressionIn * (1 - expressionOut);
  const returnToBook = characterCycleEligible ? span(characterSeconds, comfortEnd, returnEnd) : 0;
  const cameraProgress = reducedMotion ? 1 : span(elapsed, .45, Math.max(.8, Math.min(duration - .35, comfortStart)));
  let phase: ReadingRecoveryPhase = "reading";
  if (characterCycleEligible) {
    if (characterSeconds >= comfortStart && characterSeconds < comfortEnd) phase = "contented";
    else if (characterSeconds >= comfortEnd && characterSeconds < returnEnd) phase = "return-reading";
    else if (characterSeconds >= returnEnd) phase = "hold";
  }
  return {
    seconds: elapsed,
    durationSeconds: duration,
    characterSeconds,
    cycleIndex: proposedCycleIndex,
    characterCycleEligible,
    phase,
    pageTurn: 0,
    pageCurl: 0,
    pageSettle: 0,
    handDegrees: 0,
    headDegrees: 2.8 * gazeFollow * (1 - returnToBook) - 5.1 * expression,
    expression,
    cameraProgress,
    pageContactActive: false,
    iconTransitions: readingRecoveryIconTransitionTimes(duration, normalized),
    iconLayers: reducedMotion ? [{icon: "heart", iconIndex: 2, scale: 1, role: "current"}] : readingRecoveryIconLayers(elapsed, duration, normalized),
  };
}

export interface ReadingPoint {x: number; y: number}
export const READING_SHOULDER: ReadingPoint = {x: 143.5, y: 248};
export const READING_FINGER_REST: ReadingPoint = {x: 83.5, y: 282.8};
export const READING_PAGE_SPINE: ReadingPoint = {x: 58.2, y: 295.2};

export function rotateReadingPoint(point: ReadingPoint, degrees: number, pivot = READING_SHOULDER): ReadingPoint {
  const radians = degrees * Math.PI / 180;
  const x = point.x - pivot.x;
  const y = point.y - pivot.y;
  return {x: pivot.x + x * Math.cos(radians) - y * Math.sin(radians), y: pivot.y + x * Math.sin(radians) + y * Math.cos(radians)};
}

export function readingRecoveryActualGeometry(state: ReadingRecoveryMotionState) {
  const finger = rotateReadingPoint(READING_FINGER_REST, state.handDegrees);
  return {
    shoulder: READING_SHOULDER,
    finger,
    pageSpine: READING_PAGE_SPINE,
    contactTarget: state.pageContactActive ? finger : null,
    handTransform: state.handDegrees === 0 ? null : `rotate(${state.handDegrees} ${READING_SHOULDER.x} ${READING_SHOULDER.y})`,
    headTransform: state.headDegrees === 0 ? null : `rotate(${state.headDegrees} 122 244)`,
    bubbleOpacity: 1,
    iconOpacities: state.iconLayers.map(() => 1),
    iconScales: state.iconLayers.map((layer) => layer.scale),
  };
}
