import {ThreeCanvas} from "@remotion/three";
import {useThree} from "@react-three/fiber";
import React, {useEffect, useMemo, useRef, useState} from "react";
import {cancelRender, continueRender, delayRender} from "remotion";
import {CatmullRomCurve3, Color, Material, Mesh, MeshStandardMaterial, Object3D, ShaderMaterial, Shape, SphereGeometry, Vector3} from "three";
import {MarchingCubes} from "three/examples/jsm/objects/MarchingCubes.js";
import {BokehPass} from "three/examples/jsm/postprocessing/BokehPass.js";
import {EffectComposer} from "three/examples/jsm/postprocessing/EffectComposer.js";
import {RenderPass} from "three/examples/jsm/postprocessing/RenderPass.js";
import {OutputPass} from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  bloodCellState,
  type BloodCellCue,
  type BloodCellPose,
  type BloodCellState,
  type BloodCellVariant,
} from "../../lib/video/blood-cell-motion";
import {createRedBloodCellGeometry} from "./blood-cell-geometry";

export type {BloodCellCue} from "../../lib/video/blood-cell-motion";

type BloodCellArtworkProps = {
  seconds: number;
  cue: BloodCellCue;
  reducedMotion?: boolean;
  qaMode?: boolean;
  width: number;
  height: number;
  variant?: BloodCellVariant;
};

type CellAudit = {
  id: string;
  kind: "red" | "white";
  matrixPosition: [number, number, number];
  geometryCount: number;
  vertexCount: number;
  topology: string;
  radius: number;
  matrixWorld: number[];
  actualScale: [number, number, number];
  stateOpacity: number;
  materialOpacities: number[];
  visible: boolean;
};

type SceneAudit = {
  seconds: number;
  focusDepth: number;
  focusDistance: number;
  phase: BloodCellState["phase"];
  cells: CellAudit[];
  drawCalls: number;
  camera: {projectionMatrix: number[]; matrixWorldInverse: number[]; position: number[]};
};

const CORAL = "#FF6B4A";
const CORAL_SHADOW = "#D95036";
const PALE = "#F4F7F6";
const PEACH = "#F7D2C0";
const PEACH_SHADOW = "#EBC4B2";
const MEMBRANE = "#EEF3F0";
const NUCLEUS = "#59617F";
const NUCLEUS_LIGHT = "#7A7193";

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
    float fresnel = pow(1.0 - facing, 1.65);
    float edge = smoothstep(0.04, 0.88, fresnel);
    float softLight = 0.84 + 0.16 * max(dot(normalize(vViewNormal), normalize(vec3(-0.25, 0.45, 1.0))), 0.0);
    gl_FragColor = vec4(uColor * softLight, mix(0.18, 0.74, edge) * uOpacity);
  }
`;

const GRANULES: readonly [number, number, number, number][] = [
  [-0.48, 0.24, 0.45, 0.034], [-0.32, -0.54, 0.28, 0.026], [-0.2, 0.62, 0.1, 0.023],
  [-0.04, -0.7, -0.04, 0.03], [0.12, 0.55, 0.37, 0.028], [0.25, -0.42, 0.49, 0.025],
  [0.42, 0.35, 0.32, 0.03], [0.58, -0.08, 0.12, 0.024], [-0.57, -0.23, 0.04, 0.025],
  [0.04, 0.16, 0.69, 0.022], [0.44, -0.5, -0.05, 0.022], [-0.35, 0.44, -0.26, 0.024],
  [0.62, 0.11, -0.22, 0.02], [-0.08, -0.35, -0.65, 0.022], [0.3, 0.57, -0.31, 0.021],
] as const;

function createWhiteCellGeometry() {
  const geometry = new SphereGeometry(1, 64, 48);
  const positions = geometry.attributes.position;
  if (!positions) throw new Error("White-cell membrane geometry is missing positions");
  const point = new Vector3();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const normal = point.clone().normalize();
    const ripple =
      Math.sin(normal.x * 13.1 + normal.y * 4.7) *
      Math.sin(normal.y * 11.3 - normal.z * 5.2) *
      Math.sin(normal.z * 12.7 + normal.x * 3.9);
    point.multiplyScalar(1 + ripple * 0.026);
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData = {cellKind: "white", topology: "closed-textured-membrane", detail: 5};
  return geometry;
}

function createLobedNucleusGeometry() {
  const temporaryMaterial = new MeshStandardMaterial();
  const field = new MarchingCubes(42, temporaryMaterial, false, false, 24000);
  field.isolation = 80;
  field.reset();
  // Three overlapping field lobes form one continuous surface. The smaller field
  // contributions between them produce narrow biological bridges without exposed
  // connector ends or mesh-intersection seams.
  field.addBall(0.34, 0.57, 0.52, 0.72, 18);
  field.addBall(0.51, 0.41, 0.51, 0.68, 18);
  field.addBall(0.68, 0.57, 0.49, 0.7, 18);
  field.addBall(0.425, 0.495, 0.515, 0.28, 18);
  field.addBall(0.595, 0.495, 0.5, 0.28, 18);
  field.update();
  const geometry = field.geometry.clone();
  geometry.computeBoundingSphere();
  geometry.userData = {structure: "single-surface-three-lobed-neutrophil-nucleus"};
  field.geometry.dispose();
  temporaryMaterial.dispose();
  return geometry;
}

const RedCell: React.FC<{cell: BloodCellPose; geometry: ReturnType<typeof createRedBloodCellGeometry>}> = ({cell, geometry}) => (
  <group
    position={cell.position}
    rotation={cell.rotation}
    scale={cell.radius}
    visible={cell.opacity > 0.001}
    userData={{cellId: cell.id, cellKind: cell.kind, topology: geometry.userData.topology, radius: cell.radius, stateOpacity: cell.opacity}}
  >
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshPhysicalMaterial
        color={CORAL}
        roughness={0.38}
        metalness={0}
        clearcoat={0.28}
        clearcoatRoughness={0.5}
        sheen={0.18}
        sheenColor={CORAL_SHADOW}
        transparent={cell.opacity < 1}
        opacity={cell.opacity}
        depthWrite={cell.opacity > 0.98}
      />
    </mesh>
  </group>
);

const WhiteCell: React.FC<{
  cell: BloodCellPose;
  geometry: SphereGeometry;
  nucleusGeometry: ReturnType<typeof createLobedNucleusGeometry>;
}> = ({cell, geometry, nucleusGeometry}) => {
  const membraneUniforms = useMemo(() => ({
    uColor: {value: new Color(MEMBRANE)},
    uOpacity: {value: cell.opacity},
  }), [cell.opacity]);
  return (
    <group
      position={cell.position}
      rotation={cell.rotation}
      scale={cell.radius}
      visible={cell.opacity > 0.001}
      userData={{cellId: cell.id, cellKind: cell.kind, topology: geometry.userData.topology, radius: cell.radius, stateOpacity: cell.opacity}}
    >
      <mesh geometry={geometry} renderOrder={4}>
        <shaderMaterial
          uniforms={membraneUniforms}
          vertexShader={MEMBRANE_VERTEX_SHADER}
          fragmentShader={MEMBRANE_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
        />
      </mesh>

    <mesh
      geometry={nucleusGeometry}
      rotation={[0.25, -0.18, 0.2]}
      scale={1.38}
      userData={{structure: nucleusGeometry.userData.structure}}
    >
      <meshPhysicalMaterial color={NUCLEUS} roughness={0.64} sheen={0.3} sheenColor={NUCLEUS_LIGHT} transparent opacity={cell.opacity} depthWrite={cell.opacity > 0.98} />
    </mesh>

    {GRANULES.map(([x, y, z, radius], index) => (
      <mesh key={index} position={[x, y, z]} scale={radius} renderOrder={3}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={index % 3 === 0 ? PEACH_SHADOW : NUCLEUS_LIGHT} roughness={0.8} transparent opacity={cell.opacity} depthWrite={cell.opacity > 0.98} />
      </mesh>
    ))}
    </group>
  );
};

const VerticalVessel: React.FC = () => {
  const mosaic = useMemo(() => {
    const ys = [-4.15, -2.08, 0, 2.08, 4.15] as const;
    // Each band has different joint positions. Shared endpoints keep the mosaic
    // watertight while the short slanted joins avoid a continuous table grid.
    const rowXs: readonly (readonly number[])[] = [
      [-3.14, -1.72, -0.1, 1.52, 3.14],
      [-3.08, -2.15, -0.48, 1.17, 3.08],
      [-3.15, -1.62, 0.18, 1.83, 3.15],
      [-3.09, -2.04, -0.3, 1.3, 3.09],
      [-3.14, -1.52, 0.12, 1.68, 3.14],
    ];
    const node = (column: number, row: number) => new Vector3(
      rowXs[row]?.[column] ?? 0,
      (ys[row] ?? 0) + Math.sin(row * 2.35 - column * 0.8) * 0.1,
      -2.86,
    );
    const tiles: {shape: Shape; color: string; key: string}[] = [];
    for (let row = 0; row < ys.length - 1; row++) {
      for (let column = 0; column < 4; column++) {
        const corners = [node(column, row), node(column + 1, row), node(column + 1, row + 1), node(column, row + 1)];
        const first = corners[0];
        if (!first) continue;
        const shape = new Shape();
        shape.moveTo(first.x, first.y);
        for (const corner of corners.slice(1)) shape.lineTo(corner.x, corner.y);
        shape.closePath();
        tiles.push({
          shape,
          color: (row + column) % 3 === 0 ? "#F7D4C4" : (row + column) % 3 === 1 ? "#F3CCBB" : "#F9DBCC",
          key: `${column}-${row}`,
        });
      }
    }
    const seams: {curve: CatmullRomCurve3; outer: boolean; key: string}[] = [];
    for (const column of [0, 4] as const) {
      const points = ys.map((_, row) => node(column, row));
      for (const point of points) point.z = -0.18;
      seams.push({curve: new CatmullRomCurve3(points), outer: true, key: `outer-${column}`});
    }
    for (let row = 0; row < ys.length; row++) {
      seams.push({curve: new CatmullRomCurve3([0, 1, 2, 3, 4].map((column) => node(column, row))), outer: false, key: `h-${row}`});
    }
    for (let row = 0; row < ys.length - 1; row++) {
      for (let column = 1; column < 4; column++) {
        const from = node(column, row);
        const to = node(column, row + 1);
        const midpoint = from.clone().lerp(to, 0.5);
        midpoint.x += Math.sin(row * 1.9 + column) * 0.09;
        seams.push({curve: new CatmullRomCurve3([from, midpoint, to]), outer: false, key: `join-${column}-${row}`});
      }
    }
    return {tiles, seams};
  }, []);
  return (
    <>
      <mesh position={[0, 0, -3.0]} receiveShadow>
        <planeGeometry args={[30, 12]} />
        <meshStandardMaterial color="#EFC3B0" roughness={0.98} />
      </mesh>
      {mosaic.tiles.map((tile) => (
        <mesh key={tile.key} position={[0, 0, -2.86]}>
          <shapeGeometry args={[tile.shape, 1]} />
          <meshBasicMaterial color={tile.color} />
        </mesh>
      ))}
      <mesh position={[-5.18, 0, -0.82]} scale={[2.08, 5.2, 1.1]}>
        <sphereGeometry args={[1, 64, 40]} />
        <meshStandardMaterial color="#EDBEAA" roughness={0.94} />
      </mesh>
      <mesh position={[5.18, 0, -0.82]} scale={[2.08, 5.2, 1.1]}>
        <sphereGeometry args={[1, 64, 40]} />
        <meshStandardMaterial color="#EDBEAA" roughness={0.94} />
      </mesh>
      {mosaic.seams.map((seam) => (
        <mesh key={seam.key}>
          <tubeGeometry args={[seam.curve, 72, seam.outer ? 0.026 : 0.021, 10, false]} />
          <meshBasicMaterial color="#31405A" />
        </mesh>
      ))}
    </>
  );
};

const VesselField: React.FC<{state: BloodCellState}> = ({state}) => {
  const redGeometry = useMemo(() => createRedBloodCellGeometry(), []);
  const whiteGeometry = useMemo(() => createWhiteCellGeometry(), []);
  const nucleusGeometry = useMemo(() => createLobedNucleusGeometry(), []);

  useEffect(() => () => {
    redGeometry.dispose();
    whiteGeometry.dispose();
    nucleusGeometry.dispose();
  }, [nucleusGeometry, redGeometry, whiteGeometry]);

  return (
    <>
      <color attach="background" args={[PALE]} />
      <ambientLight intensity={0.42} color="#FFF8F1" />
      <hemisphereLight intensity={0.72} color="#FFFFFF" groundColor={PEACH_SHADOW} />
      <directionalLight position={[-4, 6, 8]} intensity={1.12} color="#FFF6EC" />
      <directionalLight position={[5, -3, 5]} intensity={0.36} color="#DCE9F2" />
      <pointLight position={[0, 0, 5]} intensity={0.32} color="#FFFFFF" distance={15} decay={1.5} />

      {state.variant === "vertical" ? <VerticalVessel /> : <>
        <mesh position={[0, 0, -3.0]} receiveShadow>
          <planeGeometry args={[30, 12, 1, 1]} />
          <meshStandardMaterial color={PEACH} roughness={0.98} />
        </mesh>
        <mesh position={[0, 3.45, -0.75]} scale={[7.5, 0.38, 0.9]}>
          <sphereGeometry args={[1, 64, 20]} />
          <meshStandardMaterial color={PEACH_SHADOW} roughness={0.92} />
        </mesh>
        <mesh position={[0, -3.45, -0.75]} scale={[7.5, 0.38, 0.9]}>
          <sphereGeometry args={[1, 64, 20]} />
          <meshStandardMaterial color={PEACH_SHADOW} roughness={0.92} />
        </mesh>
      </>}

      {state.cells.map((cell) => cell.kind === "red"
        ? <RedCell key={cell.id} cell={cell} geometry={redGeometry} />
        : <WhiteCell key={cell.id} cell={cell} geometry={whiteGeometry} nucleusGeometry={nucleusGeometry} />)}
    </>
  );
};

const FocusAndAuditRenderer: React.FC<{
  seconds: number;
  state: BloodCellState;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  onRendered: () => void;
}> = ({seconds, state, wrapperRef, onRendered}) => {
  const {gl, scene, camera, size} = useThree();
  const composer = useMemo(() => {
    const next = new EffectComposer(gl);
    next.addPass(new RenderPass(scene, camera));
    next.addPass(new BokehPass(scene, camera, {
      focus: Math.max(0.1, camera.position.z - state.focusDepth),
      aperture: 0.0016,
      maxblur: 0.0045,
      aspect: size.width / size.height,
    }));
    next.addPass(new OutputPass());
    next.setSize(size.width, size.height);
    return next;
  }, [camera, gl, scene, size.height, size.width]);

  useEffect(() => () => composer.dispose(), [composer]);

  // This passive effect runs after ThreeCanvas's deterministic frame advance. It
  // replaces that direct frame with the focused composer result, then audits the
  // same GPU-complete scene before releasing Remotion's render handle.
  useEffect(() => {
    try {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const bokeh = composer.passes.find((pass) => pass instanceof BokehPass) as BokehPass | undefined;
      const focusDistance = Math.max(0.1, camera.position.z - state.focusDepth);
      if (bokeh) {
        const uniforms = bokeh.uniforms as Record<string, {value: number}>;
        if (uniforms.focus) uniforms.focus.value = focusDistance;
        if (uniforms.aperture) uniforms.aperture.value = state.variant === "vertical" ? 0.0005 : 0.0016;
        if (uniforms.maxblur) uniforms.maxblur.value = state.variant === "vertical" ? 0.0015 : 0.0045;
      }
      composer.render();
      const context = gl.getContext();
      if ("finish" in context && typeof context.finish === "function") context.finish();

      const cells: CellAudit[] = [];
      scene.traverse((object: Object3D) => {
        if (typeof object.userData.cellId !== "string") return;
        let geometryCount = 0;
        let vertexCount = 0;
        const materialOpacities: number[] = [];
        object.traverse((child) => {
          const mesh = child as Mesh;
          if (!mesh.isMesh || !mesh.geometry) return;
          geometryCount++;
          vertexCount += mesh.geometry.attributes.position?.count ?? 0;
          const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            const shader = material as ShaderMaterial;
            const uniformOpacity = shader.isShaderMaterial
              ? (shader.uniforms.uOpacity?.value as unknown)
              : undefined;
            materialOpacities.push(typeof uniformOpacity === "number" ? uniformOpacity : material.opacity);
          }
        });
        const world = new Vector3();
        const actualScale = new Vector3();
        object.getWorldPosition(world);
        object.getWorldScale(actualScale);
        cells.push({
          id: object.userData.cellId as string,
          kind: object.userData.cellKind as "red" | "white",
          matrixPosition: [world.x, world.y, world.z],
          geometryCount,
          vertexCount,
          topology: String(object.userData.topology ?? "unknown"),
          radius: Number(object.userData.radius),
          matrixWorld: object.matrixWorld.toArray(),
          actualScale: [actualScale.x, actualScale.y, actualScale.z],
          stateOpacity: Number(object.userData.stateOpacity ?? 1),
          materialOpacities,
          visible: object.visible,
        });
      });
      const audit: SceneAudit = {
        seconds,
        focusDepth: state.focusDepth,
        focusDistance,
        phase: state.phase,
        cells,
        drawCalls: gl.info.render.calls,
        camera: {
          projectionMatrix: camera.projectionMatrix.toArray(),
          matrixWorldInverse: camera.matrixWorldInverse.toArray(),
          position: camera.position.toArray(),
        },
      };
      wrapperRef.current?.setAttribute("data-blood-rendered", JSON.stringify(audit));
      onRendered();
    } catch (error) {
      cancelRender(error instanceof Error ? error : new Error(String(error)));
    }
  }, [camera, composer, gl, onRendered, scene, seconds, state, wrapperRef]);

  return null;
};

export const BloodCellArtwork: React.FC<BloodCellArtworkProps> = ({
  seconds,
  cue,
  reducedMotion = false,
  qaMode = false,
  width,
  height,
  variant = "horizontal",
}) => {
  const state = bloodCellState(seconds, cue, reducedMotion, variant);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [renderHandle] = useState(() => delayRender("Blood-cell field: waiting for deterministic GPU render"));
  const released = useRef(false);
  const release = React.useCallback(() => {
    if (released.current) return;
    released.current = true;
    continueRender(renderHandle);
  }, [renderHandle]);

  useEffect(() => () => release(), [release]);

  return (
    <div
      ref={wrapperRef}
      data-blood-cell-root="true"
      data-blood-seconds={seconds}
      data-blood-state={JSON.stringify(state)}
      data-blood-source-ref={cue.sourceRef}
      data-blood-window-label={cue.windowLabel}
      data-blood-qa={qaMode ? "true" : "false"}
      data-blood-variant={variant}
      style={{width, height, overflow: "hidden", background: PALE, borderRadius: 34, opacity: state.fieldOpacity}}
    >
      <ThreeCanvas
        width={width}
        height={height}
        frameloop="never"
        camera={{position: [0, 0, 11], fov: 31, near: 0.1, far: 30}}
        gl={{antialias: true, alpha: false, powerPreference: "high-performance"}}
        shadows
        dpr={1}
        style={{width, height}}
      >
        <VesselField state={state} />
        <FocusAndAuditRenderer seconds={seconds} state={state} wrapperRef={wrapperRef} onRendered={release} />
      </ThreeCanvas>
    </div>
  );
};
