import path from "node:path";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { bundle } from "@remotion/bundler";
import { openBrowser, selectComposition, renderStill, renderMedia } from "@remotion/renderer";
import { DRINKING_SPEED, DRINKING_DURATION_FRAMES } from "../lib/video/drinking-study-motion";

async function main() {
  const source = readFileSync(path.resolve("../docs/references/drinking water-pana-2.svg"));
  const sourceHash = createHash("sha256").update(source).digest("hex");
  if (sourceHash !== "0e36d46ec3405006d40bf0c7c02ed0f8a2c4f3df75654edd156c78a016332076") throw new Error("Drinking source changed; re-inspect its layers before adapting");
  const snapshot = path.resolve("public/studies/drinking");
  mkdirSync(snapshot, { recursive: true });
  writeFileSync(path.join(snapshot, "drinking-water-pana.svg"), source);
  const output = path.resolve("out/drinking-asset-study");
  mkdirSync(output, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.resolve("video-composition/drinking-study-index.tsx") });
  const browser = await openBrowser("chrome");
  try {
    const composition = await selectComposition({ serveUrl, id: "DrinkingStudy", puppeteerInstance: browser });
    const originalFrames = process.argv.includes("--stills-only") ? [0, 90, 120, 150, 180, 225] :
      [0, 45, 60, 75, 90, 105, 114, 117, 120, 123, 126, 135, 150, 165, 180, 195, 204, 207, 210, 213, 216, 225, 240, 255, 270, 285, 300];
    const frames = [...new Set(originalFrames.map((frame) => Math.round(frame / DRINKING_SPEED))), DRINKING_DURATION_FRAMES - 1];
    for (const frame of frames) {
      await renderStill({ serveUrl, composition, puppeteerInstance: browser, frame, output: path.join(output, `frame-${frame}.png`) });
    }
    if (process.argv.includes("--stills-only")) return;
    const reducedProps = { reducedMotion: true, camera: false };
    const reducedComposition = await selectComposition({ serveUrl, id: "DrinkingStudy", puppeteerInstance: browser, inputProps: reducedProps });
    await renderStill({ serveUrl, composition: reducedComposition, puppeteerInstance: browser, frame: Math.round(150 / DRINKING_SPEED), inputProps: reducedProps, output: path.join(output, "reduced-motion.png") });
    await renderMedia({ serveUrl, composition, puppeteerInstance: browser, codec: "h264", muted: true, enforceAudioTrack: false, crf: 18, concurrency: 2, outputLocation: path.join(output, "drinking-study.mp4") });
    writeFileSync(path.join(output, "render-evidence.json"), JSON.stringify({ sourceHash, frames, fps: 30, durationSeconds: DRINKING_DURATION_FRAMES / 30, speedMultiplier: DRINKING_SPEED, waterColor: "#8ACCE8", silent: true, humanApproval: "pending" }, null, 2) + "\n");
    console.log(output);
  } finally { await browser.close({ silent: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
