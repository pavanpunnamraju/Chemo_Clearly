import React, { useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { DirectedFonts } from "./directed/DirectedFonts";
import { FONT_FAMILY, FRAME_BG, NAVY, TEAL } from "./directed/DirectedTheme";
import { thermometerStudyPose, THERMOMETER_ELBOW } from "../lib/video/thermometer-study-motion";

const SOURCE = "illustrations/side_effects/side_effects__tiredness-pana.svg";
const SVG_NS = "http://www.w3.org/2000/svg";

/** Layer the existing SVG without rewriting the artist's character geometry. */
export function prepareThermometerArtwork(svg: SVGSVGElement): SVGGElement {
  const character = svg.querySelector("[id='freepik--Character--inject-3']");
  if (!character) throw new Error("Expected source character is missing.");
  const path = (prefix: string) => {
    const node = [...character.querySelectorAll("path")].find((p) => p.getAttribute("d")?.startsWith(prefix));
    if (!node) throw new Error(`Source artwork changed: path ${prefix}`);
    return node;
  };
  svg.querySelector("[id='freepik--background-simple--inject-3']")?.remove();
  const forearm = path("M315.37,352.68");
  const fingers = path("M327.86,368.26");
  const thumb = path("M314.68,350.38");
  const handDetail = path("M317.36,412.06");
  // Coffee-specific body, lid, reflection and cast shadow only.
  for (const prefix of ["M276,340.24", "M310.34,351.1", "M280.89,341.44", "M277.17,339.19", "M328.18,338.64", "M352.14,462.71"]) path(prefix).remove();
  for (const x of ["273.07", "280.95"]) {
    const rectangle = character.querySelector(`rect[x='${x}']`);
    if (!rectangle) throw new Error("Source coffee lid changed.");
    rectangle.remove();
  }
  const arm = document.createElementNS(SVG_NS, "g");
  arm.setAttribute("data-motion-layer", "original-hand-forearm-and-prop");
  forearm.before(arm);
  arm.append(forearm);
  const prop = document.createElementNS(SVG_NS, "g");
  prop.setAttribute("data-motion-layer", "thermometer");
  // New prop only: original hand paths are painted over its grip surface.
  // Blank screen deliberately contains no invented clinical measurement.
  prop.innerHTML = `<path d="M295 320Q294 315 299 313L308 310Q313 309 315 315L320 333L323 388Q323 402 312 405L300 403Q292 402 291 391L287 343Q286 333 293 331Z" fill="#fafafa" stroke="#455a64" stroke-width="1.4"/>
    <path d="M298 312L306 309L302 299Q301 296 298 297L293 299Q291 300 292 303Z" fill="#e0e0e0" stroke="#455a64" stroke-width="1.2"/>
    <path d="M296 338L311 335L313 355L298 358Z" fill="#c7e7df" stroke="#789e96" stroke-width=".8"/>
    <path d="M301 344L307 343M302 349L308 348" stroke="#86aaa1" stroke-width="1.3" stroke-linecap="round"/>
    <ellipse cx="306" cy="367" rx="4.5" ry="5" fill="#2fbfa0"/>
    <path d="M295 381L297 394Q298 398 302 399" fill="none" stroke="#e0e0e0" stroke-width="2"/>`;
  arm.append(prop, fingers, thumb, handDetail);
  // Cover the rotating forearm's old flat crop with a rounded sleeve opening,
  // not a straight vertical cut through the skin. The opening tracks only the
  // elbow, which remains fixed; original jacket outline is preserved behind it.
  const cuff = document.createElementNS(SVG_NS, "path");
  cuff.setAttribute("d", "M334 435Q352 422 371 434L381 470H326Z");
  cuff.setAttribute("fill", "#455a64");
  character.append(cuff);
  const cuffSeam = document.createElementNS(SVG_NS, "path");
  cuffSeam.setAttribute("d", "M334 435Q352 422 371 434");
  cuffSeam.setAttribute("fill", "none");
  cuffSeam.setAttribute("stroke", "#263238");
  cuffSeam.setAttribute("stroke-width", ".55");
  character.append(cuffSeam);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Existing illustrated character holding a thermometer; motion study");
  svg.style.width = "100%"; svg.style.height = "100%";
  return arm;
}

export const ThermometerStudy: React.FC<{ reducedMotion?: boolean; camera?: boolean }> = ({ reducedMotion = false, camera = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const host = useRef<HTMLDivElement>(null);
  const arm = useRef<SVGGElement | null>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("Preparing original illustration layers"));
  useLayoutEffect(() => {
    let cancelled = false;
    fetch(staticFile(SOURCE)).then((response) => { if (!response.ok) throw new Error("Cannot load source illustration"); return response.text(); }).then((source) => {
      if (cancelled) return;
      const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
      if (parsed.querySelector("parsererror")) throw new Error("Invalid source illustration");
      const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
      arm.current = prepareThermometerArtwork(svg);
      host.current!.replaceChildren(svg);
      setReady(true);
    }).catch(cancelRender);
    return () => { cancelled = true; };
  }, []);
  const pose = thermometerStudyPose(seconds, reducedMotion);
  useLayoutEffect(() => {
    if (!ready || !arm.current) return;
    arm.current.setAttribute("transform", `rotate(${pose.elbowDegrees} ${THERMOMETER_ELBOW.x} ${THERMOMETER_ELBOW.y})`);
    continueRender(handle);
  }, [ready, pose.elbowDegrees, handle]);
  const scale = camera && !reducedMotion ? 1 + .06 * pose.lift : 1;
  return <AbsoluteFill style={{ backgroundColor: FRAME_BG, fontFamily: FONT_FAMILY, overflow: "hidden" }}>
    <DirectedFonts />
    <div style={{ position: "absolute", left: "-6%", top: "8%", width: "62%", height: "78%", borderRadius: "58% 42% 53% 47% / 44% 55% 45% 56%", background: `radial-gradient(circle at 40% 40%, ${TEAL}22, ${FRAME_BG} 72%)` }} />
    <div ref={host} style={{ position: "absolute", left: -45, top: -5, width: 690, height: 690, transform: `scale(${scale})`, transformOrigin: "62% 57%" }} />
    <div style={{ position: "absolute", left: 745, top: 190, width: 440 }}>
      <div style={{ color: NAVY, fontSize: 52, fontWeight: 800, lineHeight: 1.1 }}>Thermometer</div>
      <div style={{ color: TEAL, fontSize: 34, fontWeight: 700, lineHeight: 1.2, marginTop: 8 }}>Existing-artwork motion study</div>
      <div style={{ color: NAVY, fontSize: 24, lineHeight: 1.4, marginTop: 42 }}>Lift · hold · return</div>
    </div>
    <div style={{ position: "absolute", left: 64, right: 64, bottom: 28, color: NAVY, fontSize: 18, lineHeight: 1.4 }}>Visual prototype — no narration or measurement instructions. Adapted from artwork by Storyset / Freepik.</div>
  </AbsoluteFill>;
};
