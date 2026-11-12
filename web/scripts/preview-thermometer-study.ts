import path from "node:path";
import { mkdirSync } from "node:fs";
import { bundle } from "@remotion/bundler";
import { openBrowser, selectComposition, renderStill, renderMedia } from "@remotion/renderer";

async function main() {
  const output = path.resolve("out", "thermometer-asset-study");
  mkdirSync(output, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.resolve("video-composition/thermometer-study-index.tsx") });
  const browser = await openBrowser("chrome");
  try {
    const composition = await selectComposition({ serveUrl, id: "ThermometerStudy", puppeteerInstance: browser });
    for (const seconds of [0, 1.5, 2, 2.5, 3, 3.5, 4, 6, 7.5, 8.5, 10]) {
      await renderStill({ serveUrl, composition, puppeteerInstance: browser, frame: Math.round(seconds * 30), output: path.join(output, `frame-${seconds}.png`) });
    }
    await renderMedia({ serveUrl, composition, puppeteerInstance: browser, codec: "h264", crf: 18, concurrency: 2, outputLocation: path.join(output, "thermometer-study.mp4") });
    console.log(output);
  } finally { await browser.close({ silent: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
