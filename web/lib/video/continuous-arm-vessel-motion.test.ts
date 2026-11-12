import assert from "node:assert/strict";
import test from "node:test";
import type {ArmZoomAnchor} from "./arm-microscope-motion";
import {continuousArmVesselState} from "./continuous-arm-vessel-motion";

const ANCHOR: ArmZoomAnchor = {
  sourceRef: "storyset-character-forearm",
  initialCenter: [272, 280],
  initialHeight: 370,
  forearmCenter: [327.0315110308524, 309],
  forearmHeight: 88,
  microscopicHeight: 3.3,
  forearmAngleDegrees: 11.479738036926157,
};
const WIDTH = 1280;
const HEIGHT = 650;
const ENTRY = 3.2;

test("live canvas reaches the exact approved final transform without a representation switch", () => {
  const final = continuousArmVesselState(ENTRY, ANCHOR, ENTRY, WIDTH, HEIGHT);
  assert.equal(final.seconds, ENTRY);
  assert.equal(final.portal.scale, 1);
  assert.deepEqual(final.portal.translate, [0, 0]);
  assert.deepEqual(final.portal.center, [WIDTH / 2, HEIGHT / 2]);
  assert.deepEqual(final.portal.focalPoint, [WIDTH / 2, HEIGHT / 2]);
  assert.equal(final.portal.transform, "none");
  assert.equal(final.portal.maskImage, "none");
  assert.equal(final.portal.forearmClipActive, false);
  assert.equal(final.portal.opacity, 1);
  assert.equal(final.sourceOpacity, 0);
  assert.equal(final.phase, "microscopic");
});

test("soft reveal stays within the transformed live-canvas coverage until it fills the frame", () => {
  for (let frame = 0; frame <= ENTRY * 30; frame++) {
    const state = continuousArmVesselState(frame / 30, ANCHOR, ENTRY, WIDTH, HEIGHT);
    if (state.portal.scale < 0.999) {
      assert.ok(state.portal.maskRadius[0] <= state.portal.scale * Math.min(state.portal.focalPoint[0], WIDTH - state.portal.focalPoint[0]), `horizontal mask outran canvas at frame ${frame}`);
      assert.ok(state.portal.maskRadius[1] <= state.portal.scale * Math.min(state.portal.focalPoint[1], HEIGHT - state.portal.focalPoint[1]), `vertical mask outran canvas at frame ${frame}`);
    }
    const viewWidth = state.camera.height * WIDTH / HEIGHT;
    assert.ok(Math.abs(state.skinWindow.radius[0] / viewWidth * WIDTH - state.portal.maskRadius[0]) < 1e-8);
    assert.ok(Math.abs(state.skinWindow.radius[1] / state.camera.height * HEIGHT - state.portal.maskRadius[1]) < 1e-8);
    if (state.portal.forearmClipActive) {
      const values = state.portal.forearmClipTransform.slice(7, -1).split(/\s+/).map(Number);
      const [a, b, c, d, e, f] = values;
      const projectedX = a! * ANCHOR.forearmCenter[0] + c! * ANCHOR.forearmCenter[1] + e!;
      const projectedY = b! * ANCHOR.forearmCenter[0] + d! * ANCHOR.forearmCenter[1] + f!;
      assert.ok(Math.hypot(projectedX - state.portal.center[0], projectedY - state.portal.center[1]) < 1e-7, `forearm clip lost portal anchor at frame ${frame}`);
    }
  }
});

test("middle zoom exposes a narrow strip of the actual live red rim", () => {
  for (const frame of [54, 60, 66]) {
    const state = continuousArmVesselState(frame / 30, ANCHOR, ENTRY, WIDTH, HEIGHT);
    assert.ok(state.portal.maskRadius[0] <= 8, `middle vessel is too wide at frame ${frame}`);
    assert.ok(state.portal.maskRadius[1] >= 24, `middle vessel no longer reads as a line at frame ${frame}`);
    assert.ok(state.portal.focalPoint[0] < WIDTH * 0.38, `middle zoom stopped tracking the approved red rim at frame ${frame}`);
  }
});

// Pixel-to-rim registration is checked against fresh renders by
// scripts/inspect-curved-arm-blood-cell-study.ts; no stored PNG is required.

test("portal motion is continuous and remains anchored to the projected forearm", () => {
  let previous = continuousArmVesselState(0, ANCHOR, ENTRY, WIDTH, HEIGHT);
  for (let frame = 1; frame <= ENTRY * 30; frame++) {
    const current = continuousArmVesselState(frame / 30, ANCHOR, ENTRY, WIDTH, HEIGHT);
    assert.ok(Math.abs(current.portal.scale - previous.portal.scale) < 0.09, `scale jumped at frame ${frame}`);
    assert.ok(Math.hypot(current.portal.center[0] - previous.portal.center[0], current.portal.center[1] - previous.portal.center[1]) < 9, `anchor jumped at frame ${frame}`);
    assert.ok(current.portal.opacity >= previous.portal.opacity, `reveal reversed at frame ${frame}`);
    previous = current;
  }
});

test("reduced motion immediately presents the same final live canvas", () => {
  const early = continuousArmVesselState(0, ANCHOR, ENTRY, WIDTH, HEIGHT, true);
  const late = continuousArmVesselState(12, ANCHOR, ENTRY, WIDTH, HEIGHT, true);
  for (const state of [early, late]) {
    assert.equal(state.portal.scale, 1);
    assert.deepEqual(state.portal.translate, [0, 0]);
    assert.equal(state.portal.opacity, 1);
    assert.equal(state.sourceOpacity, 0);
    assert.equal(state.phase, "reduced-microscopic");
  }
  assert.notEqual(early.seconds, late.seconds);
});
