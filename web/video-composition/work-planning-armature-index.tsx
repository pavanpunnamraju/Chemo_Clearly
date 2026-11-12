import React, {useState} from 'react';
import {AbsoluteFill, Composition, registerRoot, useCurrentFrame, useVideoConfig} from 'remotion';
import {LibrarySvgArtwork, type LibrarySvgRig} from './directed/LibrarySvgArtwork';
import {prepareWorkPlanningArmature} from './directed/WorkPlanningArmature';

export interface ArmatureStudyProps extends Record<string, unknown> {
  view: 'human' | 'scene' | 'closeup' | 'phone';
  baseline: boolean;
  diagram: boolean;
  qa: boolean;
}
type Joints = ReturnType<ReturnType<typeof prepareWorkPlanningArmature>['audit']>['joints'];

const ArmatureStudy: React.FC<ArmatureStudyProps> = ({view, baseline, diagram, qa}) => {
  const seconds = useCurrentFrame() / useVideoConfig().fps;
  const [joints, setJoints] = useState<Joints>([]);
  const isolated = view === 'human' || view === 'closeup';
  const viewBox = view === 'human' ? '135 175 205 280'
    : view === 'closeup' ? '155 230 170 94' : '-80 17.96875 660 464.0625';
  const prepare = (svg: SVGSVGElement): LibrarySvgRig => {
    if (isolated) {
      for (const child of [...svg.children]) {
        if (child.tagName.toLowerCase() !== 'defs' && !['Character', 'background-simple', 'Floor'].includes(child.id)) child.remove();
      }
    }
    svg.setAttribute('viewBox', viewBox);
    if (baseline) return {apply() {}};
    const armature = prepareWorkPlanningArmature(svg);
    if (diagram) setJoints(armature.audit().joints);
    // A static binding preparation, deliberately without a pose/motion API.
    // The loader's frame callback lets the harness verify time invariance and
    // inspect actual post-namespace transforms rather than preparation intent.
    return {apply(time) {
      const audit = armature.audit();
      if (qa) console.log(`ARMATURE_QA:${JSON.stringify({seconds: time, ...audit})}`);
    }};
  };
  return <AbsoluteFill style={{background: 'white'}}>
    <LibrarySvgArtwork artworkId={`work-armature-${view}`} seconds={seconds} prepare={prepare}
      publicPath={`studies/work-planning/working-typing${isolated ? '-no-desk' : ''}.svg`}
      expectedSha256={isolated ? '7d2bdcdb19035c341e94ad052930dfe63cb31cc7e587bb8f38cab464665693a7'
        : '11e6f3cddf6f5f6e8de584c612d18f7afdc4b30991cd15142b8cade0f85e1a4d'}/>
    {diagram && <svg viewBox={viewBox} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}}>
      {joints.map(joint => {
        const parent = joints.find(other => other.id === joint.parentId);
        const color = joint.side === 'near' ? '#006b86' : '#8740a0';
        const label = `${joint.side === 'near' ? 'N' : 'F'}${joint.kind[0]!.toUpperCase()}`;
        const {x, y} = joint.actual;
        const dx = joint.kind === 'wrist' ? -5 : 4;
        const dy = joint.kind === 'shoulder' ? -6 : joint.kind === 'elbow' ? 7 : 9;
        return <g key={joint.id}>
          {parent && <line x1={parent.actual.x} y1={parent.actual.y} x2={x} y2={y}
            stroke="white" strokeWidth={1.3}/>}
          {parent && <line x1={parent.actual.x} y1={parent.actual.y} x2={x} y2={y}
            stroke={color} strokeWidth={.55} strokeDasharray="1.4 .7"/>}
          <circle cx={x} cy={y} r={1.6} fill={color} stroke="white" strokeWidth={.45}/>
          <line x1={x} y1={y} x2={x + dx} y2={y + dy} stroke={color} strokeWidth={.25}/>
          <rect x={x + dx - 3.7} y={y + dy - 2.5} width={7.4} height={4.2} rx={.7} fill="white" stroke={color} strokeWidth={.15}/>
          <text x={x + dx} y={y + dy + .45} textAnchor="middle" fill={color} fontFamily="Arial, sans-serif" fontWeight={700} fontSize={2.5}>{label}</text>
        </g>;
      })}
    </svg>}
  </AbsoluteFill>;
};

registerRoot(() => <Composition id="WorkPlanningArmature" component={ArmatureStudy}
  width={1280} height={900} fps={30} durationInFrames={91}
  defaultProps={{view: 'human', baseline: false, diagram: false, qa: false}}
  calculateMetadata={({props}) => ({width: props.view === 'human' ? 720 : props.view === 'phone' ? 640 : 1280,
    height: props.view === 'human' ? 980 : props.view === 'phone' ? 360 : props.view === 'closeup' ? 708 : 900})}/>);
