import React from 'react';
import {AbsoluteFill,Freeze,Sequence,useCurrentFrame,useVideoConfig} from 'remotion';
import type {TransitionPlan} from '../../lib/video/transition-plan';
export interface TransitionShotTiming {id:string;from:number;duration:number}
const ease=(t:number)=>{const x=Math.min(1,Math.max(0,t));return x*x*(3-2*x);};
/** Visual handles only: incoming rests before its clock, outgoing holds after it.
 * Neither shot boundaries nor narration/caption times are shifted. */
export const BoundaryTransitionStage:React.FC<{shots:TransitionShotTiming[];plan?:TransitionPlan;renderShot:(index:number)=>React.ReactNode;reducedMotion?:boolean}>=({shots,plan,renderShot,reducedMotion=false})=>{
 const frame=useCurrentFrame(),{fps,width,height}=useVideoConfig();
 if(!plan||reducedMotion)return null;
 const boundary=plan.boundaries.find(p=>{const next=shots.find(s=>s.id===p.toId);return p.type!=='cut'&&next&&Math.abs(frame-next.from)<p.durationSeconds*fps/2;});
 if(!boundary)return null;
 const outIndex=shots.findIndex(s=>s.id===boundary.fromId),inIndex=outIndex+1;
 const outgoing=shots[outIndex]!,incoming=shots[inIndex]!;
 const start=incoming.from-boundary.durationSeconds*fps/2;
 const progress=(frame-start)/(boundary.durationSeconds*fps),p=ease(progress);
 const shot=(index:number)=>{const s=shots[index]!;return <Freeze frame={Math.max(s.from,Math.min(frame,s.from+s.duration-1))}><Sequence from={s.from} durationInFrames={s.duration}>{renderShot(index)}</Sequence></Freeze>;};
 return <AbsoluteFill data-boundary-type={boundary.type} data-boundary-progress={progress} style={{backgroundColor:'white',overflow:'hidden'}}>
 {boundary.type==='board-slide'?<><AbsoluteFill style={{transform:`translateX(${-p*width}px)`}}>{shot(outIndex)}</AbsoluteFill><AbsoluteFill style={{transform:`translateX(${(1-p)*width}px)`}}>{shot(inIndex)}</AbsoluteFill></>:
 boundary.type==='dissolve'?<>{shot(outIndex)}<AbsoluteFill style={{opacity:p}}>{shot(inIndex)}</AbsoluteFill></>:
 <>{frame<incoming.from?shot(outIndex):shot(inIndex)}<svg width={width} height={height} style={{position:'absolute',inset:0}}><circle cx={width*.72} cy={height*.35} r={Math.hypot(width,height)*(progress<.5?ease(progress*2):ease((1-progress)*2))} fill={boundary.color}/></svg></>}
 </AbsoluteFill>;
};
