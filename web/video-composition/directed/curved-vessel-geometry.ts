import {BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3} from "three";
import {mergeVertices} from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const CUTAWAY_INNER_RADIUS = 2.25;
export const CUTAWAY_OUTER_RADIUS = 2.65;
export const CUTAWAY_THETA_START = Math.PI * (5 / 6);
export const CUTAWAY_THETA_END = Math.PI * (13 / 6);

export type VesselFrame = {
  center: Vector3;
  tangent: Vector3;
  normal: Vector3;
  binormal: Vector3;
};

export function sampleCutawayFrame(t: number): VesselFrame {
  const clamped = Math.max(0, Math.min(1, t));
  const phase = (clamped - 0.5) * Math.PI * 1.35;
  const center = new Vector3(
    1.62 * Math.sin(phase),
    -5.45 + 10.9 * clamped,
    -0.42 * (clamped - 0.5) + 0.1 * Math.sin(clamped * Math.PI),
  );
  const tangent = new Vector3(
    1.62 * Math.cos(phase) * Math.PI * 1.35,
    10.9,
    -0.42 + 0.1 * Math.cos(clamped * Math.PI) * Math.PI,
  ).normalize();
  const normal = new Vector3(tangent.y, -tangent.x, 0).normalize();
  const binormal = normal.clone().cross(tangent).normalize();
  return {center, tangent, normal, binormal};
}

function surfacePoint(frame: VesselFrame, radius: number, theta: number) {
  return frame.center.clone()
    .addScaledVector(frame.normal, Math.cos(theta) * radius)
    .addScaledVector(frame.binormal, Math.sin(theta) * radius);
}

export function createCutawayRimCurve(theta: number, segments = 72) {
  const points = Array.from({length: segments + 1}, (_, index) =>
    surfacePoint(sampleCutawayFrame(index / segments), (CUTAWAY_INNER_RADIUS + CUTAWAY_OUTER_RADIUS) / 2, theta),
  );
  return new CatmullRomCurve3(points);
}

/** One continuous partial annular sweep with separately addressable outer wall,
 * inner wall, longitudinal cut rims, and annular end caps. */
export function createCurvedCutawayVesselGeometry(pathSegments = 72, radialSegments = 48) {
  const positions: number[] = [];
  const indices: number[] = [];
  const groups: {start: number; count: number; materialIndex: number}[] = [];
  const ringStride = radialSegments + 1;

  const addSurface = (radius: number, reverse: boolean, materialIndex: number) => {
    const vertexStart = positions.length / 3;
    for (let pathIndex = 0; pathIndex <= pathSegments; pathIndex++) {
      const frame = sampleCutawayFrame(pathIndex / pathSegments);
      for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex++) {
        const theta = CUTAWAY_THETA_START + (CUTAWAY_THETA_END - CUTAWAY_THETA_START) * (radialIndex / radialSegments);
        const point = surfacePoint(frame, radius, theta);
        positions.push(point.x, point.y, point.z);
      }
    }
    const groupStart = indices.length;
    for (let pathIndex = 0; pathIndex < pathSegments; pathIndex++) {
      for (let radialIndex = 0; radialIndex < radialSegments; radialIndex++) {
        const a = vertexStart + pathIndex * ringStride + radialIndex;
        const b = a + ringStride;
        const c = b + 1;
        const d = a + 1;
        if (reverse) indices.push(a, d, b, b, d, c);
        else indices.push(a, b, d, b, c, d);
      }
    }
    groups.push({start: groupStart, count: indices.length - groupStart, materialIndex});
  };

  addSurface(CUTAWAY_OUTER_RADIUS, false, 0);
  addSurface(CUTAWAY_INNER_RADIUS, true, 1);

  const addLongitudinalRim = (theta: number, reverse: boolean) => {
    const vertexStart = positions.length / 3;
    for (let pathIndex = 0; pathIndex <= pathSegments; pathIndex++) {
      const frame = sampleCutawayFrame(pathIndex / pathSegments);
      for (const radius of [CUTAWAY_INNER_RADIUS, CUTAWAY_OUTER_RADIUS]) {
        const point = surfacePoint(frame, radius, theta);
        positions.push(point.x, point.y, point.z);
      }
    }
    const groupStart = indices.length;
    for (let pathIndex = 0; pathIndex < pathSegments; pathIndex++) {
      const a = vertexStart + pathIndex * 2;
      const b = a + 2;
      if (reverse) indices.push(a, b, a + 1, b, b + 1, a + 1);
      else indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    groups.push({start: groupStart, count: indices.length - groupStart, materialIndex: 2});
  };
  // The two cut boundaries run in opposite directions around the annulus.
  addLongitudinalRim(CUTAWAY_THETA_START, true);
  addLongitudinalRim(CUTAWAY_THETA_END, false);

  for (const endpoint of [0, 1] as const) {
    const frame = sampleCutawayFrame(endpoint);
    const vertexStart = positions.length / 3;
    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex++) {
      const theta = CUTAWAY_THETA_START + (CUTAWAY_THETA_END - CUTAWAY_THETA_START) * (radialIndex / radialSegments);
      for (const radius of [CUTAWAY_INNER_RADIUS, CUTAWAY_OUTER_RADIUS]) {
        const point = surfacePoint(frame, radius, theta);
        positions.push(point.x, point.y, point.z);
      }
    }
    const groupStart = indices.length;
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex++) {
      const a = vertexStart + radialIndex * 2;
      const b = a + 2;
      if (endpoint === 0) indices.push(a, a + 1, b, b, a + 1, b + 1);
      else indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    groups.push({start: groupStart, count: indices.length - groupStart, materialIndex: 2});
  }

  const rawGeometry = new BufferGeometry();
  rawGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  rawGeometry.setIndex(indices);
  for (const group of groups) rawGeometry.addGroup(group.start, group.count, group.materialIndex);
  const geometry = mergeVertices(rawGeometry, 1e-5);
  rawGeometry.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    topology: "continuous-swept-partial-annulus",
    pathSegments,
    radialSegments,
    innerRadius: CUTAWAY_INNER_RADIUS,
    outerRadius: CUTAWAY_OUTER_RADIUS,
  };
  return geometry;
}

/** Intact capped swept tube used only for subdued distant vessels. */
export function createClosedSweptVesselGeometry(path: CatmullRomCurve3, radius: number, pathSegments = 48, radialSegments = 24) {
  const positions: number[] = [];
  const indices: number[] = [];
  const frames = path.computeFrenetFrames(pathSegments, false);
  for (let pathIndex = 0; pathIndex <= pathSegments; pathIndex++) {
    const center = path.getPointAt(pathIndex / pathSegments);
    const normal = frames.normals[pathIndex] ?? new Vector3(1, 0, 0);
    const binormal = frames.binormals[pathIndex] ?? new Vector3(0, 0, 1);
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex++) {
      const theta = radialIndex / radialSegments * Math.PI * 2;
      const point = center.clone().addScaledVector(normal, Math.cos(theta) * radius).addScaledVector(binormal, Math.sin(theta) * radius);
      positions.push(point.x, point.y, point.z);
    }
  }
  for (let pathIndex = 0; pathIndex < pathSegments; pathIndex++) {
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex++) {
      const next = (radialIndex + 1) % radialSegments;
      const a = pathIndex * radialSegments + radialIndex;
      const b = a + radialSegments;
      const c = (pathIndex + 1) * radialSegments + next;
      const d = pathIndex * radialSegments + next;
      indices.push(a, d, b, b, d, c);
    }
  }
  for (const endpoint of [0, 1] as const) {
    const centerIndex = positions.length / 3;
    const center = path.getPointAt(endpoint);
    positions.push(center.x, center.y, center.z);
    const ringStart = endpoint * pathSegments * radialSegments;
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex++) {
      const next = (radialIndex + 1) % radialSegments;
      if (endpoint === 0) indices.push(centerIndex, ringStart + next, ringStart + radialIndex);
      else indices.push(centerIndex, ringStart + radialIndex, ringStart + next);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData = {topology: "closed-capped-swept-tube", pathSegments, radialSegments, radius};
  return geometry;
}
