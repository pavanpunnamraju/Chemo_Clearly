import React from 'react';
import {AbsoluteFill, Freeze, Img, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {FLOW_CLIPS, flowClipState, sourceFrameToCompositionFrame, type FlowClipAsset} from '../../lib/video/flow-clip-motion';

const HEART = 'studies/reading-recovery/twemoji/2764.svg';

export const FlowClipScene: React.FC<{
  asset: FlowClipAsset;
  durationSeconds: number;
  reducedMotion?: boolean;
}> = ({asset, durationSeconds, reducedMotion = false}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const state = flowClipState({asset, frame, fps, durationSeconds, reducedMotion});
  const heartVisible = state.heartState !== 'hidden' && state.heartState !== 'pause';
  const heartOpacity = state.heartState === 'pop'
    ? Math.min(1, state.heartProgress / .12)
    : state.heartState === 'fade'
      ? Math.max(0, 1 - (state.heartProgress - 1.18) / .37) : 1;
  const heartScale = state.heartState === 'pop'
    ? .5 + .5 * Math.min(1, state.heartProgress / .22) : 1;
  const heartRise = Math.min(1, state.heartProgress / 1.55) * 43;

  return <AbsoluteFill style={{backgroundColor: '#fff', overflow: 'hidden'}}
    data-flow-asset={asset}
    data-flow-source-frame={state.sourceFrame}
    data-flow-completed-cycles={state.completedCycles}
    data-flow-heart-state={state.heartState}>
    <Freeze frame={sourceFrameToCompositionFrame(state.sourceFrame, fps)}>
      <OffthreadVideo muted src={staticFile(FLOW_CLIPS[asset].path)}
        style={{width: '100%', height: '100%', objectFit: 'contain'}} />
    </Freeze>
    {heartVisible && <Img src={staticFile(HEART)} alt=""
      style={{position: 'absolute', left: '60.5%', top: '37%', width: '3.2%', height: '5.7%',
        opacity: heartOpacity, transform: `translateY(${-heartRise}px) scale(${heartScale})`,
        transformOrigin: '50% 80%'}} />}
  </AbsoluteFill>;
};
