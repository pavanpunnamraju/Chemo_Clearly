type Point = { x: number; y: number };

const SHOULDER = { x: 119, y: 211 };
const FINGERTIP = { x: 191.68, y: 246.24 };
const SOURCE_ARM_ANGLE = Math.atan2(FINGERTIP.y - SHOULDER.y, FINGERTIP.x - SHOULDER.x);
export const CALENDAR_LEFT_ARM_LENGTH = Math.hypot(FINGERTIP.x - SHOULDER.x, FINGERTIP.y - SHOULDER.y);
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export interface CalendarLeftPose {
  actual: Point; hipDegrees: number; elbowDegrees: number; shoulderDegrees: number;
  shoulder: Point; armLength: number;
}

/** Project a requested page point onto the original fingertip's circular
 * reach. The elbow silhouette stays unchanged; the complete arm only swings
 * around its source shoulder. */
export function solveCalendarLeftPose(desiredHand: Point): CalendarLeftPose {
  const angle = Math.atan2(desiredHand.y - SHOULDER.y, desiredHand.x - SHOULDER.x);
  const elbowDegrees = (angle - SOURCE_ARM_ANGLE) * 180 / Math.PI;
  return { actual: {
    x: SHOULDER.x + Math.cos(angle) * CALENDAR_LEFT_ARM_LENGTH,
    y: SHOULDER.y + Math.sin(angle) * CALENDAR_LEFT_ARM_LENGTH,
  }, hipDegrees: 0, elbowDegrees, shoulderDegrees: elbowDegrees,
    shoulder: SHOULDER, armLength: CALENDAR_LEFT_ARM_LENGTH };
}

export function prepareCalendarLeftBodyRig(leftWoman: SVGGElement) {
  if (leftWoman.children.length !== 39) throw new Error("Calendar left-woman geometry changed");
  const original = [...leftWoman.children] as SVGGraphicsElement[];
  const arm = original[38] as SVGPathElement;
  const armShadow = original[37] as SVGPathElement;
  if (!arm.getAttribute("d")?.startsWith("M191.68,246.24") ||
      !armShadow.getAttribute("d")?.startsWith("M113.48,255.05"))
    throw new Error("Calendar left arm geometry changed");
  const armD = arm.getAttribute("d"), shadowD = armShadow.getAttribute("d");
  const shadowStyle = armShadow.getAttribute("style");
  const ns = "http://www.w3.org/2000/svg";
  const shirt = original[4]!;
  const shirtShade = original[5]!;
  const shirtShadeStyle = shirtShade.getAttribute("style");
  const rigPrefix = (leftWoman.id || "calendar-left-woman").replace(/[^A-Za-z0-9_-]/g, "-");
  const defs = document.createElementNS(ns, "defs");
  const clip = document.createElementNS(ns, "clipPath");
  clip.id = `${rigPrefix}-sleeve-clip`;
  const clipShape = document.createElementNS(ns, "path");
  clipShape.setAttribute("d", "M80 180 L130 180 C125 193 122 203 122 213 C122 221 124 228 129 234 L104 251 L80 240 Z");
  clip.append(clipShape);
  const mask = document.createElementNS(ns, "mask");
  mask.id = `${rigPrefix}-stationary-shirt-mask`;
  const maskBase = document.createElementNS(ns, "rect");
  maskBase.setAttribute("x", "80"); maskBase.setAttribute("y", "185");
  maskBase.setAttribute("width", "105"); maskBase.setAttribute("height", "105"); maskBase.setAttribute("fill", "white");
  const maskCut = clipShape.cloneNode(true) as SVGPathElement;
  maskCut.setAttribute("fill", "black"); mask.append(maskBase, maskCut);
  const shadowClip = document.createElementNS(ns, "clipPath");
  shadowClip.id = `${rigPrefix}-torso-shadow-clip`;
  const shadowClipShape = document.createElementNS(ns, "path");
  shadowClipShape.setAttribute("d", "M125 199.56 C120 203 119 207 119 211 C118 224 116 238 115 242 L112 257 L151 260 L154 241 C160 226 158 211 143 201 Z");
  shadowClip.append(shadowClipShape);
  const torsoSilhouetteClip = document.createElementNS(ns, "clipPath");
  torsoSilhouetteClip.id = `${rigPrefix}-source-torso-silhouette-clip`;
  const torsoSilhouette = shirt.cloneNode(true) as SVGGraphicsElement;
  torsoSilhouette.removeAttribute("id"); torsoSilhouette.removeAttribute("style");
  torsoSilhouette.setAttribute("fill", "black");
  torsoSilhouetteClip.append(torsoSilhouette);
  defs.append(clip, mask, shadowClip, torsoSilhouetteClip);
  leftWoman.insertBefore(defs, leftWoman.firstChild);
  const shoulderShadow = document.createElementNS(ns, "ellipse");
  shoulderShadow.setAttribute("data-calendar-layer", "left-shoulder-cloth-shadow");
  shoulderShadow.setAttribute("cx", "121"); shoulderShadow.setAttribute("cy", "215");
  shoulderShadow.setAttribute("rx", "9"); shoulderShadow.setAttribute("ry", "11");
  shoulderShadow.setAttribute("fill", "#c84f39"); shoulderShadow.setAttribute("opacity", "0");
  const torsoBackfill = document.createElementNS(ns, "path");
  torsoBackfill.setAttribute("data-calendar-layer", "left-orange-torso-backfill");
  // Stop several source units above the original hem. The stationary source
  // shirt already supplies the waist, avoiding doubled edge antialiasing.
  torsoBackfill.setAttribute("d", "M125 199.56 C120 203 119 207 119 211 C118 224 116 238 115 242 L112 257 L151 260 L154 241 C160 226 158 211 143 201 Z");
  torsoBackfill.setAttribute("fill", "#FF6B4A"); torsoBackfill.setAttribute("opacity", "0");
  torsoBackfill.setAttribute("clip-path", `url(#${torsoSilhouetteClip.id})`);
  leftWoman.insertBefore(torsoBackfill, shirt);
  const clippedShadowGroup = document.createElementNS(ns, "g");
  clippedShadowGroup.setAttribute("data-calendar-layer", "left-stationary-shadow-clip");
  clippedShadowGroup.setAttribute("clip-path", `url(#${shadowClip.id})`);
  const clippedArmShadow = armShadow.cloneNode(true) as SVGPathElement;
  clippedArmShadow.setAttribute("data-calendar-layer", "left-clipped-natural-arm-shadow");
  clippedArmShadow.style.opacity = "0";
  clippedShadowGroup.append(shoulderShadow, clippedArmShadow);
  leftWoman.insertBefore(clippedShadowGroup, shirt);
  const armRig = document.createElementNS(ns, "g");
  armRig.setAttribute("data-calendar-layer", "left-rigid-whole-arm");
  leftWoman.insertBefore(armRig, armShadow);
  const movingSleeve = document.createElementNS(ns, "g");
  movingSleeve.setAttribute("data-calendar-layer", "left-moving-sleeve");
  movingSleeve.setAttribute("clip-path", `url(#${clip.id})`);
  const sleeveFace = shirt.cloneNode(true) as SVGGraphicsElement;
  const sleeveShade = shirtShade.cloneNode(true) as SVGGraphicsElement;
  sleeveFace.removeAttribute("data-calendar-layer"); sleeveShade.removeAttribute("data-calendar-layer");
  sleeveShade.setAttribute("data-calendar-layer", "left-moving-sleeve-crease");
  sleeveShade.style.opacity = "0";
  movingSleeve.append(sleeveFace);
  armRig.append(movingSleeve);
  armRig.append(sleeveShade);
  armRig.append(armShadow, arm);
  arm.setAttribute("data-calendar-layer", "left-arm");
  armShadow.setAttribute("data-calendar-layer", "left-arm-shadow");
  original.slice(0, 3).forEach((node) => node.setAttribute("data-calendar-layer", "left-stationary-lower-body"));
  original.slice(3, 4).forEach((node) => node.setAttribute("data-calendar-layer", "left-far-arm-hidden-behind-calendar"));
  shirt.setAttribute("data-calendar-layer", "left-shirt-fabric");
  shirtShade.setAttribute("data-calendar-layer", "left-source-sleeve-crease");
  original[6]!.setAttribute("data-calendar-layer", "left-shirt-fabric");
  original.slice(7, 20).forEach((node) => node.setAttribute("data-calendar-layer", "left-head"));
  original.slice(20, 37).forEach((node) => node.setAttribute("data-calendar-layer", "left-stationary-lower-body"));

  return { apply(desiredHand: Point, reducedMotion: boolean): CalendarLeftPose {
    const pose = solveCalendarLeftPose(reducedMotion ? FINGERTIP : desiredHand);
    const moving = Math.abs(pose.shoulderDegrees) >= 1e-8;
    if (!moving) armRig.removeAttribute("transform");
    else armRig.setAttribute("transform", `rotate(${pose.shoulderDegrees} ${SHOULDER.x} ${SHOULDER.y})`);
    movingSleeve.setAttribute("opacity", moving ? "1" : "0");
    sleeveShade.style.opacity = moving ? "0.3" : "0";
    torsoBackfill.setAttribute("opacity", moving ? "1" : "0");
    const shadowMix = smooth(Math.abs(pose.shoulderDegrees) / 3);
    if (!moving && shadowStyle === null) armShadow.removeAttribute("style");
    else if (!moving) armShadow.setAttribute("style", shadowStyle!);
    else armShadow.style.opacity = String(.3 * (1 - shadowMix));
    clippedArmShadow.style.opacity = String(.3 * shadowMix);
    if (moving) shirtShade.style.opacity = "0";
    else if (shirtShadeStyle === null) shirtShade.removeAttribute("style");
    else shirtShade.setAttribute("style", shirtShadeStyle);
    if (moving) clippedArmShadow.setAttribute("transform", `rotate(${pose.shoulderDegrees} ${SHOULDER.x} ${SHOULDER.y})`);
    else clippedArmShadow.removeAttribute("transform");
    shoulderShadow.setAttribute("opacity", moving ? String(Math.min(.28, Math.abs(pose.shoulderDegrees) / 55)) : "0");
    if (moving) {
      shirt.setAttribute("mask", `url(#${mask.id})`);
    } else {
      shirt.removeAttribute("mask");
    }
    if (arm.getAttribute("d") !== armD || armShadow.getAttribute("d") !== shadowD)
      throw new Error("Calendar rigid arm source paths changed");
    const root = leftWoman.ownerSVGElement, armMatrix = arm.getCTM(), rootMatrix = root?.getCTM();
    let actual = pose.actual;
    if (armMatrix && rootMatrix && typeof DOMPoint !== "undefined") {
      const viewport = new DOMPoint(FINGERTIP.x, FINGERTIP.y).matrixTransform(armMatrix);
      const source = viewport.matrixTransform(rootMatrix.inverse());
      actual = { x: source.x, y: source.y };
    }
    const measured = { ...pose, actual };
    leftWoman.setAttribute("data-calendar-left-motion", JSON.stringify(measured));
    return measured;
  } };
}
