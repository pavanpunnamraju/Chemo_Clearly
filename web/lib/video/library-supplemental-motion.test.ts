import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";
import { SUPPLEMENTAL_ARTWORK_RECIPES, supplementalMotion } from "./library-supplemental-motion";

test("supplemental adapters bind inspected original source hashes", () => {
  for (const recipe of SUPPLEMENTAL_ARTWORK_RECIPES) {
    assert.equal(createHash("sha256").update(readFileSync(path.resolve("public", recipe.publicPath))).digest("hex"), recipe.sourceSha256);
  }
});

test("native body and blink channels return together with stationary cycle seams", () => {
  for (const offset of [0, .25]) {
    const rest = { angle: 0, eyeScaleY: 1 };
    for (const time of [0, .001, 11.999, 12, 12.001, 24]) assert.deepEqual(supplementalMotion(time, false, offset), rest);
    for (let frame = 0; frame < 720; frame++) {
      const current = supplementalMotion(frame / 60, false, offset);
      assert.ok(current.angle >= 0 && current.angle <= .65);
      assert.ok(current.eyeScaleY >= .07999 && current.eyeScaleY <= 1);
      assert.deepEqual(supplementalMotion(frame / 60, true, offset), rest);
      const next = supplementalMotion(frame / 60 + .0001, false, offset);
      assert.ok(Math.abs(next.angle - current.angle) < .00006, "body motion must remain smooth");
      assert.ok(Math.abs(next.eyeScaleY - current.eyeScaleY) < .001, "blink must remain smooth");
    }
  }
});
