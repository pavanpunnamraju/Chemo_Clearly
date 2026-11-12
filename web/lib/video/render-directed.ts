import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { DirectedVideoProps } from "./direction-types";
import { muxNarrationAudio } from "./render-narration-audio";

export async function bundleDirectedVideo(props: DirectedVideoProps, audioBuffer: Buffer) {
  const { bundle } = await import("@remotion/bundler");
  const { selectComposition, openBrowser } = await import("@remotion/renderer");
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const publicDir = mkdtempSync(path.join(os.tmpdir(), "chemo-directed-"));
  cpSync(path.join(webRoot, "public"), publicDir, { recursive: true });
  if (audioBuffer.length) writeFileSync(path.join(publicDir, "narration.wav"), audioBuffer);
  const serveUrl = await bundle({ entryPoint: path.join(webRoot, "video-composition", "directed-index.ts"), publicDir });
  const browser = await openBrowser("chrome");
  const composition = await selectComposition({ serveUrl, id: "DirectedPatientVideo", inputProps: props, puppeteerInstance: browser });
  return { serveUrl, composition, browser };
}

export async function renderDirectedVideo(props: DirectedVideoProps, audioBuffer: Buffer, outputPath: string,
  onProgress?: (progress: number) => void) {
  if (props.musicSrc) throw new Error("Directed candidates require the independently verified narration track without unreviewed music");
  const { renderMedia } = await import("@remotion/renderer");
  const prepared = await bundleDirectedVideo(props, audioBuffer);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  try {
    await renderMedia({ serveUrl: prepared.serveUrl, composition: prepared.composition, puppeteerInstance: prepared.browser,
      inputProps: props, codec: "h264", crf: 18, outputLocation: outputPath, concurrency: 3,
      muted: true,
      onProgress: ({ progress }) => onProgress?.(progress) });
  } finally { await prepared.browser.close({ silent: true }); }
  if (audioBuffer.length) await muxNarrationAudio(outputPath, audioBuffer);
  return outputPath;
}
