import assert from "node:assert/strict";
import {
  DEFAULT_READING_RECOVERY_CUE,
  READING_RECOVERY_ICONS,
  readingRecoveryActualGeometry,
  readingRecoveryIconLayers,
  readingRecoveryIconPopSampleTimes,
  readingRecoveryIconTransitionTimes,
  readingRecoveryMotionState,
} from "./reading-recovery-motion";

const duration = 9.8;
for (let frame = 0; frame < duration * 30; frame++) {
  const state = readingRecoveryMotionState(frame / 30, duration);
  assert.equal(state.pageTurn, 0, "rejected page flip never runs");
  assert.equal(state.pageCurl, 0);
  assert.equal(state.handDegrees, 0, "hands remain on original book");
  assert.equal(state.pageContactActive, false);
  assert.ok(state.expression >= 0 && state.expression <= 1);
  assert.ok(state.cameraProgress >= 0 && state.cameraProgress <= 1);
  assert.ok(Number.isFinite(state.pageCurl));
  const actual = readingRecoveryActualGeometry(state);
  assert.ok(Number.isFinite(actual.finger.x) && Number.isFinite(actual.finger.y));
  assert.equal(actual.bubbleOpacity, 1);
  assert.ok(actual.iconOpacities.every((opacity) => opacity === 1));
}

const shortTransitions = readingRecoveryIconTransitionTimes(duration);
assert.equal(shortTransitions.length, 2);
assert.equal(readingRecoveryIconPopSampleTimes(duration).length, 16);
assert.equal(readingRecoveryIconLayers(0, duration)[0]!.icon, "book");
assert.equal(readingRecoveryIconLayers(duration, duration)[0]!.icon, "heart");
for (const center of shortTransitions) {
  assert.ok(readingRecoveryIconLayers(center - .19, duration).some((layer) => layer.scale === 1));
  assert.ok(readingRecoveryIconLayers(center + .2, duration).some((layer) => layer.scale > 1));
  assert.ok(readingRecoveryIconLayers(center + .39, duration).some((layer) => Math.abs(layer.scale - 1) < 1e-9));
}

const longDuration = 33;
const longTransitions = readingRecoveryIconTransitionTimes(longDuration);
assert.equal(longTransitions.length, READING_RECOVERY_ICONS.length - 1);
assert.equal(readingRecoveryIconLayers(longDuration, longDuration)[0]!.icon, "home");

const reduced = readingRecoveryMotionState(7.25, duration, true, DEFAULT_READING_RECOVERY_CUE);
assert.equal(reduced.seconds, 7.25, "reduced motion retains the narration clock");
assert.ok(Object.is(reduced.pageTurn, 0) || Object.is(reduced.pageTurn, -0));
assert.equal(reduced.expression, 0);
assert.equal(reduced.cameraProgress, 1);
assert.equal(reduced.iconLayers[0]!.icon, "heart");
assert.deepEqual(readingRecoveryActualGeometry(reduced).contactTarget, null);

const end = readingRecoveryMotionState(9.77, duration);
assert.equal(end.phase, "hold");
assert.equal(end.expression, 0);
assert.equal(end.handDegrees, 0);
assert.equal(end.headDegrees, 0, "reader returns to the exact source reading pose");
const tiny = readingRecoveryMotionState(.1, .2);
assert.ok(tiny.iconTransitions.every((time) => time >= 0 && time <= .2));
for (const shortDuration of [3, 7]) {
  for (let frame = 0; frame < shortDuration * 30; frame++) {
    const state = readingRecoveryMotionState(frame / 30, shortDuration);
    assert.equal(state.characterCycleEligible, false);
    assert.equal(state.pageTurn, 0);
    assert.equal(state.expression, 0);
    assert.equal(state.handDegrees, 0);
    assert.equal(state.headDegrees, 0);
  }
}
for (const [sample, eligible, cycleIndex] of [[8.99, true, 0], [10.9, true, 0], [11, true, 1], [20.9, true, 1], [22, true, 2], [31.01, true, 2], [32.99, true, 2]] as const) {
  const state = readingRecoveryMotionState(sample, 33);
  assert.equal(state.characterCycleEligible, eligible);
  assert.equal(state.cycleIndex, cycleIndex);
}
assert.equal(readingRecoveryMotionState(11, 15).cycleIndex, 0, "do not begin a second cycle that cannot finish");
assert.equal(readingRecoveryMotionState(14.99, 15).phase, "hold");
console.log("Reading recovery motion: stationary book and hands, expression, pullback, icon pops, reduced motion and return passed");
