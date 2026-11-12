import React from "react";
import { calendarMotionState } from "../../lib/video/calendar-motion";
import { pointsToClosedPathD, sampleClosedPath, smoothstep } from "../../lib/video/arm-deform";
import { LibrarySvgArtwork, type LibrarySvgRig } from "./LibrarySvgArtwork";
import { prepareCalendarPageRig } from "./CalendarPageRig";

const SVG_NS = "http://www.w3.org/2000/svg";
const SOURCE_PATH = "illustrations/timeline/timeline__calendar-pana.svg";
const SOURCE_SHA256 = "c1c1cbfc3dc4c933f264dc86ff4917f2186625c98492d945a73233a244054bd0";
const LINE_X = 235;
const LINE_WIDTHS = [205, 193, 181] as const;

const get = <T extends SVGElement>(svg: SVGSVGElement, id: string) => {
  const node = svg.querySelector<T>(`[id='${id}']`);
  if (!node) throw new Error(`Calendar source layer missing: ${id}`);
  return node;
};
const layer = <T extends SVGElement>(node: T, name: string) => {
  node.setAttribute("data-calendar-layer", name);
  return node;
};
const make = <K extends keyof SVGElementTagNameMap>(name: K) => document.createElementNS(SVG_NS, name);

export function prepareCalendarArtwork(svg: SVGSVGElement): LibrarySvgRig {
  svg.querySelectorAll("text").forEach((node) => node.remove());
  get<SVGGElement>(svg, "freepik--background-simple--inject-4").remove();
  const calendar = get<SVGGElement>(svg, "freepik--Calendar--inject-4");
  const leftWoman = get<SVGGElement>(svg, "freepik--character-1--inject-4");
  const rightWoman = get<SVGGElement>(svg, "freepik--character-2--inject-4");
  if (calendar.children.length !== 44 || leftWoman.children.length !== 39 || rightWoman.children.length !== 79)
    throw new Error("Calendar source child order changed");
  if (!calendar.children[13]?.getAttribute("d")?.startsWith("M172.49,180.91") ||
      !leftWoman.children[38]?.getAttribute("d")?.startsWith("M191.68,246.24") ||
      rightWoman.children[18]?.tagName.toLowerCase() !== "polygon")
    throw new Error("Calendar source motion anchors changed");
  const rightSourceChildren = [...rightWoman.children] as SVGGraphicsElement[];
  const shoeNodes = [...rightSourceChildren.slice(0, 18), ...rightSourceChildren.slice(24, 42)];
  const lowerBodyNodes = rightSourceChildren.slice(61, 64);

  // Preserve the same simplified source preparation as context-calendar.
  [...calendar.children].forEach((child, index) => { if (index > 13) child.remove(); });
  layer(calendar, "source-base");
  layer(leftWoman, "left-woman");
  layer(rightWoman, "right-woman");

  const pageRig = prepareCalendarPageRig({ svg, calendar, leftWoman });

  // The large original coral marker is children 18–23. Move its source geometry
  // together; the nearby arm remains visually connected through the marker grip.
  const marker = layer(make("g"), "marker");
  rightWoman.insertBefore(marker, rightWoman.children[18]!);
  for (let index = 0; index < 6; index++) marker.append(rightWoman.children[19]!);
  const markerTip = layer(make("circle"), "marker-tip");
  markerTip.setAttribute("cx", "518.91"); markerTip.setAttribute("cy", "176.77"); markerTip.setAttribute("r", "2.4");
  markerTip.setAttribute("fill", "#263238"); markerTip.setAttribute("opacity", "0"); marker.append(markerTip);
  const markerArm = [...rightWoman.querySelectorAll<SVGPathElement>("path")]
    .find((node) => node.getAttribute("d")?.startsWith("M598.37,204.92"));
  if (!markerArm) throw new Error("Calendar marker-arm source geometry changed");
  layer(markerArm, "marker-arm");
  marker.append(markerArm);
  const lowerPaths = lowerBodyNodes.filter((node): node is SVGPathElement => node instanceof SVGPathElement)
    .map((node) => ({ node, d: node.getAttribute("d")!, points: sampleClosedPath(node, 180) }));
  const pants = lowerBodyNodes.find((node): node is SVGPolylineElement => node instanceof SVGPolylineElement);
  if (!pants) throw new Error("Calendar right-woman pants geometry changed");
  const pantsPoints = pants.points ? Array.from(pants.points).map((point) => ({ x: point.x, y: point.y })) : [];
  const pantsSource = pants.getAttribute("points")!;

  svg.setAttribute("viewBox", "0 0 750 500");
  svg.setAttribute("aria-label", "Two women flip a blank treatment calendar page and draw three planning lines");
  svg.setAttribute("data-prepared-calendar", "true");
  return { apply(seconds, reducedMotion) {
    const state = calendarMotionState(seconds, reducedMotion);
    const { pageContact } = pageRig.apply(state, reducedMotion);

    // The source arm and giant marker form one rigid unit about their real
    // shoulder. The woman steps and crouches to meet each row; only the legs
    // compress below the hips, keeping both shoes planted vertically.
    const desired = { x: 518.91 + state.markerX, y: 176.77 + state.markerY };
    const action = Math.min(1, Math.hypot(state.markerX, state.markerY) / 80);
    const row = Math.max(0, Math.min(1, (desired.y - 248) / 84));
    const angle = (-40 - 20 * row) * action;
    const radians = angle * Math.PI / 180;
    const rel = { x: 518.91 - 598.37, y: 176.77 - 204.92 };
    const rotated = { x: rel.x * Math.cos(radians) - rel.y * Math.sin(radians),
      y: rel.x * Math.sin(radians) + rel.y * Math.cos(radians) };
    const bodyX = desired.x - (598.37 + rotated.x);
    const bodyY = desired.y - (204.92 + rotated.y);
    if (Math.abs(bodyX) + Math.abs(bodyY) < 1e-9) rightWoman.removeAttribute("transform");
    else rightWoman.setAttribute("transform", `translate(${bodyX} ${bodyY})`);
    marker.setAttribute("transform", angle === 0 ? "" : `rotate(${angle} 598.37 204.92)`);
    const correctLeg = (point: { x: number; y: number }) => ({
      x: point.x,
      y: point.y - bodyY * smoothstep(0, 1, (point.y - 285) / 160),
    });
    lowerPaths.forEach(({ node, d, points }) => node.setAttribute("d", Math.abs(bodyY) < 1e-9 ? d : pointsToClosedPathD(points.map(correctLeg))));
    pants.setAttribute("points", Math.abs(bodyY) < 1e-9 ? pantsSource : pantsPoints.map(correctLeg).map((point) => `${point.x},${point.y}`).join(" "));
    shoeNodes.forEach((node) => {
      if (Math.abs(bodyY) < 1e-9) node.removeAttribute("transform");
      else node.setAttribute("transform", `translate(0 ${-bodyY})`);
    });

    const markerActual = { x: 518.91 + state.markerX, y: 176.77 + state.markerY };
    const activeLine = state.cycleSeconds < 11.13 ? 0 : state.cycleSeconds < 12.68 ? 1 : 2;
    const markerTarget = { x: LINE_X + LINE_WIDTHS[activeLine]! * (1 - state.lineProgress[activeLine]!), y: 248 + activeLine * 42 };
    svg.setAttribute("data-calendar-seconds", String(state.elapsedSeconds));
    svg.setAttribute("data-calendar-motion", JSON.stringify(state));
    svg.setAttribute("data-calendar-page-contact", JSON.stringify(pageContact));
    svg.setAttribute("data-calendar-marker-contact", JSON.stringify({ actual: markerActual, target: markerTarget, active: state.markerContactActive }));
    svg.setAttribute("data-calendar-line-progress", JSON.stringify(state.lineProgress));
  } };
}

export interface CalendarArtworkProps {
  seconds: number;
  durationSeconds?: number;
  reducedMotion?: boolean;
  style?: React.CSSProperties;
}

export const CalendarArtwork: React.FC<CalendarArtworkProps> = ({ seconds, reducedMotion = false, style }) =>
  <LibrarySvgArtwork artworkId="directed-calendar" publicPath={SOURCE_PATH} expectedSha256={SOURCE_SHA256}
    seconds={seconds} reducedMotion={reducedMotion} style={style} prepare={prepareCalendarArtwork} />;
