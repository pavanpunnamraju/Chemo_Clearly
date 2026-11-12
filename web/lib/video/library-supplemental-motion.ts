/** Optional, source-preserving alternatives. Deliberately outside the current
 * production registry: adding these does not change existing candidate renders. */
export const SUPPLEMENTAL_ARTWORK_RECIPES = [
  {
    id: "supplemental-gentle-activity",
    publicPath: "illustrations/daily_life/daily_life__healthy-lifestyle-bro.svg",
    sourceSha256: "dfcff032b979f53c9335424e46af138ebb63a69dfc02eca694d6c7797d97ee64",
    semantics: "Two adults in the original activity pose, with quiet eye blinks.",
    restriction: "Activity context only. The held source pose is not a walking demonstration or exercise protocol; floating food and fitness symbols are removed.",
  },
  {
    id: "supplemental-remote-support",
    publicPath: "illustrations/patient_voices/patient_voices__active-support-bro.svg",
    sourceSha256: "5a12acdfa7d8597477efb1baeb1c61b6236f0f1f790cc219e1a133d9c8b10fca",
    semantics: "A person wearing a headset on a laptop screen, gently attending and blinking.",
    restriction: "Receiving-side remote support context only. No guaranteed response, emergency action, clinical role, review rating or invented screen information; stock screen UI is removed.",
  },
] as const;

export const SUPPLEMENTAL_CYCLE_SECONDS = 12;
export const supplementalArtworkRecipe = (id: string) => SUPPLEMENTAL_ARTWORK_RECIPES.find((recipe) => recipe.id === id);
const smooth = (value: number) => { const p = Math.max(0, Math.min(1, value)); return p * p * (3 - 2 * p); };

export function supplementalMotion(seconds: number, reducedMotion = false, blinkOffset = 0) {
  const t = Math.max(0, seconds) % SUPPLEMENTAL_CYCLE_SECONDS;
  const attention = reducedMotion ? 0 : smooth((t - 1) / 2) * (1 - smooth((t - 5) / 2));
  const close = (peak: number) => {
    const distance = Math.abs(t - peak);
    return 1 - smooth(distance / .14);
  };
  const blink = reducedMotion ? 0 : Math.max(close(3.8 + blinkOffset), close(8.9 + blinkOffset));
  return { angle: attention * .65, eyeScaleY: 1 - blink * .92 };
}
