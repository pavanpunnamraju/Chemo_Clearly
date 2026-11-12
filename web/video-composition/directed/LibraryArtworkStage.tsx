import React from "react";
import { activeArtworkBeat } from "../../lib/video/library-direction";
import { PATIENT_ARTWORK_RECIPES } from "../../lib/video/library-patient-motion";
import { contextArtworkRecipe } from "../../lib/video/library-context-motion";
import type { DirectedShot } from "../../lib/video/direction-types";
import { LibraryPatientArtwork } from "./LibraryPatientArtwork";
import { LibraryContextArtwork } from "./LibraryContextArtwork";
import { ADDITIONAL_CARE_ARTWORK, AdditionalCareArtwork } from "./AdditionalCareArtwork";
import { ApprovedArtworkStage } from "./ApprovedArtworkStage";
import { libraryArtworkClock } from "../../lib/video/library-artwork-clock";

export const LibraryArtwork: React.FC<{ artworkId: string; seconds: number; reducedMotion?: boolean; style?: React.CSSProperties }> = (props) => {
  if (PATIENT_ARTWORK_RECIPES[props.artworkId]) return <LibraryPatientArtwork {...props} />;
  if (contextArtworkRecipe(props.artworkId)) return <LibraryContextArtwork {...props} />;
  if ((ADDITIONAL_CARE_ARTWORK as readonly string[]).includes(props.artworkId)) return <AdditionalCareArtwork {...props} />;
  throw new Error(`Artwork has no implemented renderer: ${props.artworkId}`);
};

/** A source-bound cutaway may change within an entry, but never changes the
 * narration/caption clock or starts the next source's text early. */
export const LibraryArtworkStage: React.FC<{ shot: DirectedShot; seconds: number; reducedMotion: boolean; emergency?: boolean }> = ({ shot, seconds, reducedMotion, emergency = false }) => {
  const beat = activeArtworkBeat(shot, shot.startSeconds + seconds);
  if (!beat) throw new Error(`No library artwork on narration clock: ${shot.id}/${seconds}`);
  const localSeconds = Math.max(0, shot.startSeconds + seconds - beat.startSeconds);
  const duration = beat.endSeconds - beat.startSeconds;
  const clock = libraryArtworkClock(beat.artworkId, localSeconds, duration, reducedMotion);
  if (beat.artworkId === "approved-calling" || beat.artworkId === "approved-drinking") {
    const calling = beat.artworkId === "approved-calling";
    const projected = { ...shot, startSeconds: beat.startSeconds, endSeconds: beat.endSeconds, cueSeconds: beat.startSeconds,
      assetId: calling ? "patient-contact" : "patient-hydration", action: calling ? "call" as const : "drink" as const };
    return <ApprovedArtworkStage shot={projected} seconds={localSeconds} reducedMotion={reducedMotion} emergency={emergency} />;
  }
  const onLeft = emergency || shot.staging === "left";
  const artWidth = emergency ? 494 : 586;
  const scale = reducedMotion || shot.camera === "establish" ? 1 : 1 + .035 * Math.min(1, Math.max(0, localSeconds - 1) / 5);
  const isCutaway = beat.startSeconds > shot.startSeconds;
  const opacity = reducedMotion || !isCutaway ? 1 : Math.min(1, localSeconds / .35);
  return <div data-layout-id="illustration-stage" data-artwork-beat={beat.artworkId} style={{ position: "absolute", left: onLeft ? 30 : 635,
    top: 113, width: artWidth, height: 488, opacity }}>
    <div style={{ width: "100%", height: "100%", transform: `scale(${scale})`, transformOrigin: "50% 55%" }}>
      <LibraryArtwork key={beat.artworkId} artworkId={beat.artworkId} seconds={clock.seconds} reducedMotion={clock.still} />
    </div>
  </div>;
};
