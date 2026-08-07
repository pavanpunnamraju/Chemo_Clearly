import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import { IntakeSchema, toPersonalizationFilter } from "@/lib/intake/schema";
import { loadRegimenContent } from "@/lib/content";
import { selectContent } from "@/lib/video/select";
import { buildNarrationPlan, applyTimepoints } from "@/lib/video/narration";
import { synthesizeNarration } from "@/lib/video/tts";
import { renderVideoLocally } from "@/lib/video/render";
import { storeVideo } from "@/lib/storage";
import { getSupabaseServerClient } from "@/lib/supabase/client";

// Orchestrates the full Phase 1 goal 3 pipeline: approved content + intake ->
// agentic selection -> narration assembly -> real TTS -> render -> storage.
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

  const content = loadRegimenContent(intake.regimenId);
  const selection = await selectContent(content, filter);
  const estimatedPlan = buildNarrationPlan(content, selection.entryIds, filter);

  const { audioBuffer, timepoints, durationSeconds } = await synthesizeNarration(
    estimatedPlan.ssml,
    estimatedPlan.script,
  );
  const plan = applyTimepoints(estimatedPlan, timepoints, durationSeconds);

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "chemo-render-"));
  const localOutput = path.join(tmpDir, "video.mp4");
  await renderVideoLocally(plan, audioBuffer, localOutput);

  const key = `${intake.regimenId}/${Date.now()}.mp4`;
  const stored = await storeVideo(localOutput, key);

  const supabase = await getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from("generated_videos").insert({
      regimen_id: intake.regimenId,
      storage_url: stored.url,
      selection_method: selection.method,
      entry_ids: selection.entryIds,
      total_seconds: plan.totalSeconds,
    });
    if (error) console.error("Failed to persist generated_videos row:", error);
  }

  return NextResponse.json({
    videoUrl: stored.url,
    storageBackend: stored.backend,
    selectionMethod: selection.method,
    entryIds: selection.entryIds,
    totalSeconds: plan.totalSeconds,
  });
}
