import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { DirectedTiming } from "./timing";

const STUDY_SOURCE_FILES = ["timing.json", "narration.wav", "speech-review.json"] as const;

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

export const loadRchopStudyNarration = (sectionId: string) => {
  const directory = path.resolve("fixtures/study-narration/rchop");
  const manifest = JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8")) as {
    files: Record<string, string>;
  };
  for (const name of STUDY_SOURCE_FILES) {
    assert.equal(sha256(path.join(directory, name)), manifest.files[name], `Study source fixture changed: ${name}`);
  }
  const speechReview = JSON.parse(readFileSync(path.join(directory, "speech-review.json"), "utf8")) as {
    sectionId: string;
    report: { faithful: boolean; uncertain: boolean };
  }[];
  const sectionReview = speechReview.find((section) => section.sectionId === sectionId);
  assert.ok(sectionReview?.report.faithful && !sectionReview.report.uncertain,
    `Study source fixture has no faithful ${sectionId} speech review`);
  return {
    directory,
    timing: JSON.parse(readFileSync(path.join(directory, "timing.json"), "utf8")) as DirectedTiming,
    hashes: Object.fromEntries(STUDY_SOURCE_FILES.map((name) => [name, sha256(path.join(directory, name))])),
  };
};
