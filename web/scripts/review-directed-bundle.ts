import path from "node:path";
import { readFileSync } from "node:fs";
import { loadVerifiedBundle, reusableRender, directedRendererDigest } from "../lib/video/review-bundle";
import { writeJson } from "../lib/video/stage-cache";

/** Explicit human attestation, never called automatically by generation. */
function option(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? "" : process.argv[index + 1]?.trim() ?? "";
}
const directory = process.argv[2];
if (!directory || !option("reviewer") || !option("notes") || !process.argv.includes("--confirm-full-playback")) {
  throw new Error("Usage: review-directed-bundle.ts <directory> --reviewer <name> --notes <findings> --confirm-full-playback. Run only after personally reviewing all audio, captions, motion and clinical display text. This is NOT clinical approval.");
}
const { manifest } = loadVerifiedBundle(directory);
if (!reusableRender(directory, manifest)) throw new Error("Rendered video is missing, modified or stale. Render and audit it first.");
const qa = JSON.parse(readFileSync(path.join(directory, "layout-qa/report.json"), "utf8"));
if (!qa.valid || qa.preview || qa.rendererDigest !== directedRendererDigest()) throw new Error("A current successful full-candidate layout audit is required before recording review.");
writeJson(path.join(directory, "manifest.json"), { ...manifest, status: "visually_reviewed_candidate", visualReview: "approved",
  review: { reviewer: option("reviewer"), notes: option("notes"), confirmedFullPlayback: true, reviewedAt: new Date().toISOString(),
    videoDigest: manifest.videoDigest, clinicalApproval: "not established by this command" } });
console.log("Recorded full-playback/visual review. Clinical approval remains separate; unchanged repeats may reuse this video.");
