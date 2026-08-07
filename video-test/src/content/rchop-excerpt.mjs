// Curated spike content — hand-picked from docs/content/rchop.md, "Low white blood cells /
// infection risk" entry under `side_effects`. Not agentic selection (that's Phase 1 goal 3
// proper); this is a fixed excerpt + a hand-written narration script to prove the render
// pipeline works end-to-end.
//
// Source text (unmodified from docs/content/rchop.md, status: AI-drafted, not yet reviewed
// by Dr. Reddy):
//   "This treatment temporarily lowers your infection-fighting white blood cells, especially
//   around days 7-10. A fever is a medical emergency, not a routine call-team item - at any
//   point in treatment, not only during this window - see the emergency section for the exact
//   threshold and what to do."
//   self_care: "Wash hands often; avoid crowds and sick contacts; your team may give you a
//   growth-factor injection to help counts recover faster."

export const narrationScript =
  "This treatment temporarily lowers your infection-fighting white blood cells, " +
  "especially around days seven through ten. " +
  "During this time, wash your hands often, and avoid crowds and sick contacts. " +
  "Your care team may give you a growth-factor injection to help your counts recover faster. " +
  "A fever during this window is a medical emergency, not a routine call-team item - " +
  "call your care team immediately, day or night.";

// startSeconds: seconds from the start of the narration this beat should appear at.
export const slideBeats = [
  {
    startSeconds: 0,
    headline: "Low white blood cells & infection risk",
    body: "R-CHOP temporarily lowers your infection-fighting white blood cells, especially around days 7-10.",
  },
  {
    startSeconds: 6,
    headline: "What helps",
    body: "Wash hands often. Avoid crowds and sick contacts. Your team may give a growth-factor injection.",
  },
  {
    startSeconds: 13,
    headline: "Fever = emergency",
    body: "A fever during this window is a medical emergency. Call your care team immediately, day or night.",
  },
];
