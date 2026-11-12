import React from 'react';
import {AbsoluteFill,Composition,registerRoot,useCurrentFrame,useVideoConfig} from 'remotion';
import {WorkPlanningFlowScene} from './directed/WorkPlanningFlowScene';
import {DirectedFonts} from './directed/DirectedFonts';
export interface FlowStudyProps extends Record<string,unknown>{
 durationInFrames:number;exitStart:number;reducedMotion:boolean;
 captions:{text:string;startSeconds:number;endSeconds:number}[];
}
const Study:React.FC<FlowStudyProps>=({exitStart,reducedMotion,captions})=>{
 const t=useCurrentFrame()/useVideoConfig().fps;
 const caption=captions.find(c=>t>=c.startSeconds&&t<c.endSeconds);
 return <AbsoluteFill style={{background:'white'}}><DirectedFonts/>
  <WorkPlanningFlowScene exitStart={exitStart} reducedMotion={reducedMotion}/>
  {caption&&<div style={{position:'absolute',left:90,right:90,bottom:22,fontFamily:'Figtree',fontSize:30,lineHeight:1.2,textAlign:'center',color:'#263238',background:'white',padding:'8px 20px'}}>{caption.text}</div>}
 </AbsoluteFill>;
};
registerRoot(()=><Composition id="WorkPlanningFlow" component={Study} width={1280} height={720} fps={24} durationInFrames={576}
 defaultProps={{durationInFrames:576,exitStart:22.5,reducedMotion:false,captions:[]}}
 calculateMetadata={({props})=>({durationInFrames:props.durationInFrames})}/>);
