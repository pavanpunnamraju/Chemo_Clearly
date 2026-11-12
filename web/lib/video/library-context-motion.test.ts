import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { LIBRARY_CONTEXT_ARTWORK, contextMotion } from "./library-context-motion";

assert.equal(new Set(LIBRARY_CONTEXT_ARTWORK.map((recipe) => recipe.id)).size, LIBRARY_CONTEXT_ARTWORK.length);
for (const recipe of LIBRARY_CONTEXT_ARTWORK) {
  if (recipe.publicPath) {
    const hash = createHash("sha256").update(readFileSync(path.resolve("public", recipe.publicPath))).digest("hex");
    assert.equal(hash, recipe.sourceSha256, `${recipe.id} source geometry must be reviewed if changed`);
  }
}
for (let frame = 0; frame <= 900; frame++) {
  const seconds = frame / 30;
  const current = contextMotion(seconds);
  assert.ok(Object.values(current).every(Number.isFinite));
  assert.ok(current.angle >= 0 && current.angle <= .65);
  if (frame) assert.ok(Math.abs(current.angle - contextMotion(seconds - 1 / 30).angle) * 30 < .55, "Rigid listening inclination must stay slow");
  assert.deepEqual(contextMotion(seconds, true), contextMotion(0));
}
assert.deepEqual(contextMotion(9), contextMotion(0), "Loop must return fully to rest");
assert.deepEqual(contextMotion(Infinity), contextMotion(0));
console.log("Context library source hashes, unique IDs, bounded smooth motion, exact loop rest and reduced motion passed.");
