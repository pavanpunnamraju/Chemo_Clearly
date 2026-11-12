import path from "node:path";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import sharp from "sharp";

const output = path.resolve("out/calling-asset-study");
const file = (name: string) => path.join(output, name);
const video = file("calling-study.mp4");
// Decode the actual MP4, including every transition, rather than relying only
// on independent still renders. Every sixth frame enters the contact sheets.
execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vf", "select=not(mod(n\\,6))", "-fps_mode", "vfr", "-y", file("decoded-%02d.png")]);
const sheets = [
  { name: "contact-strip.png", crop: { left: 245, top: 68, width: 210, height: 270 }, size: 210 },
  { name: "support-strip.png", crop: { left: 208, top: 388, width: 314, height: 280 }, size: 210 },
];
for (const sheet of sheets) {
  const panels = [];
  for (let index = 0; index < 60; index++) {
    const content = await sharp(file(`decoded-${String(index + 1).padStart(2, "0")}.png`)).extract(sheet.crop).resize(sheet.size, 240, { fit: "contain", background: "#f4f7f6" }).png().toBuffer();
    const label = Buffer.from(`<svg width="210" height="24"><rect width="210" height="24" fill="#f4f7f6"/><text x="8" y="17" font-family="Arial" font-size="14" fill="#1c2b45">${(index / 5).toFixed(1)} s</text></svg>`);
    panels.push({ input: content, left: (index % 10) * 210, top: Math.floor(index / 10) * 264 });
    panels.push({ input: label, left: (index % 10) * 210, top: Math.floor(index / 10) * 264 + 240 });
  }
  await sharp({ create: { width: 2100, height: 1584, channels: 4, background: "#f4f7f6" } }).composite(panels).png().toFile(file(sheet.name));
}
await sharp(file("frame-105.png")).resize(640, 360).png().toFile(file("phone-landscape.png"));
const initial = await sharp(file("frame-0.png")).raw().toBuffer();
assert.ok(initial.equals(await sharp(file("frame-359.png")).raw().toBuffer()), "Final image must exactly match initial image");
assert.ok(initial.equals(await sharp(file("reduced-motion.png")).raw().toBuffer()), "Reduced motion must preserve the resting frame");
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", video], { encoding: "utf8" }));
assert.equal(probe.streams.length, 1);
assert.equal(probe.streams[0].codec_type, "video");
assert.equal(probe.streams[0].nb_frames, "360");
assert.equal(Number(probe.format.duration), 12);
writeFileSync(file("inspection-evidence.json"), JSON.stringify({ exactPixelReturn: true, reducedMotionMatchesRest: true, decodedContactSamplingFps: 5, inspectedFrameCount: 60, video: probe.streams[0], humanVisualApproval: "pending" }, null, 2) + "\n");
writeFileSync(file("index.html"), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calling motion preview</title>
<style>body{margin:0;background:#f4f7f6;color:#1c2b45;font:17px system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px}h1{font-size:28px}video{width:100%;display:block;border-radius:8px}button,select{font:inherit;padding:8px;margin:12px 8px 12px 0}p{line-height:1.5}a{color:#176f60}img{max-width:100%}</style>
<main><h1>Calling motion preview</h1><video id="preview" controls loop playsinline preload="auto" poster="frame-0.png" src="calling-study.mp4"></video>
<button id="previous">Previous frame</button><button id="next">Next frame</button><label>Speed <select id="speed"><option value="1">Normal</option><option value="0.5">Half</option><option value="0.25">Quarter</option></select></label>
<p>12 seconds, silent. Gentle listening lean, pause and return, with the original hand, phone, ear and supporting-arm pose retained.</p>
<p><a href="calling-study.mp4">Open MP4</a> · <a href="contact-strip.png">Phone and ear frames</a> · <a href="support-strip.png">Supporting arm and waist frames</a></p>
<p>Phone landscape preview</p><img src="phone-landscape.png" width="640" height="360" alt="Calling study at phone landscape size">
<p>Artwork adapted from <a href="https://storyset.com/illustration/calling/pana">Storyset / Freepik</a>. Visual review pending.</p></main>
<script>const video=document.querySelector('#preview');document.querySelector('#speed').onchange=e=>video.playbackRate=Number(e.target.value);for(const [id,step] of [['previous',-1],['next',1]])document.getElementById(id).onclick=()=>{video.pause();video.currentTime=Math.max(0,Math.min(video.duration-1/30,video.currentTime+step/30))};</script></html>`);
console.log("Decoded 360-frame silent MP4; exact pixel return and reduced-motion checks passed. Contact sheets and review page created.");
