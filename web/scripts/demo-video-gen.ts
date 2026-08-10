// Runnable, standalone demonstration of the full Phase 1 goal 3 pipeline,
// including #3c's narration rewrite + side-effect component placement —
// parses approved content -> intake -> agentic selection -> LLM narration
// rewrite (guardrailed) -> component placement -> real Gemini-TTS call ->
// alignment -> local Remotion render (icon overlays included) -> storage
// (local disk fallback). Run: npm run demo:video
//
// Requires GOOGLE_APPLICATION_CREDENTIALS + GOOGLE_CLOUD_PROJECT (see
// web/.env.local.example) for the TTS/rewrite/alignment steps to actually run.

import "dotenv/config";
import { config as loadEnvLocal } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvLocal({ path: path.join(__dirname, "..", ".env.local") });

import { IntakeSchema, toPersonalizationFilter } from "../lib/intake/schema";
import { loadRegimenContent } from "../lib/content";
import { selectContent } from "../lib/video/select";
import { rewriteNarration } from "../lib/video/rewrite";
import { buildNarrationPlanFromChunks, applyTimepoints } from "../lib/video/narration";
import { findComponentTriggers, refineComponentTiming, placeComponentsInTime } from "../lib/video/components";
import { synthesizeNarration } from "../lib/video/tts";
import { alignAudioToScript } from "../lib/video/align";
import { renderVideoLocally } from "../lib/video/render";
import { storeVideo } from "../lib/storage";

async function main() {
  const voiceTone = process.argv[2] ?? "neutral";
  const intake = IntakeSchema.parse({
    regimenId: "rchop",
    educationLevel: "some_college",
    depthPreference: "short",
    voiceTone,
  });
  const filter = toPersonalizationFilter(intake);
  console.log("Intake:", intake);
  console.log("Filter:", filter);

  const content = loadRegimenContent(intake.regimenId);
  console.log(`Loaded ${content.entries.length} entries for ${content.title}`);

  const selection = await selectContent(content, filter);
  console.log(`Selection (${selection.method}):`, selection.entryIds);

  const entryById = new Map(content.entries.map((e) => [e.id, e]));
  const entries = selection.entryIds.map((id) => entryById.get(id)).filter((e) => e !== undefined);

  console.log("\nRewriting narration (LLM, guardrailed)...");
  const rewrite = await rewriteNarration(entries, filter);
  const estimatedPlan = buildNarrationPlanFromChunks(rewrite.chunks, entries);
  console.log(
    `Narration script (${estimatedPlan.script.length} chars, ~${estimatedPlan.totalSeconds.toFixed(1)}s estimated):`,
  );
  console.log(estimatedPlan.script);

  console.log("\nFinding side-effect component triggers...");
  const triggers = findComponentTriggers(rewrite.script);
  console.log(`Matched ${triggers.length} side-effect tag(s):`, triggers.map((t) => t.tag));
  const placedTriggers = await refineComponentTiming(rewrite.script, triggers);

  console.log(`\nCalling Gemini-TTS (voiceTone: ${voiceTone})...`);
  const { audioBuffer, charactersSent, voice, durationSeconds, sampleRateHertz } = await synthesizeNarration(
    estimatedPlan.script,
    voiceTone,
  );
  console.log(
    `TTS OK: ${charactersSent} chars sent, voice ${voice}, ${audioBuffer.length} audio bytes, ${durationSeconds.toFixed(1)}s actual duration`,
  );

  const outDir = path.join(__dirname, "..", "out");
  mkdirSync(outDir, { recursive: true });
  const audioOutPath = path.join(outDir, `narration-${voiceTone}.wav`);
  writeFileSync(audioOutPath, audioBuffer);
  console.log(`Saved narration audio: ${audioOutPath}`);

  console.log("\nAligning audio to script via Cloud Speech-to-Text...");
  const { words, durationSeconds: alignedDurationSeconds } = await alignAudioToScript(
    audioBuffer,
    estimatedPlan.script,
    sampleRateHertz,
  );
  console.log(`Alignment OK: ${words.length} words, ${alignedDurationSeconds.toFixed(1)}s aligned duration`);
  const plan = applyTimepoints(estimatedPlan, words, durationSeconds);
  console.log(
    `Slide sync: estimated ${estimatedPlan.totalSeconds.toFixed(1)}s vs real ${plan.totalSeconds.toFixed(1)}s`,
  );
  for (const slide of plan.slides) {
    if (Number.isNaN(slide.startSeconds)) throw new Error(`Slide ${slide.entryId} has no startSeconds`);
    console.log(`  ${slide.startSeconds.toFixed(1)}s — ${slide.entryId}`);
  }

  const components = placeComponentsInTime(rewrite.script, placedTriggers, words);
  console.log(`\nComponent placements (${components.length}):`);
  for (const c of components) {
    console.log(`  ${c.startSeconds.toFixed(1)}s — ${c.tag} (${c.iconId})`);
  }

  console.log("\nRendering video locally via Remotion...");
  const outputPath = path.join(__dirname, "..", "out", "demo-video.mp4");
  const render = await renderVideoLocally(plan, audioBuffer, outputPath, components);
  console.log(`Rendered: ${render.outputPath} (${render.width}x${render.height} @ ${render.fps}fps)`);

  const stored = await storeVideo(outputPath, `demo/${Date.now()}.mp4`);
  console.log(`Stored (${stored.backend}):`, stored.url);
}

main().catch((err) => {
  console.error("Demo pipeline failed:", err);
  process.exitCode = 1;
});
