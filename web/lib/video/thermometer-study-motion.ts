const smooth = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

/** Small authored arc; no IK branch, independent hand rotation or body bob. */
export function thermometerStudyPose(seconds: number, reducedMotion = false) {
  const lift = reducedMotion ? 0 : smooth((seconds - 1.5) / 2.5) * (1 - smooth((seconds - 7) / 2.5));
  return { elbowDegrees: -12 + 20 * lift, lift };
}
export const THERMOMETER_ELBOW = { x: 355, y: 449 };

export function thermometerStudyPoint(x: number, y: number, seconds: number) {
  const angle = thermometerStudyPose(seconds).elbowDegrees * Math.PI / 180;
  const dx = x - THERMOMETER_ELBOW.x, dy = y - THERMOMETER_ELBOW.y;
  return { x: THERMOMETER_ELBOW.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: THERMOMETER_ELBOW.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
}
