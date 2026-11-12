// Pure geometry for the gradient-deformation arm bend (docs/references/handoff.md).
// No cut, no hinge: every outline point rotates about the elbow by an angle
// that grows smoothly (0 at the shoulder, full bend past the elbow) instead
// of snapping between two rigid pieces — a gap is geometrically impossible
// because the transform is continuous, not a step function.
// video-composition/ArmBend.tsx wires this to real frame/timing state.

export interface Point {
  x: number;
  y: number;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Projects `p` onto the shoulder→fingertip axis. 0 at the shoulder, 1 at
 * the fingertip, clamped — used both to pick the bend angle and to find the
 * elbow pivot as a point on this same axis. */
export function projectT(p: Point, axisStart: Point, axisEnd: Point): number {
  const dx = axisEnd.x - axisStart.x;
  const dy = axisEnd.y - axisStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  const t = ((p.x - axisStart.x) * dx + (p.y - axisStart.y) * dy) / lenSq;
  return Math.min(1, Math.max(0, t));
}

export function bendAngleDegrees(t: number, maxBendDegrees: number, falloffStart: number, falloffEnd: number): number {
  return maxBendDegrees * smoothstep(falloffStart, falloffEnd, t);
}

export function rotateAroundPivot(p: Point, pivot: Point, angleDegrees: number): Point {
  const rad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}

export interface ArmAxis {
  shoulder: Point;
  fingertip: Point;
  /** Fraction 0..1 along shoulder→fingertip where the elbow (rotation pivot)
   * sits — a slider, not a fixed coordinate, so it can be tuned in Studio. */
  elbowPosition: number;
}

export function axisPivot(axis: ArmAxis): Point {
  return lerpPoint(axis.shoulder, axis.fingertip, axis.elbowPosition);
}

/** Rotates every outline point about the elbow pivot by its own gradient
 * angle. Same technique as bone-weighted mesh skinning: because the weight
 * is a smooth band, not a hard split, the outline deforms instead of
 * tearing. */
export function deformArmOutline(
  points: Point[],
  axis: ArmAxis,
  maxBendDegrees: number,
  falloffStart: number,
  falloffEnd: number,
): Point[] {
  const pivot = axisPivot(axis);
  return points.map((p) => {
    const t = projectT(p, axis.shoulder, axis.fingertip);
    const angle = bendAngleDegrees(t, maxBendDegrees, falloffStart, falloffEnd);
    return rotateAroundPivot(p, pivot, angle);
  });
}

export function pointsToClosedPathD(points: Point[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first!.x} ${first!.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(" ") + " Z";
}

export interface ShoulderRig {
  socket: Point;
  /** Degrees the whole arm rotates about the socket at full progress (sign
   * convention matches the elbow bend: applied negative internally so
   * positive values sweep down-and-back, same direction as the elbow). */
  rotateDegrees: number;
  /** Net retraction displacement at full progress. */
  retractX: number;
  retractY: number;
  /** Extra downward dip mid-motion before the path pulls back in — a bow,
   * not a straight line, per the annotated arc. */
  arcBow: number;
}

/** Root-bone displacement at a given progress: a straight pull toward
 * (retractX, retractY) with a sine bow added mid-motion so the path dips
 * down before curving back in, instead of a straight line. */
// ponytail: retraction >~15 detaches the arm from the torso — the body's shoulder region would have to deform too
export function shoulderRetractionOffset(progress: number, rig: ShoulderRig): Point {
  return {
    x: rig.retractX * progress,
    y: rig.retractY * progress + rig.arcBow * Math.sin(Math.PI * progress),
  };
}

/** Applies the shoulder (root) bone to a point: rigid rotation about the
 * socket, then the retraction offset. Same transform for every point on the
 * arm at a given progress, since the shoulder is the root of the chain —
 * everything past it moves together before the elbow's own bend layers on
 * top. */
export function applyShoulderRig(p: Point, rig: ShoulderRig, progress: number): Point {
  const rotated = rotateAroundPivot(p, rig.socket, -(rig.rotateDegrees * progress));
  const offset = shoulderRetractionOffset(progress, rig);
  return { x: rotated.x + offset.x, y: rotated.y + offset.y };
}

/** Delays a point's local progress based on its t position, so the shoulder
 * starts moving first and the wrist follows a few frames later — successive
 * breaking of joints instead of one rigid swing. */
export function lagFramesForT(t: number, shoulderLagFrames: number, wristLagFrames: number): number {
  return shoulderLagFrames + (wristLagFrames - shoulderLagFrames) * smoothstep(0, 1, t);
}

/** Browser-only: samples a closed `<path>`'s outline into `count` evenly
 * spaced points via the native SVGGeometryElement API — platform feature,
 * no dependency, no hand-rolled path-command flattening. */
export function sampleClosedPath(pathEl: SVGPathElement, count: number): Point[] {
  const total = pathEl.getTotalLength();
  const points: Point[] = [];
  for (let i = 0; i < count; i++) {
    const { x, y } = pathEl.getPointAtLength((total * i) / count);
    points.push({ x, y });
  }
  return points;
}
