import React from "react";
import {BoundaryTransitionStage} from "./BoundaryTransitionStage";
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import type { DirectedVideoProps } from "../../lib/video/direction-types";
import { DirectedScene, SCENE_COLORS } from "./DirectedScene";
import { DirectedCaptions } from "./DirectedCaptions";
import { DirectedFonts } from "./DirectedFonts";
import { DirectedLayoutQA } from "./DirectedLayoutQA";
import { FRAME_BG, FONT_FAMILY } from "./DirectedTheme";

export const DirectedVideo: React.FC<DirectedVideoProps> = ({ direction, audioSrc, captions, captionsEnabled = true, reducedMotion = false, musicSrc, qaMode = false }) => {
  const { fps } = useVideoConfig();
  const renderShot=(index:number)=>{const shot=direction.shots[index]!;const next=direction.shots[index+1];return <DirectedScene shot={shot} nextColor={SCENE_COLORS[next?.scene??shot.scene]} index={index} reducedMotion={reducedMotion} transitionDisabled={Boolean(direction.transitionPlan)}/>;};
  return <AbsoluteFill data-directed-root style={{ fontFamily: FONT_FAMILY, backgroundColor: FRAME_BG }}>
    <DirectedFonts />
    {audioSrc ? <Audio src={staticFile(audioSrc)} /> : null}
    {musicSrc ? <Audio src={staticFile(musicSrc)} volume={.025} loop /> : null}
    {direction.shots.map((shot, index) => {
      const from = Math.round(shot.startSeconds * fps);
      const end = Math.round(shot.endSeconds * fps);
      const next = direction.shots[index + 1];
      const nextColor = SCENE_COLORS[next?.scene ?? shot.scene];
      return <Sequence key={shot.id} name={`${shot.sectionId}: ${shot.headline}`} from={from} durationInFrames={Math.max(1, end - from)}>
        {renderShot(index)}
      </Sequence>;
    })}
    <BoundaryTransitionStage shots={direction.shots.map(s=>({id:s.id,from:Math.round(s.startSeconds*fps),duration:Math.max(1,Math.round(s.endSeconds*fps)-Math.round(s.startSeconds*fps))}))} plan={direction.transitionPlan} renderShot={renderShot} reducedMotion={reducedMotion}/>
    {captionsEnabled ? <DirectedCaptions captions={captions} /> : null}
    {qaMode ? <DirectedLayoutQA /> : null}
  </AbsoluteFill>;
};
