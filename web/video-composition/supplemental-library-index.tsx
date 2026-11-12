import React from "react";
import { AbsoluteFill, Composition, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";
import { supplementalArtworkRecipe } from "../lib/video/library-supplemental-motion";
import { LibrarySvgArtwork } from "./directed/LibrarySvgArtwork";
import { prepareSupplementalArtwork } from "./directed/SupplementalLibraryArtwork";
import { DirectedFonts } from "./directed/DirectedFonts";

const Probe: React.FC<{ artworkId: string; reducedMotion?: boolean; qaMode?: boolean }> = ({ artworkId, reducedMotion = false, qaMode = false }) => {
  const seconds = useCurrentFrame() / useVideoConfig().fps;
  const recipe = supplementalArtworkRecipe(artworkId)!;
  return <AbsoluteFill style={{ backgroundColor: "#F4F7F6", fontFamily: "Figtree, sans-serif" }}>
    <DirectedFonts />
    <div style={{ position: "absolute", inset: "30px 24px 70px" }}>
      <LibrarySvgArtwork artworkId={artworkId} publicPath={recipe.publicPath} expectedSha256={recipe.sourceSha256} seconds={seconds} reducedMotion={reducedMotion}
        prepare={(svg) => {
          const rig = prepareSupplementalArtwork(svg, artworkId);
          return { apply(time, reduced) {
            rig.apply(time, reduced);
            if (qaMode) console.info(`SUPPLEMENTAL_QA:${JSON.stringify({ artworkId, seconds: time, reducedMotion: reduced, ...rig.audit() })}`);
          } };
        }} />
    </div>
    <div style={{ position: "absolute", bottom: 40, width: "100%", textAlign: "center", color: "#1C2B45", fontSize: 17 }}>{artworkId}</div>
    <div style={{ position: "absolute", bottom: 22, width: "100%", textAlign: "center", color: "#455A64", fontSize: 11 }}>Optional context illustration · silent motion study</div>
    <div style={{ position: "absolute", bottom: 7, width: "100%", textAlign: "center", color: "#455A64", fontSize: 11 }}>Illustration: Storyset / Freepik · visual review pending</div>
  </AbsoluteFill>;
};
registerRoot(() => <Composition id="SupplementalLibraryProbe" component={Probe} width={600} height={560} fps={30} durationInFrames={361} defaultProps={{ artworkId: "supplemental-gentle-activity", qaMode: false }} />);
