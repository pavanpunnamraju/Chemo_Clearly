import assert from 'node:assert/strict';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser,renderStill,renderMedia,selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import {loadRchopStudyNarration} from '../lib/video/study-source';
import {FLOW_PROPS,flowSceneState} from '../video-composition/directed/WorkPlanningFlowScene';
import {workPropOffset} from '../lib/video/work-planning-motion';
import type {FlowStudyProps} from '../video-composition/work-planning-flow-index';
async function main(){
 const run=process.argv.find(a=>a.startsWith('--run='))?.slice(6)??'flow-scene-1';
 assert.match(run,/^[\w-]+$/);const out=path.resolve('out/work-planning-review',run);
 assert.ok(!existsSync(out),'Use a fresh run name');mkdirSync(out,{recursive:true});
 const quick=process.argv.includes('--quick');
 const source=loadRchopStudyNarration('daily_life');const words=source.timing.words.filter(w=>w.entryId==='daily_life');
 const start=words[0]!.startSeconds-.4,end=words.at(-1)!.endSeconds;
 const props:FlowStudyProps={durationInFrames:Math.ceil((end-start+1.4)*24),exitStart:end-start+.1,reducedMotion:false,captions:[]};
 for(let i=0;i<words.length;i+=8){const group=words.slice(i,i+8);props.captions.push({text:group.map(w=>w.text).join(' '),startSeconds:group[0]!.startSeconds-start,endSeconds:(words[i+8]?.startSeconds??group.at(-1)!.endSeconds)-start});}
 const files=['video-composition/directed/WorkPlanningFlowScene.tsx','video-composition/work-planning-flow-index.tsx','video-composition/directed/LibrarySvgArtwork.tsx','video-composition/directed/namespace-svg.ts','video-composition/directed/DirectedFonts.tsx','lib/video/work-planning-motion.ts','lib/video/study-source.ts','scripts/preview-work-planning-flow.ts','scripts/prepare-work-planning-flow-layers.py','public/studies/work-planning/working-typing-straight-sleeve.svg','public/studies/work-planning/working-to-relax-flow-wide-candidate.mp4','public/studies/work-planning/working-flow-approved-edit.json','public/studies/work-planning/flow-layers/manifest.json','public/studies/work-planning/flow-layers/rest.png','public/fonts/figtree-latin-v9.woff2','package-lock.json'];
 const hash=(f:string)=>createHash('sha256').update(readFileSync(f)).digest('hex');const fingerprint=Object.fromEntries(files.map(f=>[f,hash(f)]));
 const approved=JSON.parse(readFileSync('public/studies/work-planning/working-flow-approved-edit.json','utf8'));
 assert.equal(approved.sourceSha256,'9ad5cad79f9e9e99c0da5659cd3ae66e78e3ba870850f645cbd73bb111bc4883');
 assert.equal(hash('public/studies/work-planning/working-to-relax-flow-wide-candidate.mp4'),approved.sourceSha256);
 assert.equal(approved.fps,24);assert.deepEqual(approved.sourceFramesInclusive,[0,179]);assert.equal(approved.holdFrame,179);
 const rest=execFileSync('ffmpeg',['-v','error','-i','public/studies/work-planning/working-to-relax-flow-wide-candidate.mp4','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:1280*720*3+1024});
 assert.deepEqual(await sharp('public/studies/work-planning/flow-layers/rest.png').removeAlpha().raw().toBuffer(),rest);
 const layers=JSON.parse(readFileSync('public/studies/work-planning/flow-layers/manifest.json','utf8'));
 assert.equal(layers.scriptSha256,hash('scripts/prepare-work-planning-flow-layers.py'));
 for(const entry of layers.frames)assert.equal(hash(`public/studies/work-planning/flow-layers/${String(entry.frame).padStart(3,'0')}.png`),entry.sha256);
 assert.equal(layers.sourceSha256,hash('public/studies/work-planning/working-to-relax-flow-wide-candidate.mp4'));
 for(const prop of FLOW_PROPS){let last=0;for(let t=0;t<8;t+=1/24){const dx=workPropOffset(t,prop.start);assert.ok(dx>=last-1e-9);last=dx;}assert.ok(prop.start+1.6<props.exitStart);}
 for(let f=167;f<props.durationInFrames;f++)assert.equal(flowSceneState(f/24,props.exitStart).sourceFrame,179);
 assert.equal(flowSceneState(20,props.exitStart,true).sourceFrame,0);
 assert.equal(flowSceneState(72/24,props.exitStart).sourceFrame,72);
 assert.equal(flowSceneState(73/24,props.exitStart).sourceFrame,85);
 assert.equal(flowSceneState(166/24,props.exitStart).sourceFrame,178);
 writeFileSync(path.join(out,'props.json'),JSON.stringify(props,null,2));
 const url=await bundle({entryPoint:path.resolve('video-composition/work-planning-flow-index.tsx')});
 const browser=await openBrowser('chrome');
 const key=[0,24,36,48,72,96,120,144,179,240,480];
 const events=[Math.round(.85*24),Math.round(2.3*24),73,167,179,Math.round(props.exitStart*24),props.durationInFrames-1];
 const frames=[...new Set([...key,...events.flatMap(f=>[-2,-1,0,1,2].map(d=>f+d))])].filter(f=>f>=0&&f<props.durationInFrames).sort((a,b)=>a-b);
 try{
  const comp=await selectComposition({serveUrl:url,id:'WorkPlanningFlow',puppeteerInstance:browser,inputProps:props});
  for(const frame of (quick?key:frames))await renderStill({serveUrl:url,composition:comp,inputProps:props,puppeteerInstance:browser,frame,output:path.join(out,`frame-${frame}.png`),logLevel:'error'});
  if(!quick){
   const reduced={...props,reducedMotion:true,captions:[]};const rc=await selectComposition({serveUrl:url,id:'WorkPlanningFlow',puppeteerInstance:browser,inputProps:reduced});
   for(const frame of [0,200])await renderStill({serveUrl:url,composition:rc,inputProps:reduced,puppeteerInstance:browser,frame,output:path.join(out,`reduced-${frame}.png`),logLevel:'error'});
   assert.deepEqual(await sharp(path.join(out,'reduced-0.png')).raw().toBuffer(),await sharp(path.join(out,'reduced-200.png')).raw().toBuffer());
   await renderMedia({serveUrl:url,composition:comp,inputProps:props,puppeteerInstance:browser,codec:'h264',imageFormat:'png',crf:17,concurrency:2,outputLocation:path.join(out,'silent.mp4'),logLevel:'error'});
   execFileSync('ffmpeg',['-v','error','-y','-i',path.join(out,'silent.mp4'),'-ss',String(start),'-i',path.join(source.directory,'narration.wav'),'-map','0:v','-map','1:a','-af',`atrim=duration=${end-start+.05},apad`,'-t',String(props.durationInFrames/24),'-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',path.join(out,'work-relax.mp4')]);
   execFileSync('ffmpeg',['-v','error','-y','-i',path.join(out,'work-relax.mp4'),'-vf','scale=640:360','-c:v','libx264','-crf','18','-c:a','copy',path.join(out,'phone.mp4')]);
   for(const frame of [24,48,71,72,73,74,75,96,144,166,167,168,178,179,180,props.durationInFrames-1])execFileSync('ffmpeg',['-v','error','-y','-i',path.join(out,'work-relax.mp4'),'-vf',`select=eq(n\\,${frame})`,'-frames:v','1',path.join(out,`encoded-${frame}.png`)]);
   const last=await sharp(path.join(out,`encoded-${props.durationInFrames-1}.png`)).removeAlpha().raw().toBuffer();assert.ok(last.every(v=>v>=250),'Final swipe must leave no returning props');
  }
 }finally{await browser.close({silent:true});}
 const panels=await Promise.all(key.map(async(f,i)=>({input:await sharp(path.join(out,`frame-${f}.png`)).resize(384,216).png().toBuffer(),left:(i%3)*384,top:Math.floor(i/3)*216})));
 await sharp({create:{width:1152,height:864,channels:3,background:'white'}}).composite(panels).png().toFile(path.join(out,'contact.png'));
 assert.deepEqual(Object.fromEntries(files.map(f=>[f,hash(f)])),fingerprint);
 writeFileSync(path.join(out,'evidence.json'),JSON.stringify({fingerprint,narrationHashes:source.hashes,frames:quick?key:frames,sourceFrames:'0–72,85–179 at24fps, then held; source73–84 removed per user request, narration/camera/props unchanged',checks:['approved source SHA and edit contract','rest still equals decoded source frame0','foreground builder hash','foreground frame hashes','rightward prop monotonicity','retirement before swipe','hold frame',...quick?[]:['reduced motion equality','final white frame']],humanApproval:'Prior full scene liked; requested half-second overhead trim pending review',videoSha256:existsSync(path.join(out,'work-relax.mp4'))?hash(path.join(out,'work-relax.mp4')):null},null,2)+'\n');
 console.log(out);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
