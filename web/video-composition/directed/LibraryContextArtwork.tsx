import React from "react";
import { contextArtworkRecipe, contextMotion } from "../../lib/video/library-context-motion";
import { LibrarySvgArtwork, type LibrarySvgRig } from "./LibrarySvgArtwork";
import { PatientCareObjects } from "./PatientCareObjects";

const SVG_NS = "http://www.w3.org/2000/svg";
const get = (svg: SVGSVGElement, id: string) => {
  const node = svg.querySelector<SVGGraphicsElement>(`[id='${id}']`);
  if (!node) throw new Error(`Context source layer missing: ${id}`);
  return node;
};
const remove = (svg: SVGSVGElement, ids: string[]) => ids.forEach((id) => svg.querySelectorAll(`[id='${id}']`).forEach((node) => node.remove()));
function retainChildren(node: SVGGraphicsElement, expected: number, indices: number[]) {
  if (node.children.length !== expected) throw new Error(`Context source child order changed: ${node.id}`);
  [...node.children].forEach((child, index) => { if (!indices.includes(index)) child.remove(); });
}
function blankLines(node: SVGGraphicsElement, x: number, y: number, width: number, spacing: number) {
  for (let index = 0; index < 3; index++) {
    const line = document.createElementNS(SVG_NS, "path");
    line.setAttribute("d", `M${x} ${y + index * spacing}h${width - index * 12}`);
    line.setAttribute("stroke", "#CFDEDA"); line.setAttribute("stroke-width", "4"); line.setAttribute("stroke-linecap", "round");
    line.setAttribute("data-context-layer", "blank-source-label-space"); node.append(line);
  }
}

/** Source-specific preparation strips potentially misleading stock content.
 * Crops are derived only after removals; no character paths are recolored. */
export function prepareContextArtwork(svg: SVGSVGElement, artworkId: string): LibrarySvgRig {
  const recipe = contextArtworkRecipe(artworkId);
  if (!recipe?.publicPath) throw new Error(`Unknown context source: ${artworkId}`);
  const rotating: { node: SVGGraphicsElement; base: string; x: number; y: number; multiplier: number; phase: number }[] = [];
  const blinks: { node: SVGGraphicsElement; base: string; x: number; y: number }[] = [];
  const rig = (node: SVGGraphicsElement, multiplier = 1, phase = 0) => {
    const box = node.getBBox();
    node.setAttribute("data-context-layer", "connected-source-body");
    rotating.push({ node, base: node.getAttribute("transform") ?? "", x: box.x + box.width * .5, y: box.y + box.height, multiplier, phase });
  };
  svg.querySelectorAll("text").forEach((node) => node.remove());
  for (const node of [...svg.querySelectorAll<SVGGraphicsElement>("[id]")]) {
    if (/background|speech-bubble|text-balloon|Plants|Plant|Window|Pictures/i.test(node.id)) node.remove();
  }
  if (artworkId === "context-infusion") {
    const face = get(svg, "freepik--Face--inject-22");
    if (face.children.length !== 8) throw new Error("Infusion face geometry changed");
    // The original tubing, arm and infusion apparatus remain stationary and
    // connected. Only the two original eye paths blink; no bag flow is invented.
    for (const index of [2, 3]) {
      const node = face.children[index] as SVGGraphicsElement;
      const box = node.getBBox();
      blinks.push({ node, base: node.getAttribute("transform") ?? "", x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
  } else if (artworkId === "context-clinician") {
    remove(svg, ["freepik--Heart--inject-3"]);
    rig(get(svg, "freepik--Character--inject-3"));
  } else if (artworkId === "context-support") {
    remove(svg, ["freepik--character-1--inject-15", "freepik--character-4--inject-15"]);
    rig(get(svg, "freepik--character-2--inject-15"), .4);
    rig(get(svg, "freepik--character-3--inject-15"), -.4, .4);
  } else if (artworkId === "context-community") {
    remove(svg, ["freepik--Child--inject-16", "freepik--Couple--inject-16"]);
    get(svg, "freepik--old-woman--inject-16").setAttribute("transform", "translate(-115 0)");
    ["young-man", "yound-woman", "old-woman"].forEach((name, index) => rig(get(svg, `freepik--${name}--inject-16`), index % 2 ? -.55 : .55, index * .35));
  } else if (artworkId === "context-hospital") {
    remove(svg, ["freepik--Helicopter--inject-2", "freepik--Birds--inject-2"]);
    // Architecture does not wiggle. The parent scene supplies its establishing camera.
  } else if (artworkId === "context-call-center") {
    rig(get(svg, "freepik--character-1--inject-6"), .35);
    rig(get(svg, "freepik--character-2--inject-6"), -.35, .5);
  } else if (artworkId === "context-calendar") {
    const calendar = get(svg, "freepik--Calendar--inject-4");
    retainChildren(calendar, 44, Array.from({ length: 14 }, (_, index) => index));
    blankLines(calendar, 235, 248, 205, 42);
    rig(get(svg, "freepik--character-1--inject-4"), .35);
    rig(get(svg, "freepik--character-2--inject-4"), -.35, .4);
  } else if (artworkId === "context-schedule") {
    const schedule = get(svg, "freepik--Schedule--inject-18");
    retainChildren(schedule, 208, [0, 1, 2, 3, 4]);
    blankLines(schedule, 275, 205, 260, 55);
    rig(get(svg, "freepik--Character--inject-18"), .55);
  } else if (artworkId === "context-timeline") {
    const board = get(svg, "freepik--Table--inject-4");
    retainChildren(board, 74, [0, 1, 3, 71, 72, 73]);
    blankLines(board, 116, 199, 265, 47);
    rig(get(svg, "freepik--Marker--inject-4"), 2);
  } else if (artworkId === "context-online-doctor") {
    remove(svg, ["freepik--Bottle--inject-2", "freepik--Pills--inject-2"]);
    const device = get(svg, "freepik--Device--inject-2");
    if (device.children.length !== 6) throw new Error("Online doctor device geometry changed");
    rig(device.children[4] as SVGGraphicsElement, .5);
  } else if (artworkId === "context-patient-voice") {
    remove(svg, ["freepik--Reviews--inject-13"]);
    const character = get(svg, "freepik--Character--inject-13");
    const original = [...character.children] as SVGGraphicsElement[];
    if (original.length !== 272 || !original[4]?.getAttribute("d")?.startsWith("M347,183.78") ||
      !original[6]?.getAttribute("d")?.startsWith("M361.1,184.2")) throw new Error("Patient-voice head layers changed");
    // Original back hair, face, neck, eyes and bun remain one connected group.
    // The lower neck stays behind the shirt; laptop, hands, legs and chair stay fixed.
    const head = document.createElementNS(SVG_NS, "g");
    character.insertBefore(head, original[0]!);
    head.append(...original.slice(0, 21));
    head.setAttribute("data-context-layer", "connected-head-and-neck");
    rotating.push({ node: head, base: "", x: 360, y: 220, multiplier: 1.6, phase: 0 });
    for (const index of [4, 6]) {
      const node = original[index]!;
      const box = node.getBBox();
      blinks.push({ node, base: node.getAttribute("transform") ?? "", x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
  }
  const box = svg.getBBox();
  svg.setAttribute("viewBox", `${box.x - 18} ${box.y - 18} ${box.width + 36} ${box.height + 36}`);
  svg.setAttribute("aria-label", recipe.semantics);
  svg.setAttribute("data-prepared-context", artworkId);
  svg.setAttribute("data-rig-layers", String(rotating.length + blinks.length));
  return { apply(seconds, reducedMotion) {
    for (const layer of rotating) {
      const angle = contextMotion(seconds, reducedMotion, layer.phase).angle * layer.multiplier;
      layer.node.setAttribute("transform", `${layer.base} rotate(${angle} ${layer.x} ${layer.y})`);
    }
    const blinkTime = Math.max(0, seconds) % 7;
    const blink = reducedMotion ? 1 : Math.max(.08, 1 - Math.max(0, 1 - Math.abs(blinkTime - 3.8) / .12));
    for (const layer of blinks) layer.node.setAttribute("transform", `${layer.base} translate(${layer.x} ${layer.y}) scale(1 ${blink}) translate(${-layer.x} ${-layer.y})`);
  } };
}

export const LibraryContextArtwork: React.FC<{ artworkId: string; seconds: number; reducedMotion?: boolean; style?: React.CSSProperties }> =
  ({ artworkId, seconds, reducedMotion = false, style }) => {
    const recipe = contextArtworkRecipe(artworkId);
    if (!recipe) throw new Error(`Unknown library context artwork: ${artworkId}`);
    if (!recipe.publicPath) return <PatientCareObjects artworkId={artworkId} seconds={seconds} reducedMotion={reducedMotion} style={style} />;
    return <LibrarySvgArtwork artworkId={artworkId} publicPath={recipe.publicPath} expectedSha256={recipe.sourceSha256}
      seconds={seconds} reducedMotion={reducedMotion} style={style} prepare={(svg) => prepareContextArtwork(svg, artworkId)} />;
  };
