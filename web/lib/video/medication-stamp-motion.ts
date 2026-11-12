export type MedicationStampCue = {
  lines: string[];
  sourceRef: string;
  contactSeconds: number;
  endSeconds: number;
};

export type MedicationStampPhase =
  | "waiting"
  | "entering"
  | "settling"
  | "contact"
  | "lifting"
  | "exiting"
  | "hold"
  | "reduced-waiting"
  | "reduced-hold";

export const MEDICATION_STAMP_FOOTPRINT = {
  x: 291,
  y: 216,
  width: 109,
  height: 66,
  radius: 4,
} as const;

export const MEDICATION_STAMP_TIMING = {
  entrySeconds: 2.8,
  settleSeconds: 0.32,
  compressionSeconds: 0.24,
  contactHoldSeconds: 0.18,
  liftSeconds: 0.46,
  exitSeconds: 1.15,
  minimumPostContactSeconds: 2.03,
} as const;

export type MedicationStampPose = {
  phase: MedicationStampPhase;
  assemblyX: number;
  assemblyY: number;
  assemblyScale: number;
  compression: number;
  imprintOpacity: number;
  contact: boolean;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowOpacity: number;
  hardwareVisible: boolean;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function validateCue(cue: MedicationStampCue) {
  if (!cue.sourceRef.trim()) throw new Error("Medication stamp cue requires a sourceRef");
  if (cue.lines.length < 1 || cue.lines.length > 2 || cue.lines.some((line) => !line.trim())) {
    throw new Error("Medication stamp cue requires one or two non-empty message lines");
  }
  if (!Number.isFinite(cue.contactSeconds) || !Number.isFinite(cue.endSeconds)) {
    throw new Error("Medication stamp cue times must be finite");
  }
  if (cue.contactSeconds < MEDICATION_STAMP_TIMING.entrySeconds) {
    throw new RangeError(
      `Medication stamp needs ${MEDICATION_STAMP_TIMING.entrySeconds}s before contact; received ${cue.contactSeconds}s`,
    );
  }
  if (cue.endSeconds - cue.contactSeconds < MEDICATION_STAMP_TIMING.minimumPostContactSeconds) {
    throw new RangeError(
      `Medication stamp needs ${MEDICATION_STAMP_TIMING.minimumPostContactSeconds}s after contact; received ${cue.endSeconds - cue.contactSeconds}s`,
    );
  }
}

/** A single source-timed stamp action. Geometry exits through the crop; it never
 * disappears in open frame space and it never accelerates to fit a short cue. */
export function medicationStampMotion(
  seconds: number,
  cue: MedicationStampCue,
  reducedMotion = false,
): MedicationStampPose {
  validateCue(cue);
  const now = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const contact = cue.contactSeconds;

  if (reducedMotion) {
    const revealed = now >= contact;
    return {
      phase: revealed ? "reduced-hold" : "reduced-waiting",
      assemblyX: 400,
      assemblyY: -52,
      assemblyScale: 1.08,
      compression: 0,
      imprintOpacity: revealed ? 1 : 0,
      contact: false,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      shadowOpacity: 0,
      hardwareVisible: false,
    };
  }

  const entryStart = contact - MEDICATION_STAMP_TIMING.entrySeconds;
  const settleStart = contact - MEDICATION_STAMP_TIMING.settleSeconds;
  const compressionEnd = contact + MEDICATION_STAMP_TIMING.compressionSeconds;
  const liftStart = compressionEnd + MEDICATION_STAMP_TIMING.contactHoldSeconds;
  const liftEnd = liftStart + MEDICATION_STAMP_TIMING.liftSeconds;
  const exitEnd = liftEnd + MEDICATION_STAMP_TIMING.exitSeconds;

  if (now < entryStart) {
    return {phase: "waiting", assemblyX: 400, assemblyY: -52, assemblyScale: 1.08, compression: 0, imprintOpacity: 0, contact: false, shadowOffsetX: 12, shadowOffsetY: -8, shadowOpacity: 0, hardwareVisible: true};
  }

  if (now < settleStart) {
    const progress = smooth((now - entryStart) / (settleStart - entryStart));
    return {
      phase: "entering",
      assemblyX: 400 * (1 - progress) + 5 * progress,
      assemblyY: -52 * (1 - progress) - 4 * progress,
      assemblyScale: 1.08 * (1 - progress) + 1.012 * progress,
      compression: 0,
      imprintOpacity: 0,
      contact: false,
      shadowOffsetX: 12 * (1 - progress) + 3 * progress,
      shadowOffsetY: -8 * (1 - progress) - progress,
      shadowOpacity: 0.08 + 0.15 * progress,
      hardwareVisible: true,
    };
  }

  if (now < contact) {
    const progress = smooth((now - settleStart) / (contact - settleStart));
    return {
      phase: "settling",
      assemblyX: 5 * (1 - progress),
      assemblyY: -4 * (1 - progress),
      assemblyScale: 1.012 * (1 - progress) + progress,
      compression: 0,
      imprintOpacity: 0,
      contact: false,
      shadowOffsetX: 3 * (1 - progress),
      shadowOffsetY: -(1 - progress),
      shadowOpacity: 0.23 + 0.05 * progress,
      hardwareVisible: true,
    };
  }

  if (now < compressionEnd) {
    const compression = smooth((now - contact) / (compressionEnd - contact));
    return {phase: "contact", assemblyX: 0, assemblyY: 0, assemblyScale: 1, compression, imprintOpacity: compression, contact: true, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 0.28, hardwareVisible: true};
  }

  if (now < liftStart) {
    return {phase: "contact", assemblyX: 0, assemblyY: 0, assemblyScale: 1, compression: 1, imprintOpacity: 1, contact: true, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 0.28, hardwareVisible: true};
  }

  if (now < liftEnd) {
    const progress = smooth((now - liftStart) / (liftEnd - liftStart));
    return {
      phase: "lifting",
      assemblyX: 7 * progress,
      assemblyY: -5 * progress,
      assemblyScale: 1 + 0.015 * progress,
      compression: 1 - progress,
      imprintOpacity: 1,
      contact: false,
      shadowOffsetX: 4 * progress,
      shadowOffsetY: -3 * progress,
      shadowOpacity: 0.28 - 0.09 * progress,
      hardwareVisible: true,
    };
  }

  if (now < exitEnd) {
    const progress = smooth((now - liftEnd) / (exitEnd - liftEnd));
    return {
      phase: "exiting",
      assemblyX: 7 * (1 - progress) + 400 * progress,
      assemblyY: -5 * (1 - progress) - 52 * progress,
      assemblyScale: 1.015 * (1 - progress) + 1.08 * progress,
      compression: 0,
      imprintOpacity: 1,
      contact: false,
      shadowOffsetX: 4 * (1 - progress) + 12 * progress,
      shadowOffsetY: -3 * (1 - progress) - 8 * progress,
      shadowOpacity: 0.19 * (1 - progress),
      hardwareVisible: true,
    };
  }

  return {phase: "hold", assemblyX: 400, assemblyY: -52, assemblyScale: 1.08, compression: 0, imprintOpacity: 1, contact: false, shadowOffsetX: 12, shadowOffsetY: -8, shadowOpacity: 0, hardwareVisible: true};
}
