import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import sharp from 'sharp';
import {loadRchopStudyNarration} from '../lib/video/study-source';
import {muxNarrationAudio} from '../lib/video/render-narration-audio';
import {DEFAULT_WORK_PLANNING_CUE} from '../lib/video/work-planning-motion';
import type {WorkPlanningStudyProps} from '../video-composition/work-planning-study-index';
async function main(){
  const proof=process.argv.includes('--proof'),stills=process.argv.includes('--stills-only');
  if(!proof){
    if(!process.argv.includes('--static')) throw new Error('Work animation is paused for static-pose review. Use --static for the baked working asset; the previous full-motion review is superseded.');
    const staticRun=process.argv.find(a=>a.startsWith('--run='))?.slice(6)??'active-static';assert.match(staticRun,/^[a-zA-Z0-9_-]+$/);
    const output=path.resolve('out/work-planning-review',staticRun);assert.ok(!existsSync(output),'Use a fresh --run directory');mkdirSync(output,{recursive:true});
    const serveUrl=await bundle({entryPoint:path.resolve('video-composition/work-planning-study-index.tsx')});
    const browser=await openBrowser('chrome');
    const props:WorkPlanningStudyProps={proof:false,reducedMotion:false,qa:false,durationInFrames:100,cue:DEFAULT_WORK_PLANNING_CUE,captions:[]};
    try{
      const composition=await selectComposition({serveUrl,id:'WorkPlanningStudy',puppeteerInstance:browser,inputProps:props});
      for(const frame of [0,90])await renderStill({serveUrl,composition,inputProps:props,puppeteerInstance:browser,frame,output:path.join(output,`renderer-${frame}.png`),logLevel:'error'});
      assert.deepEqual(await sharp(path.join(output,'renderer-0.png')).raw().toBuffer(),await sharp(path.join(output,'renderer-90.png')).raw().toBuffer(),'Static human must not change representation over time');
    }finally{await browser.close({silent:true});}
    console.log(output);return;
  }

  const run=process.argv.find(a=>a.startsWith('--run='))?.slice(6)??(proof?'source-leg-proof':'draft-1');assert.match(run,/^[a-zA-Z0-9_-]+$/);
  const output=path.resolve('out/work-planning-review',run);mkdirSync(output,{recursive:true});
  const files=['public/studies/work-planning/working-pana.svg','video-composition/directed/WorkPlanningArtwork.tsx','video-composition/directed/WorkPlanningUpperBody.ts','video-composition/directed/LibrarySvgArtwork.tsx','video-composition/directed/namespace-svg.ts','video-composition/directed/DirectedFonts.tsx','video-composition/work-planning-study-index.tsx','lib/video/work-planning-motion.ts','lib/video/study-source.ts','lib/video/render-narration-audio.ts','scripts/preview-work-planning-study.ts','public/fonts/figtree-latin-v9.woff2','package.json','package-lock.json'];
  const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
  const fingerprint=Object.fromEntries(files.map(p=>[p,hash(p)]));
  const props:WorkPlanningStudyProps={proof,reducedMotion:false,qa:false,durationInFrames:proof?138:687,cue:DEFAULT_WORK_PLANNING_CUE,captions:[]};
  let audio:string|undefined;
  if(!proof){
    const source=loadRchopStudyNarration('daily_life');const words=source.timing.words.filter(w=>w.entryId==='daily_life');
    assert.ok(words.length===66);const start=words[0]!.startSeconds-.4,speechEnd=words.at(-1)!.endSeconds;
    const clipEnd=speechEnd+.05;
    props.durationInFrames=Math.ceil((speechEnd-start+1.35)*30-1e-7);
    props.cue={...DEFAULT_WORK_PLANNING_CUE,exitStart:speechEnd-start+.1,exitEnd:props.durationInFrames/30-.15};
    for(let i=0;i<words.length;i+=8){const group=words.slice(i,i+8);props.captions.push({text:group.map(w=>w.text).join(' '),startSeconds:group[0]!.startSeconds-start,endSeconds:words[i+8]?.startSeconds!==undefined?words[i+8]!.startSeconds-start:group.at(-1)!.endSeconds-start});}
    audio=path.join(output,'narration.wav');execFileSync('ffmpeg',['-v','error','-y','-i',path.join(source.directory,'narration.wav'),'-af',`atrim=start=${start}:end=${clipEnd},asetpts=PTS-STARTPTS,apad,atrim=duration=${props.durationInFrames/30}`,'-c:a','pcm_s16le',audio]);
  }
  writeFileSync(path.join(output,'props.json'),JSON.stringify(props,null,2)+'\n');
  const requested=process.argv.find(a=>a.startsWith('--frames='))?.slice(9).split(',').map(Number);
  const events=proof?[0,17,18,19,20,39,59,60,61,77,78,79,119,120,121,137]:[0,58,59,60,61,62,69,70,71,75,81,82,83,90,105,110,120,124,125,126,127,128,135,145,160,181,182,183,191,192,193,213,270,450,Math.round(props.cue.exitStart*30)-1,Math.round(props.cue.exitStart*30),Math.round(props.cue.exitStart*30)+1,props.durationInFrames-15,props.durationInFrames-1];
  const frames=requested??events;const audits:unknown[]=[];
  const capture=(log:{text:string})=>{const p='WORK_QA:',i=log.text.indexOf(p);if(i>=0)audits.push(JSON.parse(log.text.slice(i+p.length)));};
  const serveUrl=await bundle({entryPoint:path.resolve('video-composition/work-planning-study-index.tsx')});
  const browser=await openBrowser('chrome');
  try{
    const audited={...props,qa:true};const composition=await selectComposition({serveUrl,id:'WorkPlanningStudy',puppeteerInstance:browser,inputProps:audited});
    for(const frame of frames){await renderStill({serveUrl,composition,inputProps:audited,puppeteerInstance:browser,frame,output:path.join(output,`frame-${frame}.png`),logLevel:'error',onBrowserLog:capture});console.log('Work frame',frame);}
    const reducedProps={...props,reducedMotion:true,qa:true,captions:[]};const reduced=await selectComposition({serveUrl,id:'WorkPlanningStudy',puppeteerInstance:browser,inputProps:reducedProps});
    await renderStill({serveUrl,composition:reduced,puppeteerInstance:browser,inputProps:reducedProps,frame:60,output:path.join(output,'reduced.png'),logLevel:'error',onBrowserLog:capture});
    if(!stills){const composition=await selectComposition({serveUrl,id:'WorkPlanningStudy',puppeteerInstance:browser,inputProps:props});
      await renderMedia({serveUrl,composition,inputProps:props,puppeteerInstance:browser,codec:'h264',crf:17,concurrency:2,outputLocation:path.join(output,'silent.mp4'),logLevel:'error'});
    }
  }finally{await browser.close({silent:true});}
  const selected=frames.filter((_,i)=>i%Math.max(1,Math.floor(frames.length/8))===0).slice(0,8);
  const panelWidth=proof?180:480,panelHeight=proof?280:338;
  const panels=await Promise.all(selected.map(async(f,i)=>({input:await sharp(path.join(output,`frame-${f}.png`)).resize(panelWidth,panelHeight).png().toBuffer(),left:(i%4)*panelWidth,top:Math.floor(i/4)*panelHeight})));
  await sharp({create:{width:panelWidth*4,height:panelHeight*Math.ceil(selected.length/4),channels:4,background:'white'}}).composite(panels).png().toFile(path.join(output,'contact.png'));
  let mux:unknown=null;const video=path.join(output,proof?'leg-motion.mp4':'work-relax.mp4');
  if(!stills){if(audio)mux=await muxNarrationAudio(path.join(output,'silent.mp4'),readFileSync(audio),video);else execFileSync('ffmpeg',['-v','error','-y','-i',path.join(output,'silent.mp4'),'-c','copy',video]);
    for(const frame of proof?[60]:[90,145,192,270])execFileSync('ffmpeg',['-v','error','-y','-i',video,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1',path.join(output,`encoded-${frame}.png`)]);
  }
  assert.deepEqual(Object.fromEntries(files.map(p=>[p,hash(p)])),fingerprint,'Implementation changed during render');
  const checks:{name:string;passed:boolean;detail:string}[]=[];
  if(!proof){
    const records=audits as {state:{exit:number};chairUnchanged:boolean;cuff:{x:number;y:number};shoeCuff:{x:number;y:number};actualBounds:{head:{x:number;y:number;width:number;height:number}};upper:{boneLengths:Record<string,number>};props:{visibility:string}[]}[];
    const check=(name:string,passed:boolean,detail:string)=>checks.push({name,passed,detail});
    check('stationary-source-chair',records.every(a=>a.chairUnchanged),'Original chair node bytes stay fixed; camera/scene transforms are shared.');
    const cuffError=Math.max(...records.map(a=>Math.hypot(a.cuff.x-a.shoeCuff.x,a.cuff.y-a.shoeCuff.y)));
    check('shoe-cuff-attachment',cuffError<.01,`Maximum source-space cuff discrepancy ${cuffError}.`);
    const lengths=records[0]?.upper.boneLengths;
    const lengthError=Math.max(...records.flatMap(a=>Object.entries(a.upper.boneLengths).map(([key,value])=>Math.abs(value-(lengths?.[key]??value)))));
    check('fixed-arm-segment-lengths',lengthError<.01,`Maximum source-space segment-length change ${lengthError}.`);
    check('head-frame-clearance',records.filter(a=>a.state.exit===0).every(a=>{const h=a.actualBounds.head;return h.x>=0&&h.y>=0&&h.x+h.width<=1280&&h.y+h.height<=800;}),'Actual transformed DOM head bounds remain within the stage above captions, before the intentional exit.');
    check('departed-props-stay-retired',records.filter(a=>a.state.exit>0).every(a=>a.props.every(p=>p.visibility==='hidden')),'Every departing prop is hidden offstage before the final scene swipe.');
    if(frames.includes(0))check('reduced-motion-rest',Buffer.compare(await sharp(path.join(output,'frame-0.png')).raw().toBuffer(),await sharp(path.join(output,'reduced.png')).raw().toBuffer())===0,'Reduced-motion artwork with captions omitted equals the full source-rest frame.');
  }
  writeFileSync(path.join(output,'evidence.json'),JSON.stringify({scope:proof?'Original source leg proof':'Full work-relax study, human approval pending',fingerprint,frames,audits,checks,mux,videoSha256:existsSync(video)&&!stills?hash(video):null},null,2)+'\n');
  assert.ok(checks.every(c=>c.passed),JSON.stringify(checks.filter(c=>!c.passed)));
  console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
