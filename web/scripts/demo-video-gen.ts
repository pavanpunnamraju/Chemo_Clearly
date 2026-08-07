// Runnable, standalone demonstration of Phase 1 goal 3 (video-gen workflow) —
// parses approved content -> intake -> agentic selection (Gemini if
// GEMINI_API_KEY is set, deterministic fallback otherwise) -> narration
// assembly -> real Google Cloud TTS call -> local Remotion render -> storage
// (local disk fallback). Run: npm run demo:video
//
// Requires GOOGLE_APPLICATION_CREDENTIALS (see web/.env.local.example) for
// the TTS step to actually run, same as the original spike.

import "dotenv/config";
import { config as loadEnvLocal } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvLocal({ path: path.join(__dirname, "..", ".env.local") });

import { IntakeSchema, toPersonalizationFilter } from "../lib/intake/schema";
import { loadRegimenContent } from "../lib/content";
import { selectContent } from "../lib/video/select";
import { buildNarrationPlan, applyTimepoints } from "../lib/video/narration";
import { synthesizeNarration } from "../lib/video/tts";
import { renderVideoLocally } from "../lib/video/render";
import { storeVideo } from "../lib/storage";

async function main() {
  const intake = IntakeSchema.parse({
    regimenId: "rchop",
    educationLevel: "some_college",
    topics: ["infection-risk", "nausea-appetite"],
    depthPreference: "short",
  });
  const filter = toPersonalizationFilter(intake);
  console.log("Intake:", intake);
  console.log("Filter:", filter);

  const content = loadRegimenContent(intake.regimenId);
  console.log(`Loaded ${content.entries.length} entries for ${content.title}`);

  const selection = await selectContent(content, filter);
  console.log(`Selection (${selection.method}):`, selection.entryIds);

  const estimatedPlan = buildNarrationPlan(content, selection.entryIds, filter);
  console.log(
    `Narration script (${estimatedPlan.script.length} chars, ~${estimatedPlan.totalSeconds.toFixed(1)}s estimated):`,
  );
  console.log(estimatedPlan.script);

  console.log("\nCalling Google Cloud TTS...");
  const { audioBuffer, charactersSent, voice, timepoints, durationSeconds } = await synthesizeNarration(
    estimatedPlan.ssml,
    estimatedPlan.script,
  );
  console.log(
    `TTS OK: ${charactersSent} chars billed, voice ${voice}, ${audioBuffer.length} audio bytes, ${durationSeconds.toFixed(1)}s actual duration, ${timepoints.length} timepoints`,
  );
  const plan = applyTimepoints(estimatedPlan, timepoints, durationSeconds);

  console.log("\nRendering video locally via Remotion...");
  const outputPath = path.join(__dirname, "..", "out", "demo-video.mp4");
  const render = await renderVideoLocally(plan, audioBuffer, outputPath);
  console.log(`Rendered: ${render.outputPath} (${render.width}x${render.height} @ ${render.fps}fps)`);

  const stored = await storeVideo(outputPath, `demo/${Date.now()}.mp4`);
  console.log(`Stored (${stored.backend}):`, stored.url);
}

main().catch((err) => {
  console.error("Demo pipeline failed:", err);
  process.exitCode = 1;
});
