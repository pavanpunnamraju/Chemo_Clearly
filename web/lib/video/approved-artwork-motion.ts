import type { DirectedShot } from "./direction-types";
import { callingStudyPose } from "./calling-study-motion";
import { DRINKING_SPEED, drinkingStudyPose } from "./drinking-study-motion";

export type ApprovedArtwork = "calling" | "drinking";
export const APPROVED_ARTWORK_PAUSE_SECONDS = 2.5;

/** Eligibility is source-validated by the director before rendering. Require
 * both semantic identifiers here; never infer a self-care action from a scene. */
export function approvedArtworkForShot(shot: DirectedShot): ApprovedArtwork | null {
  if (shot.safetyCard) return null;
  if (shot.assetId === "patient-contact" && shot.action === "call") return "calling";
  if (shot.assetId === "patient-hydration" && (shot.action === "drink" || shot.action === "rest")) return "drinking";
  return null;
}

/** Translate the narration cue into repeated original study clocks, without
 * scaling time. Pause at rest between complete cycles. Start another cycle only
 * when its full return (and calling blink) fits before the boundary hold.
 * Drinking's 1.15 multiplier belongs exclusively to drinking-study-motion. */
export function approvedArtworkMotion(shot: DirectedShot, seconds: number, reducedMotion = false) {
  const artwork = approvedArtworkForShot(shot);
  const onset = artwork === "drinking" ? 1.5 / DRINKING_SPEED : 1.5;
  const end = artwork === "drinking" ? 9.5 / DRINKING_SPEED : 9.65;
  const cue = Math.max(.35, shot.cueSeconds - shot.startSeconds);
  const duration = shot.endSeconds - shot.startSeconds;
  const actionSeconds = end - onset;
  const cycleSeconds = actionSeconds + APPROVED_ARTWORK_PAUSE_SECONDS;
  const elapsed = Math.max(0, seconds - cue);
  const cycle = Math.floor(elapsed / cycleSeconds);
  const cycleStart = cue + cycle * cycleSeconds;
  const still = reducedMotion || !artwork || shot.action === "rest" || duration - cycleStart < actionSeconds + .7;
  const clock = still ? 0 : Math.max(0, Math.min(end + APPROVED_ARTWORK_PAUSE_SECONDS, seconds - cycleStart + onset));
  const attention = artwork === "drinking" ? drinkingStudyPose(clock, still).reach : callingStudyPose(clock, still).attention;
  return { artwork, seconds: clock, still, cycle,
    scale: still || shot.camera === "establish" ? 1 : 1 + attention * (artwork === "drinking" ? .025 : .035) };
}
