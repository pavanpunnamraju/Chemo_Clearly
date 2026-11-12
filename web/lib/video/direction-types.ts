import type { TransitionPlan } from './transition-plan';
import type { SectionId } from "../content/types";
import type { TimedCaption } from "./captions";

export const MOTION_ACTIONS = ["welcome", "infusion", "drink", "wash-hands", "temperature", "rest", "stretch", "walk", "call", "support", "calendar", "observe"] as const;
export type MotionAction = typeof MOTION_ACTIONS[number];
export const SCENE_KINDS = ["treatment", "timeline", "daily-life", "symptom", "emergency", "family", "household", "quote", "outlook"] as const;
export type SceneKind = typeof SCENE_KINDS[number];
export type CameraMove = "establish" | "push-in" | "detail" | "drift";
export type Staging = "left" | "right" | "center";
export type SceneTransition = "zoom-through" | "match-cut" | "settle";

/** Semantic capabilities are shared by the director, validator and renderer. */
export interface MotionAsset {
  id: string;
  label: string;
  actions: readonly MotionAction[];
  tags: readonly string[];
  focus: { x: number; y: number };
}

export const MOTION_ASSETS: readonly MotionAsset[] = [
  { id: "patient-treatment", label: "Patient and infusion chair", actions: ["infusion", "welcome"], tags: ["what-it-is"], focus: { x: 0.56, y: 0.4 } },
  { id: "patient-hydration", label: "Patient with a glass of water", actions: ["drink", "rest"], tags: ["nausea-appetite", "mouth-digestion", "urinary"], focus: { x: 0.57, y: 0.36 } },
  { id: "patient-hygiene", label: "Patient washing hands at a sink", actions: ["wash-hands"], tags: ["infection-risk", "household-safety"], focus: { x: 0.6, y: 0.58 } },
  { id: "patient-temperature", label: "Patient holding a thermometer", actions: ["temperature", "observe"], tags: ["emergency-signs", "infection-risk"], focus: { x: 0.6, y: 0.4 } },
  { id: "patient-rest", label: "Patient resting in a comfortable chair", actions: ["rest", "observe"], tags: ["fatigue", "nausea-appetite", "aches-pain", "emotional-support"], focus: { x: 0.48, y: 0.42 } },
  { id: "patient-movement", label: "Patient doing gentle activity", actions: ["stretch", "walk"], tags: ["work-daily-life", "how-it-feels-daily", "fatigue"], focus: { x: 0.5, y: 0.48 } },
  { id: "patient-contact", label: "Patient contacting their care team", actions: ["call"], tags: ["emergency-signs", "heart", "bleeding-bruising", "nerve-tingling"], focus: { x: 0.55, y: 0.3 } },
  { id: "patient-support", label: "Patient with a supportive companion", actions: ["support", "welcome"], tags: ["fertility-intimacy", "emotional-support", "long-term-outlook"], focus: { x: 0.5, y: 0.45 } },
  { id: "patient-observe", label: "Patient listening and reflecting", actions: ["observe", "welcome"], tags: ["hair-skin-appearance", "nerve-tingling", "mouth-digestion", "urinary", "bleeding-bruising", "heart", "aches-pain"], focus: { x: 0.5, y: 0.4 } },
  { id: "treatment-calendar", label: "Treatment schedule", actions: ["calendar"], tags: ["schedule"], focus: { x: 0.5, y: 0.5 } },
];

/** Display strings are source-bound; rationale is reviewer-only. Seconds use the audio clock. */
export interface ArtworkBeat {
  artworkId: string;
  startSeconds: number;
  endSeconds: number;
  sourceRef: string;
  rationale: string;
}

export interface DirectedShot {
  id: string;
  entryId: string;
  sectionId: SectionId;
  startSeconds: number;
  endSeconds: number;
  cueSeconds: number;
  scene: SceneKind;
  assetId: string;
  action: MotionAction;
  camera: CameraMove;
  staging: Staging;
  transition: SceneTransition;
  headline: string;
  message: string;
  sourceRefs: string[];
  rationale: string;
  focus: { x: number; y: number };
  /** Explicit source-bound labels, never a generated clinical number. */
  labels: string[];
  /** Inspected library scenes/cutaways on the same measured narration clock. */
  artworkBeats?: ArtworkBeat[];
  /** Source labels with absolute narration-clock intervals. An absent/empty
   * list means no timed labels; the renderer must never invent a schedule. */
  labelCues?: { text: string; startSeconds: number; endSeconds: number }[];
  /** Complete source-projected fever alternatives and their action/context.
   * Render both criteria with an explicit OR; never isolate a numeric reading. */
  safetyCard?: { criteria: string[]; action: string; applicability: string };
}

export interface VisualDirection {
  version: string;
  regimenId: string;
  regimenTitle: string;
  method: "ai" | "authored";
  totalSeconds: number;
  shots: DirectedShot[];
  transitionPlan?: TransitionPlan;
}

export interface DirectedVideoProps extends Record<string, unknown> {
  direction: VisualDirection;
  audioSrc: string;
  captions: TimedCaption[];
  reducedMotion?: boolean;
  musicSrc?: string;
  captionsEnabled?: boolean;
  /** Development-only DOM measurement logging; never a patient-visible overlay. */
  qaMode?: boolean;
}
