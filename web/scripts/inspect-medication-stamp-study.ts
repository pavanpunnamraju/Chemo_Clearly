import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {videoTrackIdentity} from '../lib/video/render-narration-audio';
import {medicationStampMotion} from '../lib/video/medication-stamp-motion';
const output=path.resolve(process.argv[2]??'out/medication-plan-motion-study/preview-1');
const sha=(f:string)=>createHash('sha256').update(readFileSync(f)).digest('hex');
const evidence=JSON.parse(readFileSync(path.join(output,'evidence.json'),'utf8'));
const video=path.join(output,'medication-stamp.mp4');assert.equal(sha(video),evidence.previewSha256);
const decode=(f:string)=>{const b=execFileSync('ffmpeg',['-v','error','-i',f,'-vn','-ac','1','-ar','8000','-f','f32le','-'],{maxBuffer:16*1024*1024});return Float32Array.from({length:b.length/4},(_,i)=>b.readFloatLE(i*4));};
const source=decode(path.join(output,'narration-excerpt.wav')),encoded=decode(video);
const waveformWindows=[.5,5,9,13].map(fromSeconds=>{
 const from=Math.round(fromSeconds*8000),to=from+24000;
 const correlation=(lag:number)=>{let aa=0,bb=0,ab=0;for(let i=from;i<to;i++){const a=source[i]!,b=encoded[i+lag]!;aa+=a*a;bb+=b*b;ab+=a*b;}return ab/Math.sqrt(aa*bb);};
 let best={lag:0,correlation:-1};for(let lag=-640;lag<=640;lag++){const value=correlation(lag);if(value>best.correlation)best={lag,correlation:value};}
 assert.equal(best.lag,0,'Narration shifted from cue/caption clock');assert.ok(best.correlation>.98);return{fromSeconds,toSeconds:to/8000,bestOffsetSeconds:best.lag/8000,correlation:best.correlation};
});
const before=await videoTrackIdentity(path.join(output,'silent.mp4')),after=await videoTrackIdentity(video);assert.deepEqual(after,before);
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<.001,`Actual DOM matrix ${a} differs from ${b}`);
for(const audit of evidence.audits){
 const pose=medicationStampMotion(audit.seconds,evidence.cue,audit.reducedMotion);
 const layer=(key:string)=>audit.layers.find((l:any)=>l.attrs[key]!==undefined);
 if(!audit.reducedMotion){
  const root=audit.root.matrix,h=layer('data-stamp-hardware').matrix,g=layer('data-stamp-grip').matrix,pad=layer('data-stamp-pad').matrix,body=layer('data-stamp-body').matrix;
  close(h[0],root[0]*pose.assemblyScale);close(h[3],root[3]*pose.assemblyScale);
  close(h[4],root[4]+root[0]*(pose.assemblyX+345.5*(1-pose.assemblyScale)));
  close(h[5],root[5]+root[3]*(pose.assemblyY+249*(1-pose.assemblyScale)));
  for(let i=0;i<6;i++){close(pad[i],h[i]);close(body[i],h[i]);}
  close(g[4]-h[4],-5*pose.compression*h[0]);close(g[5]-h[5],5*pose.compression*h[3]);
  assert.deepEqual(layer('data-stamp-hand').matrix,g);assert.deepEqual(layer('data-stamp-forearm').matrix,g);
  const anatomy=audit.layers.filter((l:any)=>l.attrs['data-stamp-anatomy']);
  for(const part of anatomy){close(part.matrix[0],g[0]);close(part.matrix[3],g[3]*1.15);close(part.matrix[5],g[5]-178*.15*g[3]);}
  if(anatomy.length){
   const crease=layer('data-stamp-thumb-crease'),hand=anatomy.find((l:any)=>l.attrs['data-stamp-anatomy']==='hand');
   assert.ok(crease.pathLength>8&&crease.pathLength<10,'Thumb crease should be a short lower arc');
   close(crease.matrix[0]/hand.matrix[0],Math.cos(Math.PI/18));close(crease.matrix[1]/hand.matrix[3],Math.sin(Math.PI/18));
  }
  if(pose.phase==='contact')assert.ok(layer('data-stamp-forearm').bounds.x+layer('data-stamp-forearm').bounds.width>1280,'Forearm ends inside frame');
 }
 assert.ok(layer('data-stamp-shadow').ancestors.some((p:any)=>p.receiver==='paper'&&p.overflow==='hidden'));
}
const packets=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-read_intervals','%+#2','-show_packets','-of','json',video],{encoding:'utf8'})).packets;
assert.ok(Number(packets[0].pts_time)<=0);assert.ok(Number(packets[1].pts_time)===0||Number(packets[0].pts_time)===0);
assert.ok(encoded.length>=source.length&&encoded.length-source.length<480,'Unexpected audio tail');
for(const frame of [153,229,259,283]){
 execFileSync('ffmpeg',['-v','error','-i',video,'-vf',`select=eq(n\\,${frame})`,'-frames:v','1','-y',path.join(output,`encoded-${frame}.png`)]);
}
await sharp(path.join(output,'encoded-229.png')).extract({left:680,top:190,width:520,height:310}).resize({width:1040}).png().toFile(path.join(output,'encoded-contact-detail.png'));
await sharp(path.join(output,'encoded-283.png')).resize({width:667}).png().toFile(path.join(output,'phone-imprint.png'));
const result={previewSha256:sha(video),checkerSha256:sha('scripts/inspect-medication-stamp-study.ts'),waveformWindows,actualDomTransformsAndClippingVerified:true,videoTrackIdentity:after,audioPackets:packets,humanVisualApproval:'pending'};
writeFileSync(path.join(output,'export-inspection.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
