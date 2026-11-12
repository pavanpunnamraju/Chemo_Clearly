import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import type { DirectedVideoProps } from "../lib/video/direction-types";

export async function inspectDirectedIntegration(directory: string) {
const file = (name: string) => path.join(directory, name);
const video = file("integration-preview.mp4");
const hash = (name: string) => createHash("sha256").update(readFileSync(file(name))).digest("hex");
const renderEvidence = JSON.parse(readFileSync(file("render-evidence.json"), "utf8"));
const props = JSON.parse(readFileSync(file("props.json"), "utf8")) as DirectedVideoProps;
const fps = Number(renderEvidence.fps);
const durationSeconds = props.direction.totalSeconds;
const totalFrames = Math.round(durationSeconds * fps);
const sampleEveryFrames = 6;
const sampleFps = fps / sampleEveryFrames;
assert.equal(fps, 30, "Preview inspection expects the directed renderer's 30 fps clock");
assert.equal(props.direction.shots.length, 3);
assert.equal(renderEvidence.videoDigest, hash("integration-preview.mp4"), "Video does not match render evidence");
assert.equal(renderEvidence.propsDigest, hash("props.json"), "Props do not match render evidence");
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", video], { encoding: "utf8" }));
assert.equal(probe.streams.length, 1, "Preview must remain silent");
assert.equal(probe.streams[0].codec_type, "video");
assert.equal(Number(probe.streams[0].nb_frames), totalFrames);
assert.equal(Number(probe.format.duration), durationSeconds);
assert.equal(probe.streams[0].width, 1280);
assert.equal(probe.streams[0].height, 720);
// Fail on a decode error anywhere, then sample the encoded video every 6 frames.
execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", video, "-f", "null", "-"]);
execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vf", "select=not(mod(n\\,6))", "-fps_mode", "vfr", "-y", file("decoded-%03d.png")]);
const scenes = props.direction.shots.map((shot, index) => ({ name: ["drinking", "ordinary-calling", "emergency-calling"][index]!,
  startSeconds: shot.startSeconds, start: Math.round(shot.startSeconds * sampleFps),
  samples: Math.round((shot.endSeconds - shot.startSeconds) * sampleFps),
  frame: Math.round(shot.startSeconds * fps) + (index === 0 ? 130 : 150), reducedFrame: Math.round(shot.startSeconds * fps) + 150 }));
for (const [sceneIndex, scene] of scenes.entries()) {
  const panels: sharp.OverlayOptions[] = [];
  for (let index = 0; index < scene.samples; index++) {
    const content = await sharp(file(`decoded-${String(scene.start + index + 1).padStart(3, "0")}.png`))
      .extract({ left: sceneIndex === 1 ? 630 : 0, top: 90, width: 650, height: 540 })
      .resize(260, 216).png().toBuffer();
    const label = Buffer.from(`<svg width="260" height="24"><rect width="260" height="24" fill="#f4f7f6"/><text x="8" y="17" font-family="Arial" font-size="14" fill="#1c2b45">${(scene.startSeconds + index / sampleFps).toFixed(1)} s</text></svg>`);
    panels.push({ input: content, left: index % 10 * 260, top: Math.floor(index / 10) * 240 });
    panels.push({ input: label, left: index % 10 * 260, top: Math.floor(index / 10) * 240 + 216 });
  }
  await sharp({ create: { width: 2600, height: Math.ceil(scene.samples / 10) * 240, channels: 4, background: "#f4f7f6" } }).composite(panels).png().toFile(file(`${scene.name}-contact-sheet.png`));
  await sharp(file(`frame-${scene.frame}.png`)).resize(640, 360).png().toFile(file(`${scene.name}-phone.png`));
}
await sharp(file("fever-card.png")).resize(640, 360).png().toFile(file("fever-card-phone.png"));
writeFileSync(file("inspection-evidence.json"), JSON.stringify({ preview: true, videoDigest: hash("integration-preview.mp4"),
  completeDecodePassed: true, silent: true, frames: totalFrames, durationSeconds, decodedContactSamplingFps: sampleFps,
  decodedSamples: scenes.reduce((sum, scene) => sum + scene.samples, 0), loopPreview: Boolean(renderEvidence.loopPreview),
  phoneLandscape: { width: 640, height: 360 }, video: probe.streams[0],
  humanVisualApproval: "pending", clinicalApproval: "not-established", speechSynchronization: "not-tested; synthetic silent preview timing" }, null, 2) + "\n");
writeFileSync(file("index.html"), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Directed scene ${renderEvidence.loopPreview ? "loop" : "integration"} preview</title>
<style>body{margin:0;background:#f4f7f6;color:#1c2b45;font:17px system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px}h1{font-size:28px}video{width:100%;display:block;border-radius:8px}button,select{font:inherit;padding:8px;margin:12px 8px 12px 0}p{line-height:1.5}a{color:#176f60}img{max-width:100%;height:auto}figure{margin:24px 0}figcaption{margin:8px 0}</style>
<main><h1>Directed scene ${renderEvidence.loopPreview ? "loop" : "integration"} preview</h1>
<p>${durationSeconds} seconds, silent. Captions use synthetic preview timing. Human visual review is pending; speech synchronization and clinical approval are not established.</p>
<video id="preview" controls playsinline preload="auto" poster="frame-130.png" src="integration-preview.mp4"></video>
<button id="previous">Previous frame</button><button id="next">Next frame</button><label>Speed <select id="speed"><option value="1">Normal</option><option value="0.5">Half</option><option value="0.25">Quarter</option></select></label><span id="time"></span>
<p>${scenes.map((scene, index) => `<button data-seek="${scene.startSeconds}">${["Drinking", "Care-team calling", "Emergency calling"][index]}</button>`).join("")}</p>
<p><a href="integration-preview.mp4">Open MP4</a> · <a href="source-evidence.json">Source passages</a> · <a href="layout-qa.json">Measured layout</a> · <a href="render-evidence.json">Render evidence</a> · <a href="inspection-evidence.json">Decode evidence</a></p>
<p>These are selected source excerpts for visual integration review. Complete education videos remain a separate milestone. Watch the contact motion, ${renderEvidence.loopPreview ? "repeated actions and calm pauses, " : ""}transitions, captions, credit placement and landscape framing.</p>
${scenes.map((scene, index) => `<figure><figcaption>${["Drinking", "Care-team calling", "Emergency calling"][index]} at phone landscape size · <a href="${scene.name}-contact-sheet.png">Encoded contact frames, every 0.2 s</a> · <a href="reduced-${scene.reducedFrame}.png">Reduced-motion still</a></figcaption><img src="${scene.name}-phone.png" width="640" height="360" alt="${scene.name} at 640 by 360 pixels"></figure>`).join("\n")}
<figure><figcaption>Separate fever-card regression still, preserving both alternatives and the action/context.</figcaption><a href="fever-card.png"><img src="fever-card-phone.png" width="640" height="360" alt="Complete fever safety card at phone landscape size"></a></figure>
<p>Artwork adapted from <a href="https://storyset.com/illustration/calling/pana">Calling</a> and <a href="https://storyset.com/illustration/drinking-water/pana">Drinking water</a>, Storyset / Freepik. Existing study approvals apply to their original rendered bytes; this integration has review pending.</p></main>
<script>const video=document.querySelector('#preview');document.querySelector('#speed').onchange=e=>video.playbackRate=Number(e.target.value);for(const [id,step] of [['previous',-1],['next',1]])document.getElementById(id).onclick=()=>{video.pause();video.currentTime=Math.max(0,Math.min(video.duration-1/30,video.currentTime+step/30))};document.querySelectorAll('[data-seek]').forEach(button=>button.onclick=()=>{video.currentTime=Number(button.dataset.seek)});video.ontimeupdate=()=>document.querySelector('#time').textContent=video.currentTime.toFixed(2)+' s';</script></html>`);
console.log(`Decoded ${totalFrames}-frame silent preview; ${scenes.reduce((sum, scene) => sum + scene.samples, 0)} contact samples, phone stills and review page created.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  inspectDirectedIntegration(path.resolve(process.argv[2] ?? "out/directed-integration-preview"))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
