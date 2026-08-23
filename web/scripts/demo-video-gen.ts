// Runnable, standalone demonstration of the full Phase 1 goal 3 pipeline,
// including #3c's narration rewrite — parses approved content -> intake ->
// agentic selection -> LLM narration rewrite (guardrailed) -> real
// Gemini-TTS call -> alignment -> local Remotion render (Scene archetype,
// tag-driven side_effects illustrations) -> storage (local disk fallback).
// Run: npm run demo:video
//
// Requires GOOGLE_APPLICATION_CREDENTIALS + GOOGLE_CLOUD_PROJECT (see
// web/.env.local.example) for the TTS/rewrite/alignment steps to actually run.

import "dotenv/config";
import { config as loadEnvLocal } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvLocal({ path: path.join(__dirname, "..", ".env.local") });

import { IntakeSchema, toPersonalizationFilter, hashPersonalizationFilter } from "../lib/intake/schema";
import { loadRegimenContent } from "../lib/content";
import { selectContent } from "../lib/video/select";
import { buildNarrationPlanFromChunks, applyTimepoints } from "../lib/video/narration";
import { buildCaptionTrack } from "../lib/video/captions";
import { renderVideoLocally } from "../lib/video/render";
import { storeVideo } from "../lib/storage";
import {
  groupEntriesBySection,
  hashSection,
  runSectionPipeline,
  stitchSections,
  type SectionPipelineOutput,
} from "../lib/video/pipeline";

// Dev-only cache for the pipeline's expensive stages (LLM rewrite, Gemini-TTS,
// Cloud Speech-to-Text alignment), keyed per narrated section (Phase 2a goal
// #13) rather than as one whole-script blob — editing a couple of lines in
// one section of docs/content/*.md no longer forces a full re-rewrite +
// re-TTS + re-align of the whole ~33-entry script; only the changed
// section(s) re-run. Layout: `.demo-cache/<filterHash>/sections/<sectionId>/
// {meta.json,audio.wav}`. Downstream steps (component placement, captions,
// render) always run fresh; those are what demo iteration targets.
// Force a fresh run with `--fresh` or `DEMO_FORCE_REFRESH=1`.
const FORCE_REFRESH = process.argv.includes("--fresh") || process.env.DEMO_FORCE_REFRESH === "1";
// Goal #5 verification render — same on/off-by-default shape as FORCE_REFRESH
// above, doesn't touch the section cache (only the render step reads this).
const REDUCED_MOTION = process.argv.includes("--reduced-motion") || process.env.DEMO_REDUCED_MOTION === "1";

type SectionMeta = Omit<SectionPipelineOutput, "audioBuffer">;

function sectionCacheDir(cacheRoot: string, sectionId: string): string {
  return path.join(cacheRoot, "sections", sectionId);
}

function loadSectionCache(cacheRoot: string, sectionId: string, expectedHash: string): SectionPipelineOutput | null {
  const dir = sectionCacheDir(cacheRoot, sectionId);
  if (FORCE_REFRESH || !existsSync(path.join(dir, "meta.json"))) return null;

  const meta = JSON.parse(readFileSync(path.join(dir, "meta.json"), "utf-8")) as SectionMeta;
  if (meta.hash !== expectedHash) {
    console.log(`Section "${sectionId}" cache is stale (content changed) — re-running.`);
    return null;
  }

  const audioBuffer = readFileSync(path.join(dir, "audio.wav"));
  return { ...meta, audioBuffer };
}

function saveSectionCache(cacheRoot: string, output: SectionPipelineOutput): void {
  const dir = sectionCacheDir(cacheRoot, output.sectionId);
  mkdirSync(dir, { recursive: true });
  const { audioBuffer, ...meta } = output;
  writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
  writeFileSync(path.join(dir, "audio.wav"), audioBuffer);
}

async function main() {
  const voiceTone = process.argv[2] ?? "friendly";
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
  const selectedEntries = selection.entryIds.map((id) => entryById.get(id)).filter((e) => e !== undefined);

  const cacheRoot = path.join(__dirname, "..", ".demo-cache", hashPersonalizationFilter(filter));
  const groups = groupEntriesBySection(selectedEntries);

  const sectionOutputs: SectionPipelineOutput[] = [];
  for (const group of groups) {
    const hash = hashSection(group.sectionId, group.entries);
    const cached = loadSectionCache(cacheRoot, group.sectionId, hash);
    if (cached) {
      console.log(`Section "${group.sectionId}": cache hit — skipping rewrite/TTS/alignment.`);
      sectionOutputs.push(cached);
      continue;
    }

    console.log(`Section "${group.sectionId}": rewriting/synthesizing/aligning (${group.entries.length} entries)...`);
    const output = await runSectionPipeline(group.sectionId, group.entries, filter, voiceTone);
    console.log(
      `Section "${group.sectionId}" OK: ${output.tts.charactersSent} chars, ${output.durationSeconds.toFixed(1)}s audio, ${output.words.length} aligned words.`,
    );
    saveSectionCache(cacheRoot, output);
    sectionOutputs.push(output);
  }

  // Stitched entries follow the same canonical section order groupEntriesBySection
  // used, so they line up 1:1 with the concatenated chunks below.
  const entries = groups.flatMap((g) => g.entries);
  const stitched = stitchSections(sectionOutputs);
  const rewrite = { chunks: stitched.chunks, script: stitched.chunks.map((c) => c.text).join(" ") };
  const audioBuffer = stitched.audioBuffer;
  const words = stitched.words;
  const durationSeconds = stitched.durationSeconds;

  const estimatedPlan = buildNarrationPlanFromChunks(rewrite.chunks, entries);
  console.log(`~${estimatedPlan.totalSeconds.toFixed(1)}s estimated:`);
  console.log(estimatedPlan.script);

  const outDir = path.join(__dirname, "..", "out");
  mkdirSync(outDir, { recursive: true });
  const audioOutPath = path.join(outDir, `narration-${voiceTone}.wav`);
  writeFileSync(audioOutPath, audioBuffer);
  console.log(`Saved narration audio: ${audioOutPath}`);
  const plan = applyTimepoints(estimatedPlan, words, durationSeconds);
  console.log(
    `Slide sync: estimated ${estimatedPlan.totalSeconds.toFixed(1)}s vs real ${plan.totalSeconds.toFixed(1)}s`,
  );
  for (const slide of plan.slides) {
    if (Number.isNaN(slide.startSeconds)) throw new Error(`Slide ${slide.entryId} has no startSeconds`);
    console.log(`  ${slide.startSeconds.toFixed(1)}s — ${slide.entryId}`);
  }

  const captions = buildCaptionTrack(estimatedPlan.script, words, plan.totalSeconds);
  console.log(`\nCaption track (${captions.length} chunks) — spot check:`);
  for (const c of captions.slice(0, 5)) {
    console.log(`  ${c.startSeconds.toFixed(2)}s-${c.endSeconds.toFixed(2)}s (${(c.endSeconds - c.startSeconds).toFixed(2)}s): "${c.text}"`);
  }

  console.log(`\nRendering video locally via Remotion (captions on${REDUCED_MOTION ? ", reducedMotion on" : ""}, for verification)...`);
  const outputPath = path.join(__dirname, "..", "out", REDUCED_MOTION ? "demo-video-reduced-motion.mp4" : "demo-video.mp4");
  const render = await renderVideoLocally(plan, audioBuffer, outputPath, captions, true, REDUCED_MOTION);
  console.log(`Rendered: ${render.outputPath} (${render.width}x${render.height} @ ${render.fps}fps)`);

  const stored = await storeVideo(outputPath, `demo/${Date.now()}.mp4`);
  console.log(`Stored (${stored.backend}):`, stored.url);
}

main().catch((err) => {
  console.error("Demo pipeline failed:", err);
  process.exitCode = 1;
});
