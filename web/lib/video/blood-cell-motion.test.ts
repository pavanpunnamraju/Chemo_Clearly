import test from 'node:test';
import assert from 'node:assert/strict';
import {bloodCellState,type BloodCellCue} from './blood-cell-motion';
import {createRedBloodCellGeometry} from '../../video-composition/directed/blood-cell-geometry';
const cue:BloodCellCue={sourceRef:'timeline.roughly-days-7-10:plain',windowLabel:'Around days 7–10',focusSeconds:4.66,lowSeconds:7.36,precautionSeconds:8.6,endSeconds:13.4};
test('persistent cells move continuously with no in-frame removal or teleport',()=>{
 const initial=bloodCellState(0,cue).cells.map(c=>c.id);
 for(let frame=1;frame<=402;frame++){
  const previous=bloodCellState((frame-1)/30,cue),current=bloodCellState(frame/30,cue);
  assert.deepEqual(current.cells.map(c=>c.id),initial);
  current.cells.forEach((c,i)=>{const p=previous.cells[i]!;assert.ok(Math.hypot(...c.position.map((v,j)=>v-p.position[j]!) as [number,number,number])<.15,`${c.id} jumps`);assert.equal(c.radius,p.radius);});
 }
});
test('cells stay in separated three-dimensional streamlines',()=>{
 let clearance=Infinity;
 for(let frame=0;frame<=804;frame++){
  const cells=bloodCellState(frame/60,cue).cells;
  for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
   const a=cells[i]!,b=cells[j]!;
   const d=Math.hypot(...a.position.map((v,k)=>v-b.position[k]!) as [number,number,number]);
   clearance=Math.min(clearance,d-1.03*(a.radius+b.radius));
   assert.ok(d>=1.03*(a.radius+b.radius),`Possible mesh intersection ${a.id}/${b.id} at ${frame/60}s: distance${d}, bounds${1.03*(a.radius+b.radius)}`);
  }
 }
 assert.ok(clearance>=0);
});
test('reduced motion freezes cell shape, position and focus through the full source clock',()=>{
 const start=bloodCellState(0,cue,true);for(const t of [4.66,7.36,8.6,13.4])assert.deepEqual(bloodCellState(t,cue,true),start);
 assert.throws(()=>bloodCellState(0,{...cue,sourceRef:''}));assert.throws(()=>bloodCellState(0,{...cue,lowSeconds:2}));
});
test('another source window uses its supplied cue clock without fixed R-CHOP day timing',()=>{
 const other:BloodCellCue={sourceRef:'other-regimen:source-supported-white-cell-low',windowLabel:'Source-defined window',focusSeconds:6.66,lowSeconds:9.36,precautionSeconds:10.6,endSeconds:16};
 assert.ok(Math.abs(bloodCellState(other.focusSeconds,other).focusDepth-bloodCellState(0,other).focusDepth)>1);
 for(const id of ['wbc-early-a','wbc-early-b']){
  const first=bloodCellState(cue.lowSeconds,cue).cells.find(c=>c.id===id)!;
  const second=bloodCellState(other.lowSeconds,other).cells.find(c=>c.id===id)!;
  assert.ok(Math.abs(first.position[0]-second.position[0])<1e-8);
 }
 const longer={...other,endSeconds:24};
 for(const cell of bloodCellState(24,longer).cells.filter(c=>c.kind==='white'&&c.id!=='wbc-hero'))assert.ok(Math.abs(cell.position[0])>=7.9,'Longer source narration must retain the low-count hold');
});
test('red-cell geometry has filled thin centers, a thicker rim and finite smooth surface data',()=>{
 const g=createRedBloodCellGeometry();const a=g.getAttribute('position');assert.ok(a.count>2000);
 let centerThickness=0,rimThickness=0,centerCount=0;
 for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i);assert.ok([x,y,z].every(Number.isFinite));const r=Math.hypot(x,y);if(r<.001){centerCount++;centerThickness=Math.max(centerThickness,Math.abs(z));}if(r>.3&&r<.85)rimThickness=Math.max(rimThickness,Math.abs(z));}
 assert.ok(centerCount>0&&centerThickness>.02,'Disc must be closed through its center');assert.ok(rimThickness>centerThickness*2,'Disc needs actual biconcavity');g.dispose();
});
