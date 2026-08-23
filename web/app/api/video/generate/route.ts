import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import { IntakeSchema, toPersonalizationFilter, hashPersonalizationFilter } from "@/lib/intake/schema";
import { loadRegimenContent } from "@/lib/content";
import { selectContent } from "@/lib/video/select";
import { rewriteNarration } from "@/lib/video/rewrite";
import { buildNarrationPlanFromChunks, applyTimepoints } from "@/lib/video/narration";
import { synthesizeNarration } from "@/lib/video/tts";
import { alignAudioToScript } from "@/lib/video/align";
import { renderVideoLocally } from "@/lib/video/render";
import { checkLayoutOverflow } from "@/lib/video/layout-qa";
import { storeVideo } from "@/lib/storage";
import { getSupabaseServerClient } from "@/lib/supabase/client";

// Orchestrates the full Phase 1 goal 3 pipeline: approved content + intake ->
// agentic selection -> LLM narration rewrite (guardrailed) -> side-effect
// component placement -> real TTS -> alignment -> render -> storage. See
// docs/plans/2026-08-08-narration-rewrite-component-triggers-design.md.
//
// Renders locally via @remotion/renderer (see lib/video/render.ts) — a
// standard Vercel function can't run this; production needs a Remotion Lambda
// trigger swapped in there, not built/verified this round (no AWS creds).
// This route is the demonstrable pipeline seam, run via `npm run demo:video`
// for a non-HTTP end-to-end proof, or by calling this route directly in dev.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const intake = parsed.data;
  const filter = toPersonalizationFilter(intake);
  const filterHash = hashPersonalizationFilter(filter);

  const supabase = await getSupabaseServerClient();
  if (supabase) {
    const { data: cached, error } = await supabase
      .from("generated_videos")
      .select("storage_url, selection_method, entry_ids, total_seconds")
      .eq("regimen_id", intake.regimenId)
      .eq("filter_hash", filterHash)
      .maybeSingle();
    if (error) console.error("Cache lookup failed, generating fresh:", error);
    if (cached) {
      return NextResponse.json({
        videoUrl: cached.storage_url,
        storageBackend: "cache",
        selectionMethod: cached.selection_method,
        entryIds: cached.entry_ids,
        totalSeconds: cached.total_seconds,
      });
    }
  }

  const content = loadRegimenContent(intake.regimenId);
  const selection = await selectContent(content, filter);
  const entryById = new Map(content.entries.map((e) => [e.id, e]));
  const entries = selection.entryIds.map((id) => entryById.get(id)).filter((e) => e !== undefined);

  let rewrite;
  try {
    rewrite = await rewriteNarration(entries, filter);
  } catch (err) {
    console.error("Narration rewrite failed guardrail/validation after retry:", err);
    return NextResponse.json(
      { error: "Narration generation failed its safety check. Please try again shortly." },
      { status: 404 },
    );
  }
  const estimatedPlan = buildNarrationPlanFromChunks(rewrite.chunks, entries);

  const { audioBuffer, durationSeconds, sampleRateHertz } = await synthesizeNarration(
    estimatedPlan.script,
    intake.voiceTone,
  );
  const { words } = await alignAudioToScript(audioBuffer, estimatedPlan.script, sampleRateHertz);
  const plan = applyTimepoints(estimatedPlan, words, durationSeconds);

  // Phase 2a goal #10c: text-overflow render-QA, no captions on this path yet
  // (captionsEnabled defaults off — see render.ts/SlideVideo.tsx). Blocks
  // before the render: this is a code/CSS defect a retry can't fix, so
  // there's no value in paying for the render first.
  const layoutIssues = checkLayoutOverflow(plan, []);
  if (layoutIssues.length > 0) {
    console.error("Render-QA layout overflow check failed:", layoutIssues);
    return NextResponse.json(
      { error: "Video layout check failed. Please try again shortly." },
      { status: 404 },
    );
  }

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "chemo-render-"));
  const localOutput = path.join(tmpDir, "video.mp4");
  await renderVideoLocally(plan, audioBuffer, localOutput);

  const key = `${intake.regimenId}/${Date.now()}.mp4`;
  const stored = await storeVideo(localOutput, key);

  let responseVideoUrl = stored.url;
  let responseSelectionMethod: string = selection.method;
  let responseEntryIds: string[] = selection.entryIds;
  let responseTotalSeconds = plan.totalSeconds;

  if (supabase) {
    const { error } = await supabase.from("generated_videos").insert({
      regimen_id: intake.regimenId,
      filter_hash: filterHash,
      storage_url: stored.url,
      selection_method: selection.method,
      entry_ids: selection.entryIds,
      total_seconds: plan.totalSeconds,
    });
    // Unique constraint on (regimen_id, filter_hash) — another request generated
    // the same filter concurrently and won the race. Fall back to its row rather
    // than erroring or leaving two videos for the same filter.
    if (error?.code === "23505") {
      const { data: winner, error: reselectError } = await supabase
        .from("generated_videos")
        .select("storage_url, selection_method, entry_ids, total_seconds")
        .eq("regimen_id", intake.regimenId)
        .eq("filter_hash", filterHash)
        .single();
      if (reselectError) {
        console.error("Failed to re-read winning row after cache race:", reselectError);
      } else if (winner) {
        responseVideoUrl = winner.storage_url;
        responseSelectionMethod = winner.selection_method;
        responseEntryIds = winner.entry_ids;
        responseTotalSeconds = winner.total_seconds;
      }
    } else if (error) {
      console.error("Failed to persist generated_videos row:", error);
    }
  }

  return NextResponse.json({
    videoUrl: responseVideoUrl,
    storageBackend: stored.backend,
    selectionMethod: responseSelectionMethod,
    entryIds: responseEntryIds,
    totalSeconds: responseTotalSeconds,
  });
}
