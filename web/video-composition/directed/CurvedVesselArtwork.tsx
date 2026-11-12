import {ThreeCanvas} from "@remotion/three";
import {useThree} from "@react-three/fiber";
import React, {useEffect, useLayoutEffect, useMemo, useRef} from "react";
import {cancelRender, continueRender, delayRender} from "remotion";
import {
  BackSide,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import {MarchingCubes} from "three/examples/jsm/objects/MarchingCubes.js";
import {createRedBloodCellGeometry} from "./blood-cell-geometry";
import {curvedVesselState, type CurvedVesselCellPose, type CurvedVesselState} from "../../lib/video/curved-vessel-motion";
import type {BloodCellCue} from "../../lib/video/blood-cell-motion";
import {
  CUTAWAY_INNER_RADIUS,
  CUTAWAY_THETA_END,
  CUTAWAY_THETA_START,
  createClosedSweptVesselGeometry,
  createCurvedCutawayVesselGeometry,
  createCutawayRimCurve,
  sampleCutawayFrame,
} from "./curved-vessel-geometry";

type CurvedVesselArtworkProps = {
  width: number;
  height: number;
  qaMode?: boolean;
  seconds?: number;
  cue?: BloodCellCue;
  reducedMotion?: boolean;
  earlyCellVisibility?: boolean;
};

const BACKGROUND = "#0B1B31";
const OUTER_WALL = "#5B1830";
const INNER_WALL = "#7A1E35";
const RIM = "#B73247";
const RBC = "#B8273D";
const RBC_HIGHLIGHT = "#E76870";
const LUMEN = "#168FBE";
const MEMBRANE = "#F2F8F7";
const NUCLEUS = "#596785";
const NUCLEUS_LIGHT = "#827A9D";

const BACKGROUND_VERTEX_SHADER = `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BACKGROUND_FRAGMENT_SHADER = `
  uniform vec2 uResolution;
  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    float vertical = smoothstep(0.0, 1.0, uv.y);
    vec2 centered = (uv - vec2(0.52, 0.5)) * vec2(1.15, 1.0);
    float glow = exp(-dot(centered, centered) * 4.2);
    vec3 base = mix(vec3(0.018, 0.055, 0.11), vec3(0.032, 0.105, 0.18), vertical);
    vec3 color = base + vec3(0.025, 0.12, 0.18) * glow;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const MEMBRANE_VERTEX_SHADER = `
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const MEMBRANE_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;
  void main() {
    float facing = abs(dot(normalize(vViewNormal), normalize(vViewDirection)));
    float rim = pow(1.0 - facing, 1.55);
    float alpha = mix(0.23, 0.82, smoothstep(0.05, 0.9, rim));
    gl_FragColor = vec4(uColor * (0.88 + 0.12 * facing), alpha * uOpacity);
  }
`;

const GRANULES: readonly [number, number, number, number][] = [
  [-0.48, 0.24, 0.45, 0.034], [-0.32, -0.54, 0.28, 0.026], [-0.2, 0.62, 0.1, 0.023],
  [-0.04, -0.7, -0.04, 0.03], [0.12, 0.55, 0.37, 0.028], [0.25, -0.42, 0.49, 0.025],
  [0.42, 0.35, 0.32, 0.03], [0.58, -0.08, 0.12, 0.024], [-0.57, -0.23, 0.04, 0.025],
  [0.04, 0.16, 0.69, 0.022], [0.44, -0.5, -0.05, 0.022], [-0.35, 0.44, -0.26, 0.024],
] as const;

function createWhiteCellGeometry() {
  const geometry = new SphereGeometry(1, 64, 48);
  const positions = geometry.attributes.position;
  if (!positions) throw new Error("Curved vessel white-cell membrane is missing positions");
  const point = new Vector3();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const normal = point.clone().normalize();
    const ripple = Math.sin(normal.x * 13.1 + normal.y * 4.7)
      * Math.sin(normal.y * 11.3 - normal.z * 5.2)
      * Math.sin(normal.z * 12.7 + normal.x * 3.9);
    point.multiplyScalar(1 + ripple * 0.026);
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData = {topology: "closed-textured-membrane"};
  return geometry;
}

function createLobedNucleusGeometry() {
  const temporaryMaterial = new MeshStandardMaterial();
  const field = new MarchingCubes(42, temporaryMaterial, false, false, 24000);
  field.isolation = 80;
  field.reset();
  field.addBall(0.34, 0.57, 0.52, 0.72, 18);
  field.addBall(0.51, 0.41, 0.51, 0.68, 18);
  field.addBall(0.68, 0.57, 0.49, 0.7, 18);
  field.addBall(0.425, 0.495, 0.515, 0.28, 18);
  field.addBall(0.595, 0.495, 0.5, 0.28, 18);
  field.update();
  const geometry = field.geometry.clone();
  geometry.computeBoundingSphere();
  geometry.userData = {topology: "single-surface-three-lobed-nucleus"};
  field.geometry.dispose();
  temporaryMaterial.dispose();
  return geometry;
}

type CellPlacement = {
  id: string;
  kind: "red" | "white";
  t: number;
  normal: number;
  binormal: number;
  radius: number;
  rotation: [number, number, number];
  opacity?: number;
  position?: [number, number, number];
};

const CELLS: readonly CellPlacement[] = [
  {id: "rbc-1", kind: "red", t: 0.17, normal: -1.05, binormal: 0.24, radius: 0.44, rotation: [0.46, -0.3, 0.2]},
  {id: "rbc-2", kind: "red", t: 0.25, normal: 0.35, binormal: -0.45, radius: 0.38, rotation: [-0.25, 0.8, -0.35]},
  {id: "rbc-3", kind: "red", t: 0.33, normal: -0.05, binormal: 0.18, radius: 0.43, rotation: [0.7, 0.12, 0.5]},
  {id: "rbc-4", kind: "red", t: 0.42, normal: 1.45, binormal: 0.5, radius: 0.49, rotation: [-0.5, 0.45, 0.15]},
  {id: "rbc-5", kind: "red", t: 0.51, normal: 0.92, binormal: -0.38, radius: 0.4, rotation: [0.25, -0.7, 0.45]},
  {id: "rbc-6", kind: "red", t: 0.6, normal: -1.1, binormal: -0.12, radius: 0.42, rotation: [0.58, 0.42, -0.3]},
  {id: "rbc-7", kind: "red", t: 0.72, normal: 0.45, binormal: 0.62, radius: 0.48, rotation: [-0.32, 0.65, 0.1]},
  {id: "rbc-8", kind: "red", t: 0.78, normal: 1.08, binormal: 0.05, radius: 0.39, rotation: [0.75, -0.15, -0.5]},
  {id: "rbc-9", kind: "red", t: 0.9, normal: -0.62, binormal: 0.28, radius: 0.45, rotation: [0.2, 0.9, 0.35]},
  {id: "wbc-1", kind: "white", t: 0.28, normal: 1.02, binormal: 0.62, radius: 0.43, rotation: [0.1, -0.12, 0.04]},
  {id: "wbc-2", kind: "white", t: 0.39, normal: -0.96, binormal: 0.68, radius: 0.45, rotation: [-0.08, 0.18, -0.06]},
  {id: "wbc-3", kind: "white", t: 0.5, normal: 0.02, binormal: 0.78, radius: 0.48, rotation: [0.12, 0.08, 0.02]},
  {id: "wbc-4", kind: "white", t: 0.62, normal: 0.9, binormal: 0.66, radius: 0.44, rotation: [-0.1, -0.16, 0.05]},
  {id: "wbc-5", kind: "white", t: 0.73, normal: -0.82, binormal: 0.72, radius: 0.46, rotation: [0.08, 0.14, -0.03]},
] as const;

function placementPosition(cell: CellPlacement) {
  if (cell.position) return new Vector3(...cell.position);
  const frame = sampleCutawayFrame(cell.t);
  return frame.center.clone().addScaledVector(frame.normal, cell.normal).addScaledVector(frame.binormal, cell.binormal);
}

const WhiteCell: React.FC<{
  cell: CellPlacement;
  membrane: SphereGeometry;
  nucleus: ReturnType<typeof createLobedNucleusGeometry>;
  animated: boolean;
}> = ({cell, membrane, nucleus, animated}) => {
  const opacity = cell.opacity ?? 1;
  // R3F constructs ShaderMaterial once for a keyed cell; replacing the uniforms
  // object on later frames does not reliably replace its internal uniform map.
  // Mutate the stable uniform before RenderAudit draws the current frame instead.
  const uniforms = useMemo(() => ({uColor: {value: new Color(MEMBRANE)}, uOpacity: {value: opacity}}), []);
  useLayoutEffect(() => {
    uniforms.uOpacity.value = opacity;
  }, [opacity, uniforms]);
  const position = useMemo(() => placementPosition(cell), [cell]);
  return (
    <group position={position} rotation={cell.rotation} scale={cell.radius} visible={opacity > 0.001} userData={{cellId: cell.id, cellKind: cell.kind, radius: cell.radius, stateOpacity: opacity}}>
      <mesh geometry={membrane} renderOrder={5}>
        <shaderMaterial uniforms={uniforms} vertexShader={MEMBRANE_VERTEX_SHADER} fragmentShader={MEMBRANE_FRAGMENT_SHADER} transparent depthWrite={false} />
      </mesh>
      <mesh geometry={nucleus} rotation={[0.25, -0.18, 0.2]} scale={1.38}>
        <meshPhysicalMaterial color={NUCLEUS} roughness={0.62} sheen={0.35} sheenColor={NUCLEUS_LIGHT} transparent={animated} opacity={opacity} depthWrite={opacity > 0.98} />
      </mesh>
      {GRANULES.map(([x, y, z, radius], index) => (
        <mesh key={index} position={[x, y, z]} scale={radius}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={index % 3 === 0 ? "#D59CA9" : NUCLEUS_LIGHT} roughness={0.78} transparent={animated} opacity={opacity} depthWrite={opacity > 0.98} />
        </mesh>
      ))}
    </group>
  );
};

const CellField: React.FC<{state?: CurvedVesselState}> = ({state}) => {
  const redGeometry = useMemo(() => createRedBloodCellGeometry(), []);
  const membrane = useMemo(() => createWhiteCellGeometry(), []);
  const nucleus = useMemo(() => createLobedNucleusGeometry(), []);
  useEffect(() => () => {
    redGeometry.dispose();
    membrane.dispose();
    nucleus.dispose();
  }, [membrane, nucleus, redGeometry]);
  const animated = state !== undefined;
  const cells: readonly CellPlacement[] = state
    ? state.cells.map((cell: CurvedVesselCellPose) => ({...cell, opacity: cell.opacity * state.fieldOpacity}))
    : CELLS;
  return <>
    {cells.map((cell) => cell.kind === "red" ? (
      <group key={cell.id} position={placementPosition(cell)} rotation={cell.rotation} scale={cell.radius} visible={(cell.opacity ?? 1) > 0.001} userData={{cellId: cell.id, cellKind: cell.kind, radius: cell.radius, stateOpacity: cell.opacity ?? 1}}>
        <mesh geometry={redGeometry} castShadow>
          <meshPhysicalMaterial color={RBC} roughness={0.4} clearcoat={0.34} clearcoatRoughness={0.42} sheen={0.3} sheenColor={RBC_HIGHLIGHT} transparent={animated} opacity={cell.opacity ?? 1} depthWrite={(cell.opacity ?? 1) > 0.98} />
        </mesh>
      </group>
    ) : <WhiteCell key={cell.id} cell={cell} membrane={membrane} nucleus={nucleus} animated={animated} />)}
  </>;
};

const BackgroundVessel: React.FC<{id: string; points: [number, number, number][]; radius: number; color: string}> = ({id, points, radius, color}) => {
  const geometry = useMemo(() => createClosedSweptVesselGeometry(
    new CatmullRomCurve3(points.map((point) => new Vector3(...point))), radius,
  ), [points, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} userData={{vesselId: id, topology: geometry.userData.topology}}>
    <meshStandardMaterial color={color} roughness={0.96} />
  </mesh>;
};

const CurvedVesselScene: React.FC<{width: number; height: number; state?: CurvedVesselState}> = ({width, height, state}) => {
  const cutaway = useMemo(() => createCurvedCutawayVesselGeometry(), []);
  const centerPath = useMemo(() => new CatmullRomCurve3(
    Array.from({length: 25}, (_, index) => sampleCutawayFrame(index / 24).center),
  ), []);
  const lumenSurface = useMemo(() => createClosedSweptVesselGeometry(centerPath, CUTAWAY_INNER_RADIUS * 0.97, 64, 40), [centerPath]);
  const rimA = useMemo(() => createCutawayRimCurve(CUTAWAY_THETA_START), []);
  const rimB = useMemo(() => createCutawayRimCurve(CUTAWAY_THETA_END), []);
  const backgroundUniforms = useMemo(() => ({uResolution: {value: new Vector2(width, height)}}), [height, width]);
  useEffect(() => () => {
    cutaway.dispose();
    lumenSurface.dispose();
  }, [cutaway, lumenSurface]);

  return <>
    <color attach="background" args={[BACKGROUND]} />
    <mesh scale={28} renderOrder={-10}>
      <sphereGeometry args={[1, 48, 32]} />
      <shaderMaterial uniforms={backgroundUniforms} vertexShader={BACKGROUND_VERTEX_SHADER} fragmentShader={BACKGROUND_FRAGMENT_SHADER} side={BackSide} depthWrite={false} />
    </mesh>
    <fog attach="fog" args={[BACKGROUND, 20, 36]} />
    <ambientLight intensity={0.34} color="#9CBAD0" />
    <hemisphereLight intensity={0.58} color="#BDEEFF" groundColor="#260D20" />
    <directionalLight position={[5, 7, 8]} intensity={1.65} color="#FFD7CF" />
    <directionalLight position={[-5, 1, 4]} intensity={0.85} color="#6ADAF2" />
    <pointLight position={[0, -0.8, 2.4]} intensity={3.2} distance={8} decay={1.7} color="#76DDF2" />
    <pointLight position={[-0.4, 3, 0.5]} intensity={1.4} distance={7} decay={1.6} color="#B2F2FF" />

    <BackgroundVessel id="background-left" radius={0.3} color="#55283A" points={[[-9.2, -12, -5.2], [-8.1, -3.2, -5.5], [-9, 3, -5.8], [-7.9, 12, -6.1]]} />
    <BackgroundVessel id="background-right" radius={0.25} color="#61283B" points={[[6.3, -12, -5.8], [4.6, -3.2, -5.9], [5.3, 3, -6.2], [3.8, 12, -6.5]]} />
    <BackgroundVessel id="background-far" radius={0.18} color="#43283B" points={[[-18, 7.5, -7.2], [-4.5, 3.6, -7.4], [3.2, 4, -7.7], [18, 0.5, -8.2]]} />

    <mesh geometry={cutaway} userData={{vesselId: "main-cutaway", topology: cutaway.userData.topology}}>
      <meshPhysicalMaterial attach="material-0" color={OUTER_WALL} roughness={0.6} clearcoat={0.18} clearcoatRoughness={0.64} side={DoubleSide} />
      <meshPhysicalMaterial attach="material-1" color={INNER_WALL} roughness={0.52} clearcoat={0.22} clearcoatRoughness={0.54} sheen={0.25} sheenColor="#C95A67" side={DoubleSide} />
      <meshPhysicalMaterial attach="material-2" color={RIM} roughness={0.4} clearcoat={0.32} clearcoatRoughness={0.42} side={DoubleSide} />
    </mesh>
    <mesh geometry={lumenSurface} renderOrder={1} userData={{vesselId: "lumen-haze", topology: lumenSurface.userData.topology}}>
      <meshPhysicalMaterial color={LUMEN} emissive="#087EA9" emissiveIntensity={1.15} transparent opacity={0.48} depthWrite={false} side={BackSide} roughness={0.86} />
    </mesh>
    <mesh>
      <tubeGeometry args={[rimA, 72, 0.21, 16, false]} />
      <meshPhysicalMaterial color={RIM} roughness={0.36} clearcoat={0.38} clearcoatRoughness={0.38} />
    </mesh>
    <mesh>
      <tubeGeometry args={[rimB, 72, 0.21, 16, false]} />
      <meshPhysicalMaterial color={RIM} roughness={0.36} clearcoat={0.38} clearcoatRoughness={0.38} />
    </mesh>
    <CellField state={state} />
  </>;
};

const CameraSetup: React.FC = () => {
  const {camera} = useThree();
  useLayoutEffect(() => {
    camera.position.set(6, 3.2, 10.4);
    camera.lookAt(0, 0.2, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }, [camera]);
  return null;
};

const RenderAudit: React.FC<{
  rootRef: React.RefObject<HTMLDivElement | null>;
  qaMode: boolean;
  release: () => void;
  seconds?: number;
}> = ({rootRef, qaMode, release, seconds}) => {
  const {gl, scene, camera} = useThree();
  useEffect(() => {
    try {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      gl.render(scene, camera);
      const context = gl.getContext();
      if ("finish" in context && typeof context.finish === "function") context.finish();
      const cells: {id: string; kind: string; position: number[]; radius: number; vertices: number; matrixWorld: number[]; actualScale: number[]; materialOpacities: number[]; stateOpacity: number; visible: boolean}[] = [];
      const vessels: {id: string; topology: string; vertices: number; triangles: number}[] = [];
      scene.traverse((object: Object3D) => {
        const mesh = object as Mesh;
        if (typeof object.userData.cellId === "string") {
          const position = new Vector3();
          object.getWorldPosition(position);
          let vertices = 0;
          const materialOpacities: number[] = [];
          object.traverse((child) => {
            const childMesh = child as Mesh;
            if (childMesh.isMesh) {
              vertices += childMesh.geometry.attributes.position?.count ?? 0;
              const materials = Array.isArray(childMesh.material) ? childMesh.material : [childMesh.material];
              for (const material of materials) {
                if (material && "uniforms" in material && (material as {uniforms?: {uOpacity?: {value: number}}}).uniforms?.uOpacity) {
                  materialOpacities.push(Number((material as {uniforms: {uOpacity: {value: number}}}).uniforms.uOpacity.value));
                } else if (material && "opacity" in material) materialOpacities.push(Number(material.opacity));
              }
            }
          });
          const actualScale = new Vector3();
          object.getWorldScale(actualScale);
          cells.push({id: object.userData.cellId as string, kind: String(object.userData.cellKind), position: position.toArray(), radius: Number(object.userData.radius), vertices, matrixWorld: object.matrixWorld.toArray(), actualScale: actualScale.toArray(), materialOpacities, stateOpacity: Number(object.userData.stateOpacity), visible: object.visible});
        }
        if (mesh.isMesh && typeof object.userData.vesselId === "string") {
          vessels.push({
            id: object.userData.vesselId as string,
            topology: String(object.userData.topology),
            vertices: mesh.geometry.attributes.position?.count ?? 0,
            triangles: (mesh.geometry.index?.count ?? 0) / 3,
          });
        }
      });
      const audit = {
        seconds: seconds ?? null,
        cells,
        vessels,
        cellCounts: {red: cells.filter((cell) => cell.kind === "red").length, white: cells.filter((cell) => cell.kind === "white").length},
        camera: {position: camera.position.toArray(), projectionMatrix: camera.projectionMatrix.toArray(), matrixWorldInverse: camera.matrixWorldInverse.toArray()},
        drawCalls: gl.info.render.calls,
      };
      rootRef.current?.setAttribute("data-curved-vessel-rendered", JSON.stringify(audit));
      if (qaMode) console.log(`CURVED_VESSEL_QA:${JSON.stringify(audit)}`);
      release();
    } catch (error) {
      cancelRender(error instanceof Error ? error : new Error(String(error)));
    }
  }, [camera, gl, qaMode, release, rootRef, scene, seconds]);
  return null;
};

export const CurvedVesselArtwork: React.FC<CurvedVesselArtworkProps> = ({width, height, qaMode = false, seconds, cue, reducedMotion = false, earlyCellVisibility = false}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const renderFrameKey = cue ? `${seconds ?? 0}:${cue.sourceRef}:${reducedMotion ? "reduced" : "full"}` : "static";
  const renderHandle = useMemo(() => delayRender(`Curved vessel: waiting for GPU frame ${renderFrameKey}`), [renderFrameKey]);
  const releasedHandles = useRef(new Set<number>());
  const release = React.useCallback(() => {
    if (releasedHandles.current.has(renderHandle)) return;
    releasedHandles.current.add(renderHandle);
    continueRender(renderHandle);
  }, [renderHandle]);
  useEffect(() => () => release(), [release]);
  const state = useMemo(() => {
    if (!cue) return undefined;
    const timed = curvedVesselState(seconds ?? 0, cue, reducedMotion);
    return earlyCellVisibility && (seconds ?? 0) < (cue.entrySeconds ?? 3.2)
      ? {...timed, fieldOpacity: 1}
      : timed;
  }, [cue, earlyCellVisibility, reducedMotion, seconds]);
  return <div
    ref={rootRef}
    data-curved-vessel-root="true"
    data-curved-vessel-qa={qaMode ? "true" : "false"}
    data-curved-vessel-state={state ? JSON.stringify(state) : undefined}
    style={{width, height, overflow: "hidden", background: BACKGROUND}}
  >
    <ThreeCanvas
      width={width}
      height={height}
      frameloop="never"
      camera={{fov: 36, near: 0.1, far: 40}}
      gl={{antialias: true, alpha: false, powerPreference: "high-performance"}}
      dpr={1}
      shadows
      style={{width, height}}
    >
      <CameraSetup />
      <CurvedVesselScene width={width} height={height} state={state} />
      <RenderAudit rootRef={rootRef} qaMode={qaMode} release={release} seconds={seconds} />
    </ThreeCanvas>
  </div>;
};
