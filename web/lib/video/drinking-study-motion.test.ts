import assert from "node:assert/strict";
import { DRINKING_LIP, DRINKING_RIM, DRINKING_SPEED, DRINKING_DURATION_FRAMES, drinkingGripPoint, drinkingOutlinePoint, drinkingStudyPose, drinkingWaterLevel } from "./drinking-study-motion";

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const grip = [DRINKING_RIM, { x: 295.58, y: 248.94 }, { x: 267.33, y: 266.65 }, { x: 302.19, y: 249.55 }];
for (let frame = 0; frame < DRINKING_DURATION_FRAMES; frame++) {
  const t = frame / 30, pose = drinkingStudyPose(t);
  assert.ok(pose.degrees <= 0 && pose.degrees >= -18);
  assert.ok(Math.abs(drinkingStudyPose(t + 1 / 30).degrees - pose.degrees) * 30 <= 8.401 * DRINKING_SPEED);
  if (t >= 4 / DRINKING_SPEED && t <= 7 / DRINKING_SPEED) assert.ok(distance(drinkingGripPoint(DRINKING_RIM, t), DRINKING_LIP) < 1e-10);
  for (const a of grip) for (const b of grip) {
    assert.ok(Math.abs(distance(drinkingGripPoint(a, t), drinkingGripPoint(b, t)) - distance(a, b)) < 1e-10);
  }
  const topSocket = { x: 234.29, y: 286.39 }, bottomSocket = { x: 252.27, y: 354.74 };
  assert.ok(distance(drinkingOutlinePoint(topSocket, "top", 0, t), topSocket) < 1e-10);
  assert.ok(distance(drinkingOutlinePoint(bottomSocket, "bottom", 1, t), bottomSocket) < 1e-10);
  for (const [section, amount, joint] of [
    ["top", 1, { x: 301.77, y: 327.67 }],
    ["bottom", 0, { x: 331.63, y: 376.19 }],
  ] as const) {
    assert.ok(distance(drinkingOutlinePoint(joint, section, amount, t), drinkingGripPoint(joint, t)) < 1e-10);
  }
  assert.deepEqual(drinkingStudyPose(t, true), drinkingStudyPose(0));
  assert.ok(Number.isFinite(drinkingWaterLevel(t)));
  assert.equal(drinkingWaterLevel(t, true), drinkingWaterLevel(0));
}
assert.deepEqual(drinkingStudyPose((DRINKING_DURATION_FRAMES - 1) / 30), drinkingStudyPose(0));
assert.ok(distance(DRINKING_RIM, DRINKING_LIP) > 30, "The study must actually bring the rim from rest to the mouth");
console.log("Drinking study: fixed sip contact, rigid grip, connected elbow boundaries, pinned shoulder, speed, return and reduced motion passed");
