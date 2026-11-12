import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { DirectedFonts } from "./directed/DirectedFonts";
import { FONT_FAMILY, FRAME_BG, NAVY, TEAL } from "./directed/DirectedTheme";
import { callingStudyPose } from "../lib/video/calling-study-motion";
import { CallingArtwork } from "./directed/CallingArtwork";
export { prepareCallingArtwork } from "./directed/CallingArtwork";

export const CallingStudy: React.FC<{ reducedMotion?: boolean; camera?: boolean }> = ({ reducedMotion = false, camera = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const pose = callingStudyPose(seconds, reducedMotion);
  const scale = camera && !reducedMotion ? 1 + .035 * pose.attention : 1;
  return <AbsoluteFill style={{ backgroundColor: FRAME_BG, fontFamily: FONT_FAMILY, overflow: "hidden" }}>
    <DirectedFonts />
    <div style={{ position: "absolute", left: 40, top: 36, width: 660, height: 620, background: `radial-gradient(ellipse at 48% 48%, ${TEAL}22, ${FRAME_BG} 70%)` }} />
    <CallingArtwork seconds={seconds} reducedMotion={reducedMotion} style={{ position: "absolute", left: 142, top: 38, width: 419, height: 682, transform: `scale(${scale})`, transformOrigin: "50% 55%" }} />
    <div style={{ position: "absolute", left: 678, top: 205, width: 516 }}>
      <div style={{ color: NAVY, fontSize: 76, fontWeight: 800, lineHeight: 1.08 }}>Making<br />a call</div>
      <div style={{ color: TEAL, fontSize: 34, fontWeight: 700, lineHeight: 1.2, marginTop: 22 }}>A moment to listen</div>
    </div>
    <div style={{ position: "absolute", left: 678, right: 64, bottom: 64, color: NAVY, fontSize: 17, lineHeight: 1.4 }}>Silent motion study<br />Artwork adapted from Storyset / Freepik</div>
  </AbsoluteFill>;
};
