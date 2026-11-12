import React, {useMemo} from "react";
import {
  DEFAULT_READING_RECOVERY_CUE,
  READING_RECOVERY_ICONS,
  type ReadingRecoveryCue,
  readingRecoveryActualGeometry,
  readingRecoveryMotionState,
} from "../../lib/video/reading-recovery-motion";
import {LibrarySvgArtwork, type LibrarySvgRig} from "./LibrarySvgArtwork";
import {readingRecoveryEmojiMarkup as iconMarkup} from "./ReadingRecoveryEmoji";
export {ReadingRecoveryEmoji as ReadingRecoveryIcon} from "./ReadingRecoveryEmoji";

const SVG_NS = "http://www.w3.org/2000/svg";
const SOURCE_PATH = "studies/reading-recovery/reading-book-pana.svg";
const SOURCE_SHA256 = "360f1e54acc2e1d9e5730a035bb69d0ab8b20fde0de21d559b2b13fb17c86aae";
const TEAL = "#2F9C95";

const make = <K extends keyof SVGElementTagNameMap>(name: K) => document.createElementNS(SVG_NS, name);
export interface ReadingRecoveryInsets {top: number; bottom: number}
const NO_INSETS: ReadingRecoveryInsets = {top: 0, bottom: 0};

function cameraViewBox(progress: number, width: number, height: number, endCenter: {x:number;y:number}, insets: ReadingRecoveryInsets) {
  const stageHeight = height - insets.top - insets.bottom;
  const aspect = Math.max(.5, width / Math.max(1, stageHeight));
  const startWidth = 2;
  const endWidth = Math.max(520, 330 * aspect);
  // Constant-ratio scaling avoids a violent first jump from extreme magnification.
  // Ease toward the accepted full view while holding the same cover landmark.
  const zoomProgress = 1 - Math.pow(1 - progress, 3);
  const w = startWidth * Math.pow(endWidth / startWidth, zoomProgress);
  const stageH = w / aspect;
  const travel = (w - startWidth) / (endWidth - startWidth);
  const cover = {x: 67, y: 278};
  const x = cover.x + (endCenter.x - cover.x) * travel - w / 2;
  const stageY = cover.y + (endCenter.y - cover.y) * travel - 22 * Math.sin(Math.PI * travel) - stageH / 2;
  const unitsPerPixel = w / width;
  return {x, y: stageY - insets.top * unitsPerPixel, w, h: height * unitsPerPixel};
}

export function prepareReadingRecoveryArtwork(svg: SVGSVGElement, durationSeconds: number, width: number, height: number,
  cue: ReadingRecoveryCue, qaMode: boolean, insets: ReadingRecoveryInsets = NO_INSETS): LibrarySvgRig {
  const combined = svg.querySelector<SVGGElement>("[id='character-2-and-3']");
  const middle = svg.querySelector<SVGGElement>("[id='character-1']");
  const bubble = svg.querySelector<SVGGElement>("[id='speech-bubble-1']");
  if (!combined || !middle || !bubble || combined.children.length !== 126 || bubble.children.length !== 5)
    throw new Error("Reading recovery source layer order changed");
  const source = [...combined.children] as SVGGraphicsElement[];
  if (source[0]?.tagName.toLowerCase() !== "rect" || !source[68]?.getAttribute("d")?.startsWith("M111.28,172.38") ||
      !source[125]?.getAttribute("d")?.startsWith("M69.5,307.25")) throw new Error("Reading recovery source anchors changed");

  svg.querySelector("[id='background-complete']")?.remove();
  svg.querySelector("[id='background-simple']")?.remove();
  svg.querySelector("[id='Floor']")?.remove();
  svg.querySelector("[id='speech-bubble-2']")?.remove();
  svg.querySelector("[id='speech-bubble-3']")?.remove();
  middle.remove();
  source.slice(29, 68).forEach((node) => node.remove());
  svg.querySelectorAll<SVGElement>("[style*='#FF725E']").forEach((node) => { node.style.fill = TEAL; });

  combined.setAttribute("data-reading-layer", "book-stack-and-left-reader");
  bubble.setAttribute("data-reading-layer", "stationary-bubble");
  const originalHeart = bubble.children[2]!;
  originalHeart.remove();

  const head = make("g");
  head.setAttribute("data-reading-layer", "head-unit");
  combined.insertBefore(head, source[68]!);
  source.slice(68, 93).forEach((node) => head.append(node));
  const arm = make("g");
  arm.setAttribute("data-reading-layer", "page-hand-arm-unit");
  combined.insertBefore(arm, source[117]!);
  source.slice(117, 122).forEach((node) => arm.append(node));

  const expression = make("g");
  expression.setAttribute("data-reading-layer", "contented-expression");
  // Keep the original nose, mouth, eyes and brows. These two small arcs sit
  // inside the source face and add only the requested raised-cheek cue.
  expression.innerHTML = '<path d="M93.3 226Q95.4 227.7 97.6 225.8M110.1 222.7Q112 224.2 113.7 222.3" fill="none" stroke="#ff9a6c" stroke-width="1.15" stroke-linecap="round"/>';
  head.append(expression);
  const leftEye = source[73]!; const leftBrow = source[74]!; const leftUpperBrow = source[77]!;
  const rightEye = source[78]!; const rightBrow = source[79]!; const rightUpperBrow = source[80]!;
  const sourceSmile = source[92]!;

  const iconRoot = make("g");
  iconRoot.setAttribute("data-reading-layer", "icon-pop-library");
  bubble.insertBefore(iconRoot, bubble.children[2]!);
  const iconGroups = READING_RECOVERY_ICONS.map((icon) => {
    const group = make("g");
    group.setAttribute("data-reading-icon", icon);
    group.style.color = TEAL;
    group.innerHTML = iconMarkup[icon];
    iconRoot.append(group);
    return group;
  });
  // Center actual library ink bounds, not each file's differently padded canvas.
  // Reserve room for the largest playful overshoot within the original circle.
  const iconPlacement = iconGroups.map(group => {
    const box=group.getBBox();
    const origin={x:box.x+box.width/2,y:box.y+box.height/2};
    const fit=Math.min(1,(21.66-2.2)/(1.12*Math.hypot(box.width,box.height)/2));
    group.setAttribute('data-reading-icon-origin',JSON.stringify(origin));
    group.setAttribute('data-reading-icon-fit',String(fit));
    return {...origin,fit};
  });
  const sourceBounds=combined.getBBox();
  const fullViewCenter={x:sourceBounds.x+sourceBounds.width/2,y:(142.12+sourceBounds.y+sourceBounds.height)/2};

  const qa = make("g");
  qa.setAttribute("data-reading-layer", "qa-anchors");
  qa.innerHTML = '<circle cx="143.5" cy="248" r="2.5" fill="#8B5CF6"/><circle cx="58.2" cy="295.2" r="2.5" fill="#0EA5E9"/><circle data-finger-anchor r="2.5" fill="#22C55E"/><path data-contact-line fill="none" stroke="#22C55E" stroke-width=".8" stroke-dasharray="2 2"/>';
  // qaMode enables telemetry attributes for the inspector. Review renders stay
  // clean; geometry overlays require an explicit future debug-only prop.
  qa.style.display = "none";
  combined.append(qa);

  svg.setAttribute("aria-label", "A seated woman enjoys a comfortable moment and returns to reading on the same oversized book stack");
  svg.setAttribute("data-reading-recovery", "prepared");
  svg.setAttribute("data-reading-qa", String(qaMode));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  return {apply(seconds, reducedMotion) {
    const state = readingRecoveryMotionState(seconds, durationSeconds, reducedMotion, cue);
    const actual = readingRecoveryActualGeometry(state);
    if (actual.handTransform) arm.setAttribute("transform", actual.handTransform); else arm.removeAttribute("transform");
    if (actual.headTransform) head.setAttribute("transform", actual.headTransform); else head.removeAttribute("transform");
    expression.setAttribute("opacity", String(state.expression));
    const eyeScale = 1 - .86 * state.expression;
    leftEye.setAttribute("transform", `translate(95.65 221.2) scale(1 ${eyeScale}) translate(-95.65 -221.2)`);
    rightEye.setAttribute("transform", `translate(107.85 217.9) scale(1 ${eyeScale}) translate(-107.85 -217.9)`);
    leftBrow.setAttribute("transform", `translate(0 ${-1.1 * state.expression}) rotate(${-4 * state.expression} 94.3 215.3)`);
    rightBrow.setAttribute("transform", `translate(0 ${-1.1 * state.expression}) rotate(${4 * state.expression} 108.4 211.4)`);
    leftUpperBrow.setAttribute("transform", `translate(0 ${-.8 * state.expression}) rotate(${-2.5 * state.expression} 93 210.8)`);
    rightUpperBrow.setAttribute("transform", `translate(0 ${-.8 * state.expression}) rotate(${2.5 * state.expression} 108.3 206.7)`);
    sourceSmile.setAttribute("transform", `translate(106.1 227.2) scale(${1 + .16 * state.expression} ${1 + .12 * state.expression}) translate(-106.1 -227.2)`);
    iconGroups.forEach((group, index) => {
      const layer = state.iconLayers.find((candidate) => candidate.iconIndex === index);
      const scale = layer?.scale ?? 0;
      const placement=iconPlacement[index]!;
      group.setAttribute("transform", `translate(58.27 164.04) scale(${scale*placement.fit}) translate(${-placement.x} ${-placement.y})`);
      group.style.display = scale <= 0 ? "none" : "inline";
      group.setAttribute("opacity", "1");
    });
    const viewBox = cameraViewBox(state.cameraProgress, width, height, fullViewCenter, insets);
    svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    const fingerAnchor = qa.querySelector<SVGCircleElement>("[data-finger-anchor]")!;
    fingerAnchor.setAttribute("cx", String(actual.finger.x)); fingerAnchor.setAttribute("cy", String(actual.finger.y));
    const contactLine = qa.querySelector<SVGPathElement>("[data-contact-line]")!;
    contactLine.setAttribute("d", state.pageContactActive ? `M${actual.finger.x} ${actual.finger.y}L${actual.contactTarget!.x} ${actual.contactTarget!.y}` : "");
    svg.setAttribute("data-reading-recovery-state", JSON.stringify(state));
    svg.setAttribute("data-reading-recovery-actual", JSON.stringify({...actual, viewBox, pagePath: null}));
  }};
}

export interface ReadingRecoveryArtworkProps {
  seconds: number;
  durationSeconds: number;
  width: number;
  height: number;
  reducedMotion?: boolean;
  qaMode?: boolean;
  cue?: ReadingRecoveryCue;
  insets?: ReadingRecoveryInsets;
}

export const ReadingRecoveryArtwork: React.FC<ReadingRecoveryArtworkProps> = ({seconds, durationSeconds, width, height,
  reducedMotion = false, qaMode = false, cue = DEFAULT_READING_RECOVERY_CUE, insets = NO_INSETS}) => {
  const prepare = useMemo(() => (svg: SVGSVGElement) => prepareReadingRecoveryArtwork(svg, durationSeconds, width, height, cue, qaMode, insets),
    [durationSeconds, width, height, cue, qaMode, insets]);
  return <div data-reading-recovery="artwork" style={{width, height, overflow: "hidden"}}>
    <LibrarySvgArtwork artworkId="reading-recovery" publicPath={SOURCE_PATH} expectedSha256={SOURCE_SHA256}
      seconds={seconds} reducedMotion={reducedMotion} prepare={prepare} />
  </div>;
};
