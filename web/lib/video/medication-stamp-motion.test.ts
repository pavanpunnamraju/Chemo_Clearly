import assert from 'node:assert/strict';
import test from 'node:test';
import {medicationStampMotion,MEDICATION_STAMP_TIMING as timing} from './medication-stamp-motion';
const cue={lines:['WITH FOOD','NOT AT NIGHT'],sourceRef:'timeline.days-2-5:plain',contactSeconds:7.38,endSeconds:17.4};
test('ink only forms after contact; pad holds fixed through the press and exits completely',()=>{
 for(let t=0;t<cue.contactSeconds;t+=1/120)assert.equal(medicationStampMotion(t,cue).imprintOpacity,0);
 for(let t=cue.contactSeconds;t<cue.contactSeconds+timing.compressionSeconds+timing.contactHoldSeconds;t+=1/120){
  const p=medicationStampMotion(t,cue);assert.equal(p.contact,true);assert.equal(p.assemblyX,0);assert.equal(p.assemblyY,0);assert.equal(p.assemblyScale,1);
 }
 const finished=medicationStampMotion(cue.contactSeconds+timing.minimumPostContactSeconds,cue);
 assert.equal(finished.imprintOpacity,1);assert.equal(finished.compression,0);assert.equal(finished.contact,false);assert.ok(finished.assemblyX>=300);
 assert.deepEqual(medicationStampMotion(50,cue),finished,'Ink persists and the hand does not return');
});
test('all phase boundaries are continuous in pose, without limb or pad jumps',()=>{
 const c=cue.contactSeconds;
 const boundaries=[c-timing.entrySeconds,c-timing.settleSeconds,c,c+timing.compressionSeconds,c+timing.compressionSeconds+timing.contactHoldSeconds,c+timing.compressionSeconds+timing.contactHoldSeconds+timing.liftSeconds,c+timing.minimumPostContactSeconds];
 for(const t of boundaries){const a=medicationStampMotion(t-1e-5,cue),b=medicationStampMotion(t+1e-5,cue);for(const key of ['assemblyX','assemblyY','assemblyScale','compression','imprintOpacity'] as const)assert.ok(Math.abs(a[key]-b[key])<.0001,`${key} jumps at ${t}`);}
});
test('new regimen cue shifts the same action without inheriting old copy',()=>{
 const alternate={lines:['TAKE WITH FOOD'],sourceRef:'another-source:meal',contactSeconds:10.38,endSeconds:20.4};
 for(const t of [4.9,6.5,7.5,8.5,12]){const a=medicationStampMotion(t,cue),b=medicationStampMotion(t+3,alternate);for(const key of ['assemblyX','assemblyY','compression','imprintOpacity'] as const)assert.ok(Math.abs(a[key]-b[key])<1e-9);}
 assert.throws(()=>medicationStampMotion(0,{...cue,sourceRef:''}));
 assert.throws(()=>medicationStampMotion(0,{...cue,contactSeconds:1}),/before contact/);
 assert.throws(()=>medicationStampMotion(0,{...cue,endSeconds:8}),/after contact/);
});
test('reduced motion has no physical stamp, holds static, and reveals on the same cue',()=>{
 for(const t of [0,7,7.38,9,17]){const p=medicationStampMotion(t,cue,true);assert.equal(p.hardwareVisible,false);assert.equal(p.compression,0);assert.equal(p.shadowOpacity,0);assert.equal(p.imprintOpacity,t<cue.contactSeconds?0:1);assert.equal(p.contact,false);}
});
