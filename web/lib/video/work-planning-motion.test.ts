import assert from 'node:assert/strict';
import {DEFAULT_WORK_PLANNING_CUE as cue,workPlanningMotion,workPropOffset} from './work-planning-motion';
const start=workPlanningMotion(0),rest=workPlanningMotion(18);
assert.equal(start.lift,0);assert.equal(start.recline,0);assert.equal(rest.lift,1);assert.equal(rest.settle,1);assert.equal(rest.recline,1);
const overlap=workPlanningMotion(cue.motionStart+1);
assert.ok(overlap.lift>0&&overlap.recline>0&&overlap.legAngle>0&&overlap.camera>0);
assert.ok(workPropOffset(cue.motionStart+1,cue.motionStart)>0);
assert.ok(workPropOffset(cue.motionStart+.25,cue.motionStart)<5,'Nudge must remain small');
let last=0;for(let i=0;i<=200;i++){const x=workPropOffset(cue.motionStart+i/100,cue.motionStart);assert.ok(x>=last-1e-9,'Props must nudge and leave right, never reverse');last=x;}
for(const t of [0,3,6,12,22])assert.deepEqual(workPlanningMotion(t,cue,true),start,'Reduced motion must retain original rest');
for(const [field,end] of [['lift',cue.liftEnd],['settle',cue.settleEnd],['recline',cue.reclineEnd],['exit',cue.exitEnd]] as const){
 const a=workPlanningMotion(end-1/30)[field],b=workPlanningMotion(end)[field],c=workPlanningMotion(end+1/30)[field];
 assert.ok(Math.abs(b-a)<.002,`${field}: abrupt hold arrival`);assert.equal(b,c);
}
console.log('Work planning cue overlap, rightward nudge, smooth hold, reduced-motion checks passed.');
