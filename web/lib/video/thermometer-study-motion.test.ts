import assert from "node:assert/strict";
import { thermometerStudyPose, thermometerStudyPoint, THERMOMETER_ELBOW } from "./thermometer-study-motion";
let previous = thermometerStudyPose(0).elbowDegrees;
let maxVelocity = 0;
for (let frame = 0; frame <= 360; frame++) {
  const seconds = frame / 30;
  const pose = thermometerStudyPose(seconds);
  assert(pose.elbowDegrees >= -12 && pose.elbowDegrees <= 8);
  maxVelocity = Math.max(maxVelocity, Math.abs(pose.elbowDegrees - previous) * 30);
  previous = pose.elbowDegrees;
  const grip = thermometerStudyPoint(313, 379, seconds);
  assert(Math.abs(Math.hypot(grip.x - THERMOMETER_ELBOW.x, grip.y - THERMOMETER_ELBOW.y) - Math.hypot(313 - 355, 379 - 449)) < 1e-9);
  assert.equal(thermometerStudyPose(seconds, true).elbowDegrees, -12);
}
assert(maxVelocity < 13, "No abrupt joint rotation");
assert.deepEqual(thermometerStudyPose(0), thermometerStudyPose(12));
assert.equal(thermometerStudyPose(4).elbowDegrees, thermometerStudyPose(7).elbowDegrees);
console.log(`Thermometer study: 20 degree range, ${maxVelocity.toFixed(2)} degrees/second peak, fixed grip radius and exact return.`);
