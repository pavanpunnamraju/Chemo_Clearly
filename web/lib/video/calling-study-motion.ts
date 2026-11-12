const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

export const CALLING_WAIST = { x: 367, y: 266 };

/** A listening inclination, with the complete contact chain in one rigid layer. */
export function callingStudyPose(seconds: number, reducedMotion = false) {
  if (reducedMotion) return { degrees: 0, attention: 0, eyeScale: 1 };
  const attention = smooth((seconds - 1.5) / 2) * (1 - smooth((seconds - 6) / 2.5));
  const blink = Math.max(...[4.6, 9.4].map((start) =>
    smooth((seconds - start) / .1) * (1 - smooth((seconds - start - .1) / .15))));
  return { degrees: 2 * attention, attention, eyeScale: 1 - .9 * blink };
}

export function callingStudyPoint(x: number, y: number, seconds: number) {
  const angle = callingStudyPose(seconds).degrees * Math.PI / 180;
  const dx = x - CALLING_WAIST.x, dy = y - CALLING_WAIST.y;
  return { x: CALLING_WAIST.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: CALLING_WAIST.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
}
