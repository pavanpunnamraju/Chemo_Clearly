// Every non-side_effects narrated Scene/section (see select.ts's
// NARRATED_SECTIONS) has its own curated 2-3 file folder under
// public/illustrations/ (see MANIFEST.md) — one illustration per SlideBeat
// in that section, round-robin by the slide's position within its section.
// side_effects is deliberately absent here — it uses the tag-driven lookup
// below instead (video_visual_system.md's Scene archetype, side_effects rule).
const SECTION_ILLUSTRATIONS: Record<string, string[]> = {
  overview: [
    "illustrations/overview/overview__doctor-bro.svg",
    "illustrations/overview/overview__doctor-pana.svg",
    "illustrations/overview/overview__online-doctor-bro.svg",
  ],
  timeline: [
    "illustrations/timeline/timeline__calendar-pana.svg",
    "illustrations/timeline/timeline__timeline-bro.svg",
    "illustrations/timeline/timeline__schedule-pana.svg",
  ],
  daily_life: [
    "illustrations/daily_life/daily_life__healthy-lifestyle-bro.svg",
    "illustrations/daily_life/daily_life__training-at-home-pana.svg",
    "illustrations/daily_life/daily_life__stretching-exercises-bro.svg",
  ],
  fertility_intimacy: [
    "illustrations/fertility_intimacy/fertility_intimacy__family-bro.svg",
    "illustrations/fertility_intimacy/fertility_intimacy__asian-family-pana.svg",
  ],
  emergency: [
    "illustrations/emergency/emergency__call-center-bro.svg",
    "illustrations/emergency/emergency__hospital-building-pana.svg",
  ],
  patient_voices: [
    "illustrations/patient_voices/patient_voices__community-pana.svg",
    "illustrations/patient_voices/patient_voices__active-support-bro.svg",
    "illustrations/patient_voices/patient_voices__online-review-pana.svg",
  ],
};

/**
 * Which illustration a given section's Nth slide (0-based, within that
 * section) should show — round-robin through that section's own folder.
 * Returns null for a section with no curated folder (side_effects — use
 * `sceneIllustrationForSideEffectTags` instead).
 */
export function illustrationForSlide(sectionId: string, indexInSection: number): string | null {
  const files = SECTION_ILLUSTRATIONS[sectionId];
  if (!files || files.length === 0) return null;
  return files[indexInSection % files.length]!;
}

// Tag-driven Scene subject rule for `side_effects` (video_visual_system.md,
// Scene archetype) — which illustration an entry gets is decided by its own
// `tags` field, not by matching keywords in the (LLM-rewritten, therefore
// unpredictably-phrased) narration text the way the old component-placer did.
// Felt/visible-symptom tags depict the symptom directly; invisible-condition
// tags (infection-risk, bleeding-bruising) depict the entry's own self_care
// action instead, since the condition itself isn't visible.
const SIDE_EFFECT_SCENE_ILLUSTRATIONS: Record<string, string> = {
  "nausea-appetite": "illustrations/side_effects/side_effects__nausea.svg",
  "hair-skin-appearance": "illustrations/side_effects/side_effects__hair-loss.svg",
  "mouth-digestion": "illustrations/side_effects/side_effects__mouth-digestion.svg",
  "nerve-tingling": "illustrations/side_effects/side_effects__nerve-tingling.svg",
  "aches-pain": "illustrations/side_effects/side_effects__aches-pain.svg",
  urinary: "illustrations/side_effects/side_effects__urinary.svg",
  "emotional-support": "illustrations/side_effects/side_effects__emotional-support.svg",
  // Added 2026-08-20 (round 2 decision) — reuses the pre-existing generic
  // asset rather than a newly-sourced one; not vetted under the tag-specific
  // illustrations' color/style pass.
  fatigue: "illustrations/side_effects/side_effects__tiredness-pana.svg",
  "infection-risk": "illustrations/side_effects/side_effects__handwashing.svg",
  "bleeding-bruising": "illustrations/side_effects/side_effects__checking-bruise.svg",
};

/**
 * First tag on the entry that has a mapped Scene illustration, or `null` if
 * none do — surfaces as "no illustration" rather than a silent/wrong guess,
 * since a `side_effects` entry with a genuinely unmapped tag (e.g. a future
 * AC-T-only tag) should be flagged for a human to extend the map above, not
 * papered over.
 */
export function sceneIllustrationForSideEffectTags(tags: string[]): string | null {
  for (const tag of tags) {
    const src = SIDE_EFFECT_SCENE_ILLUSTRATIONS[tag];
    if (src) return src;
  }
  return null;
}
