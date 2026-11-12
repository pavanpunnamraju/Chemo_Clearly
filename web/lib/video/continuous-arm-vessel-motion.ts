import {PerspectiveCamera, Vector2} from "three";
import {CUTAWAY_THETA_START, createCutawayRimCurve} from "../../video-composition/directed/curved-vessel-geometry";
import type {ArmZoomAnchor} from "./arm-microscope-motion";
import {armMicroscopeState} from "./arm-microscope-motion";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const blend = (from: number, to: number, progress: number) => from + (to - from) * progress;
const optical = (from: number, to: number, progress: number) => Math.exp(blend(Math.log(from), Math.log(to), progress));

export type ContinuousArmVesselState = {
  seconds: number;
  camera: ReturnType<typeof armMicroscopeState>;
  portal: {
    center: [number, number];
    focalPoint: [number, number];
    maskRadius: [number, number];
    scale: number;
    translate: [number, number];
    opacity: number;
    progress: number;
    transform: string;
    maskImage: string;
    forearmClipTransform: string;
    forearmClipActive: boolean;
    ellipseOpacity: number;
    maskMode: "projected-live-rim" | "full-view";
  };
  sourceOpacity: number;
  skinWindow: {radius: [number, number]; opacity: number};
  phase: "approach" | "skin-reveal" | "continuous-zoom" | "microscopic" | "reduced-microscopic";
};

export function continuousArmVesselState(
  seconds: number,
  anchor: ArmZoomAnchor,
  entrySeconds: number,
  width: number,
  height: number,
  reducedMotion = false,
): ContinuousArmVesselState {
  if (![seconds, entrySeconds, width, height].every(Number.isFinite) || entrySeconds <= 0 || width <= 0 || height <= 0) {
    throw new Error("Continuous arm-vessel transition requires finite positive dimensions and entry time");
  }
  const camera = armMicroscopeState(seconds, anchor, entrySeconds, reducedMotion);
  const now = Math.max(0, seconds);
  const reveal = reducedMotion ? 1 : smooth((now - entrySeconds * 0.38) / (entrySeconds * 0.17));
  const progress = reducedMotion ? 1 : smooth((now - entrySeconds * 0.58) / (entrySeconds * 0.42));
  const viewWidth = camera.height * width / height;
  const angle = camera.rotation * Math.PI / 180;
  const dx = anchor.forearmCenter[0] - camera.center[0];
  const dy = anchor.forearmCenter[1] - camera.center[1];
  const rotatedX = camera.center[0] + dx * Math.cos(angle) - dy * Math.sin(angle);
  const rotatedY = camera.center[1] + dx * Math.sin(angle) + dy * Math.cos(angle);
  const projected: [number, number] = [
    (rotatedX - (camera.center[0] - viewWidth / 2)) / viewWidth * width,
    (rotatedY - (camera.center[1] - camera.height / 2)) / camera.height * height,
  ];
  const center: [number, number] = [blend(projected[0], width / 2, progress), blend(projected[1], height / 2, progress)];
  // Let the live canvas fill the viewport before the mask releases beyond its
  // scaled rectangular coverage. This prevents a miniature-panel edge mid-zoom.
  const scaleProgress = reducedMotion ? 1 : smooth(progress / 0.78);
  const scale = reducedMotion ? 1 : optical(0.12, 1, scaleProgress);
  // The initial focal point is a real pixel on the approved left crimson rim.
  // Moving it toward canvas center registers that same live render as the view opens.
  const focalProgress = reducedMotion ? 1 : smooth((progress - 0.22) / 0.78);
  const focalPoint: [number, number] = [blend(width * 0.328, width / 2, focalProgress), height / 2];
  const translate: [number, number] = [center[0] - focalPoint[0] * scale, center[1] - focalPoint[1] * scale];
  const maskRelease = reducedMotion ? 1 : smooth((progress - 0.78) / 0.22);
  const containedRadius: [number, number] = [
    scale * Math.min(focalPoint[0], width - focalPoint[0]) * 0.9,
    scale * Math.min(focalPoint[1], height - focalPoint[1]) * 0.9,
  ];
  const widen = reducedMotion ? 1 : smooth((progress - 0.25) / 0.75);
  const maskRadius: [number, number] = [
    blend(Math.min(blend(4, width * 1.25, widen), containedRadius[0]), width * 1.25, maskRelease),
    blend(Math.min(blend(28, height * 1.4, widen), containedRadius[1]), height * 1.4, maskRelease),
  ];
  const complete = reducedMotion || now >= entrySeconds;
  const transform = complete ? "none" : `matrix(${scale}, 0, 0, ${scale}, ${translate[0]}, ${translate[1]})`;
  const maskImage = complete ? "none" : "url(#continuous-arm-live-rim-mask)";
  const ellipseOpacity = smooth((progress - 0.22) / 0.18);
  const sourceScale = height / camera.height;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const a = sourceScale * cos;
  const b = sourceScale * sin;
  const c = -sourceScale * sin;
  const d = sourceScale * cos;
  const e = width / 2 - a * camera.center[0] - c * camera.center[1];
  const f = height / 2 - b * camera.center[0] - d * camera.center[1];
  const forearmClipTransform = `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
  const sourceOpacity = reducedMotion ? 0 : 1 - smooth((now - entrySeconds * 0.82) / (entrySeconds * 0.18));
  const phase = reducedMotion
    ? "reduced-microscopic"
    : now < entrySeconds * 0.38
      ? "approach"
      : now < entrySeconds * 0.58
        ? "skin-reveal"
        : now < entrySeconds
          ? "continuous-zoom"
          : "microscopic";
  return {
    seconds,
    camera,
    portal: {center, focalPoint, maskRadius, scale, translate, opacity: reveal, progress, transform, maskImage, forearmClipTransform, forearmClipActive: !complete && progress < 0.78, ellipseOpacity, maskMode: complete ? "full-view" : "projected-live-rim"},
    sourceOpacity,
    skinWindow: {
      radius: [maskRadius[0] * viewWidth / width, maskRadius[1] * camera.height / height],
      opacity: reveal,
    },
    phase,
  };
}

/** Screen-space ribbon centered on the approved left cut rim. The ribbon only
 * masks the live render; its pixels still come from the shaded 3D wall. */
export function projectApprovedRimPoints(width: number, height: number) {
  const camera = new PerspectiveCamera(36, width / height, 0.1, 40);
  camera.position.set(6, 3.2, 10.4);
  camera.lookAt(0, 0.2, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const curve = createCutawayRimCurve(CUTAWAY_THETA_START);
  return Array.from({length: 49}, (_, index) => {
    const projected = curve.getPoint(index / 48).project(camera);
    return new Vector2((projected.x + 1) * width / 2, (1 - projected.y) * height / 2);
  });
}

export function createApprovedRimMaskPath(width: number, height: number) {
  const points = projectApprovedRimPoints(width, height);
  const halfWidth = 14;
  const sides = points.map((point, index) => {
    const before = points[Math.max(0, index - 1)]!;
    const after = points[Math.min(points.length - 1, index + 1)]!;
    const tangent = after.clone().sub(before).normalize();
    const offset = new Vector2(-tangent.y, tangent.x).multiplyScalar(halfWidth);
    return [point.clone().add(offset), point.clone().sub(offset)] as const;
  });
  const serialize = (point: Vector2) => `${point.x.toFixed(3)} ${point.y.toFixed(3)}`;
  return `M${sides.map(([left]) => serialize(left)).join(" L")} L${sides.slice().reverse().map(([, right]) => serialize(right)).join(" L")} Z`;
}
