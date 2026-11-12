export interface PatientArtworkRecipe {
  id: string;
  publicPath: string;
  sourceSha256: string;
  characterGroup: string;
  directChildren: number;
  firstPathPrefix: string;
  keepGroups: string[];
  viewBox: string;
  semantics: string[];
  excludes: string[];
  motion: string;
}

/** Actual inspected subjects, not filename-derived clinical capabilities.
 * These adaptations require visual review; source medical approval is separate.
 */
export const PATIENT_ARTWORK_RECIPES: Record<string, PatientArtworkRecipe> = {
  "patient-washing": {
    id: "patient-washing", publicPath: "illustrations/side_effects/side_effects__handwashing.svg",
    sourceSha256: "fb71d6b16033b62b5dacfd03e7cb3e3994e4d41e979fc5b73804b98fda6f5b66",
    characterGroup: "freepik--Character--inject-3", directChildren: 65, firstPathPrefix: "M290.77,366",
    keepGroups: ["freepik--Sink--inject-3", "freepik--Character--inject-3", "freepik--Tap--inject-3"], viewBox: "35 62 410 420",
    semantics: ["handwashing", "infection-prevention", "household-hand-hygiene"], excludes: ["timed-washing-protocol"],
    motion: "Small connected palm-and-sleeve movement, original foam emphasis, and blink; sink and faucet remain fixed.",
  },
  "patient-rest": {
    id: "patient-rest", publicPath: "illustrations/side_effects/side_effects__tiredness-pana.svg",
    sourceSha256: "7cc9c41dd863e227eccec116cf5c761b0d17597f4709c0ca2b774e3044db794f",
    characterGroup: "freepik--Character--inject-3", directChildren: 63, firstPathPrefix: "M202.59,131.71",
    keepGroups: ["freepik--Character--inject-3"], viewBox: "138 70 260 258",
    semantics: ["fatigue", "rest", "pacing"], excludes: ["coffee", "hydration", "temperature-measurement"],
    motion: "Small supported-head settling gesture with original palm, forearm and sleeve moving together; coffee removed and lower grip cropped out.",
  },
  "patient-distress": {
    id: "patient-distress", publicPath: "illustrations/side_effects/side_effects__emotional-support.svg",
    sourceSha256: "e12582486a5dd503fd7e9b81f38f83bd91a2419ee9fcc15dac9f9c1354c37d64",
    characterGroup: "freepik--Character--inject-3", directChildren: 54, firstPathPrefix: "M184.79,150.33",
    keepGroups: ["freepik--Character--inject-3"], viewBox: "65 110 355 380",
    semantics: ["distress", "mood-changes", "worry"], excludes: ["support-conversation", "trembling", "panic-attack-demonstration"],
    motion: "Restrained upper-body breath with waist pinned and both hand-to-temple contact chains intact; no shaking or alarm symbols.",
  },
  "patient-hair": {
    id: "patient-hair", publicPath: "illustrations/side_effects/side_effects__hair-loss.svg",
    sourceSha256: "d6913fe1466491d32dcaec4b4a5fc1cfca02609e7934300b63d03eb3a6e9dc54",
    characterGroup: "freepik--Character--inject-67", directChildren: 89, firstPathPrefix: "M122,188.25",
    keepGroups: ["freepik--Character--inject-67"], viewBox: "60 45 390 430",
    semantics: ["hair-changes", "hair-loss"], excludes: ["falling-hair-animation", "guaranteed-regrowth", "scalp-care-demonstration"],
    motion: "Two original-eye blinks; held pose remains intact and all detached falling-hair background marks are removed.",
  },
  "patient-hand": {
    id: "patient-hand", publicPath: "illustrations/side_effects/side_effects__nerve-tingling.svg",
    sourceSha256: "9b18ceacf085c9c43a1a4f2f503c885679011a313efd3a9d684a5ed872cb33f7",
    characterGroup: "freepik--Hand--inject-35", directChildren: 1, firstPathPrefix: "M318.058,328.489",
    keepGroups: ["freepik--Hand--inject-35", "freepik--Lines--inject-35"], viewBox: "70 60 355 410",
    semantics: ["hand-tingling", "hand-numbness", "neuropathy"], excludes: ["foot-inspection", "treatment", "worsening-pain"],
    motion: "Slow localized emphasis on original sensation marks; hand anatomy and wrist stay fixed.",
  },
  "patient-sleep": {
    id: "patient-sleep", publicPath: "illustrations/side_effects/side_effects__sleep-analysis-pana.svg",
    sourceSha256: "3111b9307255a6c65605b6e013584e6f512b4b62d7f7480dc5ebb8efe38bfbcf",
    characterGroup: "freepik--Character--inject-3", directChildren: 47, firstPathPrefix: "M580,349.33",
    keepGroups: ["freepik--Character--inject-3"], viewBox: "180 245 425 218",
    semantics: ["sleep", "rest", "sleep-changes"], excludes: ["sleep-score", "sleep-analysis", "sedation"],
    motion: "Small blanket/chest breath over a stationary bed, pillow and resting head; entire analysis overlay and 702-point score removed.",
  },
  "patient-abdomen": {
    id: "patient-abdomen", publicPath: "illustrations/side_effects/side_effects__mouth-digestion.svg",
    sourceSha256: "52e9af5b77db04ae4ba36ae59d072112ebb90987d2dca2eb0e166ab6634a6005",
    characterGroup: "freepik--Character--inject-13", directChildren: 30, firstPathPrefix: "M212.77,456.35",
    keepGroups: ["freepik--Character--inject-13"], viewBox: "188 85 185 410",
    semantics: ["abdominal-discomfort", "abdominal-cramps"], excludes: ["mouth-sores", "oral-care", "nausea-self-care"],
    motion: "Small upper-body settle at the waist with both hands held against the abdomen; pants and feet fixed, pain rays removed.",
  },
  "patient-stretch": {
    id: "patient-stretch", publicPath: "illustrations/daily_life/daily_life__stretching-exercises-bro.svg",
    sourceSha256: "f567e6333def2baae547c0a2d5fbc19a0f65f1dfa5cb39a0617dd54adae16019",
    characterGroup: "freepik--Character--inject-7", directChildren: 1, firstPathPrefix: "M268.47,413.55",
    keepGroups: ["freepik--Character--inject-7"], viewBox: "90 250 335 230",
    semantics: ["gentle-activity", "seated-stretch"], excludes: ["jogging", "walking-demonstration", "prescribed-exercise-routine", "balance-trouble"],
    motion: "Small head release while holding an existing seated stretch; foot/hand contact, pelvis and legs remain fixed.",
  },
  "patient-car": {
    id: "patient-car", publicPath: "illustrations/daily_life/daily_life__car-driving-bro.svg",
    sourceSha256: "159599083a9e161cf5a579c63702a2e21f475136295d266f3811b366ed31d697",
    characterGroup: "freepik--Characters--inject-8", directChildren: 157, firstPathPrefix: "M394.87,225.35",
    keepGroups: ["freepik--Characters--inject-8"], viewBox: "195 185 375 292",
    semantics: ["conditional-driving", "transport-planning"], excludes: ["driving-endorsement", "moving-car", "emergency-self-transport"],
    motion: "Passenger blink only; vehicle, wheels, steering hands and environment remain stationary.",
  },
};

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
export const PATIENT_MOTION_PERIOD = 12;

/** Source-local motion, with zero-velocity rest at every repeat seam. No camera. */
export function libraryPatientPose(artworkId: string, seconds: number, reducedMotion = false) {
  if (!PATIENT_ARTWORK_RECIPES[artworkId]) throw new Error(`Unknown patient artwork: ${artworkId}`);
  if (!Number.isFinite(seconds)) throw new Error("Patient artwork seconds must be finite");
  const t = reducedMotion ? 0 : Math.max(0, seconds) % PATIENT_MOTION_PERIOD;
  const gesture = smooth((t - 1) / 2) * (1 - smooth((t - 5) / 2));
  const breath = smooth((t - .7) / 2.8) * (1 - smooth((t - 4) / 3.2));
  const blink = Math.max(...[3.7, 8.9].map((start) => smooth((t - start) / .12) * (1 - smooth((t - start - .12) / .18))));
  return { gesture, breath, eyeScale: 1 - .88 * blink,
    handDegrees: artworkId === "patient-washing" ? .6 * gesture : 0,
    headDegrees: artworkId === "patient-rest" ? .65 * gesture : artworkId === "patient-stretch" ? -.9 * gesture : 0,
    torsoDegrees: artworkId === "patient-abdomen" ? .6 * gesture : 0,
    torsoScaleY: artworkId === "patient-distress" ? 1 + .004 * breath : 1,
    blanketScaleY: artworkId === "patient-sleep" ? 1 + .018 * breath : 1,
    sensationOpacity: .35 + .2 * gesture, foamOpacity: .72 + .28 * gesture };
}
