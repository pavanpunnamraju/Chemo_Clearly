// Regression/generality check for the energy-curve geometry (design spec:
// "a simple curve-through-N-points formula ... points 1..N-1 dip, the last
// point rises"). No framework; run directly with tsx.
// Run: npm run test:daily-life-curve

import assert from "node:assert/strict";
import { dailyLifeCurveGeometry } from "./daily-life-curve";

for (const n of [1, 2, 4, 7]) {
  const g = dailyLifeCurveGeometry(n, 1280, 720);
  assert.equal(g.topicPoints.length, n, `topicPoints length for N=${n}`);
  assert.equal(g.points.length, n, `points length for N=${n}`);
  for (let i = 0; i < n - 1; i++) {
    assert.ok(g.topicPoints[i]!.y > g.topicPoints[n - 1]!.y, `topic ${i} should dip below the rise for N=${n}`);
  }
  for (let i = 1; i < n; i++) {
    assert.ok(g.topicPoints[i]!.x > g.topicPoints[i - 1]!.x, `x increases left-to-right for N=${n}`);
  }
  assert.ok(g.d.startsWith("M "), `path starts with a moveto for N=${n}`);
}

assert.throws(() => dailyLifeCurveGeometry(0, 1280, 720), "rejects zero topics");

console.log("daily-life-curve.test: ok");
