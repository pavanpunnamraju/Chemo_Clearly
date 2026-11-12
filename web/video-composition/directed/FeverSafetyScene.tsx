import React from "react";
import type { DirectedShot } from "../../lib/video/direction-types";
import { CREAM, PatientIllustration } from "./PatientIllustration";
import { FRAME_BG, NAVY, TEAL } from "./DirectedTheme";
import { LibraryArtwork } from "./LibraryArtworkStage";

/** Both source alternatives, their shared action and applicability remain
 * together throughout the shot. No numerical reading is invented for the prop. */
export const FeverSafetyScene: React.FC<{ shot: DirectedShot; seconds: number; reducedMotion: boolean }> = ({ shot, seconds, reducedMotion }) => {
  const card = shot.safetyCard;
  if (!card) return null;
  const sourceHeading = shot.headline.match(/\bfever\b/i)?.[0] ?? shot.headline;
  return <>
    <div style={{ position: "absolute", inset: 0, backgroundColor: FRAME_BG }} />
    <div aria-hidden="true" style={{ position: "absolute", left: "-6%", top: "8%", width: "62%", height: "78%", borderRadius: "58% 42% 53% 47% / 44% 55% 45% 56%", background: `radial-gradient(circle at 40% 40%, ${TEAL}22, ${FRAME_BG} 72%)` }} />
    <div data-qa-text="section-label" style={{ position: "absolute", left: 78, top: 54, fontSize: 21, fontWeight: 700, letterSpacing: 2.1, color: NAVY }}>WHEN TO GET HELP</div>
    <div data-qa-text="headline" style={{ position: "absolute", left: 77, top: 130, width: 300, color: NAVY, fontSize: 52, fontWeight: 800, lineHeight: 1.1 }}>{sourceHeading}</div>
    <div data-qa-text="applicability" style={{ position: "absolute", left: 80, top: 218, width: 284, color: TEAL, fontSize: 34, fontWeight: 700, lineHeight: 1.2 }}>{card.applicability}</div>
    <div style={{ position: "absolute", left: 13, top: 295, width: 355, height: 295 }}>{shot.artworkBeats?.length ? <LibraryArtwork artworkId="care-thermometer" seconds={seconds} reducedMotion={reducedMotion} /> : <PatientIllustration action="temperature" seconds={seconds} cue={Math.max(.4, shot.cueSeconds - shot.startSeconds)} reducedMotion={reducedMotion} />}</div>
    {card.criteria.map((criterion, i) => <React.Fragment key={criterion}>
      {i > 0 && <div data-qa-text="alternative-operator" style={{ position: "absolute", left: 430, top: 254 + (i - 1) * 155, width: 732, textAlign: "center", color: NAVY, fontSize: 24, lineHeight: 1, fontWeight: 700, letterSpacing: 2 }}>OR</div>}
      <div style={{ position: "absolute", left: 407, top: 121 + i * 161, width: 793, minHeight: 117, display: "flex", alignItems: "center", boxSizing: "border-box", padding: "16px 26px", borderRadius: 18, backgroundColor: "#fff8f6", border: "2px solid #c23b34" }}>
        <div data-qa-text={`fever-criterion-${i}`} style={{ color: NAVY, fontSize: 36, lineHeight: 1.2, fontWeight: 700 }}>{criterion}</div>
      </div>
    </React.Fragment>)}
    <div data-qa-text="immediate-action" style={{ position: "absolute", left: 415, top: 430, width: 778, color: NAVY, fontSize: 34, lineHeight: 1.24, fontWeight: 700 }}>{card.action}</div>
  </>;
};
