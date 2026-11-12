import assert from "node:assert/strict";
import { CALENDAR_CYCLE_SECONDS, calendarMotionState } from "./calendar-motion";

const start = calendarMotionState(0);
const seam = calendarMotionState(CALENDAR_CYCLE_SECONDS);
assert.deepEqual({ ...seam, elapsedSeconds: 0 }, start, "calendar cycle must return to its exact state");
assert.equal(calendarMotionState(4).phase, "flip");
assert.equal(calendarMotionState(10).phase, "draw");
assert.equal(calendarMotionState(17).phase, "hold");
assert.deepEqual(calendarMotionState(10.6).lineProgress, [1, 0, 0]);
assert.deepEqual(calendarMotionState(12.15).lineProgress, [1, 1, 0]);
assert.deepEqual(calendarMotionState(13.7).lineProgress, [1, 1, 1]);

let previous = calendarMotionState(8.99);
for (let frame = 270; frame <= 498; frame++) {
  const state = calendarMotionState(frame / 30);
  assert.ok(Math.hypot(state.markerX - previous.markerX, state.markerY - previous.markerY) < 40,
    `marker teleported at frame ${frame}`);
  previous = state;
}

const still = calendarMotionState(11, true);
assert.equal(still.phase, "rest");
assert.deepEqual(still.lineProgress, [1, 1, 1]);
assert.equal(still.pageFlip, 0);
assert.equal(still.markerX, 0);
console.log("calendar motion checks passed");
