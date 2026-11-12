import React from "react";
import type { DirectedShot } from "../../lib/video/direction-types";
import { approvedArtworkMotion } from "../../lib/video/approved-artwork-motion";
import { CallingArtwork } from "./CallingArtwork";
import { DrinkingArtwork } from "./DrinkingArtwork";

/** Original portrait bounds replace the generic rig's focus/rounded clipping.
 * The torso meets the frame edge; hands and faces stay inside the stage.
 * The study wrappers' camera is absent: this is the only artwork camera. */
export const ApprovedArtworkStage: React.FC<{ shot: DirectedShot; seconds: number; reducedMotion: boolean; emergency?: boolean }> = ({ shot, seconds, reducedMotion, emergency = false }) => {
  const motion = approvedArtworkMotion(shot, seconds, reducedMotion);
  const onLeft = emergency || shot.staging === "left";
  const height = emergency ? 586 : 630;
  const width = motion.artwork === "calling" ? height * 124 / 202 : height * 312 / 346;
  return <div data-layout-id="illustration-stage" data-approved-artwork={motion.artwork} data-motion-clock={motion.seconds} data-motion-still={motion.still} style={{ position: "absolute", left: onLeft ? 16 : 626, top: 720 - height, width: emergency ? 510 : 620, height, display: "flex", justifyContent: "center", alignItems: "flex-end" }}>
    <div style={{ width, height, flexShrink: 0, transform: `scale(${motion.scale})`, transformOrigin: motion.artwork === "calling" ? "50% 55%" : "46% 50%" }}>
      {motion.artwork === "calling" ? <CallingArtwork seconds={motion.seconds} reducedMotion={motion.still} style={{ width: "100%", height: "100%" }} /> : <DrinkingArtwork seconds={motion.seconds} reducedMotion={motion.still} style={{ width: "100%", height: "100%" }} />}
    </div>
  </div>;
};
