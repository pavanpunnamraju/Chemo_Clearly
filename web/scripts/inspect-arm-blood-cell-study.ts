import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {Matrix4,Vector3} from 'three';
import {videoTrackIdentity} from '../lib/video/render-narration-audio';

const output=path.resolve(process.argv[2]??'out/arm-blood-counts-motion-study/preview-1');
const sha=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const close=(actual:number,expected:number,tolerance=1e-8,message='Values differ')=>
  assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} vs ${expected}`);

const evidence=JSON.parse(readFileSync(path.join(output,'evidence.json'),'utf8'));
const video=path.join(output,'arm-blood-cell-study.mp4');
assert.equal(sha(video),evidence.previewSha256,'Preview bytes do not match evidence');
assert.equal(evidence.cue.entrySeconds,3.2);
assert.equal(evidence.durationInFrames,402);
assert.equal(evidence.duration,13.4);

const nonReduced=evidence.audits.filter((audit:any)=>!audit.reducedMotion).sort((a:any,b:any)=>a.seconds-b.seconds);
const reduced=evidence.audits.filter((audit:any)=>audit.reducedMotion).sort((a:any,b:any)=>a.seconds-b.seconds);
assert.ok(nonReduced.length>0&&reduced.length===3,'Expected full motion audits and three reduced-motion audits');

const openingPathCounts=new Set<number>();
const persistentIds=new Set(nonReduced[0].state.cells.map((cell:any)=>cell.id));
const whiteIds=[...persistentIds].filter(id=>String(id).startsWith('wbc-v-'));
assert.equal(whiteIds.length,11,'Vertical field must preserve eleven white-cell IDs');
const priorOpacity=new Map<string,number>();
const sceneChecks=nonReduced.concat(reduced).map((audit:any)=>{
  close(audit.actual.seconds,audit.seconds,1e-9,'Renderer clock differs from study clock');
  close(audit.actual.focusDepth,audit.state.focusDepth,1e-9,'Rendered focus depth differs from state');
  assert.equal(audit.state.variant,'vertical');

  assert.ok(audit.opening,'Missing native-arm opening audit');
  close(Number(audit.opening.opacity),audit.opening.state.openingOpacity,1e-5,'SVG opening CSS opacity differs from state');
  openingPathCounts.add(audit.opening.sourcePathCount);
  const [a,b,c,d]=audit.opening.sourceMatrix as [number,number,number,number,number,number];
  const xScale=Math.hypot(a,b),yScale=Math.hypot(c,d);
  close(xScale,yScale,1e-6,'Source character CTM is non-uniform');
  close(a*c+b*d,0,1e-5*Math.max(1,xScale*yScale),'Source character CTM contains shear');
  assert.ok(a*d-b*c>0,'Source character CTM flips anatomy');

  const actualById=new Map(audit.actual.cells.map((cell:any)=>[cell.id,cell]));
  assert.deepEqual(new Set(audit.state.cells.map((cell:any)=>cell.id)),persistentIds,'State cell IDs changed');
  assert.deepEqual(new Set(actualById.keys()),persistentIds,'Rendered cell IDs changed');
  const projection=new Matrix4().fromArray(audit.actual.camera.projectionMatrix)
    .multiply(new Matrix4().fromArray(audit.actual.camera.matrixWorldInverse));
  const projectionOnly=new Matrix4().fromArray(audit.actual.camera.projectionMatrix);
  const viewOnly=new Matrix4().fromArray(audit.actual.camera.matrixWorldInverse);
  let redCentersInFrustum=0;
  let activeWhiteCells=0;
  let whiteCentersInFrustum=0;
  for(const expected of audit.state.cells){
    const actual:any=actualById.get(expected.id);assert.ok(actual,`Missing rendered cell ${expected.id}`);
    expected.position.forEach((value:number,index:number)=>close(actual.matrixPosition[index],value,1e-8,`${expected.id} position mismatch`));
    actual.matrixPosition.forEach((value:number,index:number)=>close(actual.matrixWorld[12+index],value,1e-8,`${expected.id} matrix translation mismatch`));
    actual.actualScale.forEach((value:number)=>close(value,expected.radius,1e-8,`${expected.id} scale mismatch`));
    close(actual.stateOpacity,expected.opacity,1e-9,`${expected.id} state opacity mismatch`);
    assert.ok(actual.materialOpacities.length>0,`${expected.id} has no audited materials`);
    actual.materialOpacities.forEach((opacity:number)=>close(opacity,expected.opacity,1e-9,`${expected.id} material opacity mismatch`));
    assert.equal(actual.visible,expected.opacity>0.001,`${expected.id} visibility changes before its full fade`);
    if(expected.kind==='white'&&!audit.reducedMotion){
      const prior=priorOpacity.get(expected.id)??1;
      assert.ok(expected.opacity<=prior+1e-9,`${expected.id} opacity rises during count decline`);
      priorOpacity.set(expected.id,expected.opacity);
    }
    const point=new Vector3(...actual.matrixPosition as [number,number,number]).applyMatrix4(projection);
    const inFrustum=Math.abs(point.x)<1&&Math.abs(point.y)<1&&Math.abs(point.z)<1;
    if(inFrustum&&expected.kind==='red')redCentersInFrustum++;
    if(expected.kind==='white'&&expected.opacity>0.001){
      activeWhiteCells++;
      if(inFrustum)whiteCentersInFrustum++;
      if(audit.reducedMotion||audit.seconds>=evidence.cue.lowSeconds){
        assert.ok(inFrustum,`${expected.id} survivor center leaves the low-count frame`);
        const cameraPoint=new Vector3(...actual.matrixPosition as [number,number,number]).applyMatrix4(viewOnly);
        const depth=-cameraPoint.z;
        const xRadius=expected.radius*projectionOnly.elements[0]/depth;
        const yRadius=expected.radius*projectionOnly.elements[5]/depth;
        assert.ok(Math.abs(point.x)+xRadius<1&&Math.abs(point.y)+yRadius<1,
          `${expected.id} survivor is clipped during the low-count hold`);
      }
    }
  }
  assert.ok(redCentersInFrustum>=6,'Red-cell field falls below six visible centers');
  if(audit.reducedMotion||audit.seconds>=evidence.cue.lowSeconds)assert.equal(activeWhiteCells,3,'Low-count hold must retain three white cells');
  return {seconds:audit.seconds,reducedMotion:audit.reducedMotion,openingOpacity:audit.opening.state.openingOpacity,
    fieldOpacity:audit.state.fieldOpacity,redCentersInFrustum,activeWhiteCells,whiteCentersInFrustum};
});
assert.deepEqual([...openingPathCounts],[55],'Source character path count changed during camera move');

for(let index=1;index<nonReduced.length;index++){
  const prior=nonReduced[index-1],current=nonReduced[index];
  assert.ok(current.opening.state.openingOpacity<=prior.opening.state.openingOpacity+1e-9,'Arm opening opacity rises');
  assert.ok(current.state.fieldOpacity>=prior.state.fieldOpacity-1e-9,'Microscopic field opacity falls');
  assert.ok(current.opening.state.vesselReveal>=prior.opening.state.vesselReveal-1e-9,'Native vessel reveal reverses');
}
const entry=nonReduced.find((audit:any)=>Math.abs(audit.seconds-evidence.cue.entrySeconds)<1e-8);
assert.ok(entry,'Missing exact 3.2-second vessel-entry audit');
assert.equal(entry.state.cells.filter((cell:any)=>cell.kind==='white'&&cell.opacity>0.001).length,11);
assert.equal(entry.opening.state.openingOpacity,0);
assert.equal(entry.state.fieldOpacity,1);
const low=nonReduced.find((audit:any)=>audit.seconds>=evidence.cue.lowSeconds);
assert.ok(low,'Missing low-count audit');
assert.equal(low.state.cells.filter((cell:any)=>cell.kind==='white'&&cell.opacity>0.001).length,3);
assert.equal(low.state.cells.filter((cell:any)=>cell.kind==='white'&&cell.opacity===0).length,8);

const final=nonReduced.at(-1);
const survivorIds=low.state.cells.filter((cell:any)=>cell.kind==='white'&&cell.opacity===1).map((cell:any)=>cell.id);
assert.equal(survivorIds.length,3);
for(const id of survivorIds){
  const startCell=entry.state.cells.find((cell:any)=>cell.id===id);
  const finalCell=final.state.cells.find((cell:any)=>cell.id===id);
  assert.ok(finalCell.position[1]-startCell.position[1]>.2,`${id} survivor appears pinned`);
}
for(const audit of reduced){
  assert.equal(audit.opening.state.openingOpacity,0);
  assert.equal(audit.state.cells.filter((cell:any)=>cell.kind==='white'&&cell.opacity>0.001).length,3);
}
assert.deepEqual(reduced.map((audit:any)=>audit.state),[reduced[0].state,reduced[0].state,reduced[0].state],
  'Reduced microscopic state changes across the source clock');

const decode=(file:string)=>{const bytes=execFileSync('ffmpeg',['-v','error','-i',file,'-vn','-ac','1','-ar','8000','-f','f32le','-'],{maxBuffer:16*1024*1024});return Float32Array.from({length:bytes.length/4},(_,index)=>bytes.readFloatLE(index*4));};
const source=decode(path.join(output,'narration-excerpt.wav')),encoded=decode(video);
const waveformWindows=[.5,3.5,6.5,9.5].map(fromSeconds=>{
  const from=Math.round(fromSeconds*8000),to=from+20000;
  const correlation=(lag:number)=>{let aa=0,bb=0,ab=0;for(let index=from;index<to;index++){const a=source[index]!,b=encoded[index+lag]!;aa+=a*a;bb+=b*b;ab+=a*b;}return ab/Math.sqrt(aa*bb);};
  let best={lag:0,correlation:-1};for(let lag=-640;lag<=640;lag++){const value=correlation(lag);if(value>best.correlation)best={lag,correlation:value};}
  assert.equal(best.lag,0);assert.ok(best.correlation>.98);return{fromSeconds,toSeconds:to/8000,bestOffsetSeconds:0,correlation:best.correlation};
});
const before=await videoTrackIdentity(path.join(output,'silent.mp4')),after=await videoTrackIdentity(video);assert.deepEqual(after,before);

for(const file of ['public/studies/arm-microscope/character.json','../docs/references/arm-zoom-2026-09-12/contemplating-pana.svg'])
  assert.equal(sha(file),evidence.implementation[file],`${file} changed after render`);
const character=JSON.parse(readFileSync('public/studies/arm-microscope/character.json','utf8'));
assert.equal(character.sourceSha256,sha('../docs/references/arm-zoom-2026-09-12/contemplating-pana.svg'),
  'Character extraction is not bound to the approved source SVG bytes');

for(const frame of [0,54,84,96,180,222,360])execFileSync('ffmpeg',['-v','error','-i',video,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1','-y',path.join(output,`encoded-${frame}.png`)]);
for(const frame of [96,222])await sharp(path.join(output,`encoded-${frame}.png`)).resize({width:667}).png().toFile(path.join(output,`encoded-phone-${frame}.png`));
const encodedZero=await sharp(path.join(output,'encoded-0.png')).removeAlpha().raw().toBuffer({resolveWithObject:true});
for(const [x,y] of [[2,102],[1277,102],[2,747],[1277,747]] as const){
  const offset=(y*encodedZero.info.width+x)*encodedZero.info.channels;
  const rgb=[encodedZero.data[offset]!,encodedZero.data[offset+1]!,encodedZero.data[offset+2]!];
  assert.ok(rgb.every(channel=>channel>225),`Dark wedge remains at rounded artwork corner ${x},${y}: ${rgb.join(',')}`);
}
const reducedPixels=await sharp(path.join(output,'reduced-0.png')).extract({left:0,top:100,width:1280,height:650}).raw().toBuffer();
for(const frame of [222,401])assert.ok(reducedPixels.equals(await sharp(path.join(output,`reduced-${frame}.png`)).extract({left:0,top:100,width:1280,height:650}).raw().toBuffer()),'Reduced artwork pixels change');

const result={previewSha256:sha(video),checkerSha256:sha('scripts/inspect-arm-blood-cell-study.ts'),sceneChecks,waveformWindows,
  videoTrackIdentity:after,reducedArtworkPixelsStatic:true,humanVisualApproval:'pending'};
writeFileSync(path.join(output,'export-inspection.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
