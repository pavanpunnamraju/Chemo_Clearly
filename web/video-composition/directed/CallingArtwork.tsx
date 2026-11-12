import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { namespaceSvgIds } from "./namespace-svg";
import { callingStudyPose, CALLING_WAIST } from "../../lib/video/calling-study-motion";

const SVG_NS = "http://www.w3.org/2000/svg";

export function prepareCallingArtwork(svg: SVGSVGElement) {
  const character = svg.querySelector<SVGGElement>("[id='freepik--Character--inject-3']");
  if (!character || character.children.length !== 80) throw new Error("Calling source layers changed");
  const children = [...character.children];
  if (!children[27]?.getAttribute("d")?.startsWith("M383.3,149.56") ||
      !children[74]?.getAttribute("d")?.startsWith("M346.69,208.24") ||
      children[75]?.tagName !== "polygon" || children[76]?.tagName !== "polygon") {
    throw new Error("Calling source contact/occlusion order changed");
  }
  svg.querySelector("[id='freepik--background-simple--inject-3']")?.remove();
  svg.querySelector("[id='freepik--speech-bubble--inject-3']")?.remove();
  const upperBody = document.createElementNS(SVG_NS, "g");
  upperBody.setAttribute("data-motion-layer", "connected-upper-body");
  character.append(upperBody);
  // Original order: back hair, shirt, supporting arm, sleeve, face/hair,
  // holding forearm, phone surfaces, foreground fingers and hand contours.
  // The whole chain shares one transform. No wrist/elbow cut or redrawn skin.
  upperBody.append(...children.slice(27));
  const eyes = [children[55], children[56]] as SVGPathElement[];
  const anchors = eyes.map((eye) => {
    const box = eye.getBBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  svg.setAttribute("viewBox", "308 94 124 202");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Woman listening on the phone, with her other arm supporting the raised elbow");
  svg.style.width = "100%";
  svg.style.height = "100%";
  return { upperBody, eyes, anchors };
}

/** Approved source motion. The scene owns framing, camera, titles and background.
 * Pass shot-relative seconds without retiming the approved motion.
 */
export const CallingArtwork: React.FC<{
  seconds: number;
  reducedMotion?: boolean;
  style?: React.CSSProperties;
}> = ({ seconds, reducedMotion = false, style }) => {
  const instanceId = useId();
  const host = useRef<HTMLDivElement>(null);
  const rig = useRef<ReturnType<typeof prepareCallingArtwork> | null>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("Preparing supplied calling artwork"));
  useLayoutEffect(() => {
    let cancelled = false;
    fetch(staticFile("studies/calling/Calling-pana.svg")).then((response) => {
      if (!response.ok) throw new Error("Missing approved calling artwork snapshot");
      return response.text();
    }).then((source) => {
      if (cancelled) return;
      const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
      if (parsed.querySelector("parsererror")) throw new Error("Invalid calling SVG");
      const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
      host.current!.replaceChildren(svg);
      rig.current = prepareCallingArtwork(svg);
      namespaceSvgIds(svg, `calling-${instanceId}`);
      setReady(true);
    }).catch(cancelRender);
    return () => { cancelled = true; continueRender(handle); };
  }, [handle, instanceId]);
  const pose = callingStudyPose(seconds, reducedMotion);
  useLayoutEffect(() => {
    if (!ready || !rig.current) return;
    const { upperBody, eyes, anchors } = rig.current;
    upperBody.setAttribute("transform", `rotate(${pose.degrees} ${CALLING_WAIST.x} ${CALLING_WAIST.y})`);
    eyes.forEach((eye, i) => {
      const anchor = anchors[i]!;
      eye.setAttribute("transform", `translate(${anchor.x} ${anchor.y}) scale(1 ${pose.eyeScale}) translate(${-anchor.x} ${-anchor.y})`);
    });
    continueRender(handle);
  }, [ready, pose.degrees, pose.eyeScale, handle]);
  return <div ref={host} data-approved-artwork="calling" style={{ width: "100%", height: "100%", ...style }} />;
};
