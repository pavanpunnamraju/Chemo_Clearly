export interface WorkPlanningCue {
  motionStart:number;
  liftEnd:number;
  settleStart:number;
  settleEnd:number;
  reclineEnd:number;
  exitStart:number;
  exitEnd:number;
}
export const DEFAULT_WORK_PLANNING_CUE:WorkPlanningCue={motionStart:2,liftEnd:4.2,settleStart:4.2,settleEnd:6.1,reclineEnd:6.4,exitStart:21.6,exitEnd:22.7};
export const clampWork=(x:number)=>Math.min(1,Math.max(0,x));
// Quintic timing: zero velocity AND acceleration at hold boundaries.
export const workEase=(x:number)=>{const t=clampWork(x);return t*t*t*(10+t*(-15+6*t));};
export const workPhase=(t:number,start:number,end:number)=>workEase((t-start)/(end-start));
export function workPlanningMotion(seconds:number,cue=DEFAULT_WORK_PLANNING_CUE,reduced=false){
 const t=reduced?0:seconds;
 const recline=workPhase(t,cue.motionStart+.3,cue.reclineEnd);
 const leg=workPhase(t,cue.motionStart+.2,cue.reclineEnd-.35);
 return {seconds:t,lift:workPhase(t,cue.motionStart,cue.liftEnd),settle:workPhase(t,cue.settleStart,cue.settleEnd),recline,
  hipX:-12*recline,hipY:5*recline,legAngle:52*leg,legShiftX:-5*leg,legShiftY:3*leg,
  camera:workPhase(t,cue.motionStart,cue.reclineEnd+.7),exit:workPhase(t,cue.exitStart,cue.exitEnd)};
}
export function workPropOffset(seconds:number,start:number){
 // Both overlapping terms move RIGHT: a small nudge, then the main pull.
 return 3*workPhase(seconds,start,start+.28)+760*workPhase(seconds,start+.19,start+1.6);
}
export interface WorkPoint{x:number;y:number}
export const workRotate=(p:WorkPoint,k:WorkPoint,angle:number):WorkPoint=>{
 const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return{x:k.x+(p.x-k.x)*c-(p.y-k.y)*s,y:k.y+(p.x-k.x)*s+(p.y-k.y)*c};
};
