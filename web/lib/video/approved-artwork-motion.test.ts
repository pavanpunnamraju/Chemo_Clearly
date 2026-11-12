import assert from "node:assert/strict";
import { APPROVED_ARTWORK_PAUSE_SECONDS, approvedArtworkForShot, approvedArtworkMotion } from "./approved-artwork-motion";
import { drinkingStudyPose, DRINKING_SPEED } from "./drinking-study-motion";
import { callingStudyPose } from "./calling-study-motion";
import type { DirectedShot } from "./direction-types";

const shot: DirectedShot = { id: "water", entryId: "test", sectionId: "side_effects", startSeconds: 20, endSeconds: 32,
  cueSeconds: 21.5, scene: "symptom", assetId: "patient-hydration", action: "drink", camera: "detail", staging: "right",
  transition: "zoom-through", headline: "Water", message: "Source fixture", sourceRefs: ["test:selfCare"], rationale: "fixture", focus: { x: .99, y: .01 }, labels: [] };

assert.equal(approvedArtworkForShot(shot), "drinking");
assert.equal(approvedArtworkForShot({ ...shot, action: "call" }), null);
assert.equal(approvedArtworkForShot({ ...shot, safetyCard: { criteria: [], action: "call", applicability: "fixture" } }), null);
const cue = shot.cueSeconds - shot.startSeconds;
const contactTime = cue + (4 - 1.5) / DRINKING_SPEED;
const contact = approvedArtworkMotion(shot, contactTime);
assert.equal(contact.still, false);
assert.ok(Math.abs(drinkingStudyPose(contact.seconds).reach - 1) < 1e-10, "original contact time, speed applied only once");
assert.equal(approvedArtworkMotion(shot, cue - .1).scale, 1, "no movement before cue");
assert.equal(approvedArtworkMotion({ ...shot, endSeconds: 24 }, 2).still, true, "short shot holds instead of squeezing motion");
assert.equal(approvedArtworkMotion({ ...shot, cueSeconds: 30 }, 10).still, true, "late cue cannot truncate a sip");
assert.equal(approvedArtworkMotion(shot, 4, true).seconds, 0);
assert.equal(approvedArtworkMotion({ ...shot, action: "rest" }, 4).seconds, 0);
assert.equal(approvedArtworkMotion({ ...shot, camera: "establish" }, contactTime).scale, 1);
for (const action of ["drink", "call"] as const) {
  const selected = { ...shot, action, assetId: action === "call" ? "patient-contact" : "patient-hydration" };
  for (let seconds = 0; seconds <= 60; seconds += .05) {
    const state = approvedArtworkMotion(selected, seconds);
    assert.ok(state.scale >= 1 && state.scale <= (action === "call" ? 1.035 : 1.025));
    if (seconds > 12) assert.equal(action === "call" ? callingStudyPose(state.seconds).attention : drinkingStudyPose(state.seconds).reach, 0, "no cycle may start beyond the shot");
  }
  const relocated = { ...selected, startSeconds: 120, endSeconds: 132, cueSeconds: 121.5 };
  assert.deepEqual(approvedArtworkMotion(relocated, 4), approvedArtworkMotion(selected, 4), "absolute audio position must not retime motion");
  const long = { ...selected, endSeconds: 44 };
  const onset = action === "drink" ? 1.5 / DRINKING_SPEED : 1.5;
  const end = action === "drink" ? 9.5 / DRINKING_SPEED : 9.65;
  const period = end - onset + APPROVED_ARTWORK_PAUSE_SECONDS;
  const first = approvedArtworkMotion(long, cue + 3);
  const repeated = approvedArtworkMotion(long, cue + period + 3);
  assert.equal(repeated.cycle, 1);
  assert.equal(repeated.still, false);
  assert.ok(Math.abs(first.seconds - repeated.seconds) < 1e-10, "repeat keeps original speed and phase");
  for (const offset of [.01, 1, APPROVED_ARTWORK_PAUSE_SECONDS - .01]) {
    const pause = approvedArtworkMotion(long, cue + end - onset + offset);
    assert.equal(pause.scale, 1, "camera returns to rest between cycles");
    assert.equal(action === "call" ? callingStudyPose(pause.seconds).attention : drinkingStudyPose(pause.seconds).reach, 0, "pause between cycles");
  }
  const insufficientForSecond = { ...selected, endSeconds: selected.startSeconds + cue + period + (end - onset) - .01 };
  assert.equal(approvedArtworkMotion(insufficientForSecond, cue + period + 1).still, true, "never truncate another movement at scene end");
  const reduced = approvedArtworkMotion(long, cue + period + 3, true);
  assert.equal(reduced.seconds, 0);
  assert.equal(reduced.scale, 1);
}
console.log("Approved artwork routing, cue, natural repetition, pause, camera, short-shot and reduced-motion tests passed");
