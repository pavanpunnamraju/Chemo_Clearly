// Pure curve-geometry math for daily_life's energy-curve archetype
// (docs/references/daily_life_motion_spec.md) — kept side-effect-free so
// the N-sub-topic generality is testable without rendering (see
// daily-life-curve.test.ts). video-composition/DailyLifeCurve.tsx wires this
// to real frame/reveal state.

export interface CurvePoint {
  x: number;
  y: number;
}

export interface CurveGeometry {
  /** One frame-space point per topic, draw order — no synthetic point
   * (spec §1: the old pre-topic "dip" point caused a backward loop and is
   * deleted, not re-coordinated). Same array as `topicPoints`. */
  points: CurvePoint[];
  /** Monotone-cubic-Hermite path (spec §2) through every topic point,
   * x-monotonic by construction. */
  d: string;
  /** Frame-space point per topic, same order as the caller's topic array. */
  topicPoints: CurvePoint[];
}

// Design spec geometry: points 1..N-1 sit at the "dip" y, the last point
// sits at the "rise" (highest, smallest-y) — a fixed dip-then-rise shape,
// not a per-regimen curve. Percent-of-frame units, scaled to actual pixels
// by the caller's width/height.
const LEFT_X_PERCENT = 6; // = AXIS_ORIGIN_X_PERCENT
const RIGHT_X_PERCENT = 82;
const DIP_Y_PERCENT = 72;
const RISE_Y_PERCENT = 30;

export const AXIS_ORIGIN_X_PERCENT = 6;
export const AXIS_BOTTOM_Y_PERCENT = 88;
export const AXIS_TOP_Y_PERCENT = 14;
export const AXIS_RIGHT_X_PERCENT = 90;

export function dailyLifeCurveGeometry(topicCount: number, width: number, height: number): CurveGeometry {
  if (topicCount < 1) throw new Error("dailyLifeCurveGeometry needs at least 1 topic");

  const x = (percent: number) => (percent / 100) * width;
  const y = (percent: number) => (percent / 100) * height;

  const topicPoints: CurvePoint[] = Array.from({ length: topicCount }, (_, i) => ({
    x:
      topicCount > 1
        ? x(LEFT_X_PERCENT + ((RIGHT_X_PERCENT - LEFT_X_PERCENT) * i) / (topicCount - 1))
        : x((LEFT_X_PERCENT + RIGHT_X_PERCENT) / 2),
    y: y(i === topicCount - 1 ? RISE_Y_PERCENT : DIP_Y_PERCENT),
  }));

  return { points: topicPoints, d: monotoneHermitePath(topicPoints), topicPoints };
}

// Monotone cubic Hermite (Fritsch-Carlson tangents), same technique as D3's
// curveMonotoneX — x-monotonic by construction (evaluated as y = f(x), not
// parametric), unlike the old uniform Catmull-Rom which had no such
// guarantee and produced a backward loop near the start (spec §2).
export function monotoneHermitePath(points: CurvePoint[]): string {
  if (points.length < 2) return points.length === 1 ? `M ${points[0]!.x} ${points[0]!.y}` : "";

  const n = points.length;
  const dx: number[] = [];
  const secants: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1]!.x - points[i]!.x);
    secants.push((points[i + 1]!.y - points[i]!.y) / dx[i]!);
  }

  const tangents: number[] = new Array(n);
  tangents[0] = secants[0]!;
  tangents[n - 1] = secants[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    tangents[i] = (secants[i - 1]! + secants[i]!) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    const s = secants[i]!;
    if (s === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    let alpha = tangents[i]! / s;
    let beta = tangents[i + 1]! / s;
    if (alpha < 0) tangents[i] = 0;
    if (beta < 0) tangents[i + 1] = 0;
    alpha = tangents[i]! / s;
    beta = tangents[i + 1]! / s;
    const magSq = alpha * alpha + beta * beta;
    if (magSq > 9) {
      const tau = 3 / Math.sqrt(magSq);
      tangents[i] = tau * alpha * s;
      tangents[i + 1] = tau * beta * s;
    }
  }

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const segDx = dx[i]!;
    const c1x = p0.x + segDx / 3;
    const c1y = p0.y + (tangents[i]! * segDx) / 3;
    const c2x = p1.x - segDx / 3;
    const c2y = p1.y - (tangents[i + 1]! * segDx) / 3;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p1.x} ${p1.y}`;
  }
  return d;
}
