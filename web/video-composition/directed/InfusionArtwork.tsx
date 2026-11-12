import React from "react";
import { infusionMotionState } from "../../lib/video/infusion-motion";
import { LibrarySvgArtwork, type LibrarySvgRig } from "./LibrarySvgArtwork";

const SVG_NS = "http://www.w3.org/2000/svg";
const SOURCE_PATH = "illustrations/overview/overview__oncology-patient-pana.svg";
const SOURCE_SHA256 = "86bedce3698e62d3ab5fe35c31ade22da1481725beeece2813d12ebf5d6cc650";

const get = <T extends SVGElement>(svg: SVGSVGElement, id: string): T => {
  const node = svg.querySelector<T>(`[id='${id}']`);
  if (!node) throw new Error(`Infusion source layer missing: ${id}`);
  return node;
};

export interface PrepareInfusionOptions {
  durationSeconds?: number;
  fluidDropFraction?: number;
}

export function prepareInfusionArtwork(svg: SVGSVGElement, options: PrepareInfusionOptions = {}): LibrarySvgRig {
  const plant = get<SVGGElement>(svg, "freepik--plant--inject-22");
  const pot = get<SVGGElement>(svg, "freepik--Pot--inject-22");
  const face = get<SVGGElement>(svg, "freepik--Face--inject-22");
  const top = get<SVGGElement>(svg, "freepik--Top--inject-22");
  const chemoBag = get<SVGGElement>(svg, "freepik--chemo-bag--inject-22");
  if (plant.children.length !== 41 || pot.children.length !== 4) throw new Error("Infusion plant geometry changed");
  if (face.children.length !== 8 || top.children.length !== 15) throw new Error("Infusion face/head geometry changed");
  if (chemoBag.children.length !== 44) throw new Error("Infusion bag geometry changed");

  const icon = get<SVGGElement>(svg, "freepik--speech-bubble--inject-22");
  if (icon.parentNode !== svg) throw new Error("Infusion icon hierarchy changed");
  icon.remove();

  const foliage = document.createElementNS(SVG_NS, "g");
  foliage.setAttribute("data-infusion-layer", "plant-foliage");
  plant.insertBefore(foliage, pot.nextSibling);
  for (const child of [...plant.children]) if (child !== pot && child !== foliage) foliage.append(child);
  pot.setAttribute("data-infusion-layer", "plant-pot-anchor");

  const head = document.createElementNS(SVG_NS, "g");
  head.setAttribute("data-infusion-layer", "connected-head");
  const topChildren = [...top.children];
  top.insertBefore(head, topChildren[5]!);
  head.append(...topChildren.slice(5, 10));

  const eyes = [face.children[2], face.children[3]] as SVGGraphicsElement[];
  const eyebrows = [face.children[4], face.children[5]] as SVGGraphicsElement[];
  const nose = face.children[6] as SVGPolygonElement;
  const sourceMouth = face.children[7] as SVGPathElement;
  if (!eyes[0]?.getAttribute("d")?.startsWith("M250.6,159.75") ||
      !eyes[1]?.getAttribute("d")?.startsWith("M265,158.73") ||
      !eyebrows[0]?.getAttribute("d")?.startsWith("M249.22,153") ||
      !eyebrows[1]?.getAttribute("d")?.startsWith("M260.29,152.17") ||
      nose.getAttribute("points") !== "254.78 156.92 256.28 169.23 262.95 166.61 254.78 156.92" ||
      !sourceMouth.getAttribute("d")?.startsWith("M250.7,171.51")) throw new Error("Infusion expression paths changed");
  eyes.forEach((node) => node.setAttribute("data-infusion-layer", "eyes"));
  eyebrows.forEach((node) => node.setAttribute("data-infusion-layer", "eyebrows"));
  nose.setAttribute("data-infusion-layer", "nose-expression");
  sourceMouth.setAttribute("data-infusion-layer", "mouth-line");
  const sourceMouthWidth = sourceMouth.getBBox().width;
  if (sourceMouthWidth < 5 || sourceMouthWidth > 7) throw new Error("Infusion mouth bounds changed");
  const targetMouthScale = 7.595 / sourceMouthWidth;

  const fluidPaths = [...chemoBag.querySelectorAll<SVGPathElement>("path")]
    .filter((node) => node.getAttribute("d")?.startsWith("M137.52,144.51"));
  if (fluidPaths.length !== 3) throw new Error("Infusion fluid reservoir geometry changed");
  const defs = document.createElementNS(SVG_NS, "defs");
  const clip = document.createElementNS(SVG_NS, "clipPath");
  clip.id = "infusion-fluid-clip";
  clip.setAttribute("data-infusion-layer", "bag-fluid-clip");
  const clipRect = document.createElementNS(SVG_NS, "rect");
  clipRect.setAttribute("x", "132"); clipRect.setAttribute("y", "126");
  clipRect.setAttribute("width", "36"); clipRect.setAttribute("height", "48");
  clip.append(clipRect); defs.append(clip); svg.insertBefore(defs, svg.firstChild);
  fluidPaths.forEach((node) => {
    node.setAttribute("clip-path", "url(#infusion-fluid-clip)");
    node.setAttribute("data-infusion-layer", "bag-fluid");
  });
  chemoBag.setAttribute("data-infusion-layer", "bag-and-stationary-tube");

  svg.setAttribute("aria-label", "Patient receiving an infusion in the original clinic setting");
  svg.setAttribute("data-prepared-infusion", "true");
  return { apply(seconds, reducedMotion) {
    const state = infusionMotionState(seconds, options.durationSeconds, reducedMotion, options.fluidDropFraction);
    foliage.setAttribute("transform", `rotate(${state.plantDegrees} 72.6 322)`);
    // Keep the head fixed and nose geometry unchanged. A small nose translation
    // follows the same expression clock as the eyes, brows and mouth.
    head.removeAttribute("transform");
    nose.setAttribute("transform", `translate(${-1 * state.expression} ${-0.4 * state.expression})`);
    eyes.forEach((node) => node.setAttribute("transform", `translate(${state.eyeX} ${state.eyeY})`));
    eyebrows.forEach((node) => node.setAttribute("transform", `translate(${state.eyebrowX} ${state.eyebrowY})`));
    // Extend the existing closed line toward the bag (screen-left), retaining
    // its source curve, thickness, color and right-hand endpoint.
    const mouthScale = 1 + (targetMouthScale - 1) * state.expression;
    sourceMouth.setAttribute("transform", `translate(${state.mouthX} 0) translate(256.7 0) scale(${mouthScale} 1) translate(-256.7 0)`);
    clipRect.setAttribute("y", String(state.fluidSurfaceY));
    clipRect.setAttribute("height", String(Math.max(0, 174 - state.fluidSurfaceY)));
    svg.setAttribute("data-infusion-seconds", String(state.elapsedSeconds));
    svg.setAttribute("data-infusion-fluid-surface", String(state.fluidSurfaceY));
    svg.setAttribute("data-infusion-motion", JSON.stringify(state));
  } };
}

export interface InfusionArtworkProps {
  seconds: number;
  durationSeconds?: number;
  reducedMotion?: boolean;
  fluidDropFraction?: number;
  style?: React.CSSProperties;
}

export const InfusionArtwork: React.FC<InfusionArtworkProps> = ({ seconds, durationSeconds,
  reducedMotion = false, fluidDropFraction, style }) =>
  <LibrarySvgArtwork artworkId="directed-infusion" publicPath={SOURCE_PATH} expectedSha256={SOURCE_SHA256}
    seconds={seconds} reducedMotion={reducedMotion} style={style}
    prepare={(svg) => prepareInfusionArtwork(svg, { durationSeconds, fluidDropFraction })} />;
