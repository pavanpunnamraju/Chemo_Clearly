import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {armMicroscopeState} from './arm-microscope-motion';
import {bloodCellState,type BloodCellCue} from './blood-cell-motion';
const artwork=JSON.parse(readFileSync(new URL('../../public/studies/arm-microscope/character.json',import.meta.url),'utf8'));
const cue:BloodCellCue={sourceRef:'timeline.roughly-days-7-10:plain',windowLabel:'Around days 7–10',entrySeconds:3.2,focusSeconds:4.66,lowSeconds:7.36,precautionSeconds:8.6,endSeconds:13.4};
test('camera approaches one forearm continuously and completes before spoken white-cell cue',()=>{
 let prior=armMicroscopeState(0,artwork.anchor);
 for(let f=1;f<=402;f++){
  const current=armMicroscopeState(f/30,artwork.anchor);
  assert.ok(current.height<=prior.height+1e-8);
  assert.ok(prior.height/current.height<1.3,'Camera makes a discontinuous scale jump');
  assert.ok(Math.abs(current.rotation-prior.rotation)<1);
  assert.ok(Math.abs(current.openingOpacity-prior.openingOpacity)<.15);
  prior=current;
 }
 assert.equal(armMicroscopeState(cue.entrySeconds!,artwork.anchor).openingOpacity,0);
 assert.equal(armMicroscopeState(1.85,artwork.anchor).vesselReveal,1);
 const end=armMicroscopeState(cue.entrySeconds!,artwork.anchor);
 assert.deepEqual(end.center,artwork.anchor.forearmCenter);
});
test('vertical white-cell decline is staggered within the scene while surviving cells keep moving',()=>{
 const first=bloodCellState(cue.entrySeconds!,cue,false,'vertical');
 const white=first.cells.filter(c=>c.kind==='white');assert.equal(white.length,11);assert.ok(white.every(c=>c.opacity===1));
 const mid=bloodCellState(6,cue,false,'vertical').cells.filter(c=>c.kind==='white');
 assert.ok(mid.some(c=>c.opacity===0)&&mid.some(c=>c.opacity>0&&c.opacity<1)&&mid.some(c=>c.opacity===1));
 const low=bloodCellState(cue.lowSeconds,cue,false,'vertical');const remaining=low.cells.filter(c=>c.kind==='white'&&c.opacity>.99);assert.equal(remaining.length,3);
 const end=bloodCellState(cue.endSeconds, cue,false,'vertical');
 for(const survivor of remaining){const final=end.cells.find(c=>c.id===survivor.id)!;assert.equal(final.opacity,1);assert.ok(final.position[1]-survivor.position[1]>.2,'WBC appears pinned');}
 let previous=first;
 for(let frame=97;frame<=402;frame++){
  const state=bloodCellState(frame/30,cue,false,'vertical');assert.deepEqual(state.cells.map(c=>c.id),first.cells.map(c=>c.id));
  state.cells.forEach((c,i)=>{assert.ok(c.opacity<=previous.cells[i]!.opacity+1e-8);assert.equal(c.radius,first.cells[i]!.radius);});previous=state;
 }
});
test('vertical reduced motion freezes the complete low-state field and skips the zoom',()=>{
 const still=bloodCellState(0,cue,true,'vertical');
 for(const t of [3.2,6,7.36,13.4]){assert.deepEqual(bloodCellState(t,cue,true,'vertical'),still);assert.equal(armMicroscopeState(t,artwork.anchor,3.2,true).openingOpacity,0);}
});
