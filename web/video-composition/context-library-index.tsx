import React from "react";
import { AbsoluteFill, Composition, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";
import { LibraryContextArtwork } from "./directed/LibraryContextArtwork";
import { DirectedFonts } from "./directed/DirectedFonts";
import { contextArtworkRecipe } from "../lib/video/library-context-motion";

const ContextProbe: React.FC<{ artworkId: string; reducedMotion?: boolean }> = ({ artworkId, reducedMotion = false }) => {
  const seconds = useCurrentFrame() / useVideoConfig().fps;
  return <AbsoluteFill style={{ backgroundColor: "#F4F7F6", fontFamily: "Figtree, sans-serif" }}>
    <DirectedFonts />
    <div style={{ position: "absolute", inset: "30px 24px 55px" }}><LibraryContextArtwork artworkId={artworkId} seconds={seconds} reducedMotion={reducedMotion} /></div>
    <div style={{ position: "absolute", bottom: 24, width: "100%", textAlign: "center", color: "#1C2B45", fontSize: 17 }}>{artworkId}</div>
    <div style={{ position: "absolute", bottom: 7, width: "100%", textAlign: "center", color: "#455A64", fontSize: 11 }}>
      {contextArtworkRecipe(artworkId)?.sourceKind === "storyset" ? "Illustration: Storyset / Freepik" : "Original vector illustration"} · visual review pending
    </div>
  </AbsoluteFill>;
};
const Root = () => <Composition id="ContextLibraryProbe" component={ContextProbe} width={600} height={560} fps={30} durationInFrames={300} defaultProps={{ artworkId: "context-infusion" }} />;
registerRoot(Root);
