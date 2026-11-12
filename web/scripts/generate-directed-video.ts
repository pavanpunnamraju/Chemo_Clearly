import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { prepareDirectedVideo } from "../lib/video/generate-directed";
import { renderDirectedVideo } from "../lib/video/render-directed";
import { IntakeSchema } from "../lib/intake/schema";
import { digest, objectDigest, writeJson } from "../lib/video/stage-cache";
import { directedRendererDigest, loadVerifiedBundle, reusableRender } from "../lib/video/review-bundle";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(webRoot, ".env.local"), quiet: true });

function option(name: string, fallback: string): string {
  const position = process.argv.indexOf(`--${name}`);
  return position < 0 ? fallback : process.argv[position + 1] ?? fallback;
}

async function main() {
  const intake = IntakeSchema.parse({ regimenId: option("regimen", "rchop"), voiceTone: option("tone", "friendly"),
    educationLevel: option("education", "some_college"), depthPreference: option("detail", "short") });
  console.log("Directed video:", JSON.stringify(intake));
  const prepared = await prepareDirectedVideo(intake, { onProgress: console.log });
  if (process.argv.includes("--prepare-only")) return;
  if (!process.argv.includes("--rerender") && reusableRender(prepared.directory, prepared.manifest)) {
    console.log(`Unchanged rendered variant cache hit (${prepared.manifest.visualReview}): ${path.join(prepared.directory, "video.mp4")}`);
    return;
  }
  let lastProgress = -1;
  const rendererAtStart = directedRendererDigest();
  const output = await renderDirectedVideo(prepared.props, prepared.audioBuffer, path.join(prepared.directory, "video.mp4"), (value) => {
    const percent = Math.floor(value * 20) * 5;
    if (percent > lastProgress) { lastProgress = percent; console.log(`Rendering: ${percent}%`); }
  });
  const current = loadVerifiedBundle(prepared.directory);
  if (directedRendererDigest() !== rendererAtStart || objectDigest(current.manifest.files) !== objectDigest(prepared.manifest.files)) {
    throw new Error("Renderer or prepared inputs changed during export. This MP4 cannot inherit the new evidence; rerender the current bundle.");
  }
  writeJson(path.join(prepared.directory, "manifest.json"), { ...prepared.manifest, status: "rendered_candidate", video: output,
    videoDigest: digest(readFileSync(output)), rendererDigest: rendererAtStart, visualReview: "pending" });
  console.log(`Rendered candidate for review: ${output}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
