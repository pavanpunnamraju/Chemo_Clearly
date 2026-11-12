import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { DirectedFonts } from "./directed/DirectedFonts";
import { FONT_FAMILY, FRAME_BG, NAVY, TEAL } from "./directed/DirectedTheme";
import { drinkingStudyPose } from "../lib/video/drinking-study-motion";
import { DrinkingArtwork } from "./directed/DrinkingArtwork";
export { prepareDrinkingArtwork } from "./directed/DrinkingArtwork";

export const DrinkingStudy: React.FC<{ reducedMotion?: boolean; camera?: boolean }> = ({ reducedMotion = false, camera = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const pose = drinkingStudyPose(seconds, reducedMotion);
  const scale = camera && !reducedMotion ? 1 + .025 * pose.reach : 1;
  return <AbsoluteFill style={{ backgroundColor: FRAME_BG, fontFamily: FONT_FAMILY, overflow: "hidden" }}>
    <DirectedFonts />
    <div style={{ position: "absolute", left: 10, top: 45, width: 680, height: 640, background: `radial-gradient(ellipse at 48% 48%, ${TEAL}22, ${FRAME_BG} 70%)` }} />
    <DrinkingArtwork seconds={seconds} reducedMotion={reducedMotion} style={{ position: "absolute", left: 70, top: 60, width: 596, height: 661, transform: `scale(${scale})`, transformOrigin: "46% 50%" }} />
    <div style={{ position: "absolute", left: 722, top: 205, width: 494 }}>
      <div style={{ color: NAVY, fontSize: 76, fontWeight: 800, lineHeight: 1.08 }}>A sip<br />of water</div>
      <div style={{ color: TEAL, fontSize: 34, fontWeight: 700, lineHeight: 1.2, marginTop: 22 }}>Take a moment</div>
    </div>
    <div style={{ position: "absolute", left: 722, right: 64, bottom: 64, color: NAVY, fontSize: 17, lineHeight: 1.4 }}>Silent motion study<br />Artwork adapted from Storyset / Freepik</div>
  </AbsoluteFill>;
};
