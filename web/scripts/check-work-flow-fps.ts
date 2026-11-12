import {bundle} from '@remotion/bundler';
import {openBrowser,renderStill,selectComposition} from '@remotion/renderer';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';
async function main(){
 const out=path.resolve('out/flow-fps-check');mkdirSync(out,{recursive:true});
 const props={durationInFrames:600,exitStart:100,reducedMotion:false,captions:[]};
 const serveUrl=await bundle({entryPoint:path.resolve('video-composition/work-planning-flow-index.tsx')});
 const browser=await openBrowser('chrome');const results=[];
 try{const comp=await selectComposition({serveUrl,id:'WorkPlanningFlow',inputProps:props,puppeteerInstance:browser});
 for(const seconds of [0,1,3,4,7,10]){
 const buffers=[];
 for(const fps of [24,30]){const output=path.join(out,`${seconds}s-${fps}fps.png`);await renderStill({serveUrl,composition:{...comp,fps},inputProps:props,puppeteerInstance:browser,frame:seconds*fps,output,logLevel:'error'});buffers.push(await sharp(output).raw().toBuffer());}
 assert.deepEqual(buffers[0],buffers[1],`Work source/overlay differs at ${seconds}s between24/30fps`);results.push({seconds,exactPixelsEqual:true});
 }
 }finally{await browser.close({silent:true});}
 writeFileSync(path.join(out,'evidence.json'),JSON.stringify(results,null,2));console.log(results);
}main().catch(e=>{console.error(e);process.exitCode=1;});
