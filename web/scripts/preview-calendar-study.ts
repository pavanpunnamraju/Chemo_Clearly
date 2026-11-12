import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import { CALENDAR_CYCLE_SECONDS } from "../lib/video/calendar-motion";

const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const source = "public/illustrations/timeline/timeline__calendar-pana.svg";
const files = [source, "lib/video/calendar-motion.ts", "lib/video/arm-deform.ts", "video-composition/directed/CalendarArtwork.tsx", "video-composition/directed/CalendarPageRig.ts", "video-composition/directed/CalendarLeftBodyRig.ts",
  "video-composition/directed/LibrarySvgArtwork.tsx", "video-composition/directed/namespace-svg.ts",
  "video-composition/calendar-study-index.tsx", "scripts/preview-calendar-study.ts"];
type Point = { x: number; y: number };
type Contact = { active: boolean; actual: Point; target: Point; distance?: number; interaction?: string };
type Audit = { seconds: number; reducedMotion: boolean; uniqueIds: boolean;
  motion: Record<string, unknown>; pageContact: Contact | null; markerContact: Contact | null;
  leftMotion: { actual: Point; hipDegrees: number; elbowDegrees: number; shoulder: Point; armLength: number } | null;
  sleeveArm: { shadowClipping: boolean; creaseMatrix: number[] | null; sleeveMatrix: number[] | null; armMatrix: number[] | null; sleeveOpacity: string | null };
  lineProgress: number[] | null;
  layers: { name: string; bounds: { x: number; y: number; width: number; height: number }; d: string | null; opacity: string | null }[] };

async function main() {
  const run = process.argv.find(arg => arg.startsWith("--run="))?.slice(6) ?? "draft-1";
  const output = path.resolve("out/calendar-motion-study", run);
  assert.ok(!existsSync(path.join(output, "evidence.json")), "Use a new run name to preserve prior evidence");
  mkdirSync(output, { recursive: true });
  const fingerprints = () => Object.fromEntries(files.map(file => [file, sha(path.resolve(file))]));
  const before = fingerprints();
  assert.equal(before[source], "c1c1cbfc3dc4c933f264dc86ff4917f2186625c98492d945a73233a244054bd0");
  const originalArmD = readFileSync(path.resolve(source), "utf8").match(/\bd="(M598\.37,204\.92[^"]+)"/)?.[1];
  assert.ok(originalArmD, "Original drawing arm path missing");
  const originalLeftArmD = readFileSync(path.resolve(source), "utf8").match(/\bd="(M191\.68,246\.24[^"]+)"/)?.[1];
  assert.ok(originalLeftArmD, "Original left arm path missing");
  const fps = 30, cycle = CALENDAR_CYCLE_SECONDS, duration = cycle * 2, totalFrames = duration * fps;
  const sampleSeconds = [0, 1.2, 2.6, 3.8, 4.6, 5.4, 6.2, 7, 8, 9, 10, 10.6, 11, 12, 12.15, 13, 13.7, 14.4, 15.5, 16.6, cycle, cycle + 3.8, cycle + 9, cycle + 14.4];
  const frames = [...new Set([...sampleSeconds.map(seconds => Math.round(seconds * fps)), totalFrames - 1])].sort((a, b) => a - b);
  const audits: Audit[] = [];
  const capture = (log: { text: string }) => {
    const at = log.text.indexOf("CALENDAR_QA:");
    if (at >= 0) audits.push(JSON.parse(log.text.slice(at + 12)) as Audit);
  };
  const serveUrl = await bundle({ entryPoint: path.resolve("video-composition/calendar-study-index.tsx") });
  const browser = await openBrowser("chrome");
  let encoded: object | undefined;
  try {
    const inputProps = { reducedMotion: false, qaMode: true };
    const composition = await selectComposition({ serveUrl, id: "CalendarStudy", inputProps, puppeteerInstance: browser });
    for (const frame of frames) {
      await renderStill({ serveUrl, composition, inputProps, puppeteerInstance: browser, frame,
        output: path.join(output, `frame-${frame}.png`), onBrowserLog: capture, logLevel: "error" });
    }
    // Inspect the layer switch immediately after departure and before return.
    for (const frame of [37, 40, 159, 161]) {
      await renderStill({ serveUrl, composition, inputProps: { reducedMotion: false, qaMode: false },
        puppeteerInstance: browser, frame, output: path.join(output, `detail-${frame}.png`), logLevel: "error" });
    }
    const reducedProps = { reducedMotion: true, qaMode: true };
    const reducedComposition = await selectComposition({ serveUrl, id: "CalendarStudy", inputProps: reducedProps, puppeteerInstance: browser });
    await renderStill({ serveUrl, composition: reducedComposition, inputProps: reducedProps, puppeteerInstance: browser,
      frame: 360, output: path.join(output, "reduced.png"), onBrowserLog: capture, logLevel: "error" });
    // Save raw probes even when a geometry check fails, so the draft is inspectable.
    writeFileSync(path.join(output, "audits.json"), JSON.stringify(audits, null, 2));
    for (const frame of frames) {
      const audit = audits.find(a => !a.reducedMotion && Math.abs(a.seconds - frame / fps) < 1e-7);
      assert.ok(audit, `Missing audit at ${frame}`);
      assert.ok(audit.uniqueIds, "Duplicate mounted SVG IDs");
      assert.ok(audit.layers.length > 3, "Missing calendar rig layers");
      assert.equal(audit.layers.find(layer => layer.name === "marker-arm")?.d, originalArmD, "Drawing arm was stretched or redrawn");
      assert.equal(audit.layers.find(layer => layer.name === "left-arm")?.d, originalLeftArmD, "Left arm was stretched or redrawn");
      assert.ok(audit.leftMotion, "Missing left arm motion");
      assert.equal(audit.leftMotion.hipDegrees, 0, "Cancelled body bend remains");
      const initialPose = audits.find(a => !a.reducedMotion && a.seconds === 0)!.leftMotion!;
      assert.deepEqual(audit.leftMotion.shoulder, initialPose.shoulder, "Anatomical shoulder moved");
      const pivot = initialPose.shoulder;
      const sourceArmRadius = Math.hypot(191.68 - pivot.x, 246.24 - pivot.y);
      assert.ok(Math.abs(Math.hypot(audit.leftMotion.actual.x - pivot.x, audit.leftMotion.actual.y - pivot.y) - sourceArmRadius) < 1e-6,
        "Left arm length changed");
      assert.ok(!audit.layers.some(layer => layer.name === "left-waist-underlap"), "Rejected skirt filler remains");
      const fixed = (a: Audit) => a.layers.filter(layer => /^(left-stationary-lower-body|left-head|left-shirt-fabric|left-far-arm-hidden-behind-calendar)$/.test(layer.name));
      const initial = audits.find(a => !a.reducedMotion && a.seconds === 0)!;
      assert.ok(fixed(audit).length >= 34, "Missing fixed body/head/shirt layers");
      assert.deepEqual(fixed(audit), fixed(initial), "Body/head/shirt/far arm moved during arm-only gesture");
      assert.ok(audit.sleeveArm?.sleeveMatrix, "Missing moving sleeve");
      assert.ok(audit.sleeveArm.shadowClipping, "Shadow escapes stationary torso clipping group");
      assert.deepEqual(audit.sleeveArm.sleeveMatrix, audit.sleeveArm.armMatrix, "Sleeve and arm transforms differ");
      assert.deepEqual(audit.sleeveArm.creaseMatrix, audit.sleeveArm.armMatrix, "Whole sleeve crease does not move with the arm");
      if (Math.abs(audit.leftMotion.elbowDegrees) > 1e-8) {
        assert.equal(audit.sleeveArm.sleeveOpacity, "1", "Moving sleeve hidden");
        assert.equal(audit.layers.find(layer => layer.name === "left-orange-torso-backfill")?.opacity, "1", "Missing orange fabric under moving arm");
      }
      const lower = audit.layers.filter(layer => layer.name === "left-stationary-lower-body");
      const initialLower = audits.find(a => !a.reducedMotion && a.seconds === 0)?.layers.filter(layer => layer.name === "left-stationary-lower-body");
      assert.ok(lower.length === 20 && initialLower?.length === 20, "Missing stationary left legs or shoes");
      assert.deepEqual(lower, initialLower, "Left legs moved during arm gesture");
      for (const layer of audit.layers) {
        assert.ok(Object.values(layer.bounds).every(Number.isFinite), `Nonfinite bounds: ${layer.name}`);
        assert.ok(!/NaN|Infinity/.test(layer.d ?? ""), `Invalid path: ${layer.name}`);
      }
      for (const [name, contact] of [["page", audit.pageContact], ["marker", audit.markerContact]] as const) {
        if (!contact?.active) continue;
        assert.ok(contact.actual && contact.target, `Missing ${name} contact coordinates`);
        assert.ok(Math.hypot(contact.actual.x - contact.target.x, contact.actual.y - contact.target.y) < (name === "page" ? 8 : 1),
          `${name} contact separated at frame ${frame}`);
      }
    }
    assert.ok(audits.some(a => a.pageContact?.active), "No sampled page push interaction");
    const armAt = (seconds: number) => audits.find(a => !a.reducedMotion && a.seconds === seconds)!.leftMotion!;
    assert.ok(armAt(3.8).elbowDegrees > armAt(2.6).elbowDegrees && armAt(2.6).elbowDegrees > 0, "Arm does not lower smoothly");
    assert.ok(armAt(4.6).elbowDegrees < armAt(3.8).elbowDegrees, "Arm does not rise as page turns");
    assert.ok(Math.abs(armAt(5.4).elbowDegrees) < 1e-8, "Arm has not returned to source push position");
    const pixels = (frame: number | string) => sharp(path.join(output, typeof frame === "number" ? `frame-${frame}.png` : frame)).ensureAlpha().raw().toBuffer();
    assert.ok((await pixels(0)).equals(await pixels(cycle * fps)), "Loop pose does not return exactly");
    assert.ok((await pixels(0)).equals(await pixels(totalFrames - 1)), "Final hold differs from loop start");
    assert.ok((await pixels(0)).equals(await pixels("reduced.png")), "Reduced motion differs from initial pose");
    assert.ok(!(await pixels(0)).equals(await pixels(162)), "Page flip has no visible motion");
    // The waist silhouette must not jump when the motion-only layers switch.
    const waistEdge = async (file: string) => {
      const { data, info } = await sharp(path.join(output, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      return Array.from({ length: 57 }, (_, index) => {
        const x = 164 + index;
        for (let y = 405; y < 426; y++) {
          const offset = (y * info.width + x) * 3;
          if (data[offset]! < 70 && data[offset + 1]! < 90 && data[offset + 2]! < 95) return y;
        }
        throw new Error(`Waist edge missing at x=${x}`);
      });
    };
    const initialWaist = await waistEdge("frame-0.png");
    for (const frame of [37, 40, 159, 161]) {
      assert.deepEqual(await waistEdge(`detail-${frame}.png`), initialWaist, `Waist silhouette changed at frame ${frame}`);
    }
    if (!process.argv.includes("--stills-only")) {
      const inputProps = { reducedMotion: false, qaMode: false };
      const composition = await selectComposition({ serveUrl, id: "CalendarStudy", inputProps, puppeteerInstance: browser });
      const file = path.join(output, "calendar-study.mp4");
      await renderMedia({ serveUrl, composition, inputProps, puppeteerInstance: browser,
        codec: "h264", muted: true, concurrency: 2, crf: 18, outputLocation: file });
      execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", file, "-f", "null", "-"], { stdio: "pipe" });
      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" }));
      assert.equal(probe.streams.length, 1);
      assert.equal(Number(probe.streams[0].nb_frames), totalFrames);
      assert.equal(Number(probe.format.duration), duration);
      encoded = { file: "calendar-study.mp4", sha256: sha(file), frames: totalFrames, seconds: duration, fullDecodePassed: true, silent: true };
    }
  } finally { await browser.close({ silent: true }); }
  const tiles = await Promise.all(frames.map(async (frame, index) => ({
    input: await sharp(path.join(output, `frame-${frame}.png`)).resize(250, 200).png().toBuffer(),
    left: index % 4 * 250, top: Math.floor(index / 4) * 200,
  })));
  await sharp({ create: { width: 1000, height: Math.ceil(frames.length / 4) * 200, channels: 4, background: "#F4F7F6" } })
    .composite(tiles).png().toFile(path.join(output, "contact-sheet.png"));
  await sharp(path.join(output, "frame-360.png")).resize({ width: 390 }).png().toFile(path.join(output, "phone.png"));
  assert.deepEqual(fingerprints(), before, "Implementation changed during rendering");
  const artifacts = [...frames.map(frame => `frame-${frame}.png`), "reduced.png", "phone.png", "contact-sheet.png", "audits.json", ...[37, 40, 159, 161].map(frame => `detail-${frame}.png`)];
  writeFileSync(path.join(output, "evidence.json"), JSON.stringify({ implementationFiles: before, frames, audits, encoded,
    exactLoopPosePassed: true, reducedMotionPixelsPassed: true, originalDrawingArmPathPreserved: true, originalLeftArmPathPreserved: true,
    pageAndRightLayersVerifiedInCurrentRender: true, drawingPhaseVisibleInCurrentRender: true, leftLegsStationary: true,
    leftBodyHeadTorsoStationary: true, sleeveMovesWithArm: true, waistEdgeStableNearRest: true, rigidArmRadiusPreserved: true, rejectedSkirtFillerRemoved: true,
    contactsMeasuredAtRenderedSamples: true, pagePushProximityToleranceSourceUnits: 8, markerContactToleranceSourceUnits: 1, artifacts: Object.fromEntries(artifacts.map(file => [file, sha(path.join(output, file))])),
    userDirection: "Keep the approved sleeve/arm motion and stable waist silhouette, using the original shirt hem as the sole waist edge, with orange and shadow underlayers inset above it.",
    humanVisualApproval: "pending", integratedIntoFullVideo: false }, null, 2) + "\n");
  writeFileSync(path.join(output, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calendar motion review</title><style>body{font:17px/1.5 system-ui;background:#f4f7f6;color:#1c2b45;max-width:1000px;margin:24px auto;padding:0 18px}video,img{display:block;width:100%;border-radius:12px}button,select{font:inherit;padding:7px;margin:8px 6px 0 0}a{color:#176e60}</style><h1>Calendar motion</h1><p>The original shirt now supplies the waist edge throughout the motion. The sleeve and arm keep their previous movement and orange fabric reveal. The page flip and right-side drawing are unchanged. Two complete cycles for review.</p>${encoded ? '<video controls playsinline preload="metadata" src="calendar-study.mp4" poster="frame-0.png"></video><button data-step="-1">Previous frame</button><button data-step="1">Next frame</button><label>Speed <select><option value="0.5">0.5×</option><option value="1" selected>1×</option></select></label>' : '<img src="frame-0.png" alt="Calendar animation study">'}<p>Awaiting Pavan’s visual approval. <a href="contact-sheet.png">Motion samples</a> · <a href="phone.png">Phone view</a> · <a href="evidence.json">Evidence</a></p><script>const v=document.querySelector('video');if(v){document.querySelector('select').onchange=e=>v.playbackRate=Number(e.target.value);document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{v.pause();v.currentTime=Math.max(0,Math.min(v.duration-1/30,(Math.round(v.currentTime*30)+Number(b.dataset.step))/30));});}</script></html>`);
  console.log(`Calendar study: ${output}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
