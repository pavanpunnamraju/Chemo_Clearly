import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser,renderMedia,renderStill,selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import {muxNarrationAudio} from '../lib/video/render-narration-audio';
import {medicationStampMotion} from '../lib/video/medication-stamp-motion';
import {loadRchopStudyNarration} from '../lib/video/study-source';
import type {MedicationStampStudyProps} from '../video-composition/medication-stamp-study-index';
const sha=(f:string)=>createHash('sha256').update(readFileSync(f)).digest('hex');
async function main(){
 const output=path.resolve('out/medication-plan-motion-study',process.argv.find(a=>a.startsWith('--run='))?.slice(6)??'draft-1');
 assert.ok(!existsSync(path.join(output,'evidence.json')),'Use a new run name');mkdirSync(output,{recursive:true});
 const source=loadRchopStudyNarration('timeline');
 const timing=source.timing;
 const words=timing.words.filter(w=>w.entryId==='timeline.days-2-5');
 const text=words.map(w=>w.text).join(' ');
 assert.match(text,/with food and not at night/i);
 assert.match(readFileSync('../docs/content/rchop.md','utf8'),/prednisone \(with food, not at night/);
 const sourceStart=words[0]!.startSeconds-.5;
 const durationInFrames=Math.ceil((words.at(-1)!.endSeconds+.4-sourceStart)*30);
 const duration=durationInFrames/30;
 const night=words.find(w=>w.text.replace(/[^a-z]/gi,'').toLowerCase()==='night')!;
 const cue={lines:['WITH FOOD','NOT AT NIGHT'],sourceRef:'timeline.days-2-5:plain',contactSeconds:night.endSeconds-sourceStart,endSeconds:duration};
 const mapped=words.map(w=>({...w,startSeconds:w.startSeconds-sourceStart,endSeconds:w.endSeconds-sourceStart}));
 const captions:MedicationStampStudyProps['captions']=[];
 for(let i=0;i<mapped.length;i+=7){const group=mapped.slice(i,i+7);captions.push({text:group.map(w=>w.text).join(' '),startSeconds:group[0]!.startSeconds,endSeconds:mapped[i+7]?.startSeconds??group.at(-1)!.endSeconds+.15});}
 const inputProps:MedicationStampStudyProps={cue,captions,durationInFrames};
 writeFileSync(path.join(output,'props.json'),JSON.stringify(inputProps,null,2));
 const audio=path.join(output,'narration-excerpt.wav');
 execFileSync('ffmpeg',['-v','error','-y','-i',path.join(source.directory,'narration.wav'),'-af',`atrim=start=${sourceStart}:end=${sourceStart+duration},asetpts=PTS-STARTPTS`,'-c:a','pcm_s16le',audio]);
 const files=['lib/video/render-narration-audio.ts','lib/video/study-source.ts','lib/video/library-context-motion.ts','lib/video/medication-stamp-motion.ts','video-composition/directed/MedicationStampArtwork.tsx','video-composition/directed/PatientCareObjects.tsx','video-composition/directed/DirectedFonts.tsx','public/fonts/figtree-latin-v9.woff2','video-composition/medication-stamp-study-index.tsx','scripts/preview-medication-stamp-study.ts'];
 const implementation=Object.fromEntries(files.map(f=>[f,sha(f)]));
 const serveUrl=await bundle({entryPoint:path.resolve('video-composition/medication-stamp-study-index.tsx')});
 const browser=await openBrowser('chrome');const audits:any[]=[];
 const capture=(log:{text:string})=>{const marker='MEDICATION_STAMP_QA:';const i=log.text.indexOf(marker);if(i>=0)audits.push(JSON.parse(log.text.slice(i+marker.length)));};
 const c=cue.contactSeconds;
 const frames=[...new Set([0,...[-2.8,-2.3,-1.2,-.32,-.03,0,.12,.25,.43,.65,.89,1.25,1.7,2.04].map(t=>Math.ceil((c+t)*30)),durationInFrames-1])].sort((a,b)=>a-b);
 let mux:unknown=null;
 try{
  const props={...inputProps,qaMode:true};const composition=await selectComposition({serveUrl,id:'MedicationStampStudy',inputProps:props,puppeteerInstance:browser});
  for(const frame of frames)await renderStill({serveUrl,composition,inputProps:props,puppeteerInstance:browser,frame,output:path.join(output,`frame-${frame}.png`),onBrowserLog:capture,logLevel:'error'});
  const reducedProps={...props,reducedMotion:true};const reduced=await selectComposition({serveUrl,id:'MedicationStampStudy',inputProps:reducedProps,puppeteerInstance:browser});
  for(const frame of [0,Math.ceil(c*30),durationInFrames-1])await renderStill({serveUrl,composition:reduced,inputProps:reducedProps,puppeteerInstance:browser,frame,output:path.join(output,`reduced-${frame}.png`),onBrowserLog:capture,logLevel:'error'});
  assert.equal(audits.length,frames.length+3);assert.equal(audits.filter(a=>a.reducedMotion).length,3);
  const layer=(a:any,key:string)=>a.layers.find((l:any)=>l.attrs[key]!==undefined);
  for(const a of audits){
   assert.deepEqual(a.source,audits[0].source,'Original stationary geometry/transforms changed');
   const pose=medicationStampMotion(a.seconds,cue,a.reducedMotion);
   const imprint=layer(a,'data-stamp-imprint');assert.equal(Number(imprint.attrs.opacity),pose.imprintOpacity);
   const board=a.source.find((s:any)=>s.attrs['data-object-layer']==='blank-medication-checklist').bounds;
   const b=imprint.bounds;
   assert.ok(b.x>board.x&&b.y>board.y&&b.x+b.width<board.x+board.width&&b.y+b.height<board.y+board.height,'Imprint must lie within board');
   for(const line of a.messageBounds)assert.ok(line.bounds.x>b.x+4&&line.bounds.x+line.bounds.width<b.x+b.width-4,'Message exceeds stamp border');
   const shadow=layer(a,'data-stamp-shadow');assert.ok(shadow.ancestors.some((p:any)=>p.receiver==='paper'&&p.tag==='svg'&&p.overflow==='hidden'),'Shadow receiver must clip in stationary paper coordinates');
   const hardware=layer(a,'data-stamp-hardware');
   if(a.reducedMotion)assert.ok(!hardware,'Reduced motion hardware must be absent');
   else if(pose.phase==='waiting'||pose.phase==='hold')assert.ok(hardware.bounds.x>=1280,'Hardware visible at rest');
   if(pose.contact&&!a.reducedMotion){const pad=layer(a,'data-stamp-pad').bounds;for(const key of ['x','y','width','height'])assert.ok(Math.abs(pad[key]-b[key])<.01,'Contact pad must align with imprint');}
   if(a.captionBounds)assert.ok(a.captionBounds.y>=775&&a.captionBounds.y+a.captionBounds.height<865,'Caption exceeds reserved area');
  }
  const current=audits[0];
  const object=(a:any,name:string)=>a.source.find((s:any)=>s.attrs['data-object-layer']===name);
  const bread=object(current,'plain-toast').bounds,bowl=object(current,'small-bowl').bounds;
  const gap=bowl.y-bread.y-bread.height;
  assert.ok(gap>0,'Toast and bowl must retain a visible gap');
  assert.ok(Math.abs(bread.y-current.boardSurface.y)<.01,'Bread top must match white board top');
  assert.ok(Math.abs(bowl.y+bowl.height-current.boardSurface.y-current.boardSurface.height)<.01,'Bowl bottom must match white board bottom');
  assert.ok(Math.abs(bread.x+bread.width/2-bowl.x-bowl.width/2)<.01,'Food centers must align');
  for(const audit of audits)assert.deepEqual(audit.source,current.source,'Stationary source geometry changed during the current render');
  const crop={left:Math.floor(bowl.x)-5,top:Math.floor(bread.y)-5,width:Math.ceil(bowl.width)+10,height:Math.ceil(bowl.y+bowl.height-bread.y)+10};
  const foodPixels=await sharp(path.join(output,'frame-0.png')).extract(crop).raw().toBuffer();
  for(const f of frames)assert.ok(foodPixels.equals(await sharp(path.join(output,`frame-${f}.png`)).extract(crop).raw().toBuffer()),'Breakfast pixels moved');
  if(!process.argv.includes('--stills-only')){
   const props={...inputProps,qaMode:false};const composition=await selectComposition({serveUrl,id:'MedicationStampStudy',inputProps:props,puppeteerInstance:browser});
   await renderMedia({serveUrl,composition,inputProps:props,puppeteerInstance:browser,codec:'h264',muted:true,concurrency:2,crf:18,outputLocation:path.join(output,'silent.mp4')});
   mux=await muxNarrationAudio(path.join(output,'silent.mp4'),readFileSync(audio),path.join(output,'medication-stamp.mp4'));
   execFileSync('ffmpeg',['-v','error','-xerror','-i',path.join(output,'medication-stamp.mp4'),'-f','null','-']);
  }
 }finally{await browser.close({silent:true});}
 const selected=[0,...[-1.2,.25,.65,1.25,2.04].map(t=>Math.ceil((c+t)*30))];
 const panels=await Promise.all(selected.map(async(f,i)=>({input:await sharp(path.join(output,`frame-${f}.png`)).resize(640,450).png().toBuffer(),left:i%2*640,top:Math.floor(i/2)*450})));
 await sharp({create:{width:1280,height:1350,channels:4,background:'#F4F7F6'}}).composite(panels).png().toFile(path.join(output,'contact-sheet.png'));
 const contactFrame=Math.ceil((c+.25)*30);
 await sharp(path.join(output,`frame-${contactFrame}.png`)).resize({width:667}).png().toFile(path.join(output,'phone-contact.png'));
 assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(f)])),implementation,'Inputs changed while rendering');
 const video=path.join(output,'medication-stamp.mp4');
 const probe=existsSync(video)?JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',video],{encoding:'utf8'})):null;
 if(probe){assert.equal(Number(probe.streams.find((s:any)=>s.codec_type==='video').nb_frames),durationInFrames);for(const s of probe.streams)assert.equal(Number(s.start_time),0);assert.ok(Math.abs(Number(probe.format.duration)-duration)<.06);}
 writeFileSync(path.join(output,'evidence.json'),JSON.stringify({source:{entryId:'timeline.days-2-5',sourceStart,sourceEnd:sourceStart+duration,text,night,sourceAudioSha256:source.hashes['narration.wav'],sourceTimingSha256:source.hashes['timing.json'],speechReviewSha256:source.hashes['speech-review.json'],contentSha256:sha('../docs/content/rchop.md')},cue,durationInFrames,duration,frames,audits,implementation,excerptSha256:sha(audio),previewSha256:existsSync(video)?sha(video):null,mux,probe,humanVisualApproval:'pending',scope:'Isolated motion study using a verified narration fixture; new short v1 and pipeline integration pending'},null,2));
 console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
