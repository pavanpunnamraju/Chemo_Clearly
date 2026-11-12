import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Composition, continueRender, delayRender, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";
import { CallingStudy } from "./CallingStudy";
import { DrinkingStudy } from "./DrinkingStudy";
import { DrinkingArtwork } from "./directed/DrinkingArtwork";
import { DRINKING_RIM } from "../lib/video/drinking-study-motion";

/** A test-only composition: independent contact/rest instances exercise SVG isolation. */
const SimultaneousDrinking = () => {
  const root = useRef<HTMLDivElement>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  useLayoutEffect(() => {
    const handle = delayRender("Approved artwork regression: DOM checks");
    let cancelled = false;
    let released = false;
    const release = () => { if (!released) { released = true; continueRender(handle); } };
    const inspect = async () => {
      for (let attempt = 0; attempt < 300; attempt++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        const svgs = [...(root.current?.querySelectorAll<SVGSVGElement>("[data-approved-artwork] > svg") ?? [])];
        if (svgs.length !== 2 || root.current!.getBoundingClientRect().width < 1 ||
            svgs.some((svg) => !svg.querySelector("[data-motion-layer='original-hand-and-glass']")?.hasAttribute("transform"))) continue;
        const ids = svgs.flatMap((svg) => [...svg.querySelectorAll("[id]")].map((node) => node.id));
        const instances = svgs.map((svg) => {
          const grip = svg.querySelector<SVGGElement>("[data-motion-layer='original-hand-and-glass']")!;
          const water = svg.querySelector<SVGPathElement>("[data-motion-layer='level-water-surface']")!;
          const clip = water.parentElement!.getAttribute("clip-path")!;
          const clipId = /^url\(#(.+)\)$/.exec(clip)?.[1];
          const ownedIds = new Set([...svg.querySelectorAll("[id]")].map((node) => node.id));
          const references = [...svg.querySelectorAll("*")].flatMap((node) => [...node.attributes].flatMap((attribute) =>
            [...attribute.value.matchAll(/url\(#([^)]*)\)/g)].map((match) => match[1]!)));
          const point = svg.createSVGPoint();
          point.x = DRINKING_RIM.x; point.y = DRINKING_RIM.y;
          const matrix = svg.getScreenCTM()!.inverse().multiply(grip.getScreenCTM()!);
          const rim = point.matrixTransform(matrix);
          return { clipId, ownsClip: !!clipId && ownedIds.has(clipId), references,
            allReferencesOwned: references.every((id) => ownedIds.has(id)),
            waterFill: getComputedStyle(water).fill, rim: { x: rim.x, y: rim.y }, transform: grip.getAttribute("transform") };
        });
        console.log(`APPROVED_ARTWORK_QA ${JSON.stringify({ frame, ids, uniqueIds: new Set(ids).size === ids.length, instances })}`);
        return;
      }
      throw new Error("Artwork regression: both visible, prepared instances did not become ready");
    };
    inspect().catch((error: unknown) => console.log(`APPROVED_ARTWORK_QA ${JSON.stringify({ frame, error: String(error) })}`)).finally(release);
    return () => { cancelled = true; release(); };
  }, [frame]);
  return <AbsoluteFill ref={root} style={{ background: "#F4F7F6", display: "flex", flexDirection: "row" }}>
    <DrinkingArtwork seconds={frame / fps} style={{ width: 640, height: 720 }} />
    <DrinkingArtwork seconds={0} style={{ width: 640, height: 720 }} />
  </AbsoluteFill>;
};

registerRoot(() => <>
  <Composition id="CallingRegression" component={CallingStudy} width={1280} height={720} fps={30} durationInFrames={360} defaultProps={{ reducedMotion: false, camera: true }} />
  <Composition id="DrinkingRegression" component={DrinkingStudy} width={1280} height={720} fps={30} durationInFrames={314} defaultProps={{ reducedMotion: false, camera: true }} />
  <Composition id="SimultaneousDrinking" component={SimultaneousDrinking} width={1280} height={720} fps={30} durationInFrames={314} />
</>);
