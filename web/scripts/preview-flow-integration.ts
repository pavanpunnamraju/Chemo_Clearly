import {config} from 'dotenv';
import {directTransitions} from '../lib/video/transition-director';
import type {TransitionScene} from '../lib/video/transition-plan';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,renderMedia,renderStill,selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import {loadRchopStudyNarration} from '../lib/video/study-source';
import type {FlowTestProps} from '../video-composition/flow-integration-index';
async function main(){
 const run=process.argv.find(a=>a.startsWith('--run='))?.slice(6)??'review-1';assert.match(run,/^[\w-]+$/);
 const out=path.resolve('out/flow-integration',run);assert.ok(!existsSync(out),'Choose a fresh run');mkdirSync(out,{recursive:true});
 const source=loadRchopStudyNarration('daily_life');
 const ids=['daily_life','daily_life.exercise','daily_life.driving','daily_life.intimacy'];
 const groups=ids.map(id=>source.timing.words.filter(w=>w.entryId===id));groups.forEach(w=>assert.ok(w.length));
 const start=groups[0]![0]!.startSeconds-.4;const speechEnd=groups[3]!.at(-1)!.endSeconds;
 const boundaries=groups.map((w,i)=>i===0?0:Math.round((w[0]!.startSeconds-start-.2)*30));
 const durationInFrames=Math.ceil((speechEnd-start+4)*30);boundaries.push(durationInFrames);
 const assets=['work','stretch','car','support'] as const;
 const props:FlowTestProps={durationInFrames,shots:assets.map((asset,i)=>({asset,from:boundaries[i]!,duration:boundaries[i+1]!-boundaries[i]!})),captions:[],reducedMotion:false};
 for(const words of groups)for(let i=0;i<words.length;i+=7){const g=words.slice(i,i+7);props.captions.push({text:g.map(w=>w.text).join(' '),startMs:(g[0]!.startSeconds-start)*1000,endMs:((words[i+7]?.startSeconds??g.at(-1)!.endSeconds)-start)*1000,timestampMs:null,confidence:null});}
 if(process.argv.includes('--transitions')){
 config({path:'.env.local',quiet:true});
 const palettes=[['#FFFFFF','#F0F0F0'],['#FFFFFF','#F9D0C7'],['#FFFFFF','#FFD9D0'],['#FFFFFF','#FFB7A5']];
 const scenes:TransitionScene[]=props.shots.map((s,i)=>({id:s.asset,startSeconds:s.from/30,endSeconds:(s.from+s.duration)/30,summary:groups[i]!.map(w=>w.text).join(' '),palette:palettes[i]!,safety:false,layered:s.asset==='work'}));
 props.transitionPlan=await directTransitions(scenes);
 writeFileSync(path.join(out,'transition-scenes.json'),JSON.stringify(scenes,null,2));
 writeFileSync(path.join(out,'transition-plan.json'),JSON.stringify(props.transitionPlan,null,2));
 console.log('Creative director:',props.transitionPlan.boundaries.map(p=>`${p.fromId}→${p.toId}: ${p.type}`).join('; '));
 }
 const hash=(f:string)=>createHash('sha256').update(readFileSync(f)).digest('hex');
 const files=['lib/video/transition-plan.ts','lib/video/transition-director.ts','video-composition/directed/BoundaryTransitionStage.tsx','video-composition/flow-integration-index.tsx','video-composition/directed/FlowClipScene.tsx','lib/video/flow-clip-motion.ts','video-composition/directed/WorkPlanningFlowScene.tsx','video-composition/directed/LibrarySvgArtwork.tsx','video-composition/directed/namespace-svg.ts','video-composition/directed/DirectedFonts.tsx','lib/video/work-planning-motion.ts','lib/video/study-source.ts','scripts/preview-flow-integration.ts','package-lock.json','../docs/design/approved-animations.json','public/fonts/figtree-latin-v9.woff2','public/studies/reading-recovery/twemoji/2764.svg','public/studies/work-planning/working-typing-straight-sleeve.svg','public/studies/work-planning/working-to-relax-flow-wide-candidate.mp4','public/studies/patient-stretch/stretch-flow-loop.mp4','public/studies/patient-car/car-flow-approved.mp4','public/studies/context-support/support-flow-approved.mp4',...readdirSync('public/studies/work-planning/flow-layers').map(n=>'public/studies/work-planning/flow-layers/'+n)];
 const fingerprint=Object.fromEntries(files.map(f=>[f,hash(f)]));
 const approvals=JSON.parse(readFileSync('../docs/design/approved-animations.json','utf8')).records;
 for(const [id,file] of [['patient-car-flow-source','public/studies/patient-car/car-flow-approved.mp4'],['context-support-flow-source','public/studies/context-support/support-flow-approved.mp4']] as const)assert.equal(hash(file),approvals.find((r:any)=>r.id===id).approval.sha256);
 assert.equal(hash('public/studies/patient-stretch/stretch-flow-loop.mp4'),approvals.find((r:any)=>r.id==='patient-stretch-flow-loop').runtimeSha256);
 const workApproval=approvals.find((r:any)=>r.approval?.asset==='care-work-plan-flow-final-scene');assert.equal(hash('public/studies/work-planning/working-to-relax-flow-wide-candidate.mp4'),workApproval.approval.sourceSha256);
 writeFileSync(path.join(out,'props.json'),JSON.stringify(props,null,2));
 const url=await bundle({entryPoint:path.resolve('video-composition/flow-integration-index.tsx')});const browser=await openBrowser('chrome');const began=Date.now();
 try{
 const comp=await selectComposition({serveUrl:url,id:'FlowIntegration',puppeteerInstance:browser,inputProps:props});
 const reduced={...props,reducedMotion:true,captions:[]};const rc=await selectComposition({serveUrl:url,id:'FlowIntegration',puppeteerInstance:browser,inputProps:reduced});
 for(const s of props.shots){for(const [label,f] of [['a',s.from],['b',s.from+Math.min(180,s.duration-1)]] as const)await renderStill({serveUrl:url,composition:rc,inputProps:reduced,puppeteerInstance:browser,frame:f,output:path.join(out,`reduced-${s.asset}-${label}.png`),logLevel:'error'});assert.deepEqual(await sharp(path.join(out,`reduced-${s.asset}-a.png`)).raw().toBuffer(),await sharp(path.join(out,`reduced-${s.asset}-b.png`)).raw().toBuffer());}
 await renderMedia({serveUrl:url,composition:comp,inputProps:props,puppeteerInstance:browser,codec:'h264',imageFormat:'png',crf:17,concurrency:2,outputLocation:path.join(out,'silent.mp4'),logLevel:'error',onProgress:({progress})=>{if(Math.floor(progress*100)%10===0)process.stdout.write(` ${Math.floor(progress*100)}%`);}});
 }finally{await browser.close({silent:true});}
 execFileSync('ffmpeg',['-v','error','-y','-i',path.join(out,'silent.mp4'),'-ss',String(start),'-i',path.join(source.directory,'narration.wav'),'-map','0:v','-map','1:a','-af',`atrim=duration=${speechEnd-start+.05},apad`,'-t',String(durationInFrames/30),'-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',path.join(out,'four-scenes.mp4')]);
 execFileSync('ffmpeg',['-v','error','-y','-i',path.join(out,'four-scenes.mp4'),'-vf','scale=640:360','-c:v','libx264','-crf','18','-c:a','copy',path.join(out,'phone.mp4')]);
 const support=props.shots[3]!;execFileSync('ffmpeg',['-v','error','-y','-i',path.join(out,'four-scenes.mp4'),'-ss',String(support.from/30),'-t',String(support.duration/30),'-c:v','libx264','-crf','17','-c:a','aac',path.join(out,'hug-hearts.mp4')]);
 execFileSync('ffmpeg',['-v','error','-i',path.join(out,'four-scenes.mp4'),'-f','null','-']);
 const frames=[...new Set(props.shots.flatMap(s=>[s.from,s.from+60,s.from+120,s.from+180,s.from+s.duration-1]))];
 for(const f of frames)execFileSync('ffmpeg',['-v','error','-y','-i',path.join(out,'four-scenes.mp4'),'-vf',`select=eq(n\\,${f})`,'-frames:v','1',path.join(out,`encoded-${f}.png`)]);
 const panels=await Promise.all(frames.map(async(f,i)=>({input:await sharp(path.join(out,`encoded-${f}.png`)).resize(384,216).png().toBuffer(),left:i%4*384,top:Math.floor(i/4)*216})));
 await sharp({create:{width:1536,height:Math.ceil(frames.length/4)*216,channels:3,background:'white'}}).composite(panels).png().toFile(path.join(out,'contact.png'));
 assert.deepEqual(Object.fromEntries(files.map(f=>[f,hash(f)])),fingerprint);
 writeFileSync(path.join(out,'evidence.json'),JSON.stringify({fingerprint,narrationHashes:source.hashes,sourceAudioStart:start,sourceSpeechEnd:speechEnd,renderAndExportSeconds:(Date.now()-began)/1000,checks:['source approval hashes','unchanged dependencies','reduced motion pixel equality for each shot','full decode'],frames,videoSha256:hash(path.join(out,'four-scenes.mp4')),humanApproval:'Pending hearts and integrated test review',scope:'Historical reviewed narration excerpts; not final short-v1 script or clinical approval. No new TTS.'},null,2)+'\n');console.log('\n'+out);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
