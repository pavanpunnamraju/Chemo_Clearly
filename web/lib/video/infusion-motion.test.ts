import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { INFUSION_CYCLE_SECONDS, infusionMotionState } from "./infusion-motion";

const source = readFileSync(path.resolve("public/illustrations/overview/overview__oncology-patient-pana.svg"));
assert.equal(createHash("sha256").update(source).digest("hex"),
  "86bedce3698e62d3ab5fe35c31ade22da1481725beeece2813d12ebf5d6cc650");
assert.ok(source.toString().includes('<polygon points="254.78 156.92 256.28 169.23 262.95 166.61 254.78 156.92"'),
  "source nose geometry must remain exact");

const start = infusionMotionState(0, 24);
const loop = infusionMotionState(INFUSION_CYCLE_SECONDS, 24);
assert.equal(loop.expression, start.expression, "expression must return fully at the cycle seam");
assert.ok(Math.abs(loop.plantDegrees - start.plantDegrees) < 1e-12, "foliage must return at the cycle seam");
assert.equal(loop.eyeX, start.eyeX, "synchronized eye expression must return at the cycle seam");
assert.ok(loop.fluidSurfaceY > start.fluidSurfaceY, "fluid must not refill when the character cycle resets");

let previousSurface = -Infinity;
for (let frame = 0; frame <= 900; frame++) {
  const state = infusionMotionState(frame / 30, 24);
  assert.ok(Object.values(state).every(Number.isFinite));
  assert.ok(state.expression >= 0 && state.expression <= 1);
  assert.ok(state.plantDegrees >= -2.7 && state.plantDegrees <= 2.7);
  assert.equal(state.eyeX, -3.1 * state.expression, "both eyes use the same horizontal offset");
  assert.equal(state.eyeY, -0.35 * state.expression, "both eyes use the same vertical offset");
  assert.ok(state.fluidSurfaceY >= previousSurface, "fluid surface must move monotonically downward");
  previousSurface = state.fluidSurfaceY;
}
assert.equal(infusionMotionState(22, 24).fluidSurfaceY, 174, "default drains the complete visible reservoir");
assert.equal(infusionMotionState(24, 24).fluidSurfaceY, 174, "empty bag holds for the last two seconds");
assert.deepEqual(infusionMotionState(99, 24), infusionMotionState(24, 24), "all motion state clamps after duration");

const before = infusionMotionState(-5, 24);
assert.deepEqual(before, start, "negative time clamps to the initial pose");
const reduced = infusionMotionState(7, 24, true);
assert.equal(reduced.expression, 0); assert.equal(reduced.plantDegrees, 0);
assert.equal(reduced.fluidProgress, 0);
assert.equal(reduced.fluidSurfaceY, 126, "reduced motion freezes the fluid as well as the repeating motion");

console.log("Infusion source digest, exact cycle seam, one-way fluid, bounds, clamping and reduced motion passed.");
