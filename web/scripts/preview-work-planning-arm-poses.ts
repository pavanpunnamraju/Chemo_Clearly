import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser,renderStill,selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import type {ArmPoseStudyProps} from '../video-composition/work-planning-arm-poses-index';

async function main(){
  const run=process.argv.find(a=>a.startsWith('--run='))?.slice(6)??'arm-poses-1';
  assert.match(run,/^[a-zA-Z0-9_-]+$/);
  const draft=process.argv.includes('--draft');
  const output=path.resolve('out/work-planning-review',run);
  assert.ok(!existsSync(output),'Use a fresh run directory');mkdirSync(output,{recursive:true});
  const hash=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
  const records=JSON.parse(readFileSync('../docs/design/approved-animations.json','utf8')).records;
  const approval=records.find((r:{approval?:{asset:string}})=>r.approval?.asset==='care-work-plan-straight-sleeve-and-ownership').approval;
  const approved=approval.implementationFingerprintAfterAdoption as Record<string,string>;
  const verifyApproved=()=>{for(const [file,digest] of Object.entries(approved))assert.equal(hash(file),digest,`Approved file changed: ${file}`);};
  verifyApproved();
  const files=[...Object.keys(approved),'video-composition/directed/WorkPlanningArmPoses.ts','video-composition/work-planning-arm-poses-index.tsx','scripts/preview-work-planning-arm-poses.ts'];
  const optional='lib/video/work-planning-arm-poses.ts';if(existsSync(optional))files.push(optional);
  const fingerprint=Object.fromEntries(files.map(file=>[file,hash(file)]));
  const audits:Record<string,unknown>[]=[];
  const pixels=(p:string)=>sharp(p).ensureAlpha().raw().toBuffer();
  const finite=(v:unknown):boolean=>typeof v==='number'?Number.isFinite(v):v!==null&&typeof v==='object'?Object.values(v).every(finite):true;
  const serveUrl=await bundle({entryPoint:path.resolve('video-composition/work-planning-arm-poses-index.tsx')});
  const browser=await openBrowser('chrome');
  const views:ArmPoseStudyProps['view'][]=draft?['human','closeup']:['human','closeup','phone'];
  try{
    for(const view of views){
      const dir=path.join(output,view);mkdirSync(dir);
      for(const pose of [0,1,2,3,4] as const){
        const props:ArmPoseStudyProps={pose,view,baseline:false,qa:true};
        const composition=await selectComposition({serveUrl,id:'WorkPlanningArmPoses',inputProps:props,puppeteerInstance:browser,logLevel:'error'});
        for(const frame of draft?[0]:[0,90]){
          const logs:Record<string,unknown>[]=[];
          await renderStill({serveUrl,composition,inputProps:props,frame,puppeteerInstance:browser,
            output:path.join(dir,`pose-${pose}${frame?'-later':''}.png`),logLevel:'error',onBrowserLog:log=>{
              const prefix='ARM_POSE_QA:',i=log.text.indexOf(prefix);if(i>=0)logs.push(JSON.parse(log.text.slice(i+prefix.length)));
            }});
          const audit=logs.filter(a=>a.pose===pose&&typeof a.seconds==='number'&&Math.abs(a.seconds-frame/30)<1e-7).at(-1);
          assert.ok(audit&&finite(audit),`${view}/${pose}/${frame}: missing finite actual pose audit`);
          if(!draft){
            assert.equal(audit.poseIndex,pose);
            const joints=audit.joints as {id:string;side:string;kind:string;canonical:{x:number;y:number};actual:{x:number;y:number};mappingResidual:number}[];
            assert.equal(joints.length,6);
            for(const [side,expected] of Object.entries({near:{x:291,y:245},far:{x:243.61,y:243.46}})){
              for(const kind of ['shoulder','elbow','wrist'])assert.equal(joints.filter(j=>j.side===side&&j.kind===kind).length,1);
              const shoulder=joints.find(j=>j.side===side&&j.kind==='shoulder')!;
              assert.ok(Math.hypot(shoulder.actual.x-expected.x,shoulder.actual.y-expected.y)<.01,`${side} shoulder drift`);
            }
            assert.ok(joints.every(j=>j.mappingResidual<.01));
            const limbs=audit.limbs as {side:string;upperLength:number;forearmLength:number;upperLengthResidual:number;forearmLengthResidual:number;wristJoinResidual:number;elbowJoinResidual:number}[];
            assert.equal(limbs.length,2);
            for(const limb of limbs){
              assert.ok(limb.upperLength>35&&limb.upperLength<55&&limb.forearmLength>40&&limb.forearmLength<60);
              assert.ok(limb.upperLengthResidual<.02&&limb.forearmLengthResidual<.02&&limb.wristJoinResidual<.02&&limb.elbowJoinResidual<.02,`${limb.side} articulation drift`);
            }
            const torso=audit.torso as {sourceDUnchanged:boolean;probeMaxDrift:number};
            assert.equal(torso.sourceDUnchanged,true);assert.ok(torso.probeMaxDrift<.01);
            const source=audit.source as {pathDataPreserved:boolean;sourceSurfaceCount:number};
            assert.equal(source.pathDataPreserved,true);assert.equal(source.sourceSurfaceCount,37);
            const clips=audit.clipOwners as {liveClipId:string;consumerUnit:string;liveMatch:boolean}[];
            assert.equal(clips.length,6);assert.equal(new Set(clips.map(c=>c.liveClipId)).size,6);
            assert.deepEqual(clips.map(c=>c.consumerUnit).sort(),['far-upperarm','far-forearm-hand','far-sleeve','near-upperarm','near-forearm-hand','near-sleeve'].sort());
            assert.ok(clips.every(c=>c.liveMatch));
            const registration=audit.clipRegistration as {unitConsumerCount:number;sourceConsumerCount:number;farConcealConsumerCount:number;sourceClipsValid:boolean;concealClipsValid:boolean;activeMaskConsumerCount:number;masksValid:boolean;coverageClipConsumerCount:number;coverageClipsValid:boolean};
            assert.equal(registration.unitConsumerCount,6);assert.equal(registration.sourceConsumerCount,6);
            assert.equal(registration.farConcealConsumerCount,1);assert.equal(registration.activeMaskConsumerCount,pose===0?0:33);
            assert.ok(registration.sourceClipsValid&&registration.concealClipsValid&&registration.masksValid);
            assert.equal(registration.coverageClipConsumerCount,10);assert.equal(registration.coverageClipsValid,true);
            const head=audit.fixedHead as {pathCount:number;paintAttributesPreserved:boolean;maxMatrixResidual:number};
            assert.equal(head.pathCount,15);assert.equal(head.paintAttributesPreserved,true);assert.ok(head.maxMatrixResidual<.001);
            if(pose===4){
              const contact=audit.contact as {nearestContourGap:number;edgeIntersections:number;containedVertices:number;targetResidualNear:number;targetResidualFar:number;contourSampleCount:number};
              assert.ok(contact.nearestContourGap<.05&&contact.targetResidualNear<.01&&contact.targetResidualFar<.01,'Hands miss overhead contact');
              assert.equal(contact.edgeIntersections,0,'Hand contours cross');
              assert.equal(contact.containedVertices,0,'Hand contours penetrate');
              assert.ok(contact.contourSampleCount>400,'Insufficient hand contour evidence');
            }
          }
          audits.push({frame,...audit});
        }
        if(!draft)assert.ok((await pixels(path.join(dir,`pose-${pose}.png`))).equals(await pixels(path.join(dir,`pose-${pose}-later.png`))),`${view}/${pose} changes with clock`);
      }
      const props:ArmPoseStudyProps={pose:0,view,baseline:true,qa:false};
      const composition=await selectComposition({serveUrl,id:'WorkPlanningArmPoses',inputProps:props,puppeteerInstance:browser,logLevel:'error'});
      await renderStill({serveUrl,composition,inputProps:props,frame:0,puppeteerInstance:browser,output:path.join(dir,'baseline.png'),logLevel:'error'});
      assert.ok((await pixels(path.join(dir,'baseline.png'))).equals(await pixels(path.join(dir,'pose-0.png'))),`${view}: rest differs from approved source`);
      for(const pose of [1,2,3,4])assert.ok(!(await pixels(path.join(dir,'pose-0.png'))).equals(await pixels(path.join(dir,`pose-${pose}.png`))),`${view}/${pose}: absent pose`);
      if(!draft){
        const sourceBox=view==='closeup'?[145,140,245,185]:[120,110,260,350];
        const scale=Math.min(composition.width/sourceBox[2]!,composition.height/sourceBox[3]!);
        const crop=(x:number,y:number,width:number,height:number)=>({
          left:Math.round((composition.width-sourceBox[2]!*scale)/2+(x-sourceBox[0]!)*scale),
          top:Math.round((composition.height-sourceBox[3]!*scale)/2+(y-sourceBox[1]!)*scale),
          width:Math.round(width*scale),height:Math.round(height*scale)});
        const regions=[{name:'face',box:crop(254,194,34,41)},
          ...(view==='closeup'?[]:[{name:'lower-body',box:crop(125,324,245,128)}])];
        // Regression probes inside the material side of the acute near-elbow
        // join; earlier clipped bridges left background pinholes at these points.
        if(view==='closeup')for(const [pose,x,y] of [[3,892,407],[4,844,358]]){
          const rgb=await sharp(path.join(dir,`pose-${pose}.png`)).extract({left:x!,top:y!,width:1,height:1}).removeAlpha().raw().toBuffer();
          assert.ok(Math.abs(rgb[0]!-255)<=2&&Math.abs(rgb[1]!-190)<=2&&Math.abs(rgb[2]!-157)<=2,`pose ${pose}: inner elbow exposes background`);
        }
        for(const region of regions){
          const baseline=await sharp(path.join(dir,'baseline.png')).extract(region.box).ensureAlpha().raw().toBuffer();
          for(const pose of [1,2,3,4])assert.ok(baseline.equals(await sharp(path.join(dir,`pose-${pose}.png`)).extract(region.box).ensureAlpha().raw().toBuffer()),`${view}/${pose}: ${region.name} changed or covered`);
        }
      }
      console.log(`Rendered ${view}`);
    }
  }finally{await browser.close({silent:true});}
  verifyApproved();assert.deepEqual(Object.fromEntries(files.map(file=>[file,hash(file)])),fingerprint);
  const labels=['Approved rest','Clear the work surface','Elbows open, forearms rising','Higher beside the head','Hands meet overhead'];
  const tiles=await Promise.all(labels.map(async(label,pose)=>({input:await sharp(path.join(output,'human',`pose-${pose}.png`)).resize(260,350).png().toBuffer(),left:pose*260,top:40})));
  const labelSvg=Buffer.from(`<svg width="1300" height="40">${labels.map((label,i)=>`<text x="${i*260+130}" y="25" text-anchor="middle" font-family="Arial" font-size="14" fill="#263238">${poseLabel(i,label)}</text>`).join('')}</svg>`);
  await sharp({create:{width:1300,height:390,channels:3,background:'white'}}).composite([...tiles,{input:labelSvg,left:0,top:0}]).png().toFile(path.join(output,'pose-sheet.png'));
  writeFileSync(path.join(output,'evidence.json'),JSON.stringify({scope:'Static intermediate arm positions; no animation or human approval',humanApproval:'pending',draft,fingerprint,restPixelExact:true,staticFrames:draft?[0]:[0,90],audits},null,2)+'\n');
  writeFileSync(path.join(output,'review.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Woman — intermediate arm poses</title><style>body{font:17px system-ui;margin:0;background:#f1f4f6;color:#263238}main{max-width:1400px;margin:auto;padding:24px}img{width:100%;height:auto}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}article{padding:14px;background:white;border-radius:12px}h1{font-size:28px}h2{font-size:18px}a{color:#006b86}</style><main><h1>Intermediate arm positions</h1><p>Static pose review before animation. Head, torso, chair and legs stay fixed. Click a figure to enlarge.</p><a href="pose-sheet.png"><img src="pose-sheet.png" alt="Five static positions"></a><section>${labels.map((label,i)=>`<article><h2>${poseLabel(i,label)}</h2><a href="human/pose-${i}.png"><img src="human/pose-${i}.png" alt="${label}"></a>${draft?'':`<a href="closeup/pose-${i}.png">Upper-body closeup</a> · <a href="phone/pose-${i}.png">Phone view</a>`}</article>`).join('')}</section></main></html>`);
  console.log(output);
}
const poseLabel=(i:number,label:string)=>`${i}. ${label}`;
main().catch(error=>{console.error(error);process.exitCode=1;});
