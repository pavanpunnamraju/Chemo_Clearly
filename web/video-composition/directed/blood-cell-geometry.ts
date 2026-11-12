import {BufferGeometry, Float32BufferAttribute} from "three";
import {mergeVertices} from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Closed biconcave erythrocyte surface. The center is thin but remains filled;
 * the rounded outer wall closes the top and bottom surfaces without a torus hole. */
export function createRedBloodCellGeometry(radialSegments = 18, angularSegments = 72) {
  const positions: number[] = [];
  const indices: number[] = [];

  const halfThickness = (radius: number) =>
    0.13 + 0.16 * Math.pow(Math.sin(Math.PI * radius), 0.72) + 0.01 * radius * radius;

  for (const side of [1, -1] as const) {
    const center = positions.length / 3;
    positions.push(0, 0, side * halfThickness(0));
    const sideOffset = positions.length / 3;
    for (let ring = 1; ring <= radialSegments; ring++) {
      const radius = ring / radialSegments;
      const z = side * halfThickness(radius);
      for (let segment = 0; segment < angularSegments; segment++) {
        const angle = (segment / angularSegments) * Math.PI * 2;
        positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
      }
    }
    for (let segment = 0; segment < angularSegments; segment++) {
      const next = (segment + 1) % angularSegments;
      if (side > 0) indices.push(center, sideOffset + segment, sideOffset + next);
      else indices.push(center, sideOffset + next, sideOffset + segment);
    }
    for (let ring = 0; ring < radialSegments - 1; ring++) {
      for (let segment = 0; segment < angularSegments; segment++) {
        const next = (segment + 1) % angularSegments;
        const a = sideOffset + ring * angularSegments + segment;
        const b = a + angularSegments;
        const c = sideOffset + (ring + 1) * angularSegments + next;
        const d = sideOffset + ring * angularSegments + next;
        if (side > 0) indices.push(a, b, d, b, c, d);
        else indices.push(a, d, b, b, d, c);
      }
    }
  }

  const wallOffset = positions.length / 3;
  const wallRings = 10;
  for (let ring = 0; ring <= wallRings; ring++) {
    const t = ring / wallRings;
    const z = halfThickness(1) * Math.cos(t * Math.PI);
    const radius = 1 + 0.018 * Math.sin(t * Math.PI);
    for (let segment = 0; segment < angularSegments; segment++) {
      const angle = (segment / angularSegments) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
    }
  }
  for (let ring = 0; ring < wallRings; ring++) {
    for (let segment = 0; segment < angularSegments; segment++) {
      const next = (segment + 1) % angularSegments;
      const a = wallOffset + ring * angularSegments + segment;
      const b = a + angularSegments;
      const c = wallOffset + (ring + 1) * angularSegments + next;
      const d = wallOffset + ring * angularSegments + next;
      indices.push(a, b, d, b, c, d);
    }
  }

  const rawGeometry = new BufferGeometry();
  rawGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  rawGeometry.setIndex(indices);
  // Weld the duplicated polar center, outer surface seams, and wall seams. Besides
  // smooth rim normals, this makes the mesh one genuinely closed indexed surface.
  const geometry = mergeVertices(rawGeometry, 1e-5);
  rawGeometry.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData = {cellKind: "red", topology: "closed-biconcave", radialSegments, angularSegments};
  return geometry;
}
