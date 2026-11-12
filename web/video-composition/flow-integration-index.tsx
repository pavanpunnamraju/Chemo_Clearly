import React from 'react';
import type {TransitionPlan} from '../lib/video/transition-plan';
import {BoundaryTransitionStage} from './directed/BoundaryTransitionStage';
import {AbsoluteFill,Composition,Sequence,registerRoot,useCurrentFrame,useVideoConfig} from 'remotion';
import type {Caption} from '@remotion/captions';
import {DirectedFonts} from './directed/DirectedFonts';
import {WorkPlanningFlowScene} from './directed/WorkPlanningFlowScene';
import {FlowClipScene} from './directed/FlowClipScene';
export interface FlowTestProps extends Record<string,unknown>{durationInFrames:number;shots:{asset:'work'|'stretch'|'car'|'support';from:number;duration:number}[];captions:Caption[];reducedMotion:boolean;transitionPlan?:TransitionPlan}
const Test:React.FC<FlowTestProps>=({shots,captions,reducedMotion,transitionPlan})=>{
 const frame=useCurrentFrame(),{fps}=useVideoConfig();
 const caption=captions.find(c=>frame/fps*1000>=c.startMs&&frame/fps*1000<c.endMs);
 const renderShot=(index:number)=>{const s=shots[index]!;return s.asset==='work'?<WorkPlanningFlowScene exitStart={s.duration/fps+1} reducedMotion={reducedMotion}/>:<AbsoluteFill style={{transform:'scale(.92)',transformOrigin:'50% 40%'}}><FlowClipScene asset={s.asset} durationSeconds={s.duration/fps} reducedMotion={reducedMotion}/></AbsoluteFill>;};
 return <AbsoluteFill style={{background:'white'}}><DirectedFonts/>
 {shots.map((s,i)=><Sequence key={s.asset} from={s.from} durationInFrames={s.duration}>{renderShot(i)}</Sequence>)}
 <BoundaryTransitionStage shots={shots.map(s=>({id:s.asset,from:s.from,duration:s.duration}))} plan={transitionPlan} renderShot={renderShot} reducedMotion={reducedMotion}/>
 {caption&&<div data-qa-text="caption" style={{position:'absolute',left:80,right:80,bottom:22,padding:'8px 16px',fontFamily:'Figtree',fontSize:30,lineHeight:1.25,textAlign:'center',color:'#263238',background:'white'}}>{caption.text}</div>}
 <div style={{position:'absolute',bottom:3,right:40,fontFamily:'Figtree',fontSize:12,color:'#53625f'}}>Artwork: Storyset / Freepik · Hearts: Twemoji</div>
 </AbsoluteFill>;
};
registerRoot(()=><Composition id="FlowIntegration" component={Test} width={1280} height={720} fps={30} durationInFrames={300} defaultProps={{durationInFrames:300,shots:[],captions:[],reducedMotion:false}} calculateMetadata={({props})=>({durationInFrames:props.durationInFrames})}/>);
