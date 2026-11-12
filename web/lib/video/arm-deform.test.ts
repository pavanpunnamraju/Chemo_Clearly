// Regression check for the gradient-deformation arm-bend geometry
// (docs/references/handoff.md). No framework; run directly with tsx.
// Run: npm run test:arm-deform

import assert from "node:assert/strict";
import {
  applyShoulderRig,
  axisPivot,
  bendAngleDegrees,
  deformArmOutline,
  projectT,
  type ArmAxis,
  type Point,
  type ShoulderRig,
} from "./arm-deform";

const axis: ArmAxis = {
  shoulder: { x: 312, y: 276 },
  fingertip: { x: 78, y: 300 },
  elbowPosition: 0.37,
};
const maxBend = 45;
const falloffStart = 0.25;
const falloffEnd = 0.55;

// Synthetic closed loop roughly tracing the real arm's outline (shoulder ->
// elbow -> wrist -> fingertip along the top edge, back along the bottom).
const outline: Point[] = [];
for (let i = 0; i <= 20; i++) {
  const t = i / 20;
  outline.push({ x: axis.shoulder.x + (axis.fingertip.x - axis.shoulder.x) * t, y: 260 + 10 * Math.sin(t * Math.PI) });
}
for (let i = 20; i >= 0; i--) {
  const t = i / 20;
  outline.push({ x: axis.shoulder.x + (axis.fingertip.x - axis.shoulder.x) * t, y: 300 + 10 * Math.sin(t * Math.PI) });
}
outline.push(outline[0]!); // explicit close

const deformed = deformArmOutline(outline, axis, maxBend, falloffStart, falloffEnd);

assert.equal(deformed.length, outline.length, "point count preserved");
assert.ok(
  Math.abs(deformed[0]!.x - deformed[deformed.length - 1]!.x) < 1e-9 &&
    Math.abs(deformed[0]!.y - deformed[deformed.length - 1]!.y) < 1e-9,
  "outline stays closed (first point still equals last point after deform)",
);

const angleAtShoulder = bendAngleDegrees(0, maxBend, falloffStart, falloffEnd);
const angleAtFingertip = bendAngleDegrees(1, maxBend, falloffStart, falloffEnd);
assert.ok(Math.abs(angleAtShoulder) < 1e-6, `angle(0) should be ~0, got ${angleAtShoulder}`);
assert.ok(Math.abs(angleAtFingertip - maxBend) < 1e-6, `angle(1) should be ~maxBend, got ${angleAtFingertip}`);

// Continuity across the falloff band: no jump between adjacent samples —
// the max per-step angle delta should shrink toward 0 as the sampling step
// shrinks, which only holds if the function has no discontinuity to snap
// across.
function maxAngleStep(steps: number): number {
  let worst = 0;
  let prev = bendAngleDegrees(0, maxBend, falloffStart, falloffEnd);
  for (let i = 1; i <= steps; i++) {
    const cur = bendAngleDegrees(i / steps, maxBend, falloffStart, falloffEnd);
    worst = Math.max(worst, Math.abs(cur - prev));
    prev = cur;
  }
  return worst;
}
const coarse = maxAngleStep(50);
const fine = maxAngleStep(500);
assert.ok(fine < coarse / 5, `finer sampling should shrink the max per-step jump (coarse=${coarse}, fine=${fine})`);

// t projection sanity: shoulder -> 0, fingertip -> 1, elbow pivot sits at t=elbowPosition on the axis.
assert.ok(Math.abs(projectT(axis.shoulder, axis.shoulder, axis.fingertip)) < 1e-9);
assert.ok(Math.abs(projectT(axis.fingertip, axis.shoulder, axis.fingertip) - 1) < 1e-9);
const pivot = axisPivot(axis);
assert.ok(Math.abs(projectT(pivot, axis.shoulder, axis.fingertip) - axis.elbowPosition) < 1e-9);

// Shoulder rig: zero contribution at progress 0, and rigid (distance-preserving
// from the socket, up to the retraction offset) at any progress — the point
// that makes this a real second bone instead of a second copy of the elbow.
const rig: ShoulderRig = {
  socket: { x: 300, y: 270 },
  rotateDegrees: 10,
  retractX: 64,
  retractY: 35,
  arcBow: 20,
};
const samplePoint: Point = { x: 200, y: 260 };
const atRest = applyShoulderRig(samplePoint, rig, 0);
assert.ok(
  Math.abs(atRest.x - samplePoint.x) < 1e-9 && Math.abs(atRest.y - samplePoint.y) < 1e-9,
  "shoulder rig should be a no-op at progress 0",
);

const atPeak = applyShoulderRig(samplePoint, rig, 1);
const expectedOffsetAtPeak = { x: rig.retractX, y: rig.retractY }; // sin(pi*1) = 0, bow vanishes at peak
const rotatedOnly = { x: atPeak.x - expectedOffsetAtPeak.x, y: atPeak.y - expectedOffsetAtPeak.y };
const distBefore = Math.hypot(samplePoint.x - rig.socket.x, samplePoint.y - rig.socket.y);
const distAfter = Math.hypot(rotatedOnly.x - rig.socket.x, rotatedOnly.y - rig.socket.y);
assert.ok(
  Math.abs(distBefore - distAfter) < 1e-6,
  `rotation-then-translate should preserve distance from the socket before the retraction offset (before=${distBefore}, after=${distAfter})`,
);

console.log("arm-deform.test: ok");
