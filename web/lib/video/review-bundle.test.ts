import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mock } from "node:test";
import { directedRendererDigest, reusableRender } from "./review-bundle";
import { digest, implementationDigest } from "./stage-cache";
import { PATIENT_ARTWORK_RECIPES } from "./library-patient-motion";
import { LIBRARY_CONTEXT_ARTWORK } from "./library-context-motion";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "chemo-render-cache-test-"));
const originalRead = fs.readFileSync;
const rendererDigest = directedRendererDigest();
const voiceVersion = implementationDigest(["tts.ts"]);
const video = Buffer.from("checksum fixture, not a playable candidate");
const manifest = { rendererDigest, videoDigest: digest(video) };
try {
  assert.equal(reusableRender(root, manifest), false, "missing output cannot be reused");
  fs.writeFileSync(path.join(root, "video.mp4"), video);
  assert.equal(reusableRender(root, manifest), true);
  assert.equal(reusableRender(root, { ...manifest, videoDigest: "stale" }), false);

  // Change reads in this isolated test process; never edit approved assets or
  // renderer files on disk while parallel rendering may be using them.
  for (const file of [
    "render-directed.ts", "render-narration-audio.ts",
    "../../video-composition/directed/CallingArtwork.tsx",
    "../../video-composition/directed/DrinkingArtwork.tsx",
    "../../video-composition/directed/namespace-svg.ts",
    "../../video-composition/directed/ApprovedArtworkStage.tsx",
    "approved-artwork-motion.ts", "calling-study-motion.ts", "drinking-study-motion.ts", "arm-deform.ts",
    "../../public/studies/calling/Calling-pana.svg",
    "../../public/studies/drinking/drinking-water-pana.svg",
    "library-direction.ts", "library-artwork-clock.ts", "library-patient-motion.ts", "library-context-motion.ts",
    "../../video-composition/directed/LibraryArtworkStage.tsx", "../../video-composition/directed/LibrarySvgArtwork.tsx",
    "../../video-composition/directed/LibraryPatientArtwork.tsx", "../../video-composition/directed/LibraryContextArtwork.tsx",
    "../../video-composition/directed/PatientCareObjects.tsx", "../../video-composition/directed/AdditionalCareArtwork.tsx",
    ...Object.values(PATIENT_ARTWORK_RECIPES).map((recipe) => `../../public/${recipe.publicPath}`),
    ...LIBRARY_CONTEXT_ARTWORK.flatMap((recipe) => recipe.publicPath ? [`../../public/${recipe.publicPath}`] : []),
  ]) {
    const target = path.resolve(directory, file);
    mock.method(fs, "readFileSync", ((...args: Parameters<typeof originalRead>) => {
      const value = originalRead(...args);
      if (args[0] !== target) return value;
      return Buffer.isBuffer(value) ? Buffer.concat([value, Buffer.from(" changed")]) : `${value} changed`;
    }) as typeof fs.readFileSync);
    syncBuiltinESMExports();
    try {
      assert.notEqual(directedRendererDigest(), rendererDigest, `${file} bytes must invalidate rendered output`);
      assert.equal(reusableRender(root, manifest), false, `${file} change cannot reuse an approved video`);
      assert.equal(implementationDigest(["tts.ts"]), voiceVersion, "artwork changes preserve the synthesis cache fingerprint");
    } finally {
      mock.restoreAll();
      syncBuiltinESMExports();
    }
  }
  assert.equal(directedRendererDigest(), rendererDigest, "restored reads retain the original renderer digest");
  assert.equal(reusableRender(root, manifest), true);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log("review-bundle.test: renderer dependency bytes invalidate only rendered output; integrity checks passed");
