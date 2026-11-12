const NS = 'http://www.w3.org/2000/svg';

export type WorkPlanningUpperBodyState = {
  seconds: number;
  lift: number;
  settle: number;
  recline: number;
  hipX: number;
  hipY: number;
};

type Point = {x: number; y: number};
type Matrix = {a: number; b: number; c: number; d: number; e: number; f: number};

export type WorkPlanningUpperBodyRig = {
  apply: (state: WorkPlanningUpperBodyState) => void;
  headAnchor: () => Point;
  audit: () => unknown;
};

const HIP: Point = {x: 282, y: 324};
const NECK: Point = {x: 267, y: 237.5};
const HEAD_ANCHOR: Point = {x: 263, y: 213};
const SKIN = '#ffbe9d';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

const interpolatePoint = (from: Point, to: Point, amount: number): Point => ({
  x: lerp(from.x, to.x, amount),
  y: lerp(from.y, to.y, amount),
});

const polarLiftPoint = (
  shoulder: Point,
  from: Point,
  apex: Point,
  progress: number,
  direction: 'clockwise' | 'counterclockwise',
): Point => {
  // The directed scene cue owns the temporal easing, including endpoint
  // velocity. Preserve it here so the visible sweep is not compressed twice.
  const amount = clamp01(progress);
  const fromAngle = Math.atan2(from.y - shoulder.y, from.x - shoulder.x);
  let apexAngle = Math.atan2(apex.y - shoulder.y, apex.x - shoulder.x);
  if (direction === 'counterclockwise' && apexAngle < fromAngle) apexAngle += Math.PI * 2;
  if (direction === 'clockwise' && apexAngle > fromAngle) apexAngle -= Math.PI * 2;
  const angle = lerp(fromAngle, apexAngle, amount);
  const radius = lerp(Math.hypot(from.x - shoulder.x, from.y - shoulder.y), Math.hypot(apex.x - shoulder.x, apex.y - shoulder.y), amount);
  return {x: shoulder.x + Math.cos(angle) * radius, y: shoulder.y + Math.sin(angle) * radius};
};

const rotationMatrix = (degrees: number, pivot: Point, x = 0, y = 0): Matrix => {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    a: cosine,
    b: sine,
    c: -sine,
    d: cosine,
    e: x + pivot.x - pivot.x * cosine + pivot.y * sine,
    f: y + pivot.y - pivot.x * sine - pivot.y * cosine,
  };
};

const compose = (outer: Matrix, inner: Matrix): Matrix => ({
  a: outer.a * inner.a + outer.c * inner.b,
  b: outer.b * inner.a + outer.d * inner.b,
  c: outer.a * inner.c + outer.c * inner.d,
  d: outer.b * inner.c + outer.d * inner.d,
  e: outer.a * inner.e + outer.c * inner.f + outer.e,
  f: outer.b * inner.e + outer.d * inner.f + outer.f,
});

const matrixPoint = (matrix: Matrix, point: Point): Point => ({
  x: matrix.a * point.x + matrix.c * point.y + matrix.e,
  y: matrix.b * point.x + matrix.d * point.y + matrix.f,
});

const matrixAttribute = ({a, b, c, d, e, f}: Matrix) =>
  `matrix(${a.toFixed(6)} ${b.toFixed(6)} ${c.toFixed(6)} ${d.toFixed(6)} ${e.toFixed(4)} ${f.toFixed(4)})`;

/**
 * Shared source-space deformation for the torso-to-trouser join. Shoulders use
 * the full recline while the lower hem converges to the smaller pelvis angle.
 */
export const mapWorkPlanningUpperBodyPoint = (
  point: Point,
  state: Pick<WorkPlanningUpperBodyState, 'recline' | 'hipX' | 'hipY'>,
): Point => {
  const recline = clamp01(state.recline);
  const hemBlend = smooth((point.y - 278) / (319 - 278));
  const degrees = lerp(42 * recline, 12 * recline, hemBlend);
  return matrixPoint(rotationMatrix(degrees, HIP, state.hipX, state.hipY), point);
};

const pointsPath = (points: Point[], closed: boolean) =>
  points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(' ') + (closed ? ' Z' : '');

const samplePath = (source: SVGPathElement, spacing = 0.32) => {
  const length = source.getTotalLength();
  const count = Math.max(2, Math.ceil(length / spacing));
  const points = Array.from({length: count}, (_, index) => {
    const point = source.getPointAtLength(index * length / count);
    return {x: point.x, y: point.y};
  });
  return {points, closed: /z\s*$/i.test(source.getAttribute('d') ?? '')};
};

const makePathClone = (source: SVGPathElement) => {
  const clone = source.cloneNode(false) as SVGPathElement;
  clone.removeAttribute('id');
  clone.setAttribute('data-work-upper-derived-from', source.getAttribute('data-work-source-index') ?? 'nested');
  return clone;
};

const makeClip = (defs: SVGDefsElement, id: string, d: string) => {
  const clip = document.createElementNS(NS, 'clipPath');
  clip.id = id;
  clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  clip.append(path);
  defs.append(clip);
  return path;
};

const similarityMatrix = (sourceStart: Point, sourceEnd: Point, targetStart: Point, targetEnd: Point): Matrix => {
  const sourceDx = sourceEnd.x - sourceStart.x;
  const sourceDy = sourceEnd.y - sourceStart.y;
  const targetDx = targetEnd.x - targetStart.x;
  const targetDy = targetEnd.y - targetStart.y;
  const denominator = sourceDx * sourceDx + sourceDy * sourceDy;
  const a = (targetDx * sourceDx + targetDy * sourceDy) / denominator;
  const b = (targetDy * sourceDx - targetDx * sourceDy) / denominator;
  return {
    a,
    b,
    c: -b,
    d: a,
    e: targetStart.x - a * sourceStart.x + b * sourceStart.y,
    f: targetStart.y - b * sourceStart.x - a * sourceStart.y,
  };
};

const pointAtDistance = (start: Point, toward: Point, distance: number): Point => {
  const dx = toward.x - start.x;
  const dy = toward.y - start.y;
  const length = Math.hypot(dx, dy);
  return {x: start.x + dx / length * distance, y: start.y + dy / length * distance};
};

const solveElbow = (
  shoulder: Point,
  wrist: Point,
  upperLength: number,
  forearmLength: number,
  branch: 0 | 1,
): Point => {
  const dx = wrist.x - shoulder.x;
  const dy = wrist.y - shoulder.y;
  const distance = Math.max(0.001, Math.hypot(dx, dy));
  const along = (upperLength * upperLength - forearmLength * forearmLength + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  const ux = dx / distance;
  const uy = dy / distance;
  const candidates = [
    {x: shoulder.x + ux * along - uy * height, y: shoulder.y + uy * along + ux * height},
    {x: shoulder.x + ux * along + uy * height, y: shoulder.y + uy * along - ux * height},
  ];
  return candidates[branch]!;
};

const sleevePath = (shoulder: Point, cuff: Point) => {
  const dx = cuff.x - shoulder.x;
  const dy = cuff.y - shoulder.y;
  const length = Math.hypot(dx, dy);
  const tx = dx / length;
  const ty = dy / length;
  const nx = -ty;
  const ny = tx;
  const root = {x: shoulder.x - tx * 5, y: shoulder.y - ty * 5};
  const outerRoot = {x: root.x + nx * 12, y: root.y + ny * 12};
  const innerRoot = {x: root.x - nx * 12, y: root.y - ny * 12};
  const outerCuff = {x: cuff.x + nx * 7.5, y: cuff.y + ny * 7.5};
  const innerCuff = {x: cuff.x - nx * 7.5, y: cuff.y - ny * 7.5};
  const outerControl = {x: lerp(outerRoot.x, outerCuff.x, 0.54) + nx * 2, y: lerp(outerRoot.y, outerCuff.y, 0.54) + ny * 2};
  const innerControl = {x: lerp(innerCuff.x, innerRoot.x, 0.54) - nx * 1.5, y: lerp(innerCuff.y, innerRoot.y, 0.54) - ny * 1.5};
  const rootControl = {x: shoulder.x - tx * 9, y: shoulder.y - ty * 9};
  const markA = interpolatePoint(shoulder, cuff, 0.42);
  const markB = interpolatePoint(shoulder, cuff, 0.68);
  return {
    d: `M${outerRoot.x.toFixed(3)},${outerRoot.y.toFixed(3)} Q${outerControl.x.toFixed(3)},${outerControl.y.toFixed(3)} ${outerCuff.x.toFixed(3)},${outerCuff.y.toFixed(3)} L${innerCuff.x.toFixed(3)},${innerCuff.y.toFixed(3)} Q${innerControl.x.toFixed(3)},${innerControl.y.toFixed(3)} ${innerRoot.x.toFixed(3)},${innerRoot.y.toFixed(3)} Q${rootControl.x.toFixed(3)},${rootControl.y.toFixed(3)} ${outerRoot.x.toFixed(3)},${outerRoot.y.toFixed(3)} Z`,
    cuff: `M${outerCuff.x.toFixed(3)},${outerCuff.y.toFixed(3)} L${innerCuff.x.toFixed(3)},${innerCuff.y.toFixed(3)}`,
    marks: [
      `M${(markA.x - nx * 3).toFixed(3)},${(markA.y - ny * 3).toFixed(3)} L${(markA.x + nx * 2).toFixed(3)},${(markA.y + ny * 2).toFixed(3)}`,
      `M${(markB.x + nx * 2.5).toFixed(3)},${(markB.y + ny * 2.5).toFixed(3)} L${(markB.x - nx * 2).toFixed(3)},${(markB.y - ny * 2).toFixed(3)}`,
    ],
  };
};

let rigNumber = 0;

export function prepareWorkPlanningUpperBody(
  svg: SVGSVGElement,
  parts: SVGElement[],
): WorkPlanningUpperBodyRig {
  if (parts.length !== 100 || parts[55]?.tagName.toLowerCase() !== 'path' || parts[58]?.tagName.toLowerCase() !== 'path') {
    throw new Error('Working/Pana upper-body source structure changed');
  }
  const character = parts[0]!.parentElement as unknown as SVGGElement;
  if (!character) throw new Error('Working/Pana Character group is missing');

  const owned = [...parts.slice(5, 19), ...parts.slice(55, 89)];
  for (const part of owned) {
    if (!part.hasAttribute('data-work-source-index')) {
      const index = parts.indexOf(part);
      part.setAttribute('data-work-source-index', String(index));
    }
  }

  const originalAttributes = new Map<SVGElement, {style: string | null; transform: string | null}>();
  for (const part of owned) originalAttributes.set(part, {
    style: part.getAttribute('style'),
    transform: part.getAttribute('transform'),
  });

  const serial = ++rigNumber;
  let defs = svg.querySelector<SVGDefsElement>('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  const coreClipPath = makeClip(
    defs,
    `work-upper-core-${serial}`,
    'M247 237 L278 236 L292 241 L292 296 L301 320 L246 321 L251 295 L247 277 Z',
  );
  makeClip(defs, `work-upper-hand-${serial}`, 'M214 279 L247 279 L247 303 L214 303 Z');
  const backLayer = document.createElementNS(NS, 'g');
  backLayer.setAttribute('data-work-upper-layer', 'arms-behind-hair');
  character.insertBefore(backLayer, parts[5]!);

  const makeSleeve = (name: string) => {
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('data-work-upper-layer', `${name}-sleeve`);
    const shape = document.createElementNS(NS, 'path');
    shape.setAttribute('fill', '#FF725E');
    const cuff = document.createElementNS(NS, 'path');
    cuff.setAttribute('fill', 'none');
    cuff.setAttribute('stroke', '#263238');
    cuff.setAttribute('stroke-width', '0.7');
    cuff.setAttribute('stroke-linecap', 'round');
    const marks = [0, 1].map(() => {
      const mark = document.createElementNS(NS, 'path');
      mark.setAttribute('fill', 'none');
      mark.setAttribute('stroke', '#fafafa');
      mark.setAttribute('stroke-width', '0.85');
      mark.setAttribute('stroke-linecap', 'round');
      return mark;
    });
    group.append(shape, cuff, ...marks);
    return {group, shape, cuff, marks};
  };
  const farSleeve = makeSleeve('far');
  const nearSleeve = makeSleeve('near');
  backLayer.append(farSleeve.group, nearSleeve.group);

  const sourceSkin = parts[58] as SVGPathElement;
  const sourceSkeleton: Point[] = [
    {x: 293.5, y: 270},
    {x: 298, y: 292.5},
    {x: 244, y: 293},
    {x: 226, y: 292},
  ];
  const makeArm = (name: string) => {
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('data-work-upper-layer', name);
    const upper = document.createElementNS(NS, 'path');
    const forearm = document.createElementNS(NS, 'path');
    for (const [path, width] of [[upper, 17], [forearm, 14.5]] as const) {
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', SKIN);
      path.setAttribute('stroke-width', String(width));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
    }
    // The sleeve owns the cuff edge; its skin continuation must terminate flat.
    // The forearm keeps round caps so its start forms the elbow union.
    upper.setAttribute('stroke-linecap', 'butt');
    const hand = document.createElementNS(NS, 'g');
    hand.setAttribute('clip-path', `url(#work-upper-hand-${serial})`);
    hand.append(makePathClone(sourceSkin));
    group.append(upper, forearm, hand);
    return {group, upper, forearm, hand};
  };
  const farArm = makeArm('far-arm');
  const nearBackArm = makeArm('near-arm-behind-hair');
  backLayer.append(farArm.group, nearBackArm.group);

  const neckFill = document.createElementNS(NS, 'path');
  neckFill.setAttribute('d', 'M257 232 C258 228 275 228 277 233 L277 244 L256 244 Z');
  neckFill.setAttribute('fill', SKIN);
  neckFill.setAttribute('data-work-upper-layer', 'neck-fill');
  backLayer.append(neckFill);

  const bodyLayer = document.createElementNS(NS, 'g');
  bodyLayer.setAttribute('data-work-upper-layer', 'torso-source-deformation');
  bodyLayer.setAttribute('clip-path', `url(#work-upper-core-${serial})`);
  character.insertBefore(bodyLayer, parts[55]!);

  const bodyDeformers: Array<{clone: SVGPathElement; points: Point[]; closed: boolean; transitionOnly: boolean}> = [];
  for (const sourcePart of parts.slice(55, 89)) {
    if ([parts[58], parts[60]].includes(sourcePart)) continue;
    const sourcePaths = sourcePart.tagName.toLowerCase() === 'path'
      ? [sourcePart as SVGPathElement]
      : [...sourcePart.querySelectorAll<SVGPathElement>('path')];
    for (const sourcePath of sourcePaths) {
      const clone = makePathClone(sourcePath);
      if (sourcePart === parts[61]) clone.style.opacity = '0.3';
      const sampled = samplePath(sourcePath);
      bodyDeformers.push({clone, ...sampled, transitionOnly: [parts[56], parts[57], parts[59]].includes(sourcePart)});
      bodyLayer.append(clone);
    }
  }

  const nearFrontLayer = document.createElementNS(NS, 'g');
  nearFrontLayer.setAttribute('data-work-upper-layer', 'near-arm-in-front');
  const sourceSkinTransition = makePathClone(sourceSkin);
  sourceSkinTransition.setAttribute('data-work-upper-layer', 'source-skin-transition');
  const nearFrontArm = makeArm('near-arm-front-copy');
  nearFrontLayer.append(sourceSkinTransition, nearFrontArm.group);
  character.insertBefore(nearFrontLayer, parts[60]!);

  const bodyOriginals = parts.slice(55, 89).filter((part) => part !== parts[60]);
  const bodyOpacity = new Map(bodyOriginals.map((part) => {
    const inline = part.style.opacity;
    const attribute = part.getAttribute('opacity');
    const value = inline ? Number(inline) : attribute ? Number(attribute) : 1;
    return [part, Number.isFinite(value) ? value : 1] as const;
  }));

  const headParts = [...parts.slice(5, 19), parts[60]!];
  const farShoulder: Point = {x: 243, y: 245};
  const nearShoulder: Point = {x: 288, y: 244};
  const farSourceCuff: Point = {x: 231, y: 277};
  const nearSourceCuff: Point = {x: 293.5, y: 270};

  let currentState: WorkPlanningUpperBodyState = {seconds: 0, lift: 0, settle: 0, recline: 0, hipX: 0, hipY: 0};
  let currentHeadAnchor = {...HEAD_ANCHOR};
  let currentAudit: Record<string, unknown> = {};

  const restorePart = (part: SVGElement) => {
    const original = originalAttributes.get(part)!;
    if (original.style === null) part.removeAttribute('style');
    else part.setAttribute('style', original.style);
    if (original.transform === null) part.removeAttribute('transform');
    else part.setAttribute('transform', original.transform);
  };

  const apply = (rawState: WorkPlanningUpperBodyState) => {
    const state = {
      ...rawState,
      lift: clamp01(rawState.lift),
      settle: clamp01(rawState.settle),
      recline: clamp01(rawState.recline),
    };
    currentState = state;
    const activity = Math.max(state.lift, state.settle, state.recline, Math.min(1, Math.hypot(state.hipX, state.hipY) / 4));
    // An opacity crossfade between mismatched silhouettes makes the coral shirt
    // translucent. Switch representations on the first changed frame; rest still
    // uses the untouched source nodes exactly.
    const replacementOpacity = activity === 0 ? 0 : 1;
    const upperMatrix = rotationMatrix(42 * state.recline, HIP, state.hipX, state.hipY);
    const headTilt = 4 * state.settle;
    const headMatrix = compose(upperMatrix, rotationMatrix(headTilt, NECK));

    for (const part of headParts) {
      if (activity === 0) restorePart(part);
      else part.setAttribute('transform', matrixAttribute(headMatrix));
    }
    currentHeadAnchor = matrixPoint(headMatrix, HEAD_ANCHOR);

    if (activity === 0) {
      for (const part of bodyOriginals) restorePart(part);
    } else {
      for (const part of bodyOriginals) {
        const opacity = bodyOpacity.get(part) ?? 1;
        part.style.opacity = String(opacity * (1 - replacementOpacity));
      }
    }
    backLayer.setAttribute('opacity', String(replacementOpacity));
    bodyLayer.setAttribute('opacity', String(replacementOpacity));

    const bodyMap = (point: Point) => mapWorkPlanningUpperBodyPoint(point, state);
    const narrowCore = [
      {x: 247, y: 237}, {x: 278, y: 236}, {x: 292, y: 241}, {x: 292, y: 296},
      {x: 301, y: 320}, {x: 246, y: 321}, {x: 251, y: 295}, {x: 247, y: 277},
    ];
    // At the first changed frame the deformed clone must still reproduce the
    // complete source shirt. The full clip then withdraws underneath already
    // opaque sleeves, so there is no translucent crossfade or shoulder pop.
    const fullCore = [
      {x: 218, y: 230}, {x: 310, y: 230}, {x: 310, y: 300}, {x: 310, y: 328},
      {x: 236, y: 328}, {x: 218, y: 300}, {x: 218, y: 270}, {x: 218, y: 230},
    ];
    const coreTransition = smooth((state.lift - 0.015) / 0.025);
    for (const item of bodyDeformers) {
      item.clone.setAttribute('d', pointsPath(item.points.map(bodyMap), item.closed));
      item.clone.setAttribute('opacity', item.transitionOnly ? String(1 - coreTransition) : '1');
    }
    const coreSource = fullCore.map((point, index) => interpolatePoint(point, narrowCore[index]!, coreTransition));
    coreClipPath.setAttribute('d', pointsPath(coreSource.map(bodyMap), true));

    const farSleeveLength = Math.hypot(farSourceCuff.x - farShoulder.x, farSourceCuff.y - farShoulder.y);
    const nearSleeveLength = Math.hypot(nearSourceCuff.x - nearShoulder.x, nearSourceCuff.y - nearShoulder.y);
    // The scene cue is already eased. Apply the polar path's own smoothstep once
    // so the arm does not remain compressed at the desk and then rush upward.
    const armLift = state.lift;
    const armSettle = smooth(state.settle);
    const nearUpperLength = Math.hypot(298 - nearShoulder.x, 293 - nearShoulder.y);
    const nearForearmLength = Math.hypot(sourceSkeleton[2]!.x - sourceSkeleton[1]!.x, sourceSkeleton[2]!.y - sourceSkeleton[1]!.y);
    const farUpperLength = 48;
    const farForearmLength = 51;
    const handLength = Math.hypot(sourceSkeleton[3]!.x - sourceSkeleton[2]!.x, sourceSkeleton[3]!.y - sourceSkeleton[2]!.y);

    const nearApexWrist = pointAtDistance(nearShoulder, {x: 282, y: 140}, nearUpperLength + nearForearmLength);
    const nearLiftedWrist = polarLiftPoint(nearShoulder, sourceSkeleton[2]!, nearApexWrist, armLift, 'clockwise');
    const nearWrist = interpolatePoint(nearLiftedWrist, {x: 281, y: 207}, armSettle);
    const nearHandAngle = lerp(
      Math.atan2(sourceSkeleton[3]!.y - sourceSkeleton[2]!.y, sourceSkeleton[3]!.x - sourceSkeleton[2]!.x),
      -Math.PI * 0.85,
      armLift,
    );
    const nearLiftedHandAim = {
      x: nearLiftedWrist.x + Math.cos(nearHandAngle) * handLength,
      y: nearLiftedWrist.y + Math.sin(nearHandAngle) * handLength,
    };
    const nearHandAim = interpolatePoint(nearLiftedHandAim, {x: 264, y: 207}, armSettle);
    // Source bend is branch 1; after the unique straight apex it opens on branch 0.
    const nearElbow = solveElbow(nearShoulder, nearWrist, nearUpperLength, nearForearmLength, state.settle > 0 ? 0 : 1);
    const nearSkeleton: Point[] = [
      pointAtDistance(nearShoulder, nearElbow, nearSleeveLength),
      nearElbow,
      nearWrist,
      pointAtDistance(nearWrist, nearHandAim, handLength),
    ];

    const farApexWrist = pointAtDistance(farShoulder, {x: 244, y: 145}, farUpperLength + farForearmLength);
    const farPolarRestWrist = {x: 237, y: 290};
    const farFoldedRestWrist = {x: 275, y: 292};
    const farPolarWrist = polarLiftPoint(farShoulder, farPolarRestWrist, farApexWrist, armLift, 'counterclockwise');
    // At rest the missing far arm folds behind the laptop, with its source cuff
    // still attached. It opens into the outward polar sweep while occluded.
    const farLiftedWrist = interpolatePoint(farFoldedRestWrist, farPolarWrist, smooth(state.lift / 0.12));
    const farWrist = interpolatePoint(farLiftedWrist, {x: 247, y: 207}, armSettle);
    const farHandAngle = lerp(0, -Math.PI * 0.15, armLift);
    const farLiftedHandAim = {
      x: farLiftedWrist.x + Math.cos(farHandAngle) * handLength,
      y: farLiftedWrist.y + Math.sin(farHandAngle) * handLength,
    };
    const farHandAim = interpolatePoint(farLiftedHandAim, {x: 264, y: 207}, armSettle);
    // The far arm mirrors the near arm: branch 0 before apex, branch 1 after it.
    const farElbow = solveElbow(farShoulder, farWrist, farUpperLength, farForearmLength, state.settle > 0 ? 1 : 0);
    const farSkeleton: Point[] = [
      pointAtDistance(farShoulder, farElbow, farSleeveLength),
      farElbow,
      farWrist,
      pointAtDistance(farWrist, farHandAim, handLength),
    ];

    const deformArm = (arm: ReturnType<typeof makeArm>, skeleton: Point[], widthScale: number) => {
      arm.upper.setAttribute('d', `M${skeleton[0]!.x.toFixed(3)},${skeleton[0]!.y.toFixed(3)} L${skeleton[1]!.x.toFixed(3)},${skeleton[1]!.y.toFixed(3)}`);
      const handOverlap = interpolatePoint(skeleton[2]!, skeleton[3]!, 0.4);
      arm.forearm.setAttribute('d', `M${skeleton[1]!.x.toFixed(3)},${skeleton[1]!.y.toFixed(3)} L${handOverlap.x.toFixed(3)},${handOverlap.y.toFixed(3)}`);
      arm.upper.setAttribute('stroke-width', String(17 * widthScale));
      arm.forearm.setAttribute('stroke-width', String(14.5 * widthScale));
      arm.group.setAttribute('transform', matrixAttribute(upperMatrix));
      arm.hand.setAttribute('transform', matrixAttribute(similarityMatrix(sourceSkeleton[2]!, sourceSkeleton[3]!, skeleton[2]!, skeleton[3]!)));
    };
    deformArm(farArm, farSkeleton, 0.9);
    deformArm(nearBackArm, nearSkeleton, 1);
    deformArm(nearFrontArm, nearSkeleton, 1);

    const layerTransfer = smooth((state.settle - 0.08) / 0.55);
    // Reproduce source path 58 through the first changed frames, while the clean
    // near-arm rig is still position-aligned. Complete the transfer before the
    // wrist has travelled perceptibly, preventing both a forearm/hem jump and a
    // doubled moving silhouette.
    const skinTransition = smooth(state.lift / 0.015);
    sourceSkinTransition.setAttribute('opacity', String(1 - skinTransition));
    nearFrontArm.group.setAttribute('opacity', String(skinTransition));
    nearBackArm.group.setAttribute('opacity', String(layerTransfer));
    nearFrontLayer.setAttribute('opacity', String(replacementOpacity * (1 - layerTransfer)));
    // The reconstructed far forearm exists continuously and emerges from the
    // laptop through scene occlusion, rather than appearing by opacity.
    const farArmOpacity = 1;
    farArm.group.setAttribute('opacity', String(farArmOpacity));

    const applySleeve = (sleeve: ReturnType<typeof makeSleeve>, shoulder: Point, cuffPoint: Point) => {
      const geometry = sleevePath(shoulder, cuffPoint);
      sleeve.shape.setAttribute('d', geometry.d);
      sleeve.cuff.setAttribute('d', geometry.cuff);
      sleeve.marks.forEach((mark, index) => mark.setAttribute('d', geometry.marks[index]!));
      sleeve.group.setAttribute('transform', matrixAttribute(upperMatrix));
    };
    const farSleeveCuff = interpolatePoint(farSourceCuff, farSkeleton[0]!, smooth(state.lift / 0.18));
    applySleeve(farSleeve, farShoulder, farSleeveCuff);
    applySleeve(nearSleeve, nearShoulder, nearSkeleton[0]!);
    const sleeveReveal = smooth(state.lift / 0.015);
    farSleeve.group.setAttribute('opacity', String(sleeveReveal));
    nearSleeve.group.setAttribute('opacity', String(sleeveReveal));
    neckFill.setAttribute('transform', matrixAttribute(upperMatrix));

    const farCuffFromSleeve = matrixPoint(upperMatrix, farSleeveCuff);
    const nearCuffFromSleeve = matrixPoint(upperMatrix, nearSkeleton[0]!);
    const farArmCuff = matrixPoint(upperMatrix, farSkeleton[0]!);
    const nearArmCuff = matrixPoint(upperMatrix, nearSkeleton[0]!);
    const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    currentAudit = {
      state,
      sourceOwnership: {head: [5, 18], torso: [55, 88], excludedLowerBody: [19, 54, 89, 99]},
      replacementOpacity,
      torsoAnglesDegrees: {shoulder: 42 * state.recline, hem: 12 * state.recline},
      headTiltDegrees: headTilt,
      headAnchor: currentHeadAnchor,
      neckAnchor: matrixPoint(upperMatrix, NECK),
      joints: {
        far: farSkeleton.map((point) => matrixPoint(upperMatrix, point)),
        near: nearSkeleton.map((point) => matrixPoint(upperMatrix, point)),
      },
      attachmentError: {
        farCuff: distance(farCuffFromSleeve, farArmCuff),
        nearCuff: distance(nearCuffFromSleeve, nearArmCuff),
      },
      farArmOpacity,
      boneLengths: {
        farUpper: distance(matrixPoint(upperMatrix, farShoulder), matrixPoint(upperMatrix, farElbow)),
        farForearm: distance(matrixPoint(upperMatrix, farElbow), matrixPoint(upperMatrix, farWrist)),
        nearUpper: distance(matrixPoint(upperMatrix, nearShoulder), matrixPoint(upperMatrix, nearElbow)),
        nearForearm: distance(matrixPoint(upperMatrix, nearElbow), matrixPoint(upperMatrix, nearWrist)),
      },
      ikPhase: state.settle > 0 ? 'post-apex-opposite-bend' : state.lift > 0.9999 ? 'straight-apex' : 'pre-apex-source-bend',
      apexReach: {
        far: farUpperLength + farForearmLength,
        near: nearUpperLength + nearForearmLength,
      },
      layerTransfer,
      skinTransition,
    };
    svg.setAttribute('data-work-upper-state', activity === 0 ? 'source-rest' : state.settle > 0.95 ? 'reclined-settled' : 'raising');
  };

  apply(currentState);

  return {
    apply,
    headAnchor: () => ({...currentHeadAnchor}),
    audit: () => ({...currentAudit}),
  };
}
