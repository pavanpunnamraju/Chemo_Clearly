import React from 'react';
import {AbsoluteFill,Composition,registerRoot,useCurrentFrame,useVideoConfig} from 'remotion';
import {WorkPlanningArtwork} from './directed/WorkPlanningArtwork';
import {DEFAULT_WORK_PLANNING_CUE,type WorkPlanningCue,workPlanningMotion} from '../lib/video/work-planning-motion';
import {DirectedFonts} from './directed/DirectedFonts';
export interface WorkPlanningStudyProps extends Record<string,unknown>{
  reducedMotion:boolean;proof:boolean;qa:boolean;durationInFrames:number;cue:WorkPlanningCue;
  captions:{text:string;startSeconds:number;endSeconds:number}[];
}
const Study:React.FC<WorkPlanningStudyProps>=({reducedMotion,proof,qa,cue,captions})=>{
  const {fps}=useVideoConfig();const seconds=useCurrentFrame()/fps;
  const caption=captions.find(c=>seconds>=c.startSeconds&&seconds<c.endSeconds);
  const exit=workPlanningMotion(seconds,cue,reducedMotion).exit;
  return <AbsoluteFill style={{background:'white'}}><DirectedFonts/>
    <WorkPlanningArtwork seconds={seconds} reducedMotion={reducedMotion} proof={proof} cue={cue} qa={qa}/>
    {!proof&&caption&&<div style={{position:'absolute',bottom:22,left:70,right:70,textAlign:'center',fontFamily:'Figtree',fontSize:30,lineHeight:1.2,color:'#263238',background:'rgba(255,255,255,.94)',padding:'10px 22px',borderRadius:12,transform:`translateX(${-1920*exit}px)`}}>{caption.text}</div>}
  </AbsoluteFill>;
};
registerRoot(()=> <Composition id="WorkPlanningStudy" component={Study} width={1280} height={900} fps={30} durationInFrames={687}
  defaultProps={{reducedMotion:false,proof:false,qa:false,durationInFrames:687,cue:DEFAULT_WORK_PLANNING_CUE,captions:[]}}
  calculateMetadata={({props})=>({durationInFrames:props.durationInFrames,width:props.proof?720:1280,height:props.proof?1120:900})}/>);
