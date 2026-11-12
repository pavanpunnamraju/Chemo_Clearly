import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { TimedCaption } from "../../lib/video/captions";

/** Captions use the existing source-aligned JSON track, separately from the
 * camera layer. No karaoke highlighting or invented per-word timestamps. */
export const DirectedCaptions: React.FC<{ captions: TimedCaption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const caption = captions.find((cue) => now >= cue.startSeconds && now < cue.endSeconds);
  if (!caption) return null;
  return <div data-qa-region="captions" data-layout-id="captions" style={{ position: "absolute", left: 64, right: 64, bottom: 27, display: "flex", justifyContent: "center", zIndex: 20 }}>
    <div data-qa-text="caption" style={{ maxWidth: 1120, boxSizing: "border-box", padding: "15px 27px", borderRadius: 13, backgroundColor: "#193A3DF2", color: "#FFFFFF", fontSize: 36, fontWeight: 500, lineHeight: 1.26, textAlign: "center", boxShadow: "0 4px 18px #17363814", overflowWrap: "break-word" }}>{caption.text}</div>
  </div>;
};
