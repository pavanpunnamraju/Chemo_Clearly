export type BloodCellCue = {
  sourceRef: string;
  windowLabel: string;
  focusSeconds: number;
  lowSeconds: number;
  precautionSeconds: number;
  endSeconds: number;
  entrySeconds?: number;
};

export type BloodCellKind = "red" | "white";
export type BloodCellVariant = "horizontal" | "vertical";

export type BloodCellPose = {
  id: string;
  kind: BloodCellKind;
  position: [number, number, number];
  rotation: [number, number, number];
  radius: number;
  opacity: number;
};

export type BloodCellPhase = "approach" | "focus-pull" | "low-count" | "precaution-hold" | "reduced-low-count";

export type BloodCellState = {
  cells: BloodCellPose[];
  focusDepth: number;
  phase: BloodCellPhase;
  variant: BloodCellVariant;
  fieldOpacity: number;
};

type Trajectory = {
  id: string;
  kind: BloodCellKind;
  origin: [number, number, number];
  velocity: [number, number, number];
  rotation: [number, number, number];
  spin: [number, number, number];
  radius: number;
  lowExitX?: number;
  minimumEndX?: number;
};

// Every cell has one continuous streamline for the complete shot. Cells can cross
// the camera crop, but no ID is respawned or removed from the scene mid-frame.
const HORIZONTAL_TRAJECTORIES: readonly Trajectory[] = [
  {id: "rbc-hero", kind: "red", origin: [2.35, 0, 2.5], velocity: [-0.74, 0, 0], rotation: [0.38, -0.52, 0.2], spin: [0.038, 0.11, -0.026], radius: 0.92},
  {id: "rbc-a", kind: "red", origin: [-5.0, 1.9, 0.48], velocity: [-0.36, 0, 0], rotation: [0.72, 0.08, 0.3], spin: [0.03, -0.055, 0.02], radius: 0.58},
  {id: "rbc-b", kind: "red", origin: [-3.2, -1.88, -0.5], velocity: [-0.36, 0, 0], rotation: [-0.42, 0.64, -0.1], spin: [0.02, 0.052, -0.034], radius: 0.56},
  {id: "rbc-c", kind: "red", origin: [-1.4, 1.88, -0.35], velocity: [-0.36, 0, 0], rotation: [0.28, 0.9, 0.2], spin: [-0.02, 0.075, 0.025], radius: 0.62},
  {id: "rbc-d", kind: "red", origin: [0.4, -1.9, 0.42], velocity: [-0.36, 0, 0], rotation: [0.8, -0.25, -0.4], spin: [0.024, -0.06, 0.017], radius: 0.57},
  {id: "rbc-e", kind: "red", origin: [2.2, 1.9, 0.55], velocity: [-0.36, 0, 0], rotation: [-0.7, 0.36, 0.3], spin: [0.018, 0.06, 0.03], radius: 0.6},
  {id: "rbc-f", kind: "red", origin: [4.0, -1.88, -0.42], velocity: [-0.36, 0, 0], rotation: [0.56, -0.34, 0.8], spin: [-0.025, 0.054, -0.018], radius: 0.54},
  {id: "rbc-g", kind: "red", origin: [5.8, 1.88, -0.48], velocity: [-0.36, 0, 0], rotation: [-0.3, 0.72, -0.5], spin: [0.032, -0.048, 0.021], radius: 0.61},
  {id: "rbc-h", kind: "red", origin: [7.6, -1.9, 0.46], velocity: [-0.36, 0, 0], rotation: [0.5, 0.26, -0.8], spin: [-0.02, 0.065, 0.024], radius: 0.59},
  {id: "rbc-i", kind: "red", origin: [9.4, 1.9, 0.38], velocity: [-0.36, 0, 0], rotation: [0.84, 0.42, 0.14], spin: [0.022, -0.05, -0.016], radius: 0.55},
  {id: "rbc-j", kind: "red", origin: [11.2, -1.88, -0.36], velocity: [-0.36, 0, 0], rotation: [-0.5, 0.4, 0.5], spin: [0.02, 0.044, -0.02], radius: 0.58},
  {id: "rbc-k", kind: "red", origin: [9.9, 0.92, -1.55], velocity: [-0.36, 0, 0], rotation: [0.34, -0.62, 0.25], spin: [0.018, 0.052, -0.02], radius: 0.5},
  {id: "rbc-l", kind: "red", origin: [10.55, -0.94, 1.52], velocity: [-0.36, 0, 0], rotation: [-0.55, 0.3, -0.4], spin: [0.024, -0.046, 0.018], radius: 0.51},
  {id: "wbc-hero", kind: "white", origin: [0.25, 0, 0.18], velocity: [-0.025, 0, 0], rotation: [0.04, -0.12, 0], spin: [0.012, 0.022, -0.008], radius: 0.92},
  {id: "wbc-early-a", kind: "white", origin: [-3.2, 0.94, -2.0], velocity: [0, -0.005, 0], lowExitX: -8, rotation: [0.2, 0.32, 0], spin: [0.018, -0.026, 0.012], radius: 0.54},
  {id: "wbc-early-b", kind: "white", origin: [-2.0, -0.98, -2.0], velocity: [0, 0.006, 0], lowExitX: -8, rotation: [-0.12, 0.18, 0.08], spin: [-0.015, 0.024, 0.014], radius: 0.6},
  // These later white cells remain beyond the incoming edge during this shot. Their
  // long gap is the qualitative low-count signal; it does not encode a numeric count.
  {id: "wbc-later-a", kind: "white", origin: [12.0, 1.05, -0.35], velocity: [-0.35, -0.01, 0.004], minimumEndX: 8.2, rotation: [0.15, -0.22, 0], spin: [0.01, 0.02, 0.01], radius: 0.56},
  {id: "wbc-later-b", kind: "white", origin: [13.4, -1.1, 0.05], velocity: [-0.4, 0.012, -0.003], minimumEndX: 8.8, rotation: [-0.1, 0.28, 0.1], spin: [0.014, -0.018, 0.01], radius: 0.58},
] as const;

type VerticalTrajectory = Omit<Trajectory, "lowExitX" | "minimumEndX"> & {
  dissolveOrder?: number;
};

const VERTICAL_RED_X = [-2.42, 0, 2.42] as const;
const VERTICAL_RED_Y = [-8.4, -5.6, -2.8, 0, 2.8, 5.6, 8.4] as const;
const VERTICAL_RED_TRAJECTORIES: readonly VerticalTrajectory[] = VERTICAL_RED_X.flatMap((x, lane) =>
  VERTICAL_RED_Y.map((y, row): VerticalTrajectory => ({
    id: `rbc-v-${lane}-${row}`,
    kind: "red",
    origin: [x, y + (lane % 2 === 0 ? 0 : 0.7), lane % 2 === 0 ? -2.05 : -1.45],
    velocity: [0, 0.44, 0],
    rotation: [0.32 + lane * 0.11, -0.55 + row * 0.16, (lane - row) * 0.08],
    spin: [0.025 + row * 0.002, 0.055 - lane * 0.004, 0.018],
    radius: 0.4 + ((lane + row) % 3) * 0.025,
  })),
);

const VERTICAL_WHITE_TRAJECTORIES: readonly VerticalTrajectory[] = [
  {id: "wbc-v-0", kind: "white", origin: [-1.52, -2.42, 0.1], velocity: [0.012, 0.055, 0], rotation: [0.1, 0.2, 0], spin: [0.012, 0.02, -0.008], radius: 0.38, dissolveOrder: 0},
  {id: "wbc-v-1", kind: "white", origin: [-1.18, -1.43, 0.12], velocity: [-0.008, 0.05, 0], rotation: [-0.1, 0.12, 0.04], spin: [0.01, -0.018, 0.01], radius: 0.4},
  {id: "wbc-v-2", kind: "white", origin: [-1.55, -0.38, 0.08], velocity: [0.01, 0.048, 0], rotation: [0.16, -0.08, 0.02], spin: [-0.012, 0.017, 0.009], radius: 0.37, dissolveOrder: 1},
  {id: "wbc-v-3", kind: "white", origin: [-1.04, 0.62, 0.04], velocity: [-0.01, 0.052, 0], rotation: [0.04, 0.18, -0.05], spin: [0.011, 0.019, -0.01], radius: 0.39, dissolveOrder: 2},
  {id: "wbc-v-4", kind: "white", origin: [-1.46, 1.58, 0.14], velocity: [0.009, 0.046, 0], rotation: [-0.12, -0.16, 0.06], spin: [0.013, -0.016, 0.008], radius: 0.38, dissolveOrder: 3},
  {id: "wbc-v-5", kind: "white", origin: [-0.6, 2.2, 0.06], velocity: [-0.008, 0.035, 0], rotation: [0.08, 0.11, -0.02], spin: [-0.01, 0.021, 0.01], radius: 0.4},
  {id: "wbc-v-6", kind: "white", origin: [1.38, -2.12, 0.1], velocity: [0.008, 0.049, 0], rotation: [0.14, -0.14, 0.03], spin: [0.012, 0.018, -0.009], radius: 0.37, dissolveOrder: 4},
  {id: "wbc-v-7", kind: "white", origin: [1.03, -1.02, 0.05], velocity: [-0.01, 0.054, 0], rotation: [-0.06, 0.2, -0.04], spin: [0.01, -0.02, 0.009], radius: 0.39, dissolveOrder: 5},
  {id: "wbc-v-8", kind: "white", origin: [1.52, 0.12, 0.13], velocity: [0.009, 0.047, 0], rotation: [0.12, 0.06, 0.02], spin: [-0.012, 0.016, 0.01], radius: 0.38, dissolveOrder: 6},
  {id: "wbc-v-9", kind: "white", origin: [1.12, 1.32, 0.08], velocity: [-0.009, 0.051, 0], rotation: [-0.08, -0.1, 0.05], spin: [0.011, 0.02, -0.008], radius: 0.4},
  {id: "wbc-v-10", kind: "white", origin: [1.5, 2.42, 0.04], velocity: [0.01, 0.048, 0], rotation: [0.1, 0.15, -0.03], spin: [-0.01, -0.018, 0.009], radius: 0.38, dissolveOrder: 7},
] as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function validateCue(cue: BloodCellCue) {
  if (!cue.sourceRef.trim() || !cue.windowLabel.trim()) throw new Error("Blood-cell cue requires sourceRef and windowLabel");
  const times = [cue.focusSeconds, cue.lowSeconds, cue.precautionSeconds, cue.endSeconds];
  if (times.some((value) => !Number.isFinite(value))) throw new Error("Blood-cell cue times must be finite");
  if (!(cue.focusSeconds > 0 && cue.lowSeconds > cue.focusSeconds && cue.precautionSeconds >= cue.lowSeconds && cue.endSeconds > cue.precautionSeconds)) {
    throw new RangeError("Blood-cell cues must be ordered focus < low <= precaution < end");
  }
  if (cue.focusSeconds < 2 || cue.lowSeconds - cue.focusSeconds < 1.5) {
    throw new RangeError("Blood-cell motion requires 2s before focus and 1.5s between focus and the low-count cue");
  }
}

function verticalBloodCellState(now: number, cue: BloodCellCue, reducedMotion: boolean): BloodCellState {
  const entry = cue.entrySeconds ?? 3.2;
  if (!(entry >= 0 && entry < cue.focusSeconds)) {
    throw new RangeError("Vertical blood-cell entrySeconds must be before the focus cue");
  }
  const revealStart = Math.max(0, entry - 0.4);
  const fieldOpacity = reducedMotion ? 1 : smooth((now - revealStart) / Math.max(0.01, entry - revealStart));
  const motionTime = reducedMotion ? cue.lowSeconds - entry : Math.max(0, now - entry);
  const dissolveSpan = cue.lowSeconds - cue.focusSeconds;
  const dissolveStart = cue.focusSeconds + Math.min(0.18, dissolveSpan * 0.08);
  const dissolveEnd = cue.lowSeconds - Math.min(0.18, dissolveSpan * 0.08);

  const pose = (cell: VerticalTrajectory): BloodCellPose => {
    let opacity = 1;
    if (cell.dissolveOrder !== undefined) {
      const stagger = cell.dissolveOrder / 7;
      const start = dissolveStart + (dissolveEnd - dissolveStart) * stagger * 0.72;
      const duration = Math.max(0.32, Math.min(0.58, dissolveSpan * 0.2));
      const sampleTime = reducedMotion ? cue.lowSeconds : now;
      opacity = 1 - smooth((sampleTime - start) / duration);
    }
    return {
      id: cell.id,
      kind: cell.kind,
      position: [
        cell.origin[0] + cell.velocity[0] * motionTime + (reducedMotion ? 0 : Math.sin(motionTime * 0.34 + cell.origin[1]) * 0.018),
        cell.origin[1] + cell.velocity[1] * motionTime,
        cell.origin[2] + cell.velocity[2] * motionTime,
      ],
      rotation: [
        cell.rotation[0] + cell.spin[0] * motionTime,
        cell.rotation[1] + cell.spin[1] * motionTime,
        cell.rotation[2] + cell.spin[2] * motionTime,
      ],
      radius: cell.radius,
      opacity,
    };
  };

  const cells = [...VERTICAL_RED_TRAJECTORIES, ...VERTICAL_WHITE_TRAJECTORIES].map(pose);
  const phase: BloodCellPhase = reducedMotion
    ? "reduced-low-count"
    : now < cue.focusSeconds
      ? "approach"
      : now < cue.lowSeconds
        ? "focus-pull"
        : now < cue.precautionSeconds
          ? "low-count"
          : "precaution-hold";
  return {cells, focusDepth: 0.62, phase, variant: "vertical", fieldOpacity};
}

export function bloodCellState(
  seconds: number,
  cue: BloodCellCue,
  reducedMotion = false,
  variant: BloodCellVariant = "horizontal",
): BloodCellState {
  validateCue(cue);
  const now = Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, cue.endSeconds)) : 0;
  if (variant === "vertical") return verticalBloodCellState(now, cue, reducedMotion);
  const motionTime = reducedMotion ? cue.lowSeconds : now;
  const focusPullStart = Math.max(0, cue.focusSeconds - 1.25);
  const focusProgress = smooth((now - focusPullStart) / Math.max(0.01, cue.focusSeconds - focusPullStart));
  // The white cell's visible front membrane is near z=.65; focusing on its center
  // would leave the nucleus readable but soften the actual surface facing camera.
  const whiteFocusPlane = 0.65;
  const focusDepth = reducedMotion ? whiteFocusPlane : 2.5 + (whiteFocusPlane - 2.5) * focusProgress;

  const cells = HORIZONTAL_TRAJECTORIES.map((cell): BloodCellPose => ({
    id: cell.id,
    kind: cell.kind,
    position: [
      cell.lowExitX !== undefined
        ? cell.origin[0] + ((cell.lowExitX - cell.origin[0]) / cue.lowSeconds) * motionTime
        : cell.minimumEndX !== undefined
          ? cell.minimumEndX + Math.abs(cell.velocity[0]) * (cue.endSeconds - motionTime)
          : cell.origin[0] + cell.velocity[0] * motionTime,
      cell.origin[1] + cell.velocity[1] * motionTime + (reducedMotion ? 0 : Math.sin(motionTime * 0.45 + cell.origin[0]) * 0.025),
      cell.origin[2] + cell.velocity[2] * motionTime,
    ],
    rotation: [
      cell.rotation[0] + cell.spin[0] * motionTime,
      cell.rotation[1] + cell.spin[1] * motionTime,
      cell.rotation[2] + cell.spin[2] * motionTime,
    ],
    radius: cell.radius,
    opacity: 1,
  }));

  const phase: BloodCellPhase = reducedMotion
    ? "reduced-low-count"
    : now < focusPullStart
      ? "approach"
      : now < cue.lowSeconds
        ? "focus-pull"
        : now < cue.precautionSeconds
          ? "low-count"
          : "precaution-hold";

  return {cells, focusDepth, phase, variant: "horizontal", fieldOpacity: 1};
}
