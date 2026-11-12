export type DrinkingPoint = { x: number; y: number };
const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

// Source lower rim and right edge of the existing mouth, in SVG coordinates.
export const DRINKING_RIM = { x: 227.24, y: 249 };
export const DRINKING_LIP = { x: 195.8, y: 239 };
export const DRINKING_SPEED = 1.15;
export const DRINKING_DURATION_FRAMES = 314;

export function drinkingStudyPose(seconds: number, reducedMotion = false) {
  seconds *= DRINKING_SPEED;
  const reach = reducedMotion ? 0 : smooth((seconds - 1.5) / 2.5) * (1 - smooth((seconds - 7) / 2.5));
  // Reach the lip at 4 seconds, then add a small tilt around that exact contact.
  const sip = reducedMotion ? 0 : smooth((seconds - 4) / 1) * (1 - smooth((seconds - 6) / 1));
  return { reach, sip, degrees: -14 * reach - 4 * sip,
    rim: { x: DRINKING_RIM.x + (DRINKING_LIP.x - DRINKING_RIM.x) * reach,
      y: DRINKING_RIM.y + (DRINKING_LIP.y - DRINKING_RIM.y) * reach } };
}

export function drinkingGripPoint(point: DrinkingPoint, seconds: number, reducedMotion = false): DrinkingPoint {
  const pose = drinkingStudyPose(seconds, reducedMotion);
  const radians = pose.degrees * Math.PI / 180;
  const x = point.x - DRINKING_RIM.x, y = point.y - DRINKING_RIM.y;
  return { x: pose.rim.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: pose.rim.y + x * Math.sin(radians) + y * Math.cos(radians) };
}

export function drinkingGripTransform(seconds: number, reducedMotion = false) {
  const pose = drinkingStudyPose(seconds, reducedMotion);
  return `translate(${pose.rim.x} ${pose.rim.y}) rotate(${pose.degrees}) translate(${-DRINKING_RIM.x} ${-DRINKING_RIM.y})`;
}

const glassInterior: DrinkingPoint[] = [{ x: 230, y: 247 }, { x: 245, y: 221 }, { x: 292, y: 251 }];
for (let i = 1; i <= 20; i++) {
  const t = i / 20, u = 1 - t;
  glassInterior.push({ x: u * u * 292 + 2 * u * t * 293 + t * t * 281.5,
    y: u * u * 251 + 2 * u * t * 262 + t * t * 271.8 });
}
const polygonArea = (points: DrinkingPoint[]) => Math.abs(points.reduce((sum, a, i) => {
  const b = points[(i + 1) % points.length]!;
  return sum + a.x * b.y - b.x * a.y;
}, 0)) / 2;

/** Stylized, level liquid with constant visible area; avoid an empty-looking
 * vessel caused by translating the surface independently of the tilted bowl.
 */
export function drinkingWaterLevel(seconds: number, reducedMotion = false) {
  const polygon = glassInterior.map((p) => drinkingGripPoint(p, seconds, reducedMotion));
  const targetArea = polygonArea(polygon) * .46;
  let low = Math.min(...polygon.map((p) => p.y)), high = Math.max(...polygon.map((p) => p.y));
  for (let iteration = 0; iteration < 30; iteration++) {
    const level = (low + high) / 2;
    const below: DrinkingPoint[] = [];
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length]!;
      if (a.y >= level) below.push(a);
      if ((a.y >= level) !== (b.y >= level)) {
        const fraction = (level - a.y) / (b.y - a.y);
        below.push({ x: a.x + (b.x - a.x) * fraction, y: level });
      }
    });
    if (polygonArea(below) > targetArea) low = level; else high = level;
  }
  return (low + high) / 2;
}

const cubic = (a: DrinkingPoint, b: DrinkingPoint, c: DrinkingPoint, d: DrinkingPoint, t: number) => {
  const u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y };
};
const mix = (a: DrinkingPoint, b: DrinkingPoint, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Preserve the source forearm rigidly; smoothly reshape the two upper-arm
 * boundaries between pinned sleeve and moving elbow. The source curve residual
 * fades during the reach, avoiding a wavy shoulder from generic spatial weights.
 */
export function drinkingOutlinePoint(point: DrinkingPoint, section: "top" | "distal" | "bottom" | "seam", t: number, seconds: number, reducedMotion = false): DrinkingPoint {
  const pose = drinkingStudyPose(seconds, reducedMotion);
  if (pose.reach === 0 || section === "seam") return point;
  if (section === "distal") return drinkingGripPoint(point, seconds, reducedMotion);
  const top = section === "top";
  const fixed = top ? { x: 234.29, y: 286.39 } : { x: 252.27, y: 354.74 };
  const joint = top ? { x: 301.77, y: 327.67 } : { x: 331.63, y: 376.19 };
  const moved = drinkingGripPoint(joint, seconds, reducedMotion);
  let rest: DrinkingPoint, target: DrinkingPoint;
  if (top) {
    rest = cubic(fixed, mix(fixed, joint, .33), mix(fixed, joint, .72), joint, t);
    target = cubic(fixed, mix(fixed, moved, .33), mix(fixed, moved, .72), moved, t);
  } else {
    const tangent = { x: joint.x - 24, y: joint.y + 4 };
    const sleeveControl = { x: fixed.x + 25, y: fixed.y - 3 };
    rest = cubic(joint, tangent, sleeveControl, fixed, t);
    target = cubic(moved, drinkingGripPoint(tangent, seconds, reducedMotion), sleeveControl, fixed, t);
  }
  return { x: target.x + (point.x - rest.x) * (1 - pose.reach), y: target.y + (point.y - rest.y) * (1 - pose.reach) };
}
