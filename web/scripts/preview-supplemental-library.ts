import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import { SUPPLEMENTAL_ARTWORK_RECIPES } from "../lib/video/library-supplemental-motion";
import type { SupplementalGeometryAudit } from "../video-composition/directed/SupplementalLibraryArtwork";

type Audit = SupplementalGeometryAudit & { artworkId: string; seconds: number; reducedMotion: boolean };
const sha = (filename: string) => createHash("sha256").update(readFileSync(filename)).digest("hex");

async function main() {
  const output = path.resolve("out/supplemental-library-preview");
  mkdirSync(output, { recursive: true });
  const frames = [0, 30, 90, 110, 114, 118, 121, 180, 210, 267, 274, 280, 359, 360];
  const checks: object[] = [];
  const audits: Audit[] = [];
  const artifacts: string[] = [];
  const serveUrl = await bundle({ entryPoint: path.resolve("video-composition/supplemental-library-index.tsx") });
  const browser = await openBrowser("chrome");
  try {
    for (const recipe of SUPPLEMENTAL_ARTWORK_RECIPES) {
      assert.equal(sha(path.resolve("public", recipe.publicPath)), recipe.sourceSha256);
      const inputProps = { artworkId: recipe.id, qaMode: true };
      const composition = await selectComposition({ serveUrl, id: "SupplementalLibraryProbe", inputProps, puppeteerInstance: browser });
      const render = async (frame: number, reducedMotion = false) => {
        const props = { ...inputProps, reducedMotion };
        const selected = reducedMotion ? await selectComposition({ serveUrl, id: composition.id, inputProps: props, puppeteerInstance: browser }) : composition;
        const filename = `${recipe.id}-${reducedMotion ? "reduced" : frame}.png`;
        const captured: Audit[] = [];
        await renderStill({ serveUrl, composition: selected, inputProps: props, puppeteerInstance: browser, frame, output: path.join(output, filename), logLevel: "error",
          onBrowserLog: (log) => {
            const marker = "SUPPLEMENTAL_QA:";
            const index = log.text.indexOf(marker);
            if (index >= 0) captured.push(JSON.parse(log.text.slice(index + marker.length)) as Audit);
          } });
        const audit = [...captured].reverse().find((candidate) => Math.abs(candidate.seconds - frame / 30) < 1e-8 && candidate.reducedMotion === reducedMotion);
        assert.ok(audit, `${recipe.id}: missing geometry audit at ${frame}`);
        assert.ok(audit.sourceGeometryAndPalettePreserved && audit.stockGroupsRemoved && audit.sourceBoundsInsideViewBox, `${recipe.id}: geometry or stock-content check failed at ${frame}: ${JSON.stringify(audit)}`);
        assert.equal(audit.eyeCount, 2);
        assert.equal(audit.connectedBodyChildCount, recipe.id === "supplemental-remote-support" ? 51 : 0);
        audits.push(audit);
        artifacts.push(filename);
      };
      for (const frame of frames) await render(frame);
      await render(114, true);
      const pixels = (suffix: string | number) => sharp(path.join(output, `${recipe.id}-${suffix}.png`)).ensureAlpha().raw().toBuffer();
      const rest = await pixels(0);
      const reducedMotionMatchesRest = rest.equals(await pixels("reduced"));
      const loopReturnsToRest = rest.equals(await pixels(360));
      const lastFrameMatchesRest = rest.equals(await pixels(359));
      const blinkChangesRenderedPixels = !rest.equals(await pixels(114));
      assert.ok(reducedMotionMatchesRest && loopReturnsToRest && lastFrameMatchesRest && blinkChangesRenderedPixels, `${recipe.id}: reduced-motion or native seam pixel check failed`);
      const videoName = `${recipe.id}.mp4`;
      const video = path.join(output, videoName);
      const videoProps = { artworkId: recipe.id, qaMode: false };
      const videoComposition = await selectComposition({ serveUrl, id: composition.id, inputProps: videoProps, puppeteerInstance: browser });
      await renderMedia({ serveUrl, composition: { ...videoComposition, durationInFrames: 360 }, inputProps: videoProps, puppeteerInstance: browser, codec: "h264", muted: true, concurrency: 2, outputLocation: video, crf: 18 });
      execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", video, "-f", "null", "-"], { stdio: "pipe" });
      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", video], { encoding: "utf8" }));
      const videoStream = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
      assert.equal(Number(videoStream.nb_frames), 360);
      assert.equal(Number(probe.format.duration), 12);
      assert.equal(probe.streams.some((stream: { codec_type: string }) => stream.codec_type === "audio"), false);
      artifacts.push(videoName);
      const phoneName = `${recipe.id}-phone.png`;
      await sharp(path.join(output, `${recipe.id}-114.png`)).resize({ width: 375 }).png().toFile(path.join(output, phoneName));
      artifacts.push(phoneName);
      const sheetName = `${recipe.id}-contact.png`;
      const panels = await Promise.all(frames.map(async (frame, index) => ({ input: await sharp(path.join(output, `${recipe.id}-${frame}.png`)).resize(200, 187).png().toBuffer(), left: index % 7 * 200, top: Math.floor(index / 7) * 187 })));
      await sharp({ create: { width: 1400, height: 374, channels: 4, background: "#F4F7F6" } }).composite(panels).png().toFile(path.join(output, sheetName));
      artifacts.push(sheetName);
      checks.push({ artworkId: recipe.id, reducedMotionMatchesRest, loopReturnsToRest, lastFrameMatchesRest, blinkChangesRenderedPixels, fullVideoDecodePassed: true, frames: 360, seconds: 12, sourceHashUnchanged: sha(path.resolve("public", recipe.publicPath)) === recipe.sourceSha256 });
      console.log(`Supplemental study verified: ${recipe.id}`);
    }
  } finally { await browser.close({ silent: true }); }
  const implementationFiles = ["lib/video/library-supplemental-motion.ts", "video-composition/directed/SupplementalLibraryArtwork.tsx", "video-composition/supplemental-library-index.tsx", "video-composition/directed/LibrarySvgArtwork.tsx", "video-composition/directed/namespace-svg.ts", "scripts/preview-supplemental-library.ts"];
  writeFileSync(path.join(output, "evidence.json"), JSON.stringify({ previewOnly: true, integratedInCurrentCandidates: false, humanVisualApproval: "pending", clinicalApproval: "not-established", frames, recipes: SUPPLEMENTAL_ARTWORK_RECIPES, checks, audits, implementationFiles: Object.fromEntries(implementationFiles.map((file) => [file, sha(path.resolve(file))])), files: Object.fromEntries(artifacts.map((file) => [file, sha(path.join(output, file))])) }, null, 2) + "\n");
  const cards = SUPPLEMENTAL_ARTWORK_RECIPES.map((recipe) => `<article><h2>${recipe.id}</h2><p>${recipe.semantics}</p><video controls loop preload="metadata" src="${recipe.id}.mp4" poster="${recipe.id}-90.png"></video><div class="controls"><button data-step="-1">Previous frame</button><button data-step="1">Next frame</button><label>Speed <select><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option></select></label></div><p>${recipe.restriction}</p><p><a href="${recipe.id}-contact.png">Contact sheet</a> · <a href="${recipe.id}-phone.png">375-pixel preview</a> · <a href="${recipe.id}.mp4" download>Download study</a></p></article>`).join("\n");
  writeFileSync(path.join(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Supplemental illustration studies</title><style>body{font:17px system-ui;margin:32px auto;padding:0 20px;max-width:1240px;color:#1c2b45;background:#f4f7f6}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:32px}video{width:100%;border:1px solid #cfdeda;border-radius:16px}h2{font-size:20px}p{line-height:1.5}button,select{font:inherit;margin:8px 6px 0 0;padding:6px}a{color:#215b80}</style><h1>Supplemental illustration studies</h1><p>Two optional 12-second silent studies. These alternatives are available separately and are not used in the current full candidate films. Visual review is pending; clinical approval is not established.</p><p>Original illustrations: Storyset / Freepik. Original SVG files remain unchanged. <a href="evidence.json">Geometry, native-cycle and encoded-video evidence</a>.</p><main>${cards}</main><p>Contact-sheet frames: ${frames.join(", ")} at 30 fps. Frame 360 is the next cycle's resting frame; each encoded study contains frames 0–359.</p><script>document.querySelectorAll('article').forEach(card=>{const video=card.querySelector('video');card.querySelector('select').addEventListener('change',e=>video.playbackRate=Number(e.target.value));card.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>{video.pause();video.currentTime=Math.max(0,Math.min(video.duration-1/30,(Math.round(video.currentTime*30)+Number(button.dataset.step))/30));}));});</script></html>\n`);
  console.log(output);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
