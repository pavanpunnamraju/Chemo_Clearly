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
import type {ReadingRecoveryStudyProps} from '../video-composition/reading-recovery-study-index';
import {readingRecoveryIconPopSampleTimes} from '../lib/video/reading-recovery-motion';

const sha = (f:string) => createHash('sha256').update(readFileSync(f)).digest('hex');
async function main() {
  const long = process.argv.includes('--long');
  const stillsOnly = process.argv.includes('--stills-only');
  const run = process.argv.find(a => a.startsWith('--run='))?.slice(6) ?? 'draft-1';
  assert.match(run,/^[a-zA-Z0-9_-]+$/);
  const output = path.resolve('out/reading-recovery-motion-study',run);
  assert.ok(!existsSync(path.join(output,'evidence.json')),'Use a new run name');
  mkdirSync(output,{recursive:true});
  const source = loadRchopStudyNarration('timeline');
  const timing = source.timing;
  const entryWords = timing.words.filter(w => w.entryId === 'timeline.days-11-21');
  const endIndex = entryWords.findIndex(w => w.text === 'cycle.');
  assert.ok(endIndex > 0,'Recovery sentence boundary missing');
  const words = entryWords.slice(0,endIndex + 1);
  const text = words.map(w => w.text).join(' ');
  assert.match(text,/gradually start to feel more like themselves/);
  assert.match(text,/blood counts recover, leading up to the next cycle\./);
  const sourceStart = words[0]!.startSeconds - .5;
  const sourceDurationFrames = Math.ceil((words.at(-1)!.endSeconds + .4 - sourceStart)*30 - 1e-7);
  const durationInFrames = long ? 990 : sourceDurationFrames;
  const duration = durationInFrames / 30;
  const captions: ReadingRecoveryStudyProps['captions'] = [];
  if(!long) {
    const boundaries = [0,5,10,15,19,25];
    for(let i=0;i<boundaries.length-1;i++) {
      const group = words.slice(boundaries[i],boundaries[i+1]);
      captions.push({text:group.map(w=>w.text).join(' '),startSeconds:group[0]!.startSeconds-sourceStart,
        endSeconds:words[boundaries[i+1]!] ? words[boundaries[i+1]!]!.startSeconds-sourceStart : duration-.1});
    }
  }
  const cue = {pageStartSeconds:2,pageEndSeconds:4.6,comfortStartSeconds:5.2,comfortEndSeconds:7.5,returnEndSeconds:9};
  const inputProps: ReadingRecoveryStudyProps = {durationInFrames,captions,label:long?'Reading — extended motion study':'Days 11–21',cue};
  writeFileSync(path.join(output,'props.json'),JSON.stringify(inputProps,null,2)+'\n');
  const audio = path.join(output,'narration-excerpt.wav');
  if(!long) execFileSync('ffmpeg',['-v','error','-y','-i',path.join(source.directory,'narration.wav'),'-af',`atrim=start=${sourceStart}:end=${sourceStart+duration},asetpts=PTS-STARTPTS`,'-c:a','pcm_s16le',audio]);
  const fixed = ['package.json','package-lock.json','video-composition/reading-recovery-study-index.tsx',
    'video-composition/directed/DirectedFonts.tsx','public/fonts/figtree-latin-v9.woff2',
    'scripts/preview-reading-recovery-study.ts','lib/video/render-narration-audio.ts','lib/video/study-source.ts',
    'video-composition/directed/LibrarySvgArtwork.tsx','video-composition/directed/namespace-svg.ts',
    '../docs/references/recovery-2026-09-13/reading-book-pana.svg'];
  for(const directory of ['node_modules/remotion/dist','node_modules/@remotion/renderer/dist','node_modules/react','node_modules/react-dom']) {
    for(const f of readdirSync(directory,{recursive:true}).map(String)) if(/\.(?:js|mjs|cjs)$/.test(f))fixed.push(path.join(directory,f));
  }
  for(const directory of ['lib/video','video-composition/directed','scripts','public/studies/reading-recovery']) {
    if(!existsSync(directory)) continue;
    for(const f of readdirSync(directory,{recursive:true}).map(String)) {
      if(directory.endsWith('reading-recovery') || /reading.?recovery/i.test(f)) {
        if(/\.(?:ts|tsx|json|svg)$/.test(f)) fixed.push(path.join(directory,f));
      }
    }
  }
  const files = [...new Set(fixed)];
  const implementation = Object.fromEntries(files.map(f => [f,sha(f)]));
  const suppliedFrames = process.argv.find(a=>a.startsWith('--frames='))?.slice(9).split(',').map(Number);
  const eventSeconds = [0,.033,.4,.433,.45,.466,.5,.533,.767,.8,.833,1,1.5,1.9,2,2.1,2.7,3,3.6,4,4.5,4.6,4.7,5.1,5.2,5.3,6,7.4,7.5,7.6,8.5,8.9,9,9.1];
  const frames = suppliedFrames ?? [...new Set([...eventSeconds.map(t=>Math.round(t*30)),...readingRecoveryIconPopSampleTimes(duration,cue).map(t=>Math.round(t*30)),durationInFrames-1,
    ...(long ? Array.from({length:20},(_,i)=>Math.round((i*1.5+2)*30)) : [])])].filter(f=>f>=0&&f<durationInFrames).sort((a,b)=>a-b);
  assert.ok(frames.every(f=>Number.isInteger(f)&&f>=0&&f<durationInFrames));
  const serveUrl = await bundle({entryPoint:path.resolve('video-composition/reading-recovery-study-index.tsx')});
  const browser = await openBrowser('chrome');
  const audits:any[]=[];
  const capture = (log:{text:string}) => {const prefix='READING_QA:';const i=log.text.indexOf(prefix);if(i>=0)audits.push(JSON.parse(log.text.slice(i+prefix.length)));};
  let mux:unknown = null;
  try {
    const props = {...inputProps,qaMode:true};
    const composition = await selectComposition({serveUrl,id:'ReadingRecoveryStudy',inputProps:props,puppeteerInstance:browser});
    for(const frame of frames) {
      await renderStill({serveUrl,composition,inputProps:props,puppeteerInstance:browser,frame,output:path.join(output,`frame-${frame}.png`),onBrowserLog:capture,logLevel:'error',timeoutInMilliseconds:60000});
      console.log('Rendered reading frame',frame);
    }
    const reducedProps = {...props,reducedMotion:true};
    const reduced = await selectComposition({serveUrl,id:'ReadingRecoveryStudy',inputProps:reducedProps,puppeteerInstance:browser});
    const reducedFrames=[0,90,180,durationInFrames-1].filter(f=>f<durationInFrames);
    for(const frame of reducedFrames) await renderStill({serveUrl,composition:reduced,inputProps:reducedProps,puppeteerInstance:browser,frame,output:path.join(output,`reduced-${frame}.png`),onBrowserLog:capture,logLevel:'error'});
    assert.equal(audits.length,frames.length+reducedFrames.length,'Missing/duplicate frame audit');
    for(const a of audits) for(const t of a.text) assert.ok(t.bounds.x>=40&&t.bounds.x+t.bounds.width<=1240&&t.bounds.y>=20&&t.bounds.y+t.bounds.height<=875,'Text outside safe area');
    // Captions are narration-clock content and may differ; only the artwork must be still.
    const reducedPixels = await Promise.all(reducedFrames.map(frame=>sharp(path.join(output,`reduced-${frame}.png`)).extract({left:0,top:100,width:1280,height:650}).raw().toBuffer()));
    assert.ok(reducedPixels.every(p=>p.equals(reducedPixels[0]!)),'Reduced-motion artwork changes');
    if(!stillsOnly) {
      const props={...inputProps,qaMode:false};
      const composition=await selectComposition({serveUrl,id:'ReadingRecoveryStudy',inputProps:props,puppeteerInstance:browser});
      await renderMedia({serveUrl,composition,inputProps:props,puppeteerInstance:browser,codec:'h264',muted:true,concurrency:2,crf:18,outputLocation:path.join(output,'silent.mp4'),timeoutInMilliseconds:60000});
      if(!long) mux=await muxNarrationAudio(path.join(output,'silent.mp4'),readFileSync(audio),path.join(output,'reading-recovery-study.mp4'));
      else execFileSync('ffmpeg',['-v','error','-y','-i',path.join(output,'silent.mp4'),'-c','copy',path.join(output,'reading-recovery-study.mp4')]);
      execFileSync('ffmpeg',['-v','error','-xerror','-i',path.join(output,'reading-recovery-study.mp4'),'-f','null','-']);
    }
  } finally {await browser.close({silent:true});}
  const selected = [frames[0]!, frames[Math.floor(frames.length/3)]!,frames[Math.floor(2*frames.length/3)]!,frames.at(-1)!];
  const panels = await Promise.all(selected.map(async(f,i)=>({input:await sharp(path.join(output,`frame-${f}.png`)).resize(640,450).png().toBuffer(),left:i%2*640,top:Math.floor(i/2)*450})));
  await sharp({create:{width:1280,height:900,channels:4,background:'#F4F7F6'}}).composite(panels).png().toFile(path.join(output,'contact-sheet.png'));
  for(const f of selected) await sharp(path.join(output,`frame-${f}.png`)).resize({width:667}).png().toFile(path.join(output,`phone-${f}.png`));
  assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(f)])),implementation,'Implementation changed during render');
  const video = path.join(output,'reading-recovery-study.mp4');
  const probe = existsSync(video)?JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',video],{encoding:'utf8'})):null;
  if(probe) {const v=probe.streams.find((s:any)=>s.codec_type==='video');assert.equal(Number(v.nb_frames),durationInFrames);assert.equal(v.width,1280);assert.equal(v.height,900);assert.equal(v.avg_frame_rate,'30/1');assert.ok(Math.abs(Number(v.duration)-duration)<1e-5);assert.equal(probe.streams.filter((s:any)=>s.codec_type==='audio').length,long?0:1);for(const s of probe.streams)assert.equal(Number(s.start_time),0);}
  writeFileSync(path.join(output,'evidence.json'),JSON.stringify({source:{entry:'timeline.days-11-21',text,sourceStart,sourceEnd:sourceStart+sourceDurationFrames/30,
    timingSha256:source.hashes['timing.json'],audioSha256:source.hashes['narration.wav'],speechReviewSha256:source.hashes['speech-review.json']},
    long,duration,durationInFrames,cue,frames,audits,implementation,mux,probe,previewSha256:existsSync(video)?sha(video):null,
    excerptSha256:!long?sha(audio):null,humanVisualApproval:'pending',scope:long?'Silent duration and 10-icon reuse study.':'Recovery-sentence motion study using a verified narration fixture; other source-entry instructions remain in the source material and are outside this excerpt. No full-v1 integration.'},null,2)+'\n');
  console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
