import assert from "node:assert/strict";
import { callingStudyPoint, callingStudyPose } from "./calling-study-motion";

// Ear/phone, phone/finger and supporting-arm points must retain their source
// distances throughout the inclination, including every rendered transition frame.
const contacts = [[349.8, 139.3], [352.44, 138.39], [355.5, 157], [350.5, 171.5], [349, 242], [340, 242]];
for (let frame = 0; frame < 360; frame++) {
  const seconds = frame / 30;
  const pose = callingStudyPose(seconds);
  assert.ok(pose.degrees >= 0 && pose.degrees <= 2);
  assert.ok(Math.abs(callingStudyPose(seconds + 1 / 30).degrees - pose.degrees) * 30 <= 1.501);
  for (const a of contacts) for (const b of contacts) {
    const pa = callingStudyPoint(a[0]!, a[1]!, seconds), pb = callingStudyPoint(b[0]!, b[1]!, seconds);
    assert.ok(Math.abs(Math.hypot(pa.x - pb.x, pa.y - pb.y) - Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!)) < 1e-10);
  }
  assert.deepEqual(callingStudyPose(seconds, true), { degrees: 0, attention: 0, eyeScale: 1 });
}
assert.deepEqual(callingStudyPose(0), callingStudyPose(359 / 30));
assert.equal(callingStudyPose(4.7).eyeScale, .09999999999999998);
console.log("Calling motion: contact distances, speed bounds, reduced motion and exact return passed");
