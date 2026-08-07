import path from "node:path";
import { writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import type { NarrationPlan } from "./narration";

// Known constraint (already resolved in the design doc, not rediscovered here):
// Remotion can't render inside a standard Vercel serverless function. In
// production this module's `renderVideoLocally` gets swapped for a Remotion
// Lambda (or Vercel Sandbox) trigger — that path needs an AWS account/Lambda
// function deployed via `npx remotion lambda functions deploy`, which needs
// credentials this build doesn't have. Documented as the next infra step, not
// implemented/verified here (see handoff.md).
//
// This function renders locally via @remotion/renderer, which is what the
// video-gen spike verified end-to-end (846.7 kB mp4, 18s, audio track
// present) and what `demo:video` / local dev use.

export interface RenderResult {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
}

export async function renderVideoLocally(
  plan: NarrationPlan,
  audioBuffer: Buffer,
  outputPath: string,
): Promise<RenderResult> {
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");

  // The audio is generated per patient, so it can't live in the repo's own
  // public/ dir at bundle time — instead we point @remotion/bundler's
  // publicDir at a fresh temp dir containing this render's narration.mp3,
  // and reference it via staticFile() in the composition (see SlideVideo.tsx).
  // A plain local/file:// path doesn't work here: Remotion's renderer fetches
  // assets over HTTP from its own bundle server, not from the filesystem.
  const publicDir = mkdtempSync(path.join(os.tmpdir(), "chemo-video-public-"));
  const audioFilename = "narration.mp3";
  writeFileSync(path.join(publicDir, audioFilename), audioBuffer);

  const entryPoint = path.join(process.cwd(), "video-composition", "index.ts");
  const serveUrl = await bundle({ entryPoint, publicDir });

  const inputProps = {
    slides: plan.slides,
    audioSrc: audioFilename,
    totalSeconds: plan.totalSeconds,
  };

  const composition = await selectComposition({
    serveUrl,
    id: "PatientSlideVideo",
    inputProps,
  });

  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation: outputPath,
    inputProps,
  });

  return {
    outputPath,
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
  };
}
