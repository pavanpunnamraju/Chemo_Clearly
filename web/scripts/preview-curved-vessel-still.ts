import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser,renderStill,selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import {Matrix4,Vector3} from 'three';

const sha=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
async function main(){
  const run=process.argv.find(a=>a.startsWith('--run='))?.slice(6)??'draft-1';
  assert.match(run,/^[a-z0-9-]+$/);
  const output=path.resolve('out/curved-vessel-appearance',run);
  assert.ok(!existsSync(path.join(output,'evidence.json')),'Use a new run name');
  mkdirSync(output,{recursive:true});
  const files=[
    'video-composition/curved-vessel-still-index.tsx',
    'video-composition/directed/CurvedVesselArtwork.tsx',
    'video-composition/directed/curved-vessel-geometry.ts',
    'video-composition/directed/blood-cell-geometry.ts','lib/video/curved-vessel-motion.ts',
    'scripts/preview-curved-vessel-still.ts','package.json','package-lock.json',
  ];
  for(const directory of ['node_modules/three','node_modules/@react-three/fiber','node_modules/@remotion/three']){
    for(const file of readdirSync(directory,{recursive:true}).map(String).filter(f=>/\.(?:cjs|mjs|js)$/.test(f)))files.push(path.join(directory,file));
  }
  const implementation=Object.fromEntries(files.map(f=>[f,sha(f)]));
  const serveUrl=await bundle({entryPoint:path.resolve('video-composition/curved-vessel-still-index.tsx')});
  const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'}});
  const audits:unknown[]=[];
  try{
    const inputProps={qaMode:true};
    const composition=await selectComposition({serveUrl,id:'CurvedVesselAppearance',inputProps,puppeteerInstance:browser});
    await renderStill({serveUrl,composition,inputProps,puppeteerInstance:browser,frame:0,
      output:path.join(output,'vessel.png'),timeoutInMilliseconds:90000,logLevel:'error',
      onBrowserLog:log=>{const key='CURVED_VESSEL_QA:';const i=log.text.indexOf(key);if(i>=0)audits.push(JSON.parse(log.text.slice(i+key.length)));},
    });
  }finally{await browser.close({silent:true});}
  await sharp(path.join(output,'vessel.png')).resize({width:667}).png().toFile(path.join(output,'phone.png'));
  const {data,info}=await sharp(path.join(output,'vessel.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,1280);assert.equal(info.height,650);
  let transparentPixels=0;
  for(let i=3;i<data.length;i+=4)if(data[i]!==255)transparentPixels++;
  assert.equal(transparentPixels,0,'Opaque still contains transparent export holes');
  assert.ok(audits.length>0,'Missing actual renderer audit');
  const actual=audits.at(-1) as {cells:{id:string;kind:string;position:[number,number,number];radius:number}[];camera:{matrixWorldInverse:number[];projectionMatrix:number[]}};
  const cameraInverse=new Matrix4().fromArray(actual.camera.matrixWorldInverse);
  let minimumCellClearance=Infinity;
  for(let i=0;i<actual.cells.length;i++){
    const cell=actual.cells[i]!;
    const point=new Vector3(...cell.position);
    assert.ok(cell.position.every(Number.isFinite)&&cell.radius>0);
    for(const other of actual.cells.slice(i+1)){
      const clearance=point.distanceTo(new Vector3(...other.position))-1.04*(cell.radius+other.radius);
      minimumCellClearance=Math.min(minimumCellClearance,clearance);
      assert.ok(clearance>0,`${cell.id}/${other.id} bounding volumes intersect`);
    }
    if(cell.kind==='white'){
      const cameraPoint=point.clone().applyMatrix4(cameraInverse),radius=cell.radius*1.04;
      assert.ok(Math.abs(cameraPoint.x)+radius<(-cameraPoint.z-radius)/actual.camera.projectionMatrix[0]!,`${cell.id} clips horizontal frame`);
      assert.ok(Math.abs(cameraPoint.y)+radius<(-cameraPoint.z-radius)/actual.camera.projectionMatrix[5]!,`${cell.id} clips vertical frame`);
    }
  }
  assert.deepEqual(Object.fromEntries(files.map(f=>[f,sha(f)])),implementation,'Render inputs changed while rendering');
  writeFileSync(path.join(output,'evidence.json'),JSON.stringify({
    scope:'Native vessel appearance still only. User-approved camera/palette direction, requested distant background vessels. No new animation, audio or pipeline integration.',
    previewSha256:sha(path.join(output,'vessel.png')),phoneSha256:sha(path.join(output,'phone.png')),
    implementation,audits,transparentPixels,minimumCellClearance,whiteCellFraming:'pass',
    humanAppearanceApproval:'pending',humanMotionApproval:'pending',
  },null,2));
  console.log(output);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
