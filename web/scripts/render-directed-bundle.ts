import { readFileSync } from "node:fs";
import path from "node:path";
import { renderDirectedVideo } from "../lib/video/render-directed";
import { digest, objectDigest, writeJson } from "../lib/video/stage-cache";
import { loadVerifiedBundle, directedRendererDigest, reusableRender } from "../lib/video/review-bundle";

async function main() {
  const directory = process.argv[2];
  if (!directory) throw new Error("Usage: render-directed-bundle.ts <prepared review-bundle directory>");
  const { props, audioBuffer: audio, manifest } = loadVerifiedBundle(directory);
  const rendererAtStart = directedRendererDigest();
  if (!process.argv.includes("--rerender") && reusableRender(directory, manifest)) {
    console.log(`Unchanged rendered variant cache hit (${manifest.visualReview}): ${path.join(directory, "video.mp4")}`);
    return;
  }
  let last = -1;
  const filename = await renderDirectedVideo(props, audio, path.join(directory, "video.mp4"), (value) => {
    const percent = Math.floor(value * 20) * 5;
    if (percent > last) { last = percent; console.log(`Rendering: ${percent}%`); }
  });
  const current = loadVerifiedBundle(directory);
  if (directedRendererDigest() !== rendererAtStart || objectDigest(current.manifest.files) !== objectDigest(manifest.files)) {
    throw new Error("Renderer or prepared inputs changed during export. This MP4 cannot inherit the new evidence; rerender the current bundle.");
  }
  writeJson(path.join(directory, "manifest.json"), { ...manifest, status: "rendered_candidate", video: filename,
    videoDigest: digest(readFileSync(filename)), rendererDigest: rendererAtStart, visualReview: "pending" });
  console.log(filename);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
