import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import { LIBRARY_CONTEXT_ARTWORK } from "../lib/video/library-context-motion";

async function main() {
  const output = path.resolve("out/context-library-preview");
  mkdirSync(output, { recursive: true });
  const frames = process.argv.includes("--quick") ? [90] : [0, 90, 114, 180, 270];
  const checks: { artworkId: string; reducedMotionMatchesRest: boolean; loopReturnsToRest: boolean }[] = [];
  const serveUrl = await bundle({ entryPoint: path.resolve("video-composition/context-library-index.tsx") });
  const browser = await openBrowser("chrome");
  try {
    for (const recipe of LIBRARY_CONTEXT_ARTWORK) {
      const inputProps = { artworkId: recipe.id };
      const composition = await selectComposition({ serveUrl, id: "ContextLibraryProbe", inputProps, puppeteerInstance: browser });
      for (const frame of frames) await renderStill({ serveUrl, composition, inputProps, puppeteerInstance: browser, frame, output: path.join(output, `${recipe.id}-${frame}.png`) });
      if (!process.argv.includes("--quick")) {
        const reducedProps = { ...inputProps, reducedMotion: true };
        const reducedComposition = await selectComposition({ serveUrl, id: "ContextLibraryProbe", inputProps: reducedProps, puppeteerInstance: browser });
        const reducedOutput = path.join(output, `${recipe.id}-reduced.png`);
        await renderStill({ serveUrl, composition: reducedComposition, inputProps: reducedProps, puppeteerInstance: browser, frame: 114, output: reducedOutput });
        const rest = await sharp(path.join(output, `${recipe.id}-0.png`)).ensureAlpha().raw().toBuffer();
        const reduced = await sharp(reducedOutput).ensureAlpha().raw().toBuffer();
        const returned = await sharp(path.join(output, `${recipe.id}-270.png`)).ensureAlpha().raw().toBuffer();
        const reducedMotionMatchesRest = rest.equals(reduced);
        const loopReturnsToRest = rest.equals(returned);
        assert.ok(reducedMotionMatchesRest, `${recipe.id}: reduced motion changed resting artwork`);
        assert.ok(loopReturnsToRest, `${recipe.id}: cycle did not return to exact resting pixels`);
        checks.push({ artworkId: recipe.id, reducedMotionMatchesRest, loopReturnsToRest });
      }
      console.log(`Context probe: ${recipe.id}`);
    }
  } finally { await browser.close({ silent: true }); }
  const panels = await Promise.all(LIBRARY_CONTEXT_ARTWORK.map(async (recipe, index) => ({ input: await sharp(path.join(output, `${recipe.id}-90.png`)).resize(300, 280).png().toBuffer(), left: index % 4 * 300, top: Math.floor(index / 4) * 280 })));
  await sharp({ create: { width: 1200, height: Math.ceil(panels.length / 4) * 280, channels: 4, background: "#F4F7F6" } }).composite(panels).png().toFile(path.join(output, "catalog.png"));
  const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
  const implementations = ["lib/video/library-context-motion.ts", "video-composition/context-library-index.tsx", "video-composition/directed/LibraryContextArtwork.tsx", "video-composition/directed/LibrarySvgArtwork.tsx", "video-composition/directed/PatientCareObjects.tsx", "video-composition/directed/namespace-svg.ts"];
  writeFileSync(path.join(output, "evidence.json"), JSON.stringify({ frames, recipes: LIBRARY_CONTEXT_ARTWORK, checks,
    implementationFiles: Object.fromEntries(implementations.map((file) => [file, sha(path.resolve(file))])),
    humanVisualApproval: "pending", clinicalApproval: "not-established", previewOnly: true }, null, 2) + "\n");
  console.log(output);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
