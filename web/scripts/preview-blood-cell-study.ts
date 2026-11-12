import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser,renderStill,renderMedia,selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import {muxNarrationAudio} from '../lib/video/render-narration-audio';
import {loadRchopStudyNarration} from '../lib/video/study-source';
import type {BloodCellStudyProps} from '../video-composition/blood-cell-study-index';
const sha=(f:string)=>createHash('sha256').update(readFileSync(f)).digest('hex');
async function main(){
 const output=path.resolve('out/blood-counts-motion-study',process.argv.find(a=>a.startsWith('--run='))?.slice(6)??'draft-1');
 assert.ok(!existsSync(path.join(output,'evidence.json')),'Use a new run name');mkdirSync(output,{recursive:true});
 const source=loadRchopStudyNarration('timeline');
 const timing=source.timing;
 const words=timing.words.filter(w=>w.entryId==='timeline.roughly-days-7-10');
 const text=words.map(w=>w.text).join(' ');assert.match(text,/white blood cell count is typically at its lowest/);assert.match(text,/infection precautions/);
 const sourceStart=words[0]!.startSeconds-.5,durationInFrames=Math.ceil((words.at(-1)!.endSeconds+.4-sourceStart)*30-1e-7),duration=durationInFrames/30;
 const word=(s:string)=>words.find(w=>w.text.replace(/[^a-z]/gi,'').toLowerCase()===s)!;
 const cue={sourceRef:'timeline.roughly-days-7-10:plain',windowLabel:'Around days 7–10',focusSeconds:word('white').startSeconds-sourceStart,lowSeconds:word('lowest').endSeconds-sourceStart,precautionSeconds:word('infection').startSeconds-sourceStart,endSeconds:duration};
 const mapped=words.map(w=>({...w,startSeconds:w.startSeconds-sourceStart,endSeconds:w.endSeconds-sourceStart}));
 const captions:BloodCellStudyProps['captions']=[];
 for(let i=0;i<mapped.length;i+=7){const group=mapped.slice(i,i+7);captions.push({text:group.map(w=>w.text).join(' '),startSeconds:group[0]!.startSeconds,endSeconds:mapped[i+7]?.startSeconds??group.at(-1)!.endSeconds+.15});}
 const inputProps:BloodCellStudyProps={cue,captions,durationInFrames};writeFileSync(path.join(output,'props.json'),JSON.stringify(inputProps,null,2));
 const audio=path.join(output,'narration-excerpt.wav');execFileSync('ffmpeg',['-v','error','-y','-i',path.join(source.directory,'narration.wav'),'-af',`atrim=start=${sourceStart}:end=${sourceStart+duration},asetpts=PTS-STARTPTS`,'-c:a','pcm_s16le',audio]);
 const files=['package.json','package-lock.json','lib/video/blood-cell-motion.ts','lib/video/study-source.ts','video-composition/directed/BloodCellArtwork.tsx','video-composition/directed/blood-cell-geometry.ts','video-composition/blood-cell-study-index.tsx','video-composition/directed/DirectedFonts.tsx','public/fonts/figtree-latin-v9.woff2','scripts/preview-blood-cell-study.ts','lib/video/render-narration-audio.ts','node_modules/three/build/three.module.js','node_modules/@remotion/three/dist/esm/index.mjs'].filter(existsSync);
 for(const directory of ['node_modules/three','node_modules/@react-three/fiber','node_modules/@remotion/three']){
  for(const file of readdirSync(directory,{recursive:true}).map(String).filter(f=>/\.(?:cjs|mjs|js)$/.test(f)))files.push(path.join(directory,file));
 }
 const implementation=Object.fromEntries(files.map(f=>[f,sha(f)]));
 const serveUrl=await bundle({entryPoint:path.resolve('video-composition/blood-cell-study-index.tsx')});const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'}});
 const frames=process.argv.includes('--quick')?[0,70,140,225,300,401]:[0,1,45,70,90,120,139,140,141,180,220,222,225,258,300,360,401];
 const audits:any[]=[];const capture=(log:{text:string})=>{const mark='BLOOD_STUDY_QA:';const i=log.text.indexOf(mark);if(i>=0)audits.push(JSON.parse(log.text.slice(i+mark.length)));};
 let mux:unknown=null;
 try{
  const props={...inputProps,qaMode:true};const composition=await selectComposition({serveUrl,id:'BloodCellStudy',inputProps:props,puppeteerInstance:browser});
  for(const frame of frames){await renderStill({serveUrl,composition,inputProps:props,puppeteerInstance:browser,frame,output:path.join(output,`frame-${frame}.png`),onBrowserLog:capture,logLevel:'error',timeoutInMilliseconds:90000});console.log('Rendered frame',frame);}
  const reducedProps={...props,reducedMotion:true};const reduced=await selectComposition({serveUrl,id:'BloodCellStudy',inputProps:reducedProps,puppeteerInstance:browser});
  for(const frame of [0,222,401])await renderStill({serveUrl,composition:reduced,inputProps:reducedProps,puppeteerInstance:browser,frame,output:path.join(output,`reduced-${frame}.png`),onBrowserLog:capture,logLevel:'error',timeoutInMilliseconds:90000});
  assert.equal(audits.length,frames.length+3);assert.equal(audits.filter(a=>a.reducedMotion).length,3);
  for(const a of audits){assert.ok(a.canvas.length>0,'No rendered3D canvas');assert.ok(a.canvas.every((c:any)=>c.width>0&&c.height>0));for(const t of a.text)assert.ok(t.bounds.x>=40&&t.bounds.x+t.bounds.width<=1240&&t.bounds.y>=20&&t.bounds.y+t.bounds.height<=875,'Text outside safe area');}
  if(!process.argv.includes('--stills-only')){
   const props={...inputProps,qaMode:false};const composition=await selectComposition({serveUrl,id:'BloodCellStudy',inputProps:props,puppeteerInstance:browser});
   await renderMedia({serveUrl,composition,inputProps:props,puppeteerInstance:browser,codec:'h264',muted:true,concurrency:2,crf:18,outputLocation:path.join(output,'silent.mp4'),timeoutInMilliseconds:90000,onProgress:p=>{if(p.renderedFrames%60===0)console.log('Video frames',p.renderedFrames);}});
   mux=await muxNarrationAudio(path.join(output,'silent.mp4'),readFileSync(audio),path.join(output,'blood-cell-study.mp4'));execFileSync('ffmpeg',['-v','error','-xerror','-i',path.join(output,'blood-cell-study.mp4'),'-f','null','-']);
  }
 }finally{await browser.close({silent:true});}
 const selected=[frames[0]!,140,225,frames.at(-1)!];
 const panels=await Promise.all(selected.map(async(f,i)=>({input:await sharp(path.join(output,`frame-${f}.png`)).resize(640,450).png().toBuffer(),left:i%2*640,top:Math.floor(i/2)*450})));
 await sharp({create:{width:1280,height:900,channels:4,background:'#F4F7F6'}}).composite(panels).png().toFile(path.join(output,'contact-sheet.png'));
 await sharp(path.join(output,`frame-225.png`)).resize({width:667}).png().toFile(path.join(output,'phone-landscape.png'));
 assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(f)])),implementation,'Inputs changed during render');
 const video=path.join(output,'blood-cell-study.mp4');const probe=existsSync(video)?JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',video],{encoding:'utf8'})):null;
 if(probe){assert.equal(Number(probe.streams.find((s:any)=>s.codec_type==='video').nb_frames),durationInFrames);for(const s of probe.streams)assert.equal(Number(s.start_time),0);}
 writeFileSync(path.join(output,'evidence.json'),JSON.stringify({source:{entry:'timeline.roughly-days-7-10',text,sourceStart,sourceEnd:sourceStart+duration,timingSha256:source.hashes['timing.json'],audioSha256:source.hashes['narration.wav'],speechReviewSha256:source.hashes['speech-review.json']},cue,duration,durationInFrames,frames,audits,implementation,mux,probe,excerptSha256:sha(audio),previewSha256:existsSync(video)?sha(video):null,humanVisualApproval:'pending',scope:'Original 3D blood-cell focus/timelapse isolated study. Verified narration fixture; no actual counts or new shortv1/pipeline integration.'},null,2));console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
