import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BUNDLE_FILES, loadVerifiedBundle, reusableRender } from "../lib/video/review-bundle";
import { libraryDiversity } from "../lib/video/library-direction";

const SECTION_LABELS: Record<string, string> = {
  overview: "Overview", timeline: "Treatment timeline", daily_life: "Daily life", side_effects: "Side effects",
  emergency: "When to get help", fertility_intimacy: "Fertility and intimacy", practical_life: "Practical life",
  patient_voices: "Patient voices", big_picture: "The big picture",
};
const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const href = (relative: string) => relative.split(path.sep).map(encodeURIComponent).join("/");
const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** Reviewer-only local page. Rendering and approval remain separate operations;
 * this command never changes manifest.json or records a human attestation. */
export function createDirectedReviewPage(directory: string) {
  const { props, manifest } = loadVerifiedBundle(directory);
  assert.ok(reusableRender(directory, manifest), "The rendered MP4 is missing, changed or stale; render this verified bundle before creating its review page.");
  const file = (relative: string) => path.join(directory, relative);
  const readOptionalJson = (relative: string): Record<string, unknown> | null => {
    if (!existsSync(file(relative))) return null;
    return JSON.parse(readFileSync(file(relative), "utf8")) as Record<string, unknown>;
  };
  const layout = readOptionalJson("layout-qa/report.json");
  const inspection = readOptionalJson("encoded-inspection/evidence.json");
  const sourceChecksums = layout?.sourceChecksums as Record<string, unknown> | undefined;
  const layoutCurrent = Boolean(layout?.valid && !layout.preview && layout.rendererDigest === manifest.rendererDigest &&
    BUNDLE_FILES.every((name) => sourceChecksums?.[name] === manifest.files[name]));
  const inspectionFiles = inspection?.bundleFiles as Record<string, unknown> | undefined;
  const inspectionCurrent = Boolean(inspection && inspection.videoDigest === manifest.videoDigest && inspection.rendererDigest === manifest.rendererDigest &&
    inspection.propsDigest === manifest.files["props.json"] && inspection.sourceDigest === manifest.sourceDigest &&
    BUNDLE_FILES.every((file) => inspectionFiles?.[file] === manifest.files[file]));
  const inspectionPassed = inspectionCurrent && inspection?.valid !== false &&
    (inspection?.valid === true || inspection?.completeVideoAndAudioDecodePassed === true);
  const sections = [...new Set(props.direction.shots.map((shot) => shot.sectionId))].map((sectionId) => {
    const shots = props.direction.shots.filter((shot) => shot.sectionId === sectionId);
    return { sectionId, label: SECTION_LABELS[sectionId] ?? sectionId, startSeconds: shots[0]!.startSeconds,
      endSeconds: shots.at(-1)!.endSeconds, entryCount: shots.length };
  });
  assert.equal(sections.length, 9, "Full-candidate review requires all nine source sections");
  const entries = props.direction.shots.map((shot, index) => ({ index: index + 1, entryId: shot.entryId,
    headline: shot.headline, sectionId: shot.sectionId, startSeconds: shot.startSeconds, endSeconds: shot.endSeconds,
    sourceRefs: shot.sourceRefs, safetyCard: Boolean(shot.safetyCard), artworkBeats: shot.artworkBeats ?? [] }));
  const listImages = (relative: string): string[] => {
    if (!existsSync(file(relative))) return [];
    return readdirSync(file(relative), { withFileTypes: true }).flatMap((entry) => {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) return listImages(child);
      return entry.isFile() && /(?:phone|contact|sheet)/i.test(entry.name) && /\.(?:png|jpe?g|webp)$/i.test(entry.name) ? [child] : [];
    });
  };
  const inspectionDirectory = inspectionCurrent && typeof inspection?.artifactsDirectory === "string"
    ? path.relative(directory, inspection.artifactsDirectory) : null;
  const inspectionImages = inspectionDirectory && !inspectionDirectory.startsWith("..") && !path.isAbsolute(inspectionDirectory)
    ? listImages(inspectionDirectory).sort() : [];
  const existingApproval = manifest.visualReview === "approved" && manifest.review?.videoDigest === manifest.videoDigest;
  const summary = { version: 1, generatedAt: new Date().toISOString(), title: props.direction.regimenTitle,
    regimenId: props.direction.regimenId, intake: manifest.intake, durationSeconds: props.direction.totalSeconds, fps: 30,
    videoDigest: manifest.videoDigest, rendererDigest: manifest.rendererDigest, bundleVerified: true, renderCurrent: true,
    visualReview: existingApproval ? "approved-in-existing-manifest" : "pending", clinicalApproval: "not-established",
    approvalRecordedByThisCommand: false, layout: { available: Boolean(layout), currentAndValid: layoutCurrent },
    encodedInspection: { available: Boolean(inspection), current: inspectionCurrent, passed: inspectionPassed },
    sections, entries, diversity: libraryDiversity(props.direction.shots), inspectionImages };
  const links: [string, string][] = [
    ["video.mp4", "Open MP4"], ["captions.vtt", "Download timed captions (VTT)"], ["narration.txt", "Narration text"],
    ["narration.wav", "Narration audio"], ["storyboard.json", "Storyboard"], ["timing.json", "Measured timing"],
    ["speech-review.json", "Speech review"], ["acoustic-review.json", "Acoustic evidence"], ["manifest.json", "Bundle manifest"],
    ["layout-qa/report.json", "Rendered layout report"], ["encoded-inspection/evidence.json", "Encoded-video inspection"],
    ["review-summary.json", "Review summary"],
  ];
  const linkMarkup = links.filter(([relative]) => relative === "review-summary.json" || existsSync(file(relative)))
    .map(([relative, label]) => `<a href="${href(relative)}"${relative === "captions.vtt" ? " download" : ""}>${escapeHtml(label)}</a>`).join(" · ");
  const jumps = sections.map((section) => `<button data-seek="${section.startSeconds}">${escapeHtml(section.label)} <small>${stamp(section.startSeconds)}</small></button>`).join("\n");
  const entryMarkup = entries.map((entry) => `<article>
    <div class="entry-heading"><button data-seek="${entry.startSeconds}"><span class="time">${stamp(entry.startSeconds)}</span> ${entry.index}. ${escapeHtml(entry.headline)}</button><small>${Math.round(entry.endSeconds - entry.startSeconds)} s</small></div>
    <details><summary>${entry.artworkBeats.length} artwork ${entry.artworkBeats.length === 1 ? "beat" : "beats"}${entry.safetyCard ? " · complete fever safety card" : ""} · source references</summary>
    <p class="source">${escapeHtml(entry.sourceRefs.join(" · "))}</p>
    <ul>${entry.artworkBeats.map((beat) => `<li><button data-seek="${beat.startSeconds}">${stamp(beat.startSeconds)} · ${escapeHtml(beat.artworkId)}</button> <small>${(beat.endSeconds - beat.startSeconds).toFixed(1)} s</small><br><span class="source">${escapeHtml(beat.sourceRef)}</span></li>`).join("")}</ul>
    </details></article>`).join("\n");
  const phoneImages = inspectionImages.filter((relative) => /phone/i.test(path.basename(relative)));
  const gallery = inspectionImages.length ? `<h2>Encoded-video images</h2><p>${inspectionImages.map((relative) => `<a href="${href(relative)}">${escapeHtml(path.basename(relative))}</a>`).join(" · ")}</p>
    ${phoneImages.slice(0, 3).map((relative) => `<figure><a href="${href(relative)}"><img src="${href(relative)}" width="640" loading="lazy" alt="${escapeHtml(path.basename(relative))}"></a><figcaption>${escapeHtml(path.basename(relative))}</figcaption></figure>`).join("\n")}` : "";
  const visualStatus = existingApproval ? "A full-playback review is recorded in the existing manifest for these video bytes." : "Full visual and listening review is pending.";
  const preference = [manifest.intake?.voiceTone, manifest.intake?.educationLevel, manifest.intake?.depthPreference].filter(Boolean).join(" · ").replaceAll("_", " ");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(props.direction.regimenTitle)} — video review</title>
<style>body{margin:0;background:#F4F7F6;color:#1C2B45;font:16px/1.55 system-ui,sans-serif}main{max-width:1140px;margin:auto;padding:24px}h1{font-size:30px;line-height:1.2;margin-bottom:8px}h2{font-size:21px;margin:28px 0 12px}p{margin:10px 0}video{display:block;width:100%;background:#1C2B45;border-radius:10px}button,select{font:inherit;color:inherit;padding:8px 12px;border:1px solid #B7CEC5;border-radius:7px;background:#fff;cursor:pointer}button:hover,button:focus-visible{background:#E3F2EC}button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid #FF6B4A;outline-offset:2px}.controls,.sections{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}.sections button{font-size:15px}.sections small{margin-left:4px;color:#526963}small,.source{color:#526963}.source{font-size:13px;overflow-wrap:anywhere}a{color:#176E60;text-underline-offset:3px}.links{line-height:2}article{padding:12px 0;border-top:1px solid #D6E2DC}.entry-heading{display:flex;align-items:center;gap:12px}.entry-heading button{flex:1;text-align:left}.time{font-variant-numeric:tabular-nums;color:#176E60}details{padding:6px 8px}summary{cursor:pointer;font-size:14px}ul{padding-left:24px}li{margin:10px 0}figure{margin:18px 0}img{max-width:100%;height:auto;border-radius:7px}figcaption{font-size:13px;color:#526963}.status{border-left:4px solid #2FBFA0;padding-left:12px;margin:18px 0}.muted{color:#526963;font-size:14px}@media(max-width:650px){main{padding:16px}h1{font-size:25px}.entry-heading{align-items:baseline}.controls button{font-size:14px}}</style></head>
<body><main><h1>${escapeHtml(props.direction.regimenTitle)} — video review</h1><p class="muted">${escapeHtml(preference)} · ${stamp(props.direction.totalSeconds)} · ${entries.length} source entries · all nine sections</p>
<p class="status">${visualStatus} Clinical approval is not established. This page does not record approval.</p>
<video id="video" src="video.mp4" controls playsinline preload="metadata"></video>
<div class="controls"><button id="previous">Previous frame</button><button id="next">Next frame</button><label>Speed <select id="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option></select></label><span id="position" class="time" aria-live="off">0:00</span></div>
<p class="muted">Captions are already shown in the video. The VTT download contains the measured caption timing. Review the complete audio, wording, actions, transitions and phone framing.</p>
<h2>Sections</h2><nav class="sections" aria-label="Jump to a section">${jumps}</nav>
<h2>Evidence</h2><p>Bundle and rendered-video integrity verified. Layout: ${layoutCurrent ? "current audit passed" : layout ? "report present; current passing audit not confirmed" : "not yet available"}. Encoded inspection: ${inspectionPassed ? "current inspection passed" : inspectionCurrent ? "current evidence present; pass not confirmed" : inspection ? "report present; current inspection not confirmed" : "not yet available"}.</p><p class="links">${linkMarkup}</p>
<h2>Entries and artwork</h2>${entryMarkup}${gallery}
<p class="muted">Source illustrations adapted from Storyset / Freepik; additional object illustrations were created for this project. Technical and speech checks do not establish clinical approval.</p></main>
<script>const video=document.getElementById('video');const stamp=seconds=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');document.querySelectorAll('[data-seek]').forEach(button=>button.addEventListener('click',()=>{video.currentTime=Number(button.dataset.seek)}));document.getElementById('speed').addEventListener('change',event=>{video.playbackRate=Number(event.target.value)});for(const[id,step]of[['previous',-1],['next',1]])document.getElementById(id).addEventListener('click',()=>{video.pause();const limit=Number.isFinite(video.duration)?video.duration-1/30:${props.direction.totalSeconds}-1/30;video.currentTime=Math.max(0,Math.min(limit,(Math.round(video.currentTime*30)+step)/30))});video.addEventListener('timeupdate',()=>{document.getElementById('position').textContent=stamp(video.currentTime)+' / '+stamp(video.duration||${props.direction.totalSeconds})+' · '+video.currentTime.toFixed(2)+' s'});</script></body></html>`;
  writeFileSync(file("review-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(file("index.html"), html);
  console.log(`Verified review page: ${file("index.html")}`);
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const directory = process.argv[2];
  if (!directory) { console.error("Usage: create-directed-review-page.ts <verified rendered bundle directory>"); process.exitCode = 1; }
  else {
    try { createDirectedReviewPage(path.resolve(directory)); }
    catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
  }
}
