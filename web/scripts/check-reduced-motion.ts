// Runnable self-check for goal #5 (prefers-reduced-motion) — no render/
// network needed; exercises the pure pulse-scale helper directly.
// Run: npm run check:reduced-motion

import assert from "node:assert/strict";
import { timelinePulseScale } from "../video-composition/SlideVideo";

// reducedMotion pins the ring to its resting scale at every point in time —
// no oscillation, regardless of relSeconds.
for (const t of [0, 0.13, 0.25, 0.5, 1, 3.7]) {
  assert.equal(timelinePulseScale(t, true), 1, `expected frozen scale at t=${t}`);
}

// Motion stays on by default: the ring actually oscillates away from 1 at
// some point in its cycle (peak at t=0.25s per the sine phase).
assert.ok(timelinePulseScale(0.25, false) > 1, "expected the pulse to grow at its peak when motion isn't reduced");

console.log("check-reduced-motion: ok");
