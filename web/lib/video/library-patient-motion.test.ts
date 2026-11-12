import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { libraryPatientPose, PATIENT_ARTWORK_RECIPES, PATIENT_MOTION_PERIOD } from "./library-patient-motion";

for (const recipe of Object.values(PATIENT_ARTWORK_RECIPES)) {
  const source = readFileSync(path.resolve("public", recipe.publicPath));
  assert.equal(createHash("sha256").update(source).digest("hex"), recipe.sourceSha256, `${recipe.id} source changed`);
  assert.ok(source.toString().includes(recipe.characterGroup));
  assert.ok(source.toString().includes(recipe.firstPathPrefix));
  const rest = libraryPatientPose(recipe.id, 0);
  assert.deepEqual(libraryPatientPose(recipe.id, PATIENT_MOTION_PERIOD), rest, `${recipe.id} has a loop discontinuity`);
  for (let time = 0; time <= 48; time += .03) {
    const pose = libraryPatientPose(recipe.id, time);
    assert.deepEqual(libraryPatientPose(recipe.id, time, true), rest, `${recipe.id} reduced motion must freeze at rest`);
    for (const value of Object.values(pose)) assert.ok(Number.isFinite(value));
    assert.ok(pose.eyeScale >= .12 - 1e-10 && pose.eyeScale <= 1);
    assert.ok(Math.abs(pose.headDegrees) <= .9 && Math.abs(pose.handDegrees) <= .6 && Math.abs(pose.torsoDegrees) <= .6);
    assert.ok(pose.torsoScaleY <= 1.004 && pose.blanketScaleY <= 1.018);
    const repeated = libraryPatientPose(recipe.id, time + PATIENT_MOTION_PERIOD);
    for (const key of Object.keys(pose) as (keyof typeof pose)[]) assert.ok(Math.abs(pose[key] - repeated[key]) < 1e-10);
  }
  assert.deepEqual(libraryPatientPose(recipe.id, -5), rest);
  assert.throws(() => libraryPatientPose(recipe.id, Number.NaN), /finite/);
}
assert.throws(() => libraryPatientPose("misleading-filename", 0), /Unknown/);
assert.deepEqual(PATIENT_ARTWORK_RECIPES["patient-abdomen"]!.semantics, ["abdominal-discomfort", "abdominal-cramps"]);
assert.ok(PATIENT_ARTWORK_RECIPES["patient-rest"]!.excludes.includes("coffee"));
assert.ok(PATIENT_ARTWORK_RECIPES["patient-sleep"]!.excludes.includes("sleep-score"));
assert.ok(PATIENT_ARTWORK_RECIPES["patient-car"]!.excludes.includes("driving-endorsement"));
assert.equal(PATIENT_ARTWORK_RECIPES["patient-stretch"]!.semantics.includes("walking"), false);
console.log("Patient library: 9 immutable sources, bounded motion, loop seams, reduced motion and semantic exclusions passed");
