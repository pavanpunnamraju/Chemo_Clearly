import React from 'react';
import {AbsoluteFill, Composition, registerRoot, useCurrentFrame, useVideoConfig} from 'remotion';
import {LibrarySvgArtwork, type LibrarySvgRig} from './directed/LibrarySvgArtwork';
import {prepareWorkPlanningArmProof} from './directed/WorkPlanningArmProof';

export interface ArmProofProps extends Record<string, unknown> {
  view: 'scene' | 'human' | 'closeup';
  baseline: boolean;
  reducedMotion: boolean;
  qa: boolean;
}

const ArmProof: React.FC<ArmProofProps> = ({view, baseline, reducedMotion, qa}) => {
  const seconds = useCurrentFrame() / useVideoConfig().fps;
  const isolated = view !== 'scene';
  const prepare = (svg: SVGSVGElement): LibrarySvgRig => {
    if (isolated) {
      for (const child of [...svg.children]) {
        if (child.tagName.toLowerCase() !== 'defs' && !['Character', 'background-simple', 'Floor'].includes(child.id)) child.remove();
      }
    }
    svg.setAttribute('viewBox', view === 'scene' ? '-80 17.96875 660 464.0625'
      : view === 'human' ? '135 175 205 280' : '155 230 170 94');
    return baseline ? {apply() {}} : prepareWorkPlanningArmProof(svg, {qa});
  };
  return <AbsoluteFill style={{background: 'white'}}>
    <LibrarySvgArtwork artworkId={`work-arm-proof-${view}`} seconds={seconds}
      publicPath={`studies/work-planning/working-typing${isolated ? '-no-desk' : ''}.svg`}
      expectedSha256={isolated ? '7d2bdcdb19035c341e94ad052930dfe63cb31cc7e587bb8f38cab464665693a7'
        : '11e6f3cddf6f5f6e8de584c612d18f7afdc4b30991cd15142b8cade0f85e1a4d'}
      reducedMotion={reducedMotion} prepare={prepare}/>
  </AbsoluteFill>;
};

registerRoot(() => <Composition id="WorkPlanningArmProof" component={ArmProof}
  width={1280} height={900} fps={30} durationInFrames={180}
  defaultProps={{view: 'human', baseline: false, reducedMotion: false, qa: false}}
  calculateMetadata={({props}) => ({width: props.view === 'human' ? 720 : 1280,
    height: props.view === 'human' ? 980 : props.view === 'closeup' ? 708 : 900})}/>);
