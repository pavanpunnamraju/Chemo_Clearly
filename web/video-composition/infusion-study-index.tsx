import React, { useLayoutEffect } from "react";
import { AbsoluteFill, Composition, continueRender, delayRender, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";
import { InfusionArtwork } from "./directed/InfusionArtwork";

export const InfusionStudy: React.FC<{ reducedMotion?: boolean; fluidDropFraction?: number; qaMode?: boolean }> =
  ({ reducedMotion = false, fluidDropFraction = 1, qaMode = false }) => {
    const { fps } = useVideoConfig();
    const seconds = useCurrentFrame() / fps;
    useLayoutEffect(() => {
      if (!qaMode) return;
      const handle = delayRender("Infusion rendered geometry audit");
      let done = false;
      const inspect = () => {
        const svg = document.querySelector<SVGSVGElement>("svg[data-prepared-infusion]");
        if (!svg || Number(svg.getAttribute("data-infusion-seconds")) !== seconds) return;
        const motion = svg.getAttribute("data-infusion-motion");
        if (!motion || done) return;
        done = true;
        const bounds = (element: Element) => {
          const b = element.getBoundingClientRect();
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        };
        const layers = [...svg.querySelectorAll<SVGGraphicsElement>("[data-infusion-layer]")].map(node => ({
          name: node.getAttribute("data-infusion-layer"), transform: node.getAttribute("transform"),
          opacity: node.getAttribute("opacity"), bounds: bounds(node),
        }));
        const ids = [...svg.querySelectorAll("[id]")].map(node => node.id);
        console.log("INFUSION_QA:" + JSON.stringify({ seconds, reducedMotion, motion: JSON.parse(motion), layers,
          uniqueIds: new Set(ids).size === ids.length,
          iconRemoved: !svg.querySelector("[id*='speech-bubble'],[id*='Ribbon']"),
          clipY: Number(svg.querySelector("[data-infusion-layer='bag-fluid-clip'] rect")?.getAttribute("y")),
          clipHeight: Number(svg.querySelector("[data-infusion-layer='bag-fluid-clip'] rect")?.getAttribute("height")),
          mouthPath: svg.querySelector("[data-infusion-layer='mouth-line']")?.getAttribute("d"),
          mouthLayerCount: svg.querySelectorAll("[data-infusion-layer^='mouth-']").length,
          nosePoints: svg.querySelector("[data-infusion-layer^='nose-']")?.getAttribute("points"),
          svgBounds: bounds(svg) }));
        continueRender(handle);
      };
      const observer = new MutationObserver(inspect);
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
      inspect();
      return () => { observer.disconnect(); continueRender(handle); };
    }, [seconds, reducedMotion, qaMode]);
    return <AbsoluteFill style={{ backgroundColor: "#F4F7F6" }}>
      <div style={{ position: "absolute", inset: "24px 70px 44px" }}>
        <InfusionArtwork seconds={seconds} durationSeconds={24}
          reducedMotion={reducedMotion} fluidDropFraction={fluidDropFraction} />
      </div>
      <div style={{ position: "absolute", bottom: 12, width: "100%", textAlign: "center", color: "#455A64", font: "14px sans-serif" }}>
        Illustration adapted from Storyset / Freepik
      </div>
    </AbsoluteFill>;
  };

const Root = () => <Composition id="InfusionStudy" component={InfusionStudy}
  width={1000} height={900} fps={30} durationInFrames={720}
  defaultProps={{ reducedMotion: false, fluidDropFraction: 1 }} />;
registerRoot(Root);
