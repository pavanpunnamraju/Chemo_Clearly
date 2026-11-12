export const INFUSION_CYCLE_SECONDS = 12;
export const INFUSION_DEFAULT_DURATION_SECONDS = 24;
export const INFUSION_DEFAULT_FLUID_DROP_FRACTION = 1;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const finiteOrZero = (value: number) => Number.isFinite(value) ? value : 0;

export interface InfusionMotionState {
  elapsedSeconds: number;
  cycleSeconds: number;
  expression: number;
  plantDegrees: number;
  eyeX: number;
  eyeY: number;
  eyebrowX: number;
  eyebrowY: number;
  mouthX: number;
  fluidProgress: number;
  fluidDropFraction: number;
  fluidSurfaceY: number;
}

/** The character and foliage share a calm 12-second cycle. Fluid progress uses
 * clamped, unwrapped elapsed time, so it cannot refill when that cycle repeats. */
export function infusionMotionState(
  seconds: number,
  durationSeconds = INFUSION_DEFAULT_DURATION_SECONDS,
  reducedMotion = false,
  fluidDropFraction = INFUSION_DEFAULT_FLUID_DROP_FRACTION,
): InfusionMotionState {
  const duration = Math.max(0.001, finiteOrZero(durationSeconds) || INFUSION_DEFAULT_DURATION_SECONDS);
  const elapsedSeconds = Math.min(duration, Math.max(0, finiteOrZero(seconds)));
  const drop = clamp01(finiteOrZero(fluidDropFraction));
  if (reducedMotion) {
    return { elapsedSeconds, cycleSeconds: 0, expression: 0, plantDegrees: 0,
      eyeX: 0, eyeY: 0, eyebrowX: 0, eyebrowY: 0, mouthX: 0,
      fluidProgress: 0, fluidDropFraction: drop, fluidSurfaceY: 126 };
  }
  const cycleSeconds = elapsedSeconds % INFUSION_CYCLE_SECONDS;
  const phase = cycleSeconds / INFUSION_CYCLE_SECONDS;
  const expression = Math.sin(Math.PI * phase) ** 2;
  const drainSeconds = duration > 2 ? duration - 2 : duration;
  const fluidProgress = clamp01(elapsedSeconds / drainSeconds);
  return {
    elapsedSeconds,
    cycleSeconds,
    expression,
    plantDegrees: 2.7 * Math.sin(phase * Math.PI * 2),
    eyeX: -3.1 * expression,
    eyeY: -0.35 * expression,
    eyebrowX: -2.9 * expression,
    eyebrowY: -1.35 * expression,
    mouthX: -2.2 * expression,
    fluidProgress,
    fluidDropFraction: drop,
    // The source reservoir begins near y=126; y=174 clears every fluid path.
    fluidSurfaceY: 126 + 48 * drop * fluidProgress,
  };
}
