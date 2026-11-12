import React from 'react';
import {AbsoluteFill, Composition, registerRoot, useCurrentFrame, useVideoConfig} from 'remotion';
import {LibrarySvgArtwork} from './directed/LibrarySvgArtwork';
import {prepareWorkPlanningArmPoses} from './directed/WorkPlanningArmPoses';

export interface ArmPoseStudyProps extends Record<string, unknown> {
  pose: 0|1|2|3|4;
  view: 'human'|'closeup'|'phone';
  baseline: boolean;
  qa: boolean;
}
const ArmPoseStudy: React.FC<ArmPoseStudyProps> = ({pose,view,baseline,qa}) => {
  const seconds=useCurrentFrame()/useVideoConfig().fps;
  return <AbsoluteFill style={{background:'white'}}>
    <LibrarySvgArtwork artworkId={`work-arm-pose-${view}-${pose}`} seconds={seconds}
      publicPath="studies/work-planning/working-typing-straight-sleeve-no-desk.svg"
      expectedSha256="c3b68d90ee2f7b7cacdbf483d8fe23a8efc3b6e91c38179136d0dc38140390ae"
      prepare={svg=>{
        for(const child of [...svg.children])if(child.tagName.toLowerCase()!=='defs'&&!['Character','background-simple','Floor'].includes(child.id))child.remove();
        svg.setAttribute('viewBox',view==='closeup'?'145 140 245 185':'120 110 260 350');
        if(baseline)return {apply(){}};
        const rig=prepareWorkPlanningArmPoses(svg);
        return {apply(time){
          rig.applyPose(pose);
          if(qa)console.log(`ARM_POSE_QA:${JSON.stringify({seconds:time,pose,view,...rig.audit()})}`);
        }};
      }}/>
  </AbsoluteFill>;
};
registerRoot(()=><Composition id="WorkPlanningArmPoses" component={ArmPoseStudy}
  width={780} height={1050} fps={30} durationInFrames={91}
  defaultProps={{pose:0,view:'human',baseline:false,qa:false}}
  calculateMetadata={({props})=>({width:props.view==='phone'?640:props.view==='closeup'?1225:780,
    height:props.view==='phone'?360:props.view==='closeup'?925:1050})}/>);
