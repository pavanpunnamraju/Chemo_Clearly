import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {Matrix4,Vector3} from 'three';
import {videoTrackIdentity} from '../lib/video/render-narration-audio';
import {continuousArmVesselState,projectApprovedRimPoints} from '../lib/video/continuous-arm-vessel-motion';
import {loadRchopStudyNarration} from '../lib/video/study-source';
import {CUTAWAY_INNER_RADIUS} from '../video-composition/directed/curved-vessel-geometry';

const output=path.resolve(process.argv[2]??'out/curved-arm-blood-counts-motion-study/preview-1');
const sha=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const close=(actual:number,expected:number,tolerance=1e-8,message='Values differ')=>
  assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} vs ${expected}`);

const evidence=JSON.parse(readFileSync(path.join(output,'evidence.json'),'utf8'));
const video=path.join(output,'arm-blood-cell-study.mp4');
assert.equal(sha(video),evidence.previewSha256,'Preview bytes do not match evidence');
assert.equal(evidence.cue.entrySeconds,3.2);
assert.equal(evidence.durationInFrames,402);
assert.equal(evidence.duration,13.4);
assert.equal(evidence.vesselStyle,'curved');
assert.equal(evidence.continuousZoom,true);
const currentProps=JSON.parse(readFileSync(path.join(output,'props.json'),'utf8'));
const sourceFixture=loadRchopStudyNarration('timeline');
assert.equal(evidence.source.timingSha256,sourceFixture.hashes['timing.json']);
assert.equal(evidence.source.audioSha256,sourceFixture.hashes['narration.wav']);
assert.equal(evidence.source.speechReviewSha256,sourceFixture.hashes['speech-review.json']);
assert.deepEqual(currentProps.cue,evidence.cue,'Rendered props and evidence cue differ');
assert.equal(currentProps.durationInFrames,evidence.durationInFrames,'Rendered props and evidence duration differ');
assert.equal(currentProps.vesselStyle,'curved');
assert.equal(currentProps.continuousZoom,true);

const nonReduced=evidence.audits.filter((audit:any)=>!audit.reducedMotion).sort((a:any,b:any)=>a.seconds-b.seconds);
const reduced=evidence.audits.filter((audit:any)=>audit.reducedMotion).sort((a:any,b:any)=>a.seconds-b.seconds);
assert.ok(nonReduced.length>0&&reduced.length===3,'Expected full motion audits and three reduced-motion audits');

const openingPathCounts=new Set<number>();
const persistentIds=new Set(nonReduced[0].state.cells.map((cell:any)=>cell.id));
const whiteIds=[...persistentIds].filter(id=>String(id).startsWith('curved-wbc-'));
assert.equal(whiteIds.length,11,'Curved field must preserve eleven white-cell IDs');
assert.equal([...persistentIds].filter(id=>String(id).startsWith('curved-rbc-')).length,16,'Curved field must preserve sixteen red-cell IDs');
const approvedCamera=nonReduced[0].actual.camera;
const priorOpacity=new Map<string,number>();
let minimumCellClearance=Infinity;
let vesselSignature:string|undefined;
const sceneChecks=nonReduced.concat(reduced).map((audit:any)=>{
  close(audit.actual.seconds,audit.seconds,1e-9,'Renderer clock differs from study clock');
  assert.deepEqual(audit.state.sourceBinding,{
    sourceRef:evidence.cue.sourceRef,windowLabel:evidence.cue.windowLabel,entrySeconds:evidence.cue.entrySeconds,
    focusSeconds:evidence.cue.focusSeconds,lowSeconds:evidence.cue.lowSeconds,
    precautionSeconds:evidence.cue.precautionSeconds,endSeconds:evidence.cue.endSeconds,
  },'Curved-vessel state lost its narration cue binding');
  for(const key of ['position','projectionMatrix','matrixWorldInverse'] as const){
    assert.equal(audit.actual.camera[key].length,approvedCamera[key].length,`Camera ${key} length changed`);
    audit.actual.camera[key].forEach((value:number,index:number)=>close(value,approvedCamera[key][index],1e-9,`Camera ${key} changed`));
  }
  const currentVesselSignature=JSON.stringify(audit.actual.vessels);
  vesselSignature??=currentVesselSignature;
  assert.equal(currentVesselSignature,vesselSignature,'Vessel topology changed across frames');
  assert.deepEqual(new Set(audit.actual.vessels.map((vessel:any)=>vessel.id)),
    new Set(['background-left','background-right','background-far','main-cutaway','lumen-haze']),
    'Rendered vessel set differs from the approved appearance');

  assert.equal(audit.continuousZoom,true,'Continuous zoom flag missing from renderer audit');
  assert.ok(audit.opening&&audit.continuous?.actual,'Missing continuous arm/vessel opening audit');
  const expectedContinuous=continuousArmVesselState(audit.seconds,currentProps.artwork.anchor,evidence.cue.entrySeconds,1280,650,audit.reducedMotion);
  assert.deepEqual(audit.continuous.state,expectedContinuous,'Continuous transition DOM state differs from helper');
  assert.deepEqual(audit.continuous.portalState,expectedContinuous.portal,'Portal DOM state differs from helper');
  assert.deepEqual(audit.opening.state,expectedContinuous,'Source SVG state differs from continuous transition helper');
  close(Number(audit.opening.opacity),expectedContinuous.sourceOpacity,1e-5,'Source SVG CSS opacity differs from state');
  close(Number(audit.continuous.actual.opacity),expectedContinuous.portal.opacity,1e-5,'Portal CSS opacity differs from state');
  const identity=expectedContinuous.portal.scale===1&&expectedContinuous.portal.translate.every((value:number)=>value===0);
  const transformText=String(audit.continuous.actual.transform);
  const matrix=transformText.match(/^matrix\(([^)]+)\)$/)?.[1]?.split(',').map(Number);
  if(identity)assert.ok(transformText==='none'||(matrix&&matrix.length===6),'Identity portal transform has an invalid computed value');
  else assert.ok(matrix&&matrix.length===6,'Portal content has no actual CSS matrix');
  if(matrix)[expectedContinuous.portal.scale,0,0,expectedContinuous.portal.scale,...expectedContinuous.portal.translate]
    .forEach((value,index)=>close(matrix[index]!,value,0.001,'Portal content matrix differs from state'));
  if(matrix){
    const [a,b,c,d,e,f]=matrix as [number,number,number,number,number,number];
    const [focalX,focalY]=expectedContinuous.portal.focalPoint;
    close(a*focalX+c*focalY+e,expectedContinuous.portal.center[0],0.35,'Actual crimson-rim focal point is not registered horizontally');
    close(b*focalX+d*focalY+f,expectedContinuous.portal.center[1],0.35,'Actual crimson-rim focal point is not registered vertically');
  }
  const portalBounds=audit.continuous.actual.bounds,maskBounds=audit.continuous.actual.maskBounds;
  assert.ok(portalBounds&&maskBounds,'Portal content or mask bounds missing');
  const renderedBounds=audit.rootBounds;
  close(renderedBounds.x,expectedContinuous.portal.translate[0],0.02,'Live-vessel x anchor differs from state');
  close(renderedBounds.y,100+expectedContinuous.portal.translate[1],0.02,'Live-vessel y anchor differs from state');
  close(renderedBounds.width,1280*expectedContinuous.portal.scale,0.02,'Live-vessel rendered width differs from state');
  close(renderedBounds.height,650*expectedContinuous.portal.scale,0.02,'Live-vessel rendered height differs from state');
  close(renderedBounds.x+renderedBounds.width/2,expectedContinuous.portal.translate[0]+640*expectedContinuous.portal.scale,0.02,'Live-vessel canvas center is detached');
  close(renderedBounds.y+renderedBounds.height/2,100+expectedContinuous.portal.translate[1]+325*expectedContinuous.portal.scale,0.02,'Live-vessel canvas center is detached');
  // Remotion parks the portal node near y=-1e6 while composing. Its child's cached
  // rect keeps that offset, so validate local wrapper geometry and the freshly read
  // on-screen Three root independently.
  close(maskBounds.x,0,0.02,'Portal mask left its artwork container horizontally');
  close(maskBounds.width,1280,0.02,'Portal mask width changed');close(maskBounds.height,650,0.02,'Portal mask height changed');
  close(portalBounds.y-maskBounds.y,expectedContinuous.portal.translate[1],0.08,'Portal local y anchor differs from state');
  const maskText=String(audit.continuous.actual.maskImage);
  if(identity)assert.equal(maskText,'none','Completed portal mask persists in computed style');
  else assert.ok(maskText.startsWith('url(')&&maskText.includes('continuous-arm-live-rim-mask'),'Projected live-rim SVG mask is absent from computed style');
  if(expectedContinuous.portal.forearmClipActive)
    assert.ok(String(audit.continuous.actual.clipPath).startsWith('url('),'Forearm portal clip is absent during the skin-bound reveal');
  else assert.equal(audit.continuous.actual.clipPath,'none','Forearm portal clip persists after the full-scene reveal');
  close(portalBounds.x,renderedBounds.x,0.15,'Live vessel is detached horizontally from portal content');
  close(portalBounds.width,renderedBounds.width,0.15,'Live vessel width differs from portal content');
  close(portalBounds.height,renderedBounds.height,0.15,'Live vessel height differs from portal content');
  assert.deepEqual(audit.opening.viewBox,nonReduced[0].opening.viewBox,`Source viewBox changed within the current render at ${audit.seconds}s`);
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
    expected.position.forEach((value:number,index:number)=>close(actual.position[index],value,1e-8,`${expected.id} position mismatch`));
    actual.position.forEach((value:number,index:number)=>close(actual.matrixWorld[12+index],value,1e-8,`${expected.id} matrix translation mismatch`));
    actual.actualScale.forEach((value:number)=>close(value,expected.radius,1e-8,`${expected.id} scale mismatch`));
    const renderedOpacity=expected.opacity*audit.state.fieldOpacity;
    close(actual.stateOpacity,renderedOpacity,1e-9,`${expected.id} rendered state opacity mismatch`);
    assert.ok(actual.materialOpacities.length>0,`${expected.id} has no audited materials`);
    actual.materialOpacities.forEach((opacity:number)=>close(opacity,renderedOpacity,1e-9,`${expected.id} material opacity mismatch`));
    assert.equal(actual.visible,renderedOpacity>0.001,`${expected.id} visibility changes before its full fade`);
    if(expected.kind==='white'&&!audit.reducedMotion){
      const prior=priorOpacity.get(expected.id)??1;
      assert.ok(expected.opacity<=prior+1e-9,`${expected.id} opacity rises during count decline`);
      priorOpacity.set(expected.id,expected.opacity);
    }
    assert.ok(Math.hypot(expected.normal,expected.binormal)+expected.radius<CUTAWAY_INNER_RADIUS,
      `${expected.id} leaves the curved-vessel lumen`);
    const point=new Vector3(...actual.position as [number,number,number]).applyMatrix4(projection);
    const inFrustum=Math.abs(point.x)<1&&Math.abs(point.y)<1&&Math.abs(point.z)<1;
    if(inFrustum&&expected.kind==='red')redCentersInFrustum++;
    if(expected.kind==='white'&&renderedOpacity>0.001){
      activeWhiteCells++;
      if(inFrustum)whiteCentersInFrustum++;
      if(!audit.reducedMotion&&audit.seconds>=evidence.cue.entrySeconds&&audit.seconds<evidence.cue.focusSeconds){
        assert.ok(inFrustum,`${expected.id} leaves the full-count frame before its fade begins`);
      }
      if(audit.reducedMotion||audit.seconds>=evidence.cue.lowSeconds){
        assert.ok(inFrustum,`${expected.id} survivor center leaves the low-count frame`);
        const cameraPoint=new Vector3(...actual.position as [number,number,number]).applyMatrix4(viewOnly);
        const depth=-cameraPoint.z;
        const xRadius=expected.radius*projectionOnly.elements[0]/depth;
        const yRadius=expected.radius*projectionOnly.elements[5]/depth;
        assert.ok(Math.abs(point.x)+xRadius<1&&Math.abs(point.y)+yRadius<1,
          `${expected.id} survivor is clipped during the low-count hold`);
      }
    }
  }
  const active=audit.state.cells.filter((cell:any)=>cell.opacity*audit.state.fieldOpacity>0.001);
  for(let first=0;first<active.length;first++)for(let second=first+1;second<active.length;second++){
    const a=active[first],b=active[second];
    const clearance=Math.hypot(...a.position.map((value:number,index:number)=>value-b.position[index]))-a.radius-b.radius;
    minimumCellClearance=Math.min(minimumCellClearance,clearance);
    assert.ok(clearance>=-1e-8,`${a.id} intersects ${b.id} in 3D (${clearance})`);
  }
  assert.ok(redCentersInFrustum>=6,'Red-cell field falls below six visible centers');
  if(audit.reducedMotion||audit.seconds>=evidence.cue.lowSeconds)assert.equal(activeWhiteCells,3,'Low-count hold must retain three white cells');
  return {seconds:audit.seconds,reducedMotion:audit.reducedMotion,openingOpacity:expectedContinuous.sourceOpacity,
    portalProgress:expectedContinuous.portal.progress,portalScale:expectedContinuous.portal.scale,
    fieldOpacity:audit.state.fieldOpacity,redCentersInFrustum,activeWhiteCells,whiteCentersInFrustum};
});
assert.deepEqual([...openingPathCounts],[55],'Source character path count changed during camera move');

for(let index=1;index<nonReduced.length;index++){
  const prior=nonReduced[index-1],current=nonReduced[index];
  assert.ok(current.continuous.state.sourceOpacity<=prior.continuous.state.sourceOpacity+1e-9,'Source character opacity rises');
  assert.ok(current.continuous.state.portal.opacity>=prior.continuous.state.portal.opacity-1e-9,'Live-vessel portal opacity reverses');
  assert.ok(current.continuous.state.portal.progress>=prior.continuous.state.portal.progress-1e-9,'Live-vessel portal zoom reverses');
  assert.ok(current.state.fieldOpacity>=prior.state.fieldOpacity-1e-9,'Microscopic field opacity falls');
}
const entry=nonReduced.find((audit:any)=>Math.abs(audit.seconds-evidence.cue.entrySeconds)<1e-8);
assert.ok(entry,'Missing exact 3.2-second vessel-entry audit');
assert.equal(entry.state.cells.filter((cell:any)=>cell.kind==='white'&&cell.opacity>0.001).length,11);
assert.equal(entry.continuous.state.sourceOpacity,0);
assert.equal(entry.continuous.state.portal.progress,1);
assert.equal(entry.continuous.state.portal.scale,1);
assert.deepEqual(entry.continuous.state.portal.translate,[0,0]);
assert.equal(entry.state.fieldOpacity,1);
const low=nonReduced.find((audit:any)=>audit.seconds>=evidence.cue.lowSeconds);
assert.ok(low,'Missing low-count audit');
assert.equal(low.state.cells.filter((cell:any)=>cell.kind==='white'&&cell.opacity>0.001).length,3);
assert.equal(low.state.cells.filter((cell:any)=>cell.kind==='white'&&cell.opacity===0).length,8);

for(const frame of [54,60,66]){
  const audit=nonReduced.find((candidate:any)=>Math.abs(candidate.seconds-frame/30)<1e-9);
  assert.ok(audit,`Missing thin-rim transition audit at frame ${frame}`);
  assert.deepEqual(audit.continuous.state.portal.focalPoint,[1280*0.328,325],`Frame ${frame} is not registered to the approved crimson rim`);
  assert.deepEqual(audit.continuous.state.portal.maskRadius,[4,28],`Frame ${frame} does not retain the thin vertical reveal`);
  assert.equal(audit.continuous.state.portal.maskMode,'projected-live-rim',`Frame ${frame} does not use the live 3D rim mask`);
  assert.equal(audit.continuous.state.portal.ellipseOpacity,0,`Frame ${frame} exposes the wide ellipse before the rim-line hold ends`);
  assert.equal(audit.continuous.state.portal.forearmClipActive,true,`Frame ${frame} thin reveal is not clipped to the forearm`);
}

const final=nonReduced.at(-1);
const streamMotionChecks=[];
for(let index=1;index<nonReduced.length;index++){
  const previous=nonReduced[index-1],current=nonReduced[index];
  if(previous.seconds<evidence.cue.entrySeconds)continue;
  const elapsed=current.seconds-previous.seconds;
  const redSpeed=current.state.cells.filter((cell:any)=>cell.kind==='red')
    .map((cell:any)=>(cell.t-previous.state.cells.find((prior:any)=>prior.id===cell.id).t)/elapsed)
    .reduce((sum:number,speed:number)=>sum+speed,0)/16;
  for(const cell of current.state.cells.filter((cell:any)=>cell.kind==='white'&&cell.opacity>0.001)){
    const prior=previous.state.cells.find((candidate:any)=>candidate.id===cell.id);
    const streamSpeed=(cell.t-prior.t)/elapsed;
    const actual=current.actual.cells.find((candidate:any)=>candidate.id===cell.id);
    const priorActual=previous.actual.cells.find((candidate:any)=>candidate.id===cell.id);
    const worldSpeed=Math.hypot(...actual.position.map((value:number,axis:number)=>value-priorActual.position[axis]))/elapsed;
    assert.ok(streamSpeed/redSpeed>=0.8&&streamSpeed/redSpeed<=1.25,`${cell.id} does not travel with the red-cell stream`);
    assert.ok(worldSpeed>0.2,`${cell.id} moves too little during the stream/fade`);
    streamMotionChecks.push({seconds:current.seconds,id:cell.id,speedRatio:streamSpeed/redSpeed,worldSpeed,opacity:cell.opacity});
  }
}
const survivorIds=low.state.cells.filter((cell:any)=>cell.kind==='white'&&cell.opacity===1).map((cell:any)=>cell.id);
assert.equal(survivorIds.length,3);
for(const id of survivorIds){
  const startCell=entry.state.cells.find((cell:any)=>cell.id===id);
  const finalCell=final.state.cells.find((cell:any)=>cell.id===id);
  assert.ok(Math.hypot(...finalCell.position.map((value:number,index:number)=>value-startCell.position[index]))>.02,`${id} survivor appears pinned`);
}
for(const audit of reduced){
  assert.equal(audit.continuous.state.sourceOpacity,0);
  assert.equal(audit.continuous.state.portal.progress,1);
  assert.equal(audit.continuous.state.portal.scale,1);
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

for(const required of ['lib/video/curved-vessel-motion.ts','video-composition/directed/CurvedVesselArtwork.tsx',
  'video-composition/directed/curved-vessel-geometry.ts','video-composition/arm-blood-cell-study-index.tsx',
  'video-composition/directed/ContinuousArmVesselOpening.tsx','lib/video/continuous-arm-vessel-motion.ts',
  'scripts/preview-arm-blood-cell-study.ts','public/studies/arm-microscope/character.json',
  '../docs/references/arm-zoom-2026-09-12/contemplating-pana.svg','node_modules/three/build/three.module.js',
  'node_modules/@remotion/three/dist/esm/index.mjs'])assert.ok(evidence.implementation[required],`Missing implementation fingerprint: ${required}`);
assert.ok(Object.keys(evidence.implementation).some((file)=>file.startsWith('node_modules/@react-three/fiber/')&&/\.(?:cjs|mjs|js)$/.test(file)),
  'React Three Fiber runtime bytes are absent from the render fingerprint');
for(const [file,digest] of Object.entries(evidence.implementation) as [string,string][])
  assert.equal(sha(file),digest,`${file} changed after render`);
const character=JSON.parse(readFileSync('public/studies/arm-microscope/character.json','utf8'));
assert.equal(character.sourceSha256,sha('../docs/references/arm-zoom-2026-09-12/contemplating-pana.svg'),
  'Character extraction is not bound to the approved source SVG bytes');

for(const frame of [0,54,60,66,72,78,84,90,95,96,140,180,222,300,401])execFileSync('ffmpeg',['-v','error','-i',video,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1','-y',path.join(output,`encoded-${frame}.png`)]);
for(const frame of [54,66,96,222])await sharp(path.join(output,`encoded-${frame}.png`)).resize({width:667}).png().toFile(path.join(output,`encoded-phone-${frame}.png`));
const approvedRimPoints=projectApprovedRimPoints(1280,650);
const thinRimPixelChecks=[];
for(const frame of [54,60,66]){
  const audit=nonReduced.find((candidate:any)=>Math.abs(candidate.seconds-frame/30)<1e-9);
  assert.ok(audit,`Missing rendered thin-rim frame ${frame}`);
  const inspectRim=async(file:string)=>{
    const {data,info}=await sharp(file).raw().toBuffer({resolveWithObject:true});
    const pixels=new Set<string>();let sampleHits=0;
    for(const point of approvedRimPoints){
      const centerX=point.x*audit.continuous.state.portal.scale+audit.continuous.state.portal.translate[0];
      const centerY=point.y*audit.continuous.state.portal.scale+audit.continuous.state.portal.translate[1]+100;
      let hit=false;
      for(let y=Math.floor(centerY-3);y<=Math.ceil(centerY+3);y++)for(let x=Math.floor(centerX-3);x<=Math.ceil(centerX+3);x++){
        if((x-centerX)**2+(y-centerY)**2>10||x<0||y<0||x>=info.width||y>=info.height)continue;
        pixels.add(`${x},${y}`);
        const offset=(y*info.width+x)*info.channels,r=data[offset]!,g=data[offset+1]!,b=data[offset+2]!;
        if(r>70&&g<55&&b<65&&r>g*1.7&&r>b*1.3)hit=true;
      }
      if(hit)sampleHits++;
    }
    let crimsonPixels=0,bluePixels=0;
    for(const key of pixels){
      const [x,y]=key.split(',').map(Number) as [number,number];
      const offset=(y*info.width+x)*info.channels,r=data[offset]!,g=data[offset+1]!,b=data[offset+2]!;
      if(r>70&&g<55&&b<65&&r>g*1.7&&r>b*1.3)crimsonPixels++;
      if(b>75&&b>r*1.3&&b>g*1.1)bluePixels++;
    }
    assert.ok(sampleHits>=36,`Frame ${frame} crimson rim is visibly interrupted (${sampleHits}/49 samples)`);
    assert.ok(crimsonPixels>=200&&crimsonPixels>bluePixels*4,
      `Frame ${frame} reads as blue/dark instead of a crimson rim (${crimsonPixels} crimson, ${bluePixels} blue)`);
    return {sampleHits,crimsonPixels,bluePixels};
  };
  thinRimPixelChecks.push({frame,still:await inspectRim(path.join(output,`frame-${frame}.png`)),encoded:await inspectRim(path.join(output,`encoded-${frame}.png`))});
}
const encodedSurvivorChecks=[];
for(const frame of [222,300,401]){
  const audit=nonReduced.find((candidate:any)=>Math.abs(candidate.seconds-frame/30)<1e-9);
  assert.ok(audit,`Missing still audit for encoded frame ${frame}`);
  const projection=new Matrix4().fromArray(audit.actual.camera.projectionMatrix)
    .multiply(new Matrix4().fromArray(audit.actual.camera.matrixWorldInverse));
  const projectionOnly=new Matrix4().fromArray(audit.actual.camera.projectionMatrix);
  const viewOnly=new Matrix4().fromArray(audit.actual.camera.matrixWorldInverse);
  for(const cell of audit.state.cells.filter((candidate:any)=>candidate.kind==='white'&&candidate.opacity>0.001)){
    const point=new Vector3(...cell.position as [number,number,number]).applyMatrix4(projection);
    const cameraPoint=new Vector3(...cell.position as [number,number,number]).applyMatrix4(viewOnly);
    const depth=-cameraPoint.z;
    const xRadius=Math.ceil(cell.radius*projectionOnly.elements[0]/depth*640*1.35);
    const yRadius=Math.ceil(cell.radius*projectionOnly.elements[5]/depth*325*1.35);
    const centerX=Math.round((point.x+1)*640),centerY=Math.round(100+(1-point.y)*325);
    const left=Math.max(0,centerX-xRadius),top=Math.max(0,centerY-yRadius);
    const width=Math.min(1280-left,xRadius*2+1),height=Math.min(900-top,yRadius*2+1);
    const stillPixels=await sharp(path.join(output,`frame-${frame}.png`)).extract({left,top,width,height}).removeAlpha().raw().toBuffer();
    const encodedPixels=await sharp(path.join(output,`encoded-${frame}.png`)).extract({left,top,width,height}).removeAlpha().raw().toBuffer();
    let absoluteDifference=0,largeDifferenceChannels=0;
    for(let index=0;index<stillPixels.length;index++){
      const difference=Math.abs(stillPixels[index]!-encodedPixels[index]!);
      absoluteDifference+=difference;if(difference>20)largeDifferenceChannels++;
    }
    const meanAbsoluteError=absoluteDifference/stillPixels.length;
    const largeDifferenceFraction=largeDifferenceChannels/stillPixels.length;
    assert.ok(meanAbsoluteError<6&&largeDifferenceFraction<0.15,
      `${cell.id} membrane differs between audited still and encoded frame ${frame} (MAE ${meanAbsoluteError}, >20 fraction ${largeDifferenceFraction})`);
    encodedSurvivorChecks.push({frame,id:cell.id,meanAbsoluteError,largeDifferenceFraction});
  }
}
const encodedZero=await sharp(path.join(output,'encoded-0.png')).removeAlpha().raw().toBuffer({resolveWithObject:true});
for(const [x,y] of [[2,102],[1277,102],[2,747],[1277,747]] as const){
  const offset=(y*encodedZero.info.width+x)*encodedZero.info.channels;
  const rgb=[encodedZero.data[offset]!,encodedZero.data[offset+1]!,encodedZero.data[offset+2]!];
  assert.ok(rgb.every(channel=>channel>225),`Dark wedge remains at rounded artwork corner ${x},${y}: ${rgb.join(',')}`);
}
const reducedPixels=await sharp(path.join(output,'reduced-0.png')).extract({left:0,top:100,width:1280,height:650}).raw().toBuffer();
for(const frame of [222,401])assert.ok(reducedPixels.equals(await sharp(path.join(output,`reduced-${frame}.png`)).extract({left:0,top:100,width:1280,height:650}).raw().toBuffer()),'Reduced artwork pixels change');

const result={previewSha256:sha(video),checkerSha256:sha('scripts/inspect-curved-arm-blood-cell-study.ts'),sceneChecks,streamMotionChecks,waveformWindows,
  minimumCellClearance,thinRimPixelChecks,encodedSurvivorChecks,videoTrackIdentity:after,reducedArtworkPixelsStatic:true,humanMotionApproval:'pending'};
writeFileSync(path.join(output,'export-inspection.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
