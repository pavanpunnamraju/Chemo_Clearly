import {Vector3} from "three";
import {sampleCutawayFrame} from "../../video-composition/directed/curved-vessel-geometry";
import type {BloodCellCue} from "./blood-cell-motion";

export type CurvedVesselCellKind = "red" | "white";

export type CurvedVesselCellPose = {
  id: string;
  kind: CurvedVesselCellKind;
  position: [number, number, number];
  rotation: [number, number, number];
  radius: number;
  t: number;
  normal: number;
  binormal: number;
  opacity: number;
};

export type CurvedVesselPhase = "entry" | "full-count" | "dissolving" | "low-count" | "precaution" | "reduced-low-count";

export type CurvedVesselState = {
  cells: CurvedVesselCellPose[];
  fieldOpacity: number;
  phase: CurvedVesselPhase;
  sourceBinding: {
    sourceRef: string;
    windowLabel: string;
    entrySeconds: number;
    focusSeconds: number;
    lowSeconds: number;
    precautionSeconds: number;
    endSeconds: number;
  };
};

type Trajectory = {
  id: string;
  kind: CurvedVesselCellKind;
  t: number;
  normal: number;
  binormal: number;
  radius: number;
  rotation: [number, number, number];
  spin: [number, number, number];
  tSpeed: number;
  normalDrift: number;
  binormalDrift: number;
  dissolveOrder?: number;
};

const RED_T = [-0.35, -0.245, -0.14, -0.035, 0.07, 0.175, 0.28, 0.385, 0.49, 0.595, 0.7, 0.805, 0.91, 1.015, 1.12, 1.225] as const;
const RED_CELLS: readonly Trajectory[] = RED_T.map((t, index) => ({
  id: `curved-rbc-${index + 1}`,
  kind: "red",
  t,
  normal: [-0.92, 0.05, 0.94][index % 3]!,
  binormal: [-0.5, -0.72, -0.38][index % 3]!,
  radius: [0.36, 0.39, 0.35, 0.4][index % 4]!,
  rotation: [0.28 + (index % 4) * 0.16, -0.62 + (index % 5) * 0.27, (index % 3 - 1) * 0.24],
  spin: [0.027 + (index % 3) * 0.004, 0.052 - (index % 2) * 0.009, 0.019],
  tSpeed: 0.034,
  normalDrift: (index % 2 ? -1 : 1) * 0.006,
  binormalDrift: (index % 3 - 1) * 0.003,
}));

// Three entries omit dissolveOrder and therefore survive the low-count cue.
const WHITE_CELLS: readonly Trajectory[] = [
  {id: "curved-wbc-1", kind: "white", t: 0.12, normal: -1.02, binormal: 0.5, radius: 0.33, rotation: [0.1, 0.2, 0], spin: [0.012, 0.02, -0.008], tSpeed: 0.03, normalDrift: 0.004, binormalDrift: 0.002, dissolveOrder: 7},
  {id: "curved-wbc-2", kind: "white", t: 0.18, normal: 0.65, binormal: 0.74, radius: 0.34, rotation: [-0.1, 0.12, 0.04], spin: [0.01, -0.018, 0.01], tSpeed: 0.032, normalDrift: -0.003, binormalDrift: 0.001, dissolveOrder: 6},
  {id: "curved-wbc-3", kind: "white", t: 0.22, normal: -0.98, binormal: 0.7, radius: 0.34, rotation: [0.16, -0.08, 0.02], spin: [-0.012, 0.017, 0.009], tSpeed: 0.03, normalDrift: 0.002, binormalDrift: -0.002},
  {id: "curved-wbc-4", kind: "white", t: 0.28, normal: 0.82, binormal: 0.46, radius: 0.33, rotation: [0.04, 0.18, -0.05], spin: [0.011, 0.019, -0.01], tSpeed: 0.031, normalDrift: -0.003, binormalDrift: 0.002, dissolveOrder: 5},
  {id: "curved-wbc-5", kind: "white", t: 0.34, normal: -0.8, binormal: 0.76, radius: 0.35, rotation: [-0.12, -0.16, 0.06], spin: [0.013, -0.016, 0.008], tSpeed: 0.033, normalDrift: 0.003, binormalDrift: -0.001, dissolveOrder: 4},
  {id: "curved-wbc-6", kind: "white", t: 0.4, normal: 0.08, binormal: 0.8, radius: 0.36, rotation: [0.08, 0.11, -0.02], spin: [-0.01, 0.021, 0.01], tSpeed: 0.03, normalDrift: -0.002, binormalDrift: 0.001},
  {id: "curved-wbc-7", kind: "white", t: 0.46, normal: 1.0, binormal: 0.64, radius: 0.33, rotation: [0.14, -0.14, 0.03], spin: [0.012, 0.018, -0.009], tSpeed: 0.031, normalDrift: -0.003, binormalDrift: 0.002},
  {id: "curved-wbc-8", kind: "white", t: 0.52, normal: -0.96, binormal: 0.54, radius: 0.34, rotation: [-0.06, 0.2, -0.04], spin: [0.01, -0.02, 0.009], tSpeed: 0.032, normalDrift: 0.003, binormalDrift: -0.002, dissolveOrder: 3},
  {id: "curved-wbc-9", kind: "white", t: 0.58, normal: 0.76, binormal: 0.76, radius: 0.35, rotation: [0.12, 0.06, 0.02], spin: [-0.012, 0.016, 0.01], tSpeed: 0.03, normalDrift: -0.002, binormalDrift: 0.001, dissolveOrder: 2},
  {id: "curved-wbc-10", kind: "white", t: 0.64, normal: -0.78, binormal: 0.7, radius: 0.34, rotation: [-0.08, -0.1, 0.05], spin: [0.011, 0.02, -0.008], tSpeed: 0.031, normalDrift: 0.003, binormalDrift: -0.001, dissolveOrder: 1},
  {id: "curved-wbc-11", kind: "white", t: 0.7, normal: 0.5, binormal: 0.6, radius: 0.33, rotation: [0.1, 0.15, -0.03], spin: [-0.01, -0.018, 0.009], tSpeed: 0.032, normalDrift: -0.003, binormalDrift: 0.002, dissolveOrder: 0},
] as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function validateCue(cue: BloodCellCue) {
  const entry = cue.entrySeconds ?? 3.2;
  if (!cue.sourceRef.trim() || !cue.windowLabel.trim()) throw new Error("Curved-vessel cue requires sourceRef and windowLabel");
  if (![entry, cue.focusSeconds, cue.lowSeconds, cue.precautionSeconds, cue.endSeconds].every(Number.isFinite)) throw new Error("Curved-vessel cue times must be finite");
  if (!(entry >= 0 && entry < cue.focusSeconds && cue.focusSeconds < cue.lowSeconds && cue.lowSeconds <= cue.precautionSeconds && cue.precautionSeconds < cue.endSeconds)) {
    throw new RangeError("Curved-vessel cues must be ordered entry < focus < low <= precaution < end");
  }
  if (cue.lowSeconds - cue.focusSeconds < 1.25) throw new RangeError("Curved-vessel dissolve needs at least 1.25 seconds");
  return entry;
}

function extendedFrame(t: number) {
  const clamped = clamp01(t);
  const frame = sampleCutawayFrame(clamped);
  if (t === clamped) return frame;
  return {...frame, center: frame.center.clone().addScaledVector(frame.tangent, (t - clamped) * 11.7)};
}

export function curvedVesselState(seconds: number, cue: BloodCellCue, reducedMotion = false): CurvedVesselState {
  const entry = validateCue(cue);
  const now = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, cue.endSeconds)) : 0;
  const sampledTime = reducedMotion ? cue.lowSeconds : now;
  const motionTime = Math.max(0, sampledTime - entry);
  const revealStart = Math.max(0, entry - 0.4);
  const fieldOpacity = reducedMotion ? 1 : smooth((now - revealStart) / Math.max(0.01, entry - revealStart));
  const dissolveSpan = cue.lowSeconds - cue.focusSeconds;
  const firstDissolve = cue.focusSeconds + Math.min(0.14, dissolveSpan * 0.08);
  const dissolveDuration = Math.max(0.34, Math.min(0.52, dissolveSpan * 0.22));
  const lastDissolve = cue.lowSeconds - dissolveDuration;

  const cells = [...RED_CELLS, ...WHITE_CELLS].map((trajectory): CurvedVesselCellPose => {
    const t = trajectory.t + trajectory.tSpeed * motionTime;
    const normal = trajectory.normal + trajectory.normalDrift * motionTime;
    const binormal = trajectory.binormal + trajectory.binormalDrift * motionTime;
    const frame = extendedFrame(t);
    const position = frame.center.clone().addScaledVector(frame.normal, normal).addScaledVector(frame.binormal, binormal);
    let opacity = 1;
    if (trajectory.dissolveOrder !== undefined) {
      const start = firstDissolve + (lastDissolve - firstDissolve) * (trajectory.dissolveOrder / 7);
      opacity = 1 - smooth((sampledTime - start) / dissolveDuration);
    }
    return {
      id: trajectory.id,
      kind: trajectory.kind,
      position: position.toArray(),
      rotation: [
        trajectory.rotation[0] + trajectory.spin[0] * motionTime,
        trajectory.rotation[1] + trajectory.spin[1] * motionTime,
        trajectory.rotation[2] + trajectory.spin[2] * motionTime,
      ],
      radius: trajectory.radius,
      t,
      normal,
      binormal,
      opacity,
    };
  });

  const phase: CurvedVesselPhase = reducedMotion
    ? "reduced-low-count"
    : now < entry
      ? "entry"
      : now < cue.focusSeconds
        ? "full-count"
        : now < cue.lowSeconds
          ? "dissolving"
          : now < cue.precautionSeconds
            ? "low-count"
            : "precaution";
  return {
    cells,
    fieldOpacity,
    phase,
    sourceBinding: {
      sourceRef: cue.sourceRef,
      windowLabel: cue.windowLabel,
      entrySeconds: entry,
      focusSeconds: cue.focusSeconds,
      lowSeconds: cue.lowSeconds,
      precautionSeconds: cue.precautionSeconds,
      endSeconds: cue.endSeconds,
    },
  };
}
