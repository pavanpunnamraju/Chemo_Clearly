export const CALENDAR_CYCLE_SECONDS = 18;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const finite = (value: number) => Number.isFinite(value) ? value : 0;
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const between = (time: number, start: number, end: number) => smooth((time - start) / (end - start));

export type CalendarPhase = "rest" | "reach" | "flip" | "return-hand" | "draw" | "return-marker" | "hold";

export interface CalendarMotionState {
  elapsedSeconds: number;
  cycleSeconds: number;
  phase: CalendarPhase;
  reach: number;
  pageFlip: number;
  leftArmDegrees: number;
  markerX: number;
  markerY: number;
  markerDegrees: number;
  lineProgress: [number, number, number];
  pageContactActive: boolean;
  markerContactActive: boolean;
}

/** One complete, seam-safe sequence: reach, flip, return, draw, return, hold. */
export function calendarMotionState(seconds: number, reducedMotion = false): CalendarMotionState {
  const elapsedSeconds = Math.max(0, finite(seconds));
  const cycleSeconds = elapsedSeconds % CALENDAR_CYCLE_SECONDS;
  if (reducedMotion) return {
    elapsedSeconds, cycleSeconds: 0, phase: "rest", reach: 0, pageFlip: 0,
    leftArmDegrees: 0, markerX: 0, markerY: 0, markerDegrees: 0,
    lineProgress: [1, 1, 1], pageContactActive: false, markerContactActive: false,
  };

  let phase: CalendarPhase = "rest";
  if (cycleSeconds >= 1.2 && cycleSeconds < 3.8) phase = "reach";
  else if (cycleSeconds < 7 && cycleSeconds >= 3.8) phase = "flip";
  else if (cycleSeconds < 9 && cycleSeconds >= 7) phase = "return-hand";
  else if (cycleSeconds < 14.4 && cycleSeconds >= 9) phase = "draw";
  else if (cycleSeconds < 16.6 && cycleSeconds >= 14.4) phase = "return-marker";
  else if (cycleSeconds >= 16.6) phase = "hold";

  const reachIn = between(cycleSeconds, 1.2, 3.8);
  const reachOut = between(cycleSeconds, 7, 9);
  const reach = reachIn * (1 - reachOut);
  const pageFlip = between(cycleSeconds, 3.8, 7);
  const starts = [9.6, 11.15, 12.7] as const;
  const lineProgress = starts.map((start) => between(cycleSeconds, start, start + 1)) as [number, number, number];

  // The source marker rests at the right. It visits each line from left to right,
  // then returns as one connected drawing action.
  let markerX = 0, markerY = 0, markerDegrees = 0;
  if (cycleSeconds >= 9 && cycleSeconds < 14.4) {
    let tipX = 518.91, tipY = 176.77;
    if (cycleSeconds < 9.6) {
      const entry = between(cycleSeconds, 9, 9.6);
      tipX = 518.91 + (440 - 518.91) * entry; tipY = 176.77 + (248 - 176.77) * entry;
      markerDegrees = 4 * entry;
    } else if (cycleSeconds < 10.6) {
      tipX = 440 - 205 * lineProgress[0]; tipY = 248;
    } else if (cycleSeconds < 11.15) {
      const travel = between(cycleSeconds, 10.6, 11.15);
      tipX = 235 + (428 - 235) * travel; tipY = 248 + 42 * travel;
    } else if (cycleSeconds < 12.15) {
      tipX = 428 - 193 * lineProgress[1]; tipY = 290;
    } else if (cycleSeconds < 12.7) {
      const travel = between(cycleSeconds, 12.15, 12.7);
      tipX = 235 + (416 - 235) * travel; tipY = 290 + 42 * travel;
    } else {
      tipX = 416 - 181 * lineProgress[2]; tipY = 332;
    }
    markerX = tipX - 518.91;
    markerY = tipY - 176.77;
    if (cycleSeconds >= 9.6) markerDegrees = 4;
  } else if (cycleSeconds >= 14.4 && cycleSeconds < 16.6) {
    const back = between(cycleSeconds, 14.4, 16.6);
    markerX = (235 - 518.91) * (1 - back);
    markerY = (332 - 176.77) * (1 - back);
    markerDegrees = 4 * (1 - back);
  }

  return { elapsedSeconds, cycleSeconds, phase, reach, pageFlip,
    leftArmDegrees: 48 * reach, markerX, markerY, markerDegrees, lineProgress,
    pageContactActive: cycleSeconds >= 3.55 && cycleSeconds <= 7.15,
    markerContactActive: (cycleSeconds >= 9.58 && cycleSeconds <= 10.62) ||
      (cycleSeconds >= 11.13 && cycleSeconds <= 12.17) ||
      (cycleSeconds >= 12.68 && cycleSeconds <= 13.72) };
}
