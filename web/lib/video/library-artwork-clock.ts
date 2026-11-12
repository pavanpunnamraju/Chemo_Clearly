import { PATIENT_ARTWORK_RECIPES, PATIENT_MOTION_PERIOD } from "./library-patient-motion";

/** Keep each recipe's native clock. Pause instead of starting an incomplete
 * repeat; this decision is constant throughout a cycle, never mid-gesture. */
export function libraryArtworkClock(artworkId: string, seconds: number, duration: number, reducedMotion = false) {
  const patient = Boolean(PATIENT_ARTWORK_RECIPES[artworkId]);
  const extra = ["care-alert-staff", "care-thoughts", "care-headwear", "care-bruising", "care-warm-compress", "care-bowel", "care-treatment-history", "care-warning"].includes(artworkId);
  const period = patient ? PATIENT_MOTION_PERIOD : extra ? 10 : 9;
  // Patient recipes include a final blink ending at 9.2s. Context recipes may
  // offset gestures by a small phase; reserve the full native cycle for those.
  const complete = patient ? 9.2 : extra ? 7 : 8;
  const cycleStart = Math.floor(Math.max(0, seconds) / period) * period;
  const still = reducedMotion || duration - cycleStart < complete + .5;
  return { seconds: still ? 0 : Math.max(0, seconds), still, period };
}
