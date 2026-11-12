import assert from "node:assert/strict";
import { loadRegimenContent } from "../content";
import { toPersonalizationFilter } from "../intake/schema";
import { authoredDecisions, compileDirection, validateDirection, type DirectorInput } from "./director";
import { ENTRY_ARTWORK, libraryDiversity, planLibraryArtwork } from "./library-direction";
import { libraryArtworkClock } from "./library-artwork-clock";
import { PATIENT_ARTWORK_RECIPES, libraryPatientPose } from "./library-patient-motion";
import { LIBRARY_CONTEXT_ARTWORK } from "./library-context-motion";
import { ADDITIONAL_CARE_ARTWORK } from "../../video-composition/directed/AdditionalCareArtwork";

const known = new Set([...Object.keys(PATIENT_ARTWORK_RECIPES), ...LIBRARY_CONTEXT_ARTWORK.map((r) => r.id),
  ...ADDITIONAL_CARE_ARTWORK, "approved-calling", "approved-drinking"]);
for (const id of Object.values(ENTRY_ARTWORK)) assert.ok(known.has(id), `Every planned artwork must exist: ${id}`);
for (const regimenId of ["rchop", "ac-t"]) {
  const content = loadRegimenContent(regimenId);
  const input: DirectorInput = { content,
    filter: toPersonalizationFilter({ regimenId, educationLevel: "basic", depthPreference: "detailed", voiceTone: "hopeful" }),
    chunks: content.entries.map((entry) => ({ entryId: entry.id, text: entry.plain })),
    entries: content.entries.map((entry, i) => ({ entryId: entry.id, startSeconds: i * 30, endSeconds: (i + 1) * 30 })),
    words: [], totalSeconds: content.entries.length * 30 };
  const direction = compileDirection(input, authoredDecisions(input), "authored");
  const diversity = libraryDiversity(direction.shots);
  assert.equal(diversity.uniqueArtwork, content.entries.length, "Do not recycle primary SVG assets across a complete regimen");
  assert.deepEqual(diversity.repeatedArtwork, []);
  assert.equal(new Set(direction.shots.map((s) => s.sectionId)).size, 9);
  const reaction = direction.shots.find((s) => /infusion.*reaction/.test(s.entryId))!;
  assert.equal(reaction.artworkBeats![0]!.artworkId, "care-alert-staff", "in-person infusion help is never a home phone or thermometer action");
  const mouth = direction.shots.find((s) => s.entryId === "side_effects.mouth-sores")!;
  assert.equal(mouth.artworkBeats![0]!.artworkId, "care-oral");
  assert.equal(mouth.artworkBeats![0]!.sourceRef, `${mouth.entryId}:selfCare`);
  const restricted = structuredClone(content);
  restricted.entries.find((e) => e.id === "side_effects.bladder-irritation")!.selfCare = "Do not drink water or fluids.";
  assert.ok(validateDirection(direction, restricted, input).some((s) => /Unsupported library action:.*drink/.test(s)),
    "static entry mapping cannot override a source restriction with an approved drinking pose");
  const nerve = content.entries.find((e) => e.id === "side_effects.nerve-tingling-numbness")!;
  const inspectionWords = [
    { text: "Check", startSeconds: 6, endSeconds: 6.2 }, { text: "blood", startSeconds: 6.3, endSeconds: 6.5 },
    { text: "Check", startSeconds: 13, endSeconds: 13.2 }, { text: "your", startSeconds: 13.3, endSeconds: 13.5 },
    { text: "feet", startSeconds: 13.6, endSeconds: 13.8 },
  ];
  assert.equal(planLibraryArtwork(nerve, { startSeconds: 0, endSeconds: 30 }, inspectionWords)[1]!.startSeconds, 13);
  assert.equal(planLibraryArtwork({ ...nerve, selfCare: "Ask about comfortable shoes." },
    { startSeconds: 0, endSeconds: 30 }, inspectionWords).length, 1, "detail must exist in its cited source field");
  const mutated = structuredClone(direction);
  mutated.shots[0]!.artworkBeats![0]!.artworkId = "patient-washing";
  assert.ok(validateDirection(mutated, content, input).some((s) => /Unbound library/.test(s)), "cache cannot change source artwork");
  const practical = content.entries.find((e) => e.id === "practical_life")!;
  const words = [{ text: "toilet", startSeconds: 11.37, endSeconds: 11.7 }, { text: "laundry", startSeconds: 23.18, endSeconds: 23.6 }];
  const beats = planLibraryArtwork(practical, { startSeconds: 0, endSeconds: 35 }, words);
  assert.deepEqual(beats.map((b) => [b.artworkId, b.startSeconds, b.endSeconds]), [
    ["care-questions-history", 0, 11.37], ["care-toilet", 11.37, 23.18], ["care-laundry", 23.18, 35],
  ], "household instructions get distinct cutaways on actual word boundaries");
  assert.equal(planLibraryArtwork(practical, { startSeconds: 0, endSeconds: 35 }, []).length, 1, "no invented speech offsets");
  const lateLaundry = planLibraryArtwork(practical, { startSeconds: 0, endSeconds: 35 }, [
    { text: "wash", startSeconds: 10, endSeconds: 10.2 }, { text: "hands", startSeconds: 10.3, endSeconds: 10.5 },
    { text: "wash", startSeconds: 32, endSeconds: 32.2 }, { text: "soiled", startSeconds: 32.3, endSeconds: 32.5 },
    { text: "laundry", startSeconds: 32.6, endSeconds: 32.8 },
  ]);
  assert.equal(lateLaundry[1]!.startSeconds, 32, "brief laundry cutaway begins on its own wash phrase, never handwashing");
  assert.equal(libraryArtworkClock("care-laundry", 1, 3).still, true, "brief source detail holds still instead of truncating a cycle");
  console.log(`${regimenId}: ${content.entries.length} source entries, ${diversity.uniqueArtwork} distinct primary artwork scenes, all nine sections`);
}
for (const id of Object.keys(PATIENT_ARTWORK_RECIPES)) {
  const endOfBlink = libraryArtworkClock(id, 9.05, 12);
  assert.equal(endOfBlink.still, false, "second blink completes on patient 12s clock");
  assert.equal(libraryArtworkClock(id, 12.1, 18).still, true, "incomplete second patient gesture is not started");
  assert.equal(libraryArtworkClock(id, 12.1, 24).still, false);
  assert.deepEqual(libraryPatientPose(id, 0), libraryPatientPose(id, 12), "patient seams rest exactly");
}
console.log("Library source bindings, diversity, timed cutaways and native motion clocks passed");
