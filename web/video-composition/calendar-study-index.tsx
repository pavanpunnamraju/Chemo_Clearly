import React, { useLayoutEffect } from "react";
import { AbsoluteFill, Composition, continueRender, delayRender, registerRoot, useCurrentFrame, useVideoConfig } from "remotion";
import { CalendarArtwork } from "./directed/CalendarArtwork";
import { CALENDAR_CYCLE_SECONDS } from "../lib/video/calendar-motion";

const CalendarStudy: React.FC<{ reducedMotion?: boolean; qaMode?: boolean }> = ({ reducedMotion = false, qaMode = false }) => {
  const seconds = useCurrentFrame() / useVideoConfig().fps;
  useLayoutEffect(() => {
    if (!qaMode) return;
    const handle = delayRender("Calendar geometry audit");
    let done = false;
    const inspect = () => {
      const svg = document.querySelector<SVGSVGElement>("svg[data-calendar-seconds]");
      if (!svg || Number(svg.getAttribute("data-calendar-seconds")) !== seconds || done) return;
      done = true;
      const bounds = (node: Element) => {
        const b = node.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      };
      const ids = [...svg.querySelectorAll("[id]")].map(node => node.id);
      const attr = (name: string) => {
        const value = svg.getAttribute(name);
        return value ? JSON.parse(value) : null;
      };
      const markerContact = attr("data-calendar-marker-contact");
      const markerTip = svg.querySelector<SVGCircleElement>("[data-calendar-layer='marker-tip']");
      if (markerContact && markerTip) {
        const point = new DOMPoint(Number(markerTip.getAttribute("cx")), Number(markerTip.getAttribute("cy")));
        const matrix = svg.getScreenCTM()!.inverse().multiply(markerTip.getScreenCTM()!);
        const actual = point.matrixTransform(matrix);
        markerContact.actual = { x: actual.x, y: actual.y };
      }
      const pageContact = attr("data-calendar-page-contact");
      const leftArm = svg.querySelector<SVGPathElement>("[data-calendar-layer='left-arm']");
      if (pageContact && leftArm) {
        const matrix = svg.getScreenCTM()!.inverse().multiply(leftArm.getScreenCTM()!);
        const actual = new DOMPoint(191.68, 246.24).matrixTransform(matrix);
        pageContact.actual = { x: actual.x, y: actual.y };
      }
      const sleeve = svg.querySelector<SVGGElement>("[data-calendar-layer='left-moving-sleeve']");
      const matrixValues = (node: SVGGraphicsElement | null) => {
        const m = node?.getScreenCTM();
        return m ? [m.a, m.b, m.c, m.d, m.e, m.f] : null;
      };
      const crease = svg.querySelector<SVGGraphicsElement>("[data-calendar-layer='left-moving-sleeve-crease']");
      const shadowClip = svg.querySelector<SVGGElement>("[data-calendar-layer='left-stationary-shadow-clip']");
      const shadowClipping = Boolean(shadowClip?.getAttribute("clip-path")) &&
        !shadowClip?.hasAttribute("transform") &&
        svg.querySelector("[data-calendar-layer='left-shoulder-cloth-shadow']")?.parentNode === shadowClip &&
        svg.querySelector("[data-calendar-layer='left-clipped-natural-arm-shadow']")?.parentNode === shadowClip;
      const sleeveArm = { shadowClipping, creaseMatrix: matrixValues(crease), sleeveMatrix: matrixValues(sleeve), armMatrix: matrixValues(leftArm),
        sleeveOpacity: sleeve?.getAttribute("opacity") ?? null };
      console.log("CALENDAR_QA:" + JSON.stringify({ seconds, reducedMotion,
        motion: attr("data-calendar-motion"),
        leftMotion: JSON.parse(svg.querySelector("[data-calendar-left-motion]")?.getAttribute("data-calendar-left-motion") ?? "null"),
        pageContact, sleeveArm,
        markerContact, lineProgress: attr("data-calendar-line-progress"),
        uniqueIds: ids.length === new Set(ids).size,
        layers: [...svg.querySelectorAll<SVGGraphicsElement>("[data-calendar-layer]")].map(node => ({
          name: node.getAttribute("data-calendar-layer"), bounds: bounds(node),
          transform: node.getAttribute("transform"), opacity: node.getAttribute("opacity"),
          d: node.getAttribute("d"), strokeDashoffset: node.getAttribute("stroke-dashoffset"),
        })), svgBounds: bounds(svg) }));
      continueRender(handle);
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.documentElement, { subtree: true, attributes: true, childList: true });
    inspect();
    return () => { observer.disconnect(); continueRender(handle); };
  }, [seconds, reducedMotion, qaMode]);
  return <AbsoluteFill style={{ backgroundColor: "#F4F7F6" }}>
    <div style={{ position: "absolute", inset: "24px 24px 40px" }}>
      <CalendarArtwork seconds={seconds} durationSeconds={CALENDAR_CYCLE_SECONDS * 2} reducedMotion={reducedMotion} />
    </div>
    <div style={{ position: "absolute", bottom: 12, textAlign: "center", width: "100%", color: "#455A64", font: "14px sans-serif" }}>
      Illustration adapted from Storyset / Freepik
    </div>
  </AbsoluteFill>;
};
registerRoot(() => <Composition id="CalendarStudy" component={CalendarStudy} width={1000} height={800}
  fps={30} durationInFrames={CALENDAR_CYCLE_SECONDS * 2 * 30} defaultProps={{ reducedMotion: false }} />);
