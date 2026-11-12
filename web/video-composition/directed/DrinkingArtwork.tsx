import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { namespaceSvgIds } from "./namespace-svg";
import { drinkingOutlinePoint, drinkingGripTransform, drinkingStudyPose, drinkingWaterLevel, DRINKING_LIP, DRINKING_RIM } from "../../lib/video/drinking-study-motion";
import { sampleClosedPath, pointsToClosedPathD } from "../../lib/video/arm-deform";

const SVG_NS = "http://www.w3.org/2000/svg";

export function prepareDrinkingArtwork(svg: SVGSVGElement) {
  const character = svg.querySelector<SVGGElement>("[id='freepik--character-1--inject-2']");
  if (!character || character.children.length !== 42) throw new Error("Drinking source layer count changed");
  const nodes = [...character.children];
  if (!nodes[0]?.getAttribute("d")?.startsWith("M234.29,286.39") ||
      !nodes[5]?.getAttribute("d")?.startsWith("M227.24,249") ||
      !nodes[36]?.getAttribute("d")?.startsWith("M187.33,234.15")) throw new Error("Drinking source contact paths changed");
  svg.querySelector("[id='freepik--background-simple--inject-2']")?.remove();
  svg.querySelector("[id='freepik--speech-bubble-1--inject-2']")?.remove();
  const arm = nodes[0] as SVGPathElement;
  const originalArm = arm.getAttribute("d")!;
  const outline = sampleClosedPath(arm, 1600);
  const lengthOf = (d: string) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    return path.getTotalLength();
  };
  const topEnd = lengthOf(originalArm.slice(0, originalArm.indexOf("L279.3")));
  const distalEnd = lengthOf(originalArm.slice(0, originalArm.indexOf("c-11.75")));
  const bottomEnd = lengthOf(originalArm.replace(/Z$/i, ""));
  const total = arm.getTotalLength();
  const sections = outline.map((_, i) => {
    const distance = i * total / outline.length;
    if (distance <= topEnd) return { section: "top" as const, t: distance / topEnd };
    if (distance <= distalEnd) return { section: "distal" as const, t: 0 };
    if (distance <= bottomEnd) return { section: "bottom" as const, t: (distance - distalEnd) / (bottomEnd - distalEnd) };
    return { section: "seam" as const, t: 0 };
  });
  const grip = document.createElementNS(SVG_NS, "g");
  grip.setAttribute("data-motion-layer", "original-hand-and-glass");
  // The source glass is behind the face. It must be foreground for the rim to
  // reach the mouth instead of disappearing behind the cheek. Keep grip order.
  character.append(grip);
  grip.append(...nodes.slice(1, 17));
  // User-requested soft blue water, contained inside the original glass.
  // The liquid surface stays horizontal in the scene while the vessel tilts.
  const defs = document.createElementNS(SVG_NS, "defs");
  defs.innerHTML = '<clipPath id="drinking-glass-interior"><path d="M230 247L245 221L292 251Q293 262 281.5 271.8Z"/></clipPath>';
  svg.prepend(defs);
  const water = nodes[8] as SVGPathElement;
  water.style.fill = "#8ACCE8";
  const waterClip = document.createElementNS(SVG_NS, "g");
  waterClip.setAttribute("clip-path", "url(#drinking-glass-interior)");
  water.before(waterClip);
  waterClip.append(water);
  water.setAttribute("data-motion-layer", "level-water-surface");
  arm.setAttribute("data-motion-layer", "continuous-original-arm");
  svg.setAttribute("viewBox", "58 128 312 346");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Woman bringing a glass to her lips for a small sip and returning it");
  svg.style.width = "100%"; svg.style.height = "100%";
  return { arm, originalArm, outline, sections, grip, water, mouth: [nodes[36], nodes[37]] };
}

/** Approved source motion. The scene owns framing, camera, titles and background.
 * Pass shot-relative seconds; the drinking speed adjustment lives in its motion module.
 */
export const DrinkingArtwork: React.FC<{
  seconds: number;
  reducedMotion?: boolean;
  style?: React.CSSProperties;
}> = ({ seconds, reducedMotion = false, style }) => {
  const instanceId = useId();
  const host = useRef<HTMLDivElement>(null);
  const rig = useRef<ReturnType<typeof prepareDrinkingArtwork> | null>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("Preparing supplied drinking artwork"));
  useLayoutEffect(() => {
    let cancelled = false;
    fetch(staticFile("studies/drinking/drinking-water-pana.svg")).then((response) => {
      if (!response.ok) throw new Error("Missing approved drinking artwork snapshot");
      return response.text();
    }).then((source) => {
      if (cancelled) return;
      const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
      if (parsed.querySelector("parsererror")) throw new Error("Invalid drinking SVG");
      const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
      host.current!.replaceChildren(svg);
      rig.current = prepareDrinkingArtwork(svg);
      namespaceSvgIds(svg, `drinking-${instanceId}`);
      setReady(true);
    }).catch(cancelRender);
    return () => { cancelled = true; continueRender(handle); };
  }, [handle, instanceId]);
  const pose = drinkingStudyPose(seconds, reducedMotion);
  useLayoutEffect(() => {
    if (!ready || !rig.current) return;
    const { arm, originalArm, outline, sections, grip, water, mouth } = rig.current;
    grip.setAttribute("transform", drinkingGripTransform(seconds, reducedMotion));
    arm.setAttribute("d", pose.reach === 0 ? originalArm : pointsToClosedPathD(outline.map((point, i) => drinkingOutlinePoint(point, sections[i]!.section, sections[i]!.t, seconds, reducedMotion))));
    mouth.forEach((path) => path!.setAttribute("transform", `translate(${DRINKING_LIP.x} ${DRINKING_LIP.y}) scale(1 ${1 - .65 * pose.reach}) translate(${-DRINKING_LIP.x} ${-DRINKING_LIP.y})`));
    const level = drinkingWaterLevel(seconds, reducedMotion);
    water.setAttribute("d", `M100 ${level}H400V500H100Z`);
    water.setAttribute("transform", `translate(${DRINKING_RIM.x} ${DRINKING_RIM.y}) rotate(${-pose.degrees}) translate(${-pose.rim.x} ${-pose.rim.y})`);
    continueRender(handle);
  }, [ready, seconds, reducedMotion, pose.reach, handle]);
  return <div ref={host} data-approved-artwork="drinking" style={{ width: "100%", height: "100%", ...style }} />;
};
