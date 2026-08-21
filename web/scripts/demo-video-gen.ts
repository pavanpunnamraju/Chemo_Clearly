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
import { rewriteNarration, type RewriteResult } from "../lib/video/rewrite";
import { buildNarrationPlanFromChunks, applyTimepoints } from "../lib/video/narration";
import { buildCaptionTrack } from "../lib/video/captions";
import { synthesizeNarration, type SynthesizeResult } from "../lib/video/tts";
import { alignAudioToScript, type WordOffset } from "../lib/video/align";
import { renderVideoLocally } from "../lib/video/render";
import { storeVideo } from "../lib/storage";

// Dev-only cache for the pipeline's expensive stages (LLM rewrite, Gemini-TTS,
// Cloud Speech-to-Text alignment), keyed on the same filter hash the real app
// uses for `generated_videos.filter_hash` (web/lib/intake/schema.ts) — reused
// here rather than reinvented. Downstream steps (component placement,
// captions, render) always run fresh; those are what demo iteration targets.
// Force a fresh run with `--fresh` or `DEMO_FORCE_REFRESH=1`.
const FORCE_REFRESH = process.argv.includes("--fresh") || process.env.DEMO_FORCE_REFRESH === "1";

interface DemoCacheEntry {
  rewrite: RewriteResult;
  tts: Omit<SynthesizeResult, "audioBuffer">;
  align: { words: WordOffset[]; durationSeconds: number };
}

function loadDemoCache(cacheDir: string, currentEntryIds: string[]): (DemoCacheEntry & { audioBuffer: Buffer }) | null {
  if (FORCE_REFRESH || !existsSync(path.join(cacheDir, "meta.json"))) return null;
  const meta = JSON.parse(readFileSync(path.join(cacheDir, "meta.json"), "utf-8")) as DemoCacheEntry;

  // The cache key is the intake filter hash only — it says nothing about
  // which entries the (LLM-based, not perfectly deterministic) selection
  // step actually picked, or about docs/content/*.md's structure at cache
  // time. A cached rewrite whose chunk entryIds don't match this run's
  // selection is stale in a way that silently drops content rather than
  // erroring: buildNarrationPlanFromChunks skips any chunk whose entryId
  // isn't in the current entries (see lib/video/narration.ts), so a stale
  // cache can make a whole section vanish from the video while its cached
  // *audio* still narrates it — desyncing every slide after it. Caught this
  // live: a cache predating rchop.md's `emergency` per-item split (single
  // "emergency" chunk id) silently dropped the entire emergency section
  // once the content moved to per-item ids, with knock-on timing corruption
  // for everything after it. Treat a mismatch as a cache miss.
  const cachedEntryIds = new Set(meta.rewrite.chunks.map((c) => c.entryId));
  const missing = currentEntryIds.filter((id) => !cachedEntryIds.has(id));
  if (missing.length > 0) {
    console.log(`Cache at ${cacheDir} is stale (missing entries: ${missing.join(", ")}) — refreshing.`);
    return null;
  }

  const audioBuffer = readFileSync(path.join(cacheDir, "audio.wav"));
  return { ...meta, audioBuffer };
}

function saveDemoCache(cacheDir: string, entry: DemoCacheEntry & { audioBuffer: Buffer }): void {
  mkdirSync(cacheDir, { recursive: true });
  const { audioBuffer, ...meta } = entry;
  writeFileSync(path.join(cacheDir, "meta.json"), JSON.stringify(meta, null, 2));
  writeFileSync(path.join(cacheDir, "audio.wav"), audioBuffer);
}

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

  const cacheDir = path.join(__dirname, "..", ".demo-cache", hashPersonalizationFilter(filter));
  const cached = loadDemoCache(cacheDir, entries.map((e) => e.id));

  let rewrite: RewriteResult;
  let audioBuffer: Buffer;
  let durationSeconds: number, sampleRateHertz: number, charactersSent: number, voice: string;
  let words: WordOffset[], alignedDurationSeconds: number;

  if (cached) {
    console.log(`\nCache hit (${cacheDir}) — skipping rewrite/TTS/alignment.`);
    ({ rewrite, audioBuffer } = cached);
    ({ durationSeconds, sampleRateHertz, charactersSent, voice } = cached.tts);
    ({ words, durationSeconds: alignedDurationSeconds } = cached.align);
  } else {
    console.log("\nRewriting narration (LLM, guardrailed)...");
    rewrite = await rewriteNarration(entries, filter);
    console.log(`Narration script (${rewrite.script.length} chars).`);

    console.log(`\nCalling Gemini-TTS (voiceTone: ${voiceTone})...`);
    ({ audioBuffer, charactersSent, voice, durationSeconds, sampleRateHertz } = await synthesizeNarration(
      buildNarrationPlanFromChunks(rewrite.chunks, entries).script,
      voiceTone,
    ));
    console.log(
      `TTS OK: ${charactersSent} chars sent, voice ${voice}, ${audioBuffer.length} audio bytes, ${durationSeconds.toFixed(1)}s actual duration`,
    );

    console.log("\nAligning audio to script via Cloud Speech-to-Text...");
    ({ words, durationSeconds: alignedDurationSeconds } = await alignAudioToScript(
      audioBuffer,
      buildNarrationPlanFromChunks(rewrite.chunks, entries).script,
      sampleRateHertz,
    ));
    console.log(`Alignment OK: ${words.length} words, ${alignedDurationSeconds.toFixed(1)}s aligned duration`);

    saveDemoCache(cacheDir, {
      rewrite,
      tts: { charactersSent, voice, durationSeconds, sampleRateHertz },
      align: { words, durationSeconds: alignedDurationSeconds },
      audioBuffer,
    });
    console.log(`Cached pipeline outputs: ${cacheDir}`);
  }

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

  console.log("\nRendering video locally via Remotion (captions on, for verification)...");
  const outputPath = path.join(__dirname, "..", "out", "demo-video.mp4");
  const render = await renderVideoLocally(plan, audioBuffer, outputPath, captions, true);
  console.log(`Rendered: ${render.outputPath} (${render.width}x${render.height} @ ${render.fps}fps)`);

  const stored = await storeVideo(outputPath, `demo/${Date.now()}.mp4`);
  console.log(`Stored (${stored.backend}):`, stored.url);
}

main().catch((err) => {
  console.error("Demo pipeline failed:", err);
  process.exitCode = 1;
});
