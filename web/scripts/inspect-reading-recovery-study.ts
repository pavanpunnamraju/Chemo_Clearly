import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {readingRecoveryMotionState,readingRecoveryActualGeometry,READING_RECOVERY_ICONS} from '../lib/video/reading-recovery-motion';
import {loadRchopStudyNarration} from '../lib/video/study-source';

const sha=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const decode=(file:string)=>{
  const b=execFileSync('ffmpeg',['-v','error','-i',file,'-vn','-ac','1','-ar','8000','-f','f32le','-'],{maxBuffer:8*1024*1024});
  return Float32Array.from({length:b.length/4},(_,i)=>b.readFloatLE(i*4));
};
const correlation=(a:Float32Array,b:Float32Array,lag:number)=>{
  let xy=0,xx=0,yy=0;
  for(let i=Math.max(0,-lag);i<Math.min(a.length,b.length-lag);i++) {const x=a[i]!,y=b[i+lag]!;xy+=x*y;xx+=x*x;yy+=y*y;}
  return xy/Math.sqrt(xx*yy);
};
async function main(){
  const output=path.resolve(process.argv[2]??'out/reading-recovery-motion-study/preview-1');
  const evidence=JSON.parse(readFileSync(path.join(output,'evidence.json'),'utf8'));
  const props=JSON.parse(readFileSync(path.join(output,'props.json'),'utf8'));
  const sourceFixture=loadRchopStudyNarration('timeline');
  const timing=sourceFixture.timing;
  const entry=timing.words.filter((w:any)=>w.entryId==='timeline.days-11-21');
  const words=entry.slice(0,entry.findIndex((w:any)=>w.text==='cycle.')+1);
  const sourceStart=words[0]!.startSeconds-.5;
  assert.equal(evidence.source.text,words.map((w:any)=>w.text).join(' '));
  assert.equal(evidence.source.sourceStart,sourceStart);
  assert.equal(evidence.source.timingSha256,sourceFixture.hashes['timing.json']);
  assert.equal(evidence.source.audioSha256,sourceFixture.hashes['narration.wav']);
  assert.equal(evidence.source.speechReviewSha256,sourceFixture.hashes['speech-review.json']);
  assert.equal(evidence.durationInFrames,evidence.long?990:294);
  assert.equal(props.durationInFrames,evidence.durationInFrames);
  assert.deepEqual(props.cue,evidence.cue);
  if(evidence.long)assert.deepEqual(props.captions,[]);
  else {
    assert.equal(props.captions.map((c:any)=>c.text).join(' '),evidence.source.text);
    const boundaries=[0,5,10,15,19,25];
    for(let i=0;i<5;i++) {
      assert.ok(Math.abs(props.captions[i]!.startSeconds-(words[boundaries[i]!]!.startSeconds-sourceStart))<1e-7);
      const next=words[boundaries[i+1]!];
      assert.ok(Math.abs(props.captions[i]!.endSeconds-(next?next.startSeconds-sourceStart:evidence.duration-.1))<1e-7);
    }
  }
  const checker='scripts/inspect-reading-recovery-study.ts';
  // The renderer's broad inventory includes this independent checker, which is
  // never imported into the composition. A checker-only fix does not alter pixels.
  for(const [f,digest] of Object.entries(evidence.implementation))if(f!==checker)assert.equal(sha(path.resolve(f)),digest,`Rendered implementation changed: ${f}`);
  const source=path.resolve('../docs/references/recovery-2026-09-13/reading-book-pana.svg');
  assert.equal(sha(source),'360f1e54acc2e1d9e5730a035bb69d0ab8b20fde0de21d559b2b13fb17c86aae');
  const video=path.join(output,'reading-recovery-study.mp4');
  assert.equal(sha(video),evidence.previewSha256);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',video],{encoding:'utf8'}));
  const v=probe.streams.find((s:any)=>s.codec_type==='video');
  assert.equal(v.width,1280);assert.equal(v.height,900);assert.equal(v.avg_frame_rate,'30/1');assert.equal(Number(v.nb_frames),evidence.durationInFrames);
  assert.ok(Math.abs(Number(v.duration)-evidence.duration)<1e-5);
  assert.equal(probe.streams.filter((s:any)=>s.codec_type==='audio').length,evidence.long?0:1);
  const normal=evidence.audits.filter((a:any)=>!a.reducedMotion);
  assert.equal(normal.length,evidence.frames.length);
  for(const a of evidence.audits){
    assert.equal(a.state.seconds,a.seconds);
    assert.deepEqual(a.state,readingRecoveryMotionState(a.seconds,evidence.duration,a.reducedMotion,evidence.cue));
    assert.equal(a.state.handDegrees,0,'No page pickup arm motion');
    assert.equal(a.state.pageTurn,0);
    assert.equal(a.state.pageContactActive,false);
    assert.ok(!a.layers.some((l:any)=>l.layer==='attached-page-turn'),'Rejected page layer remains');
    const geometry=readingRecoveryActualGeometry(a.state);
    assert.equal(a.layers.find((l:any)=>l.layer==='head-unit').transform,geometry.headTransform);
    assert.equal(a.layers.find((l:any)=>l.layer==='page-hand-arm-unit').transform,geometry.handTransform);
    assert.equal(a.layers.find((l:any)=>l.layer==='stationary-bubble').transform,null);
    for(const icon of a.icons){
      assert.equal(Number(icon.opacity),1);
      const active=a.state.iconLayers.find((l:any)=>l.icon===icon.name);
      const scale=active?.scale??0;
      assert.equal(icon.transform,`translate(58.27 164.04) scale(${scale*icon.fit}) translate(${-icon.origin.x} ${-icon.origin.y})`);
      assert.equal(icon.display,scale<=0?'none':'inline');
    }
    assert.ok(a.layers.length>0,'No actual SVG layers audited');
    for(const l of a.layers)if(/icon|bubble/.test(l.layer))assert.equal(Number(l.opacity),1,`Icon/bubble opacity must stay fixed: ${l.layer}`);
  }
  if(evidence.long)assert.deepEqual(new Set(normal.flatMap((a:any)=>a.state.iconLayers.filter((l:any)=>l.scale>.5).map((l:any)=>l.icon))),new Set(READING_RECOVERY_ICONS));
  const decodedFrames=[...new Set([evidence.frames[0],...evidence.frames.filter((f:number)=>f%30===0),evidence.frames.at(-1)])] as number[];
  const pixelComparisons=[];
  for(const frame of decodedFrames){
    const filename=path.join(output,`encoded-${frame}.png`);
    execFileSync('ffmpeg',['-v','error','-y','-i',video,'-vf',`select=eq(n\\,${frame})`,'-fps_mode','passthrough','-frames:v','1',filename]);
    const [a,b]=await Promise.all([path.join(output,`frame-${frame}.png`),filename].map(f=>sharp(f).removeAlpha().raw().toBuffer()));
    assert.ok(a&&b);
    assert.equal(a.length,b.length);
    let error=0;for(let i=0;i<a.length;i++)error+=Math.abs(a[i]!-b[i]!);
    const meanAbsoluteError=error/a.length;
    assert.ok(meanAbsoluteError<6,`Encoded frame${frame} materially differs from standalone still (${meanAbsoluteError})`);
    pixelComparisons.push({frame,meanAbsoluteError});
    await sharp(filename).resize({width:667}).png().toFile(path.join(output,`encoded-phone-${frame}.png`));
  }
  const first=await sharp(path.join(output,'frame-0.png')).removeAlpha().raw().toBuffer();
  for(let i=0;i<first.length;i+=3)assert.ok(first[i]===47&&first[i+1]===156&&first[i+2]===149,'Opening must be entirely the source teal cover');
  let audio=null;
  if(!evidence.long){
    const a=decode(path.join(output,'narration-excerpt.wav')),b=decode(video);
    const offsets=Array.from({length:801},(_,i)=>({samples:i-400,correlation:correlation(a,b,i-400)}));
    const best=offsets.reduce((x,y)=>x.correlation>y.correlation?x:y);
    assert.equal(best.samples,0,'Narration clock shifted in export');assert.ok(best.correlation>.98);
    audio={bestLagSamples:best.samples,correlation:best.correlation,sampleRate:8000,searchMilliseconds:50};
  }
  const report={previewSha256:sha(video),checkerSha256:sha(path.resolve(checker)),checkerSha256AtRender:evidence.implementation[checker],checkedImplementationFiles:Object.keys(evidence.implementation).filter(f=>f!==checker).length,
    normalAudits:normal.length,reducedAudits:evidence.audits.length-normal.length,sourcePreserved:true,
    decodedFrames,pixelComparisons,openingUniformTeal:true,audio,humanVisualApproval:'pending',
    limits:'Pixel difference and telemetry checks complement visual review. They do not establish natural anatomy, page contact, expression or human approval.'};
  writeFileSync(path.join(output,'export-inspection.json'),JSON.stringify(report,null,2)+'\n');
  assert.ok(existsSync(path.join(output,'export-inspection.json')));
  console.log(JSON.stringify({output,frames:decodedFrames.length,audio}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
