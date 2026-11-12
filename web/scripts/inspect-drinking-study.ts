import path from "node:path";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import sharp from "sharp";
import { DRINKING_DURATION_FRAMES, DRINKING_SPEED } from "../lib/video/drinking-study-motion";

const output = path.resolve("out/drinking-asset-study");
const file = (name: string) => path.join(output, name);
const video = file("drinking-study.mp4");
const sampleCount = Math.ceil(DRINKING_DURATION_FRAMES / 6);
execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vf", "select=not(mod(n\\,6))", "-fps_mode", "vfr", "-y", file("decoded-%02d.png")]);
for (const sheet of [
  { name: "contact-strip.png", crop: { left: 290, top: 176, width: 266, height: 180 } },
  { name: "arm-strip.png", crop: { left: 387, top: 315, width: 250, height: 230 } },
]) {
  const panels = [];
  for (let index = 0; index < sampleCount; index++) {
    const content = await sharp(file(`decoded-${String(index + 1).padStart(2, "0")}.png`)).extract(sheet.crop).resize(266, 230, { fit: "contain", background: "#f4f7f6" }).png().toBuffer();
    const label = Buffer.from(`<svg width="266" height="24"><rect width="266" height="24" fill="#f4f7f6"/><text x="8" y="17" font-family="Arial" font-size="14" fill="#1c2b45">${(index / 5).toFixed(1)} s</text></svg>`);
    panels.push({ input: content, left: (index % 10) * 266, top: Math.floor(index / 10) * 254 });
    panels.push({ input: label, left: (index % 10) * 266, top: Math.floor(index / 10) * 254 + 230 });
  }
  await sharp({ create: { width: 2660, height: Math.ceil(sampleCount / 10) * 254, channels: 4, background: "#f4f7f6" } }).composite(panels).png().toFile(file(sheet.name));
}
await sharp(file(`frame-${Math.round(150 / DRINKING_SPEED)}.png`)).resize(640, 360).png().toFile(file("phone-landscape.png"));
const initial = await sharp(file("frame-0.png")).raw().toBuffer();
assert.ok(initial.equals(await sharp(file(`frame-${DRINKING_DURATION_FRAMES - 1}.png`)).raw().toBuffer()), "Final image must exactly match initial image");
assert.ok(initial.equals(await sharp(file("reduced-motion.png")).raw().toBuffer()), "Reduced motion must preserve the resting frame");
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", video], { encoding: "utf8" }));
assert.equal(probe.streams.length, 1);
assert.equal(probe.streams[0].codec_type, "video");
assert.equal(probe.streams[0].nb_frames, String(DRINKING_DURATION_FRAMES));
assert.ok(Math.abs(Number(probe.format.duration) - DRINKING_DURATION_FRAMES / 30) < .001);
writeFileSync(file("inspection-evidence.json"), JSON.stringify({ exactPixelReturn: true, reducedMotionMatchesRest: true, decodedContactSamplingFps: 5, sampledFrameCount: sampleCount, video: probe.streams[0], humanVisualApproval: "pending" }, null, 2) + "\n");
writeFileSync(file("index.html"), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Drinking-water motion preview</title>
<style>body{margin:0;background:#f4f7f6;color:#1c2b45;font:17px system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px}h1{font-size:28px}video{width:100%;display:block;border-radius:8px}button,select{font:inherit;padding:8px;margin:12px 8px 12px 0}p{line-height:1.5}a{color:#176f60}img{max-width:100%}</style>
<main><h1>Drinking-water motion preview</h1><video id="preview" controls loop playsinline preload="auto" poster="frame-0.png" src="drinking-study.mp4"></video>
<button id="previous">Previous frame</button><button id="next">Next frame</button><label>Speed <select id="speed"><option value="1">Normal</option><option value="0.5">Half</option><option value="0.25">Quarter</option></select></label>
<p>10.47 seconds, silent. Bring the glass to the lip, sip, pause and return. Soft blue water; motion 15% faster.</p>
<p><a href="drinking-study.mp4">Open MP4</a> · <a href="contact-strip.png">Glass and lip frames</a> · <a href="arm-strip.png">Shoulder and elbow frames</a></p>
<p>Phone landscape preview</p><img src="phone-landscape.png" width="640" height="360" alt="Drinking study at phone landscape size">
<p>Artwork adapted from <a href="https://storyset.com/illustration/drinking-water/pana">Storyset / Freepik</a>. Visual review pending.</p></main>
<script>const video=document.querySelector('#preview');document.querySelector('#speed').onchange=e=>video.playbackRate=Number(e.target.value);for(const [id,step] of [['previous',-1],['next',1]])document.getElementById(id).onclick=()=>{video.pause();video.currentTime=Math.max(0,Math.min(video.duration-1/30,video.currentTime+step/30))};</script></html>`);
console.log(`Decoded silent ${DRINKING_DURATION_FRAMES}-frame MP4; exact return and reduced motion passed. Review page and contact sheets created.`);
