import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadVerifiedBundle, directedRendererDigest, reusableRender } from "../lib/video/review-bundle";
import { muxNarrationAudio } from "../lib/video/render-narration-audio";
import { digest, objectDigest, writeJson } from "../lib/video/stage-cache";

// A narrowly bound migration of the two already-rendered candidates. These exact
// renderer revisions differ only in host-side narration encoding, not visuals.
// A future implementation change requires a fresh render or a separate audit.
const ORIGINAL_RENDERER = "2a466c0925595b44870d15f4a3bb6f11b0503e006b254d484735f82a307aab53";
const CORRECTED_RENDERER = "b5cdfbeb7e5ca9bebaca0d40ddec5d35c219662bbc40b250b02684895995ffeb";
const directory = process.argv[2];
assert.ok(directory, "Usage: correct-directed-audio-export.ts <prepared candidate directory with archived original export>");
assert.equal(directedRendererDigest(), CORRECTED_RENDERER, "This migration applies only to the inspected audio-only renderer change");
const prepared = loadVerifiedBundle(directory);
if (reusableRender(directory, prepared.manifest) && prepared.manifest.audioExportCorrection) {
  console.log("This candidate already has the verified single-encode audio export.");
  process.exit(0);
}
const archive = path.join(directory, "audio-export-correction");
const original = JSON.parse(readFileSync(path.join(archive, "original-manifest.json"), "utf8"));
const originalVideo = path.join(archive, "original-video.mp4");
assert.equal(original.rendererDigest, ORIGINAL_RENDERER);
assert.equal(digest(readFileSync(originalVideo)), original.videoDigest);
assert.equal(objectDigest(prepared.manifest.files), objectDigest(original.files), "Prepared narration/props changed since the inspected video was rendered");
assert.equal(prepared.manifest.audioDigest, original.audioDigest);
const output = path.join(directory, "video.mp4");
console.log("Encoding original verified narration once; copying every rendered video packet");
const mux = await muxNarrationAudio(originalVideo, prepared.audioBuffer, output);
const current = loadVerifiedBundle(directory);
assert.equal(objectDigest(current.manifest.files), objectDigest(prepared.manifest.files));
assert.equal(directedRendererDigest(), CORRECTED_RENDERER);
const videoDigest = digest(readFileSync(output));
const correction = { version: 1, correctedAt: new Date().toISOString(), reason: "Remove the measured ~42.6 ms AAC intermediate-export delay",
  originalVideoDigest: original.videoDigest, originalRendererDigest: ORIGINAL_RENDERER,
  videoDigest, rendererDigest: CORRECTED_RENDERER, audioDigest: original.audioDigest,
  preparedFilesUnchanged: true, allEncodedVideoPacketsAndTimestampsUnchanged: true, ...mux,
  encodedSpeechInspection: "Required separately; packet-preserving mux does not automatically establish speech or human approval." };
writeJson(path.join(archive, "correction.json"), correction);
writeJson(path.join(directory, "manifest.json"), { ...prepared.manifest, status: "rendered_candidate", video: output,
  videoDigest, rendererDigest: CORRECTED_RENDERER, audioExportCorrection: correction, visualReview: "pending" });
console.log(`Corrected candidate: ${output} SHA-256 ${videoDigest}`);
