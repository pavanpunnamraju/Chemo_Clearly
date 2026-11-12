import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";

const sha = (filename: string) => createHash("sha256").update(readFileSync(filename)).digest("hex");
const source = "public/illustrations/overview/overview__oncology-patient-pana.svg";
const files = [source, "lib/video/infusion-motion.ts", "video-composition/directed/InfusionArtwork.tsx",
  "video-composition/directed/LibrarySvgArtwork.tsx", "video-composition/directed/namespace-svg.ts",
  "video-composition/infusion-study-index.tsx", "scripts/preview-infusion-study.ts"];
const fingerprints = () => Object.fromEntries(files.map(file => [file, sha(path.resolve(file))]));

async function main() {
  const output = path.resolve("out/infusion-motion-study", process.argv.find(arg => arg.startsWith("--run="))?.slice(6) ?? "draft-1");
  mkdirSync(output, { recursive: true });
  const before = fingerprints();
  assert.equal(before[source], "86bedce3698e62d3ab5fe35c31ade22da1481725beeece2813d12ebf5d6cc650");
  const inputProps = { reducedMotion: false, fluidDropFraction: 1 };
  const sourceMouthPath = readFileSync(path.resolve(source), "utf8").match(/\bd="(M250\.7,171\.51[^"]+)"/)?.[1];
  assert.ok(sourceMouthPath, "Original mouth path is missing");
  type Audit = { seconds: number; reducedMotion: boolean; uniqueIds: boolean; iconRemoved: boolean; clipY: number;
    clipHeight: number; mouthPath: string; mouthLayerCount: number; nosePoints: string;
    layers: { name: string; transform: string | null; bounds: { x: number; y: number; width: number; height: number } }[] };
  const audits: Audit[] = [];
  const capture = (log: { text: string }) => {
    const marker = "INFUSION_QA:";
    const index = log.text.indexOf(marker);
    if (index >= 0) audits.push(JSON.parse(log.text.slice(index + marker.length)) as Audit);
  };
  const frames = [0, 60, 120, 180, 270, 359, 360, 480, 600, 719];
  const serveUrl = await bundle({ entryPoint: path.resolve("video-composition/infusion-study-index.tsx") });
  const browser = await openBrowser("chrome");
  let encoded: object | undefined;
  try {
    const stillProps = { ...inputProps, qaMode: true };
    const composition = await selectComposition({ serveUrl, id: "InfusionStudy", inputProps: stillProps, puppeteerInstance: browser });
    for (const frame of frames) {
      await renderStill({ serveUrl, composition, inputProps: stillProps, puppeteerInstance: browser, frame,
        output: path.join(output, `frame-${frame}.png`), onBrowserLog: capture, logLevel: "error" });
    }
    const reducedProps = { ...stillProps, reducedMotion: true };
    const reducedComposition = await selectComposition({ serveUrl, id: "InfusionStudy", inputProps: reducedProps, puppeteerInstance: browser });
    await renderStill({ serveUrl, composition: reducedComposition, inputProps: reducedProps,
      puppeteerInstance: browser, frame: 600, output: path.join(output, "reduced.png"), onBrowserLog: capture, logLevel: "error" });
    const active = frames.map(frame => {
      const audit = audits.find(a => !a.reducedMotion && Math.abs(a.seconds - frame / 30) < 1e-7);
      assert.ok(audit, `Missing rendered audit at frame ${frame}`);
      assert.ok(audit.uniqueIds && audit.iconRemoved, "SVG IDs collide or icon remains");
      assert.equal(audit.mouthPath, sourceMouthPath, "Original mouth path was replaced or redrawn");
      assert.equal(audit.mouthLayerCount, 1, "Unexpected added smile geometry");
      assert.equal(audit.nosePoints, "254.78 156.92 256.28 169.23 262.95 166.61 254.78 156.92", "Original nose was changed");
      const eyes = audit.layers.filter(layer => layer.name === "eyes");
      assert.equal(eyes.length, 2, "Expected both original eyes");
      assert.equal(eyes[0]!.transform, eyes[1]!.transform, "Eyes are not synchronized");
      const nose = audit.layers.find(layer => layer.name === "nose-expression");
      assert.ok(nose, "Missing nose expression layer");
      const translation = nose.transform?.match(/^translate\(([-\d.e+]+) ([-\d.e+]+)\)$/);
      assert.ok(translation, "Nose must only translate without rotation or scaling");
      const [noseX, noseY] = translation.slice(1).map(Number);
      assert.ok(noseX! >= -1 && noseX! <= 0 && noseY! >= -0.4 && noseY! <= 0, "Nose shift exceeds subtle limits");
      if (frame === 180) assert.ok(noseX! < 0 && noseY! < 0, "Nose must move diagonally at peak expression");
      return audit;
    });
    for (let i = 1; i < active.length; i++) {
      assert.ok(active[i]!.clipY >= active[i - 1]!.clipY, "Fluid refilled across the loop");
      for (const name of ["plant-pot-anchor", "bag-and-stationary-tube", "connected-head"]) {
        const currentLayer = active[i]!.layers.find(x => x.name === name);
        const initialLayer = active[0]!.layers.find(x => x.name === name);
        assert.ok(currentLayer && initialLayer, `Missing stationary layer: ${name}`);
        assert.deepEqual(currentLayer.bounds, initialLayer.bounds, `${name} moved`);
      }
    }
    assert.ok(active.at(-1)!.clipY > active[0]!.clipY, "Fluid did not descend");
    assert.equal(active.at(-1)!.clipHeight, 0, "Fluid did not drain completely");
    const pixels = (file: string) => sharp(path.join(output, file)).ensureAlpha().raw().toBuffer();
    assert.ok((await pixels("frame-0.png")).equals(await pixels("reduced.png")), "Reduced motion differs from initial pose");
    assert.ok(!(await pixels("frame-0.png")).equals(await pixels("frame-180.png")), "Motion has no visible change");
    if (!process.argv.includes("--stills-only")) {
      const video = path.join(output, "infusion-study.mp4");
      const videoComposition = await selectComposition({ serveUrl, id: "InfusionStudy", inputProps, puppeteerInstance: browser });
      await renderMedia({ serveUrl, composition: videoComposition, inputProps, puppeteerInstance: browser,
        codec: "h264", muted: true, concurrency: 2, crf: 18, outputLocation: video });
      execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", video, "-f", "null", "-"], { stdio: "pipe" });
      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", video], { encoding: "utf8" }));
      assert.equal(probe.streams.length, 1);
      assert.equal(Number(probe.streams[0].nb_frames), 720);
      assert.equal(Number(probe.format.duration), 24);
      encoded = { file: "infusion-study.mp4", sha256: sha(video), frames: 720, seconds: 24, fullDecodePassed: true, silent: true };
    }
  } finally { await browser.close({ silent: true }); }
  const panels = await Promise.all(frames.map(async (frame, index) => ({
    input: await sharp(path.join(output, `frame-${frame}.png`)).resize(250, 225).png().toBuffer(),
    left: index % 5 * 250, top: Math.floor(index / 5) * 225,
  })));
  await sharp({ create: { width: 1250, height: 450, channels: 4, background: "#F4F7F6" } })
    .composite(panels).png().toFile(path.join(output, "contact-sheet.png"));
  await sharp(path.join(output, "frame-180.png")).resize({ width: 390 }).png().toFile(path.join(output, "phone.png"));
  const detailArtifacts: string[] = [];
  for (const { name, region, samples } of [
    { name: "face", region: { left: 435, top: 230, width: 125, height: 155 }, samples: [0, 180, 360, 600] },
    { name: "bag", region: { left: 300, top: 210, width: 65, height: 115 }, samples: [0, 180, 360, 719] },
    { name: "plant", region: { left: 80, top: 365, width: 235, height: 270 }, samples: [0, 60, 270, 360] },
  ]) {
    const crop = (frame: number) => sharp(path.join(output, `frame-${frame}.png`)).extract(region);
    const initial = await crop(0).raw().toBuffer();
    if (name !== "bag") assert.ok(initial.equals(await crop(360).raw().toBuffer()), `${name}: rendered loop seam changed`);
    assert.ok(!initial.equals(await crop(name === "bag" ? 719 : name === "face" ? 180 : 60).raw().toBuffer()), `${name}: no visible movement`);
    const width = region.width * 2, height = region.height * 2;
    const tiles = await Promise.all(samples.map(async (frame, index) => ({ input: await crop(frame).resize(width, height).png().toBuffer(), left: index * width, top: 0 })));
    const file = `${name}-details.png`;
    await sharp({ create: { width: width * samples.length, height, channels: 4, background: "#F4F7F6" } }).composite(tiles).png().toFile(path.join(output, file));
    detailArtifacts.push(file);
  }
  assert.deepEqual(fingerprints(), before, "Source/implementation changed during render");
  const artifacts = [...frames.map(frame => `frame-${frame}.png`), "reduced.png", "contact-sheet.png", "phone.png", ...detailArtifacts];
  writeFileSync(path.join(output, "evidence.json"), JSON.stringify({ inputProps, implementationFiles: before, frames,
    reducedMotionMatchesInitialPixels: true, visibleMotionPassed: true, faceAndPlantPixelLoopSeamsPassed: true,
    stationaryHeadPassed: true, subtleNoseTranslationOnlyPassed: true, synchronizedEyesPassed: true, plantAndBagMotionCheckedInCurrentRender: true, audits, encoded,
    artifacts: Object.fromEntries(artifacts.map(file => [file, sha(path.join(output, file))])),
    userMotionDirection: "Keep the approved tiny diagonal nose translation synchronized with eyes and mouth, without turning or reshaping it.",
    integratedIntoFullVideo: false, humanVisualApproval: "pending" }, null, 2) + "\n");
  writeFileSync(path.join(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Infusion illustration — motion review</title><style>body{font:17px/1.5 system-ui;color:#1c2b45;background:#f4f7f6;max-width:1000px;margin:24px auto;padding:0 18px}video,img{display:block;width:100%;border-radius:12px}button,select{font:inherit;padding:7px;margin:8px 6px 0 0}a{color:#176e60}</style><h1>Infusion illustration</h1><p>24-second motion study. The nose shifts slightly diagonally with the facial expression, keeping its original shape and angle. All other motion is unchanged.</p>${encoded ? '<video controls playsinline preload="metadata" src="infusion-study.mp4" poster="frame-180.png"></video><button data-step="-1">Previous frame</button><button data-step="1">Next frame</button><label>Speed <select><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option></select></label>' : '<img src="frame-180.png" alt="Infusion illustration motion sample">'}<p>Awaiting Pavan’s visual approval. <a href="contact-sheet.png">Motion samples</a> · <a href="face-details.png">Face details</a> · <a href="bag-details.png">Bag details</a> · <a href="phone.png">Phone-size view</a> · <a href="evidence.json">Evidence</a></p><script>const video=document.querySelector('video');if(video){document.querySelector('select').onchange=e=>video.playbackRate=Number(e.target.value);document.querySelectorAll('[data-step]').forEach(button=>button.onclick=()=>{video.pause();video.currentTime=Math.max(0,Math.min(video.duration-1/30,(Math.round(video.currentTime*30)+Number(button.dataset.step))/30));});}</script></html>`);
  console.log(`Infusion study: ${output}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
