import React from "react";
import { supplementalArtworkRecipe, supplementalMotion } from "../../lib/video/library-supplemental-motion";
import { LibrarySvgArtwork, type LibrarySvgRig } from "./LibrarySvgArtwork";

const SVG_NS = "http://www.w3.org/2000/svg";
const geometryAttributes = ["d", "points", "x", "y", "width", "height", "cx", "cy", "rx", "ry", "r", "fill", "stroke", "style"];
// The common loader namespaces URL references after preparation. This changes
// clip identifiers, not source geometry, color, opacity or stroke attributes.
const sourceAttribute = (node: SVGGraphicsElement, name: string) => node.getAttribute(name)?.replace(/url\(#[^)]+\)/g, "url(#namespaced-reference)") ?? null;
export interface SupplementalGeometryAudit {
  sourceGeometryAndPalettePreserved: boolean;
  retainedShapeCount: number;
  connectedBodyChildCount: number;
  eyeCount: number;
  stockGroupsRemoved: boolean;
  sourceBoundsInsideViewBox: boolean;
}

/** Original paths and paint order are retained. Activity limbs stay fixed; the
 * headset, contact hand, head and torso share one rigid transform. */
export function prepareSupplementalArtwork(svg: SVGSVGElement, artworkId: string): LibrarySvgRig & { audit: () => SupplementalGeometryAudit } {
  const recipe = supplementalArtworkRecipe(artworkId);
  if (!recipe) throw new Error(`Unknown supplemental artwork: ${artworkId}`);
  const get = (id: string, expected?: number) => {
    const node = svg.querySelector<SVGGraphicsElement>(`[id='${id}']`);
    if (!node || (expected !== undefined && node.children.length !== expected)) throw new Error(`Supplemental source geometry changed: ${id}`);
    return node;
  };
  const eyes: { node: SVGGraphicsElement; base: string; x: number; y: number; offset: number }[] = [];
  const blink = (node: SVGGraphicsElement, offset = 0) => {
    const box = node.getBBox();
    eyes.push({ node, base: node.getAttribute("transform") ?? "", x: box.x + box.width / 2, y: box.y + box.height / 2, offset });
    node.setAttribute("data-supplemental-layer", "original-eye");
  };
  let body: SVGGElement | undefined;
  let connectedBodyChildCount = 0;
  if (artworkId === "supplemental-gentle-activity") {
    const left = get("freepik--character-2--inject-3", 13);
    const right = get("freepik--character-1--inject-3", 21);
    const leftEye = left.children[4] as SVGGraphicsElement;
    const rightEye = right.children[16] as SVGGraphicsElement;
    if (leftEye.tagName !== "ellipse" || leftEye.getAttribute("cx") !== "312.64" || !rightEye.getAttribute("d")?.startsWith("M241.76,168.91")) throw new Error("Activity original eye selectors changed");
    for (const node of [...svg.children]) if (node !== left && node !== right && node.tagName !== "defs") node.remove();
    left.setAttribute("data-supplemental-layer", "fixed-original-activity-pose");
    right.setAttribute("data-supplemental-layer", "fixed-original-activity-pose");
    blink(leftEye); blink(rightEye, .25);
  } else {
    const device = get("freepik--Device--inject-6", 179);
    const character = get("freepik--Character--inject-6", 1);
    const original = [...character.children[0]!.children] as SVGGraphicsElement[];
    if (original.length !== 51 || !original[18]?.getAttribute("d")?.startsWith("M266.05,195.93") || !original[19]?.getAttribute("d")?.startsWith("M280.62,195.93")) throw new Error("Remote-support source anatomy changed");
    if (device.children[6]?.getAttribute("x") !== "139.18") throw new Error("Remote-support screen geometry changed");
    for (const node of [...svg.children]) if (node !== device && node !== character && node.tagName !== "defs") node.remove();
    [...device.children].slice(8, 17).forEach((node) => node.remove());
    // Leave the original screen clip outside the moving connected character.
    body = document.createElementNS(SVG_NS, "g");
    body.setAttribute("data-supplemental-layer", "connected-headset-hand-and-body");
    character.children[0]!.append(body);
    body.append(...original);
    connectedBodyChildCount = original.length;
    blink(original[18]!); blink(original[19]!);
  }
  const retained = [...svg.querySelectorAll<SVGGraphicsElement>("path,polygon,polyline,rect,ellipse,circle,line")].map((node) => ({ node, attributes: geometryAttributes.map((name) => sourceAttribute(node, name)) }));
  const box = svg.getBBox();
  const stockGroupsRemoved = artworkId === "supplemental-gentle-activity" ? [...svg.children].filter((node) => node.tagName !== "defs").length === 2 : !svg.querySelector("[id*='speech-bubble'],[id*='background-simple']") && get("freepik--Device--inject-6").children.length === 170;
  const viewport = { x: box.x - 18, y: box.y - 18, width: box.width + 36, height: box.height + 36 };
  svg.setAttribute("viewBox", `${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`);
  svg.setAttribute("aria-label", recipe.semantics);
  svg.setAttribute("data-prepared-supplemental", artworkId);
  return {
    apply(seconds, reducedMotion) {
      if (body) body.setAttribute("transform", `rotate(${supplementalMotion(seconds, reducedMotion).angle} 267 324)`);
      for (const eye of eyes) {
        const scale = supplementalMotion(seconds, reducedMotion, eye.offset).eyeScaleY;
        eye.node.setAttribute("transform", `${eye.base} translate(${eye.x} ${eye.y}) scale(1 ${scale}) translate(${-eye.x} ${-eye.y})`);
      }
    },
    audit() {
      const current = svg.getBBox();
      return {
        sourceGeometryAndPalettePreserved: retained.every(({ node, attributes }) => node.isConnected && geometryAttributes.every((name, index) => sourceAttribute(node, name) === attributes[index])),
        retainedShapeCount: retained.length,
        connectedBodyChildCount,
        eyeCount: eyes.length,
        stockGroupsRemoved,
        sourceBoundsInsideViewBox: current.x >= viewport.x && current.y >= viewport.y && current.x + current.width <= viewport.x + viewport.width && current.y + current.height <= viewport.y + viewport.height,
      };
    },
  };
}

export const SupplementalLibraryArtwork: React.FC<{ artworkId: string; seconds: number; reducedMotion?: boolean; style?: React.CSSProperties }> =
  ({ artworkId, seconds, reducedMotion = false, style }) => {
    const recipe = supplementalArtworkRecipe(artworkId);
    if (!recipe) throw new Error(`Unknown supplemental artwork: ${artworkId}`);
    return <LibrarySvgArtwork artworkId={artworkId} publicPath={recipe.publicPath} expectedSha256={recipe.sourceSha256}
      seconds={seconds} reducedMotion={reducedMotion} style={style} prepare={(svg) => prepareSupplementalArtwork(svg, artworkId)} />;
  };
