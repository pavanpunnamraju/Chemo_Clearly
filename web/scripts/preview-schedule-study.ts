import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import { scheduleCuesFromWords, scheduleNumberState, type ScheduleNumberCue } from "../lib/video/schedule-number-cues";
import { loadRchopStudyNarration } from "../lib/video/study-source";
import type { ScheduleStudyProps } from "../video-composition/schedule-study-index";

const sha = (file:string) => createHash("sha256").update(readFileSync(file)).digest("hex");
async function main() {
  const output = path.resolve("out/schedule-motion-study", process.argv.find(a=>a.startsWith("--run="))?.slice(6) ?? "draft-1");
  if (existsSync(path.join(output,"evidence.json"))) throw new Error("Use a new run name; existing evidence is immutable.");
  mkdirSync(output,{recursive:true});
  const source = loadRchopStudyNarration("timeline");
  const timing = source.timing;
  const ids = ["timeline.day-1","timeline.days-2-5","timeline.roughly-days-7-10","timeline.days-11-21"];
  let totalFrames = 0;
  const captions: ScheduleStudyProps["captions"] = [];
  let cues: ScheduleNumberCue[] = [];
  const clips = ids.map(entryId => {
    const entryWords = timing.words.filter(w=>w.entryId===entryId);
    const last = entryWords.findIndex(w=>w.text.endsWith("."));
    assert.ok(last>=0,"Need a complete first sentence");
    const words = entryWords.slice(0,last+1);
    const sourceStart = words[0]!.startSeconds-.3;
    const sourceEnd = words.at(-1)!.endSeconds+.45;
    const frameCount = Math.ceil((sourceEnd-sourceStart)*30);
    const startSeconds = totalFrames/30;
    const durationSeconds = frameCount/30;
    const mappedWords = words.map(w=>({...w,startSeconds:w.startSeconds-sourceStart+startSeconds,endSeconds:w.endSeconds-sourceStart+startSeconds}));
    const extracted = scheduleCuesFromWords(mappedWords,entryId,startSeconds+durationSeconds);
    assert.equal(extracted.length,1,`Unexpected schedule mentions: ${entryId}`);
    cues.push(...extracted);
    for(let i=0;i<mappedWords.length;i+=7){const group=mappedWords.slice(i,i+7);captions.push({text:group.map(w=>w.text).join(" "),startSeconds:group[0]!.startSeconds,endSeconds:mappedWords[i+7]?.startSeconds ?? group.at(-1)!.endSeconds+.15});}
    totalFrames += frameCount;
    return {entryId,sourceStart,sourceEnd:sourceStart+durationSeconds,startSeconds,durationSeconds,text:words.map(w=>w.text).join(" ")};
  });
  // Hold the previous range until the next spoken numeric cue; then crossfade.
  cues = cues.map((cue,i)=>({...cue,endSeconds:cues[i+1]?.startSeconds ?? totalFrames/30-.4}));
  const inputProps: ScheduleStudyProps = {cues,captions,durationInFrames:totalFrames};
  writeFileSync(path.join(output,"props.json"),JSON.stringify(inputProps,null,2));
  const audio = path.join(output,"narration-excerpts.wav");
  const filters = clips.map((clip,i)=>`[0:a]atrim=start=${clip.sourceStart}:end=${clip.sourceEnd},asetpts=PTS-STARTPTS[a${i}]`);
  filters.push(clips.map((_,i)=>`[a${i}]`).join("")+`concat=n=${clips.length}:v=0:a=1[out]`);
  execFileSync("ffmpeg",["-v","error","-y","-i",path.join(source.directory,"narration.wav"),"-filter_complex",filters.join(";"),"-map","[out]","-c:a","pcm_s16le",audio]);
  const files = ["lib/video/schedule-number-cues.ts","lib/video/study-source.ts","video-composition/directed/ScheduleArtwork.tsx","video-composition/directed/LibraryContextArtwork.tsx","lib/video/library-context-motion.ts","video-composition/directed/PatientCareObjects.tsx","video-composition/directed/LibrarySvgArtwork.tsx","video-composition/directed/namespace-svg.ts","video-composition/directed/DirectedFonts.tsx","public/fonts/figtree-latin-v9.woff2","video-composition/schedule-study-index.tsx","scripts/preview-schedule-study.ts","public/illustrations/timeline/timeline__schedule-pana.svg"];
  const before = Object.fromEntries(files.map(f=>[f,sha(f)]));
  const serveUrl = await bundle({entryPoint:path.resolve("video-composition/schedule-study-index.tsx")});
  const browser = await openBrowser("chrome");
  const audits: any[] = [];
  const capture = (log:{text:string})=>{const mark="SCHEDULE_QA:";const i=log.text.indexOf(mark);if(i>=0)audits.push(JSON.parse(log.text.slice(i+mark.length)));};
  const frames = [...new Set([0,...cues.flatMap(c=>[Math.max(0,Math.floor(c.startSeconds*30)-1),Math.ceil(c.startSeconds*30)+1,Math.ceil((c.startSeconds+.2)*30),Math.ceil((c.startSeconds+.5)*30)]),totalFrames-1])].sort((a,b)=>a-b);
  try {
    const props = {...inputProps,qaMode:true};
    const composition = await selectComposition({serveUrl,id:"ScheduleStudy",inputProps:props,puppeteerInstance:browser});
    for(const frame of frames) await renderStill({serveUrl,composition,inputProps:props,puppeteerInstance:browser,frame,output:path.join(output,`frame-${frame}.png`),onBrowserLog:capture,logLevel:"error"});
    const reducedProps={...props,reducedMotion:true};
    const reducedComposition=await selectComposition({serveUrl,id:"ScheduleStudy",inputProps:reducedProps,puppeteerInstance:browser});
    for(const cue of cues){const frame=Math.ceil((cue.startSeconds+.2)*30);await renderStill({serveUrl,composition:reducedComposition,inputProps:reducedProps,puppeteerInstance:browser,frame,output:path.join(output,`reduced-${frame}.png`),onBrowserLog:capture,logLevel:"error"});}
    assert.equal(audits.length,frames.length+cues.length);
    assert.equal(audits.filter(a=>a.reducedMotion).length,cues.length,"Reduced-motion renders must actually use reduced props");
    for(const audit of audits){
      assert.deepEqual(audit.character,audits[0]!.character,"Character changed between frames");
      const expected = new Map(scheduleNumberState(cues,audit.seconds,audit.reducedMotion).numbers.map(n=>[n.value,n.opacity]));
      assert.deepEqual(audit.numbers.map((n:any)=>n.value),Array.from({length:31},(_,i)=>i+1),"Calendar must show every date1–31");
      assert.deepEqual(audit.weekdays.map((n:any)=>n.text),["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]);
      for(const number of audit.numbers){
        assert.equal(number.opacity,1,"Calendar numbers must remain visible");
        const strength=expected.get(number.value)??0;
        assert.ok(Math.abs(number.highlight-strength)<1e-8,"Rendered highlight timing mismatch");
        assert.ok(Math.abs(number.scale-(audit.reducedMotion?1:1+.15*strength))<1e-8,"Incorrect or reduced-motion scale");
        const rest=audits[0].numbers.find((n:any)=>n.value===number.value);
        // Chromium exposes float32-rounded SVG transforms (observed error<6e-8).
        assert.ok(Math.abs(number.matrix[0]/rest.matrix[0]-number.scale)<1e-6&&Math.abs(number.matrix[3]/rest.matrix[3]-number.scale)<1e-6,"Actual DOM numeral scale differs from declared scale");
        assert.ok(Math.abs(number.bounds.width/rest.bounds.width-number.scale)<.01,"Rendered font geometry changed unexpectedly");
        if(strength===0) assert.equal(number.fill.toLowerCase(),"#1c2b45","Inactive date must be navy");
        if(strength===1) assert.equal(number.fill.toLowerCase(),"#2fbfa0","Active date must be teal");
        const b=number.bounds,s=audit.screenBounds;
        assert.ok(b.x>s.x&&b.x+b.width<s.x+s.width&&b.y>s.y&&b.y+b.height<s.y+s.height,"Number outside source screen");
        const cell=audit.cells.find((c:any)=>c.value===number.value)?.bounds;
        assert.ok(cell&&b.x>=cell.x&&b.x+b.width<=cell.x+cell.width&&b.y>=cell.y&&b.y+b.height<=cell.y+cell.height,"Enlarged numeral exceeds its own cell");
      }
      const overlap=(a:any,b:any)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
      for(let i=0;i<audit.numbers.length;i++)for(let j=i+1;j<audit.numbers.length;j++)assert.ok(!overlap(audit.numbers[i].bounds,audit.numbers[j].bounds),"Calendar numerals overlap");
      for(let i=0;i<audit.weekdays.length;i++){
        const h=audit.weekdays[i];
        for(let j=i+1;j<audit.weekdays.length;j++)assert.ok(!overlap(h.bounds,audit.weekdays[j].bounds),"Weekday headings overlap");
        for(const n of audit.numbers)assert.ok(!overlap(h.bounds,n.bounds),"Weekday/date overlap");
      }
      if(audit.captionBounds) assert.ok(audit.captionBounds.y>=775&&audit.captionBounds.y+audit.captionBounds.height<865,"Caption outside reserved area");
    }
    console.log(`Passed ${audits.length} schedule DOM/cue/stationary-character audits.`);
    const crop = {left:125,top:120,width:195,height:630};
    const restingPixels = await sharp(path.join(output,"frame-0.png")).extract(crop).raw().toBuffer();
    for(const frame of frames) assert.ok(restingPixels.equals(await sharp(path.join(output,`frame-${frame}.png`)).extract(crop).raw().toBuffer()),"Character crop pixels changed");
    if(!process.argv.includes("--stills-only")){
      const videoProps={...inputProps,qaMode:false};
      const videoComposition=await selectComposition({serveUrl,id:"ScheduleStudy",inputProps:videoProps,puppeteerInstance:browser});
      await renderMedia({serveUrl,composition:videoComposition,inputProps:videoProps,puppeteerInstance:browser,codec:"h264",muted:true,concurrency:2,crf:18,outputLocation:path.join(output,"silent.mp4")});
      execFileSync("ffmpeg",["-v","error","-y","-i",path.join(output,"silent.mp4"),"-i",audio,"-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","192k","-movflags","+faststart",path.join(output,"schedule-study.mp4")]);
      execFileSync("ffmpeg",["-v","error","-xerror","-i",path.join(output,"schedule-study.mp4"),"-f","null","-"]);
    }
  } finally {await browser.close({silent:true});}
  const samples = cues.map(c=>Math.ceil((c.startSeconds+.5)*30));
  const panels = await Promise.all(samples.map(async(frame,i)=>({input:await sharp(path.join(output,`frame-${frame}.png`)).resize(640,450).png().toBuffer(),left:(i%2)*640,top:Math.floor(i/2)*450})));
  await sharp({create:{width:1280,height:900,channels:4,background:"#F4F7F6"}}).composite(panels).png().toFile(path.join(output,"contact-sheet.png"));
  await sharp(path.join(output,`frame-${samples[3]}.png`)).resize({width:667}).png().toFile(path.join(output,"phone-landscape.png"));
  const after=Object.fromEntries(files.map(f=>[f,sha(f)])); assert.deepEqual(after,before,"Render inputs changed during render");
  const encoded = path.join(output,"schedule-study.mp4");
  const probe = existsSync(encoded)?JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",encoded],{encoding:"utf8"})):null;
  if(probe){assert.equal(Number(probe.streams.find((s:any)=>s.codec_type==="video").nb_frames),totalFrames);assert.ok(Math.abs(Number(probe.format.duration)-totalFrames/30)<.1);}
  writeFileSync(path.join(output,"evidence.json"),JSON.stringify({clips,cues,frames,audits,implementation:before,sourceTimingSha256:source.hashes['timing.json'],sourceAudioSha256:source.hashes['narration.wav'],speechReviewSha256:source.hashes['speech-review.json'],excerptAudioSha256:sha(audio),previewSha256:existsSync(encoded)?sha(encoded):null,totalFrames,seconds:totalFrames/30,fullDecodePassed:Boolean(probe),humanVisualApproval:"pending",scope:"Isolated schedule reveal with excerpts from a verified narration fixture; not the new v1 script or final integration",probe},null,2));
  writeFileSync(path.join(output,"index.html"),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Schedule number reveal</title><style>body{max-width:1100px;margin:24px auto;padding:0 20px;background:#f4f7f6;color:#1c2b45;font:17px/1.5 system-ui}video,img{width:100%;display:block}a{color:#176e60}</style><h1>Schedule number reveal</h1><p>All 31 dates stay visible in navy. The spoken range turns teal and grows slightly, then returns to navy. The character stays still.</p><video controls src="schedule-study.mp4"></video><p>Motion review using four narration excerpts. This is not the final short v1 script. Illustration: Storyset / Freepik.</p><p><a href="schedule-study.mp4">Open video</a> · <a href="evidence.json">Review evidence</a></p><img src="phone-landscape.png" alt="Phone landscape sample">`);
  console.log(output);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
