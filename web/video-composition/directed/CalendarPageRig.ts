import type { CalendarMotionState } from "../../lib/video/calendar-motion";
import { CALENDAR_LEFT_ARM_LENGTH, prepareCalendarLeftBodyRig } from "./CalendarLeftBodyRig";

const NS = "http://www.w3.org/2000/svg";
type Point = { x: number; y: number };
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const create = <K extends keyof SVGElementTagNameMap>(tag: K, name: string) => {
  const node = document.createElementNS(NS, tag);
  node.setAttribute("data-calendar-layer", name);
  return node;
};
const sample = (path: SVGPathElement, count: number) => {
  const length = path.getTotalLength();
  return Array.from({ length: count }, (_, index) => {
    const p = path.getPointAtLength(length * index / count);
    return { x: p.x, y: p.y };
  });
};
const pathD = (points: Point[], closed = true) => points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(" ") + (closed ? " Z" : "");

/** Source hand silhouette stays connected at its sleeve. The top-bound sheet
 * curves out from the binding, turns to its reverse and settles behind the pad. */
export function prepareCalendarPageRig({ svg, calendar, leftWoman }: {
  svg: SVGSVGElement; calendar: SVGGElement; leftWoman: SVGGElement;
}) {
  const underPage = calendar.children[13] as SVGPathElement;
  underPage.setAttribute("data-calendar-layer", "calendar-underpage");
  const pageSourceD = underPage.getAttribute("d")!;
  const pagePoints = sample(underPage, 360);
  const shoulder = { x: 119, y: 211 };
  const sourceArmAngle = Math.atan2(246.24 - shoulder.y, 191.68 - shoulder.x);
  const leftEdge = pagePoints.filter(p => p.x < 210 && p.y >= 180 && p.y <= 330).sort((a, b) => a.y - b.y);
  const nearestEdgePoint = (point: Point, progress: number): Point => {
    const edge = leftEdge.map(p => mapPage(p, progress));
    let nearest = edge[0]!, best = Infinity;
    for (let index = 1; index < edge.length; index++) {
      const a = edge[index - 1]!, b = edge[index]!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const amount = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
        ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
      const candidate = { x: a.x + dx * amount, y: a.y + dy * amount };
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (distance < best) { best = distance; nearest = candidate; }
    }
    return nearest;
  };
  const page = create("g", "calendar-page");
  const face = create("path", "calendar-page-face");
  face.setAttribute("d", pageSourceD); face.setAttribute("fill", "#f5f5f5");
  page.append(face);
  const widths = [205, 193, 181];
  const oldLines: SVGPathElement[] = [], newLines: SVGPathElement[] = [];
  widths.forEach((width, index) => {
    for (const [name, group, lines] of [[`old-line-${index + 1}`, page, oldLines], [`line-${index + 1}`, calendar, newLines]] as const) {
      const line = create("path", name);
      line.setAttribute("d", group === calendar ? `M${235 + width} ${248 + index * 42}h-${width}` : `M235 ${248 + index * 42}h${width}`);
      line.setAttribute("fill", "none"); line.setAttribute("stroke", "#CFDEDA");
      line.setAttribute("stroke-width", "4"); line.setAttribute("stroke-linecap", "round");
      group.append(line); lines.push(line);
    }
  });
  calendar.append(page);
  const leftBodyRig = prepareCalendarLeftBodyRig(leftWoman);
  const pageAnchor = create("circle", "page-grip-target");
  const handAnchor = create("circle", "left-hand-contact");
  for (const anchor of [pageAnchor, handAnchor]) {
    anchor.setAttribute("r", "0.01"); anchor.setAttribute("opacity", "0"); svg.append(anchor);
  }
  const mapPage = (p: Point, progress: number): Point => {
    const v = Math.max(0, Math.min(1, (p.y - 180.91) / 232.48));
    const angle = progress * Math.PI * .78;
    return { x: p.x + Math.sin(angle) * (12 * v + 9 * Math.sin(Math.PI * v)),
      y: 180.91 + (p.y - 180.91) * Math.cos(angle) + 44 * Math.sin(angle) * Math.sin(Math.PI * v) };
  };
  return { newLines, apply(state: CalendarMotionState, reducedMotion: boolean) {
    const progress = reducedMotion ? 0 : state.pageFlip;
    underPage.setAttribute("opacity", progress === 0 ? "0" : "1");
    const time = state.cycleSeconds;
    const turned = progress > .64;
    if (turned) calendar.insertBefore(page, calendar.firstChild);
    else calendar.append(page);
    face.setAttribute("d", progress === 0 ? pageSourceD : pathD(pagePoints.map(p => mapPage(p, progress))));
    face.setAttribute("fill", turned ? "#e1e9e6" : "#f5f5f5");
    face.setAttribute("stroke", progress > 0 && progress < 1 ? "#d7e0dc" : "none");
    face.setAttribute("stroke-width", "0.8");
    page.setAttribute("opacity", String(1 - smooth((progress - .8) / .2)));
    oldLines.forEach((line, index) => {
      const points = Array.from({ length: 32 }, (_, i) => mapPage({ x: 235 + widths[index]! * i / 31, y: 248 + index * 42 }, progress));
      line.setAttribute("d", progress === 0 ? `M235 ${248 + index * 42}h${widths[index]}` : pathD(points, false));
      line.setAttribute("opacity", turned ? "0" : "1");
    });
    newLines.forEach((line, index) => {
      const value = reducedMotion ? 1 : state.lineProgress[index]!;
      line.setAttribute("stroke-dasharray", String(widths[index]));
      line.setAttribute("stroke-dashoffset", String(widths[index]! * (1 - value)));
      line.setAttribute("opacity", value > 0 ? "1" : "0");
    });
    const downAmount = time < 3.8 ? state.reach : 1 - smooth((time - 3.8) / 1.6);
    const armAngle = sourceArmAngle + 22 * Math.PI / 180 * (reducedMotion ? 0 : downAmount);
    const hand = { x: shoulder.x + Math.cos(armAngle) * CALENDAR_LEFT_ARM_LENGTH,
      y: shoulder.y + Math.sin(armAngle) * CALENDAR_LEFT_ARM_LENGTH };
    const actual = leftBodyRig.apply(hand, reducedMotion).actual;
    const pageTarget = nearestEdgePoint(actual, progress);
    handAnchor.setAttribute("cx", String(actual.x)); handAnchor.setAttribute("cy", String(actual.y));
    pageAnchor.setAttribute("cx", String(pageTarget.x)); pageAnchor.setAttribute("cy", String(pageTarget.y));
    const contactDistance = Math.hypot(actual.x - pageTarget.x, actual.y - pageTarget.y);
    return { pageContact: { actual, target: pageTarget,
      active: !reducedMotion && time >= 3.8 && time <= 5.4,
      distance: contactDistance, interaction: "rigid-arm sliding upper-page push" } };
  } };
}
