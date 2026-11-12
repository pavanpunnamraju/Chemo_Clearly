import path from "node:path";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { bundle } from "@remotion/bundler";
import { openBrowser, selectComposition, renderStill, renderMedia } from "@remotion/renderer";

async function main() {
  const source = readFileSync(path.resolve("../docs/references/Calling-pana.svg"));
  const sourceHash = createHash("sha256").update(source).digest("hex");
  if (sourceHash !== "6f5712a602544facb40c86e675234c6c68964618b1d17564d181491d7b542d8f") {
    throw new Error("Supplied SVG changed; inspect the contact layers before adapting it");
  }
  const snapshot = path.resolve("public/studies/calling");
  mkdirSync(snapshot, { recursive: true });
  writeFileSync(path.join(snapshot, "Calling-pana.svg"), source);
  const output = path.resolve("out/calling-asset-study");
  mkdirSync(output, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.resolve("video-composition/calling-study-index.tsx") });
  const browser = await openBrowser("chrome");
  try {
    const composition = await selectComposition({ serveUrl, id: "CallingStudy", puppeteerInstance: browser });
    const frames = [0, 45, 60, 75, 90, 105, 138, 139, 140, 141, 142, 144, 146, 150, 180, 195, 210, 225, 240, 255, 300, 359];
    for (const frame of frames) {
      await renderStill({ serveUrl, composition, puppeteerInstance: browser, frame, output: path.join(output, `frame-${frame}.png`) });
    }
    const reducedProps = { reducedMotion: true, camera: false };
    const reducedComposition = await selectComposition({ serveUrl, id: "CallingStudy", puppeteerInstance: browser, inputProps: reducedProps });
    await renderStill({ serveUrl, composition: reducedComposition, puppeteerInstance: browser, frame: 141, inputProps: reducedProps, output: path.join(output, "reduced-motion.png") });
    await renderMedia({ serveUrl, composition, puppeteerInstance: browser, codec: "h264", muted: true, enforceAudioTrack: false, crf: 18, concurrency: 2, outputLocation: path.join(output, "calling-study.mp4") });
    writeFileSync(path.join(output, "render-evidence.json"), JSON.stringify({ sourceHash, frames, fps: 30, durationSeconds: 12, silent: true, humanApproval: "pending" }, null, 2) + "\n");
    console.log(output);
  } finally { await browser.close({ silent: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
