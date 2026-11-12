import React, { useCallback } from "react";
import { libraryPatientPose, PATIENT_ARTWORK_RECIPES } from "../../lib/video/library-patient-motion";
import { LibrarySvgArtwork, type LibrarySvgRig } from "./LibrarySvgArtwork";

const range = (start: number, end: number) => Array.from({ length: end - start }, (_, i) => start + i);

/** Keep source nodes in their exact paint order; transform contact chains with
 * one matrix without moving nodes above foreground sleeves, palms or fingers.
 */
export function prepareLibraryPatientArtwork(svg: SVGSVGElement, artworkId: string): LibrarySvgRig {
  const recipe = PATIENT_ARTWORK_RECIPES[artworkId];
  if (!recipe) throw new Error(`Unknown patient artwork: ${artworkId}`);
  const character = svg.querySelector<SVGGElement>(`[id='${recipe.characterGroup}']`);
  if (!character || character.children.length !== recipe.directChildren ||
      !character.querySelector("path")?.getAttribute("d")?.startsWith(recipe.firstPathPrefix)) {
    throw new Error(`Patient source layers changed: ${artworkId}`);
  }
  for (const child of [...svg.children]) {
    if (child.tagName === "g" && !recipe.keepGroups.includes(child.id)) child.remove();
  }
  svg.setAttribute("viewBox", recipe.viewBox);
  svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", recipe.motion);
  const nodes = [...character.children] as SVGGraphicsElement[];
  const mutations: ((pose: ReturnType<typeof libraryPatientPose>) => void)[] = [];
  const transform = (elements: SVGGraphicsElement[], value: (pose: ReturnType<typeof libraryPatientPose>) => string, name: string) => {
    const originals = elements.map((node) => node.getAttribute("transform") ?? "");
    elements.forEach((node) => node.setAttribute("data-patient-motion-layer", name));
    mutations.push((pose) => elements.forEach((node, index) => node.setAttribute("transform", `${value(pose)} ${originals[index]}`.trim())));
  };
  const selected = (indices: number[]) => indices.map((i) => { if (!nodes[i]) throw new Error(`${artworkId}: missing layer ${i}`); return nodes[i]!; });
  const blink = (eyes: SVGGraphicsElement[]) => {
    for (const eye of eyes) {
      const box = eye.getBBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      transform([eye], (pose) => `translate(${x} ${y}) scale(1 ${pose.eyeScale}) translate(${-x} ${-y})`, "original-eye-blink");
    }
  };
  if (artworkId === "patient-washing") {
    // Both palms and both sleeves share one small rotation. Original overlap
    // at the shoulder accommodates its sub-pixel displacement; faucet is fixed.
    transform(selected([20, 22, 23, 35, 36, 37, 38, 39, 41, ...range(46, 65)]),
      (pose) => `rotate(${pose.handDegrees} 250 220)`, "connected-palms-and-sleeves");
    const foam = selected([46, 53, 54, 55, 63, 64]);
    mutations.push((pose) => foam.forEach((node) => node.setAttribute("opacity", String(pose.foamOpacity))));
    blink(selected([3, 5]));
  } else if (artworkId === "patient-rest") {
    // Coffee-specific paths and rectangles; no replacement medicine or device.
    const prefixes = ["M276,340.24", "M310.34,351.1", "M280.89,341.44", "M277.17,339.19", "M328.18,338.64", "M352.14,462.71"];
    for (const prefix of prefixes) {
      const node = [...character.querySelectorAll("path")].find((p) => p.getAttribute("d")?.startsWith(prefix));
      if (!node) throw new Error(`Rest coffee layer changed: ${prefix}`);
      node.remove();
    }
    for (const x of ["273.07", "280.95"]) {
      const rectangle = character.querySelector(`rect[x='${x}']`);
      if (!rectangle) throw new Error("Rest coffee lid changed");
      rectangle.remove();
    }
    transform(selected([...range(0, 23), 25, 26, 30, 31, 32, 44, 46, 47, 49, 50, 51, 52, 53, 54]),
      (pose) => `rotate(${pose.headDegrees} 204 340)`, "supported-head-palm-and-sleeve");
  } else if (artworkId === "patient-distress") {
    transform(nodes, (pose) => `translate(0 485) scale(1 ${pose.torsoScaleY}) translate(0 -485)`, "breathing-temple-contact-chain");
  } else if (artworkId === "patient-hair") {
    blink(selected([35, 37]));
  } else if (artworkId === "patient-hand") {
    const lines = svg.querySelector<SVGGElement>("[id='freepik--Lines--inject-35']");
    if (!lines || lines.querySelectorAll("path").length !== 11) throw new Error("Hand sensation marks changed");
    lines.setAttribute("data-patient-motion-layer", "localized-sensation-marks");
    mutations.push((pose) => lines.setAttribute("opacity", String(pose.sensationOpacity)));
  } else if (artworkId === "patient-sleep") {
    transform(selected([5, ...range(19, 39), 44, 45, 46]),
      (pose) => `translate(0 329) scale(1 ${pose.blanketScaleY}) translate(0 -329)`, "blanket-chest-breath");
  } else if (artworkId === "patient-abdomen") {
    transform(selected(range(5, 30)), (pose) => `rotate(${pose.torsoDegrees} 270 283)`, "abdomen-hand-upper-body-contact-chain");
  } else if (artworkId === "patient-stretch") {
    const groups = nodes[0]!.children;
    const head = groups[2] as SVGGraphicsElement | undefined;
    if (groups.length !== 8 || head?.children.length !== 5 || !head.querySelector("path")?.getAttribute("d")?.startsWith("M234.01,281.99")) {
      throw new Error("Seated stretch head layers changed");
    }
    transform([head], (pose) => `rotate(${pose.headDegrees} 258 330)`, "seated-stretch-head-release");
  } else if (artworkId === "patient-car") {
    if (nodes[26]!.tagName !== "ellipse" || nodes[27]!.tagName !== "ellipse") throw new Error("Passenger eye layers changed");
    blink(selected([26, 27]));
  }
  return { apply(seconds, reducedMotion) {
    const pose = libraryPatientPose(artworkId, seconds, reducedMotion);
    mutations.forEach((apply) => apply(pose));
  } };
}

export const LibraryPatientArtwork: React.FC<{ artworkId: string; seconds: number; reducedMotion?: boolean; style?: React.CSSProperties }> = ({ artworkId, seconds, reducedMotion = false, style }) => {
  const recipe = PATIENT_ARTWORK_RECIPES[artworkId];
  if (!recipe) throw new Error(`Unknown patient artwork: ${artworkId}`);
  const prepare = useCallback((svg: SVGSVGElement) => prepareLibraryPatientArtwork(svg, artworkId), [artworkId]);
  return <LibrarySvgArtwork artworkId={artworkId} publicPath={recipe.publicPath} expectedSha256={recipe.sourceSha256} prepare={prepare}
    seconds={seconds} reducedMotion={reducedMotion} style={style} />;
};
