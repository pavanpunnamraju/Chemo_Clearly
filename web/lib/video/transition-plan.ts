import type { VisualDirection } from "./direction-types";

export const TRANSITION_PLAN_VERSION = "1";
export const TRANSITION_TYPES = ["bubble-bridge", "board-slide", "dissolve", "cut"] as const;
export type TransitionType = typeof TRANSITION_TYPES[number];

/** Seconds are absolute narration-clock seconds. Palette colors must be visible
 * background/art colors supplied by the scene builder, never invented by AI. */
export interface TransitionScene {
  id: string;
  startSeconds: number;
  endSeconds: number;
  summary: string;
  palette: string[];
  safety: boolean;
  layered: boolean;
}

export interface BoundaryTransition {
  fromId: string;
  toId: string;
  type: TransitionType;
  durationSeconds: number;
  color: string;
  rationale: string;
}

export interface TransitionPlan {
  version: string;
  method: "ai" | "authored";
  model?: string;
  boundaries: BoundaryTransition[];
}

const COLOR = /^#[0-9a-f]{6}$/i;
const MIN_DURATION = 0.35;
const MAX_DURATION = 0.8;
const EPSILON = 1e-6;

/** Current directed shots use this exact frame background. Source artwork may
 * contain many other colors, but exposing those without inspection would invite
 * a bridge color that does not exist at the shot edge. */
export function transitionScenesForDirection(direction: VisualDirection): TransitionScene[] {
  return direction.shots.map((shot) => ({
    id: shot.id,
    startSeconds: shot.startSeconds,
    endSeconds: shot.endSeconds,
    summary: `${shot.headline}: ${shot.message}`.trim(),
    palette: ["#F4F7F6"],
    safety: Boolean(shot.safetyCard) || shot.scene === "emergency" || shot.action === "call",
    // Library artwork can contain opaque whole-frame video. Until its layer
    // geometry is inspected, only whole-frame transitions are safe.
    layered: !shot.artworkBeats?.length,
  }));
}

/** Validate model output against the actual chronological scene boundaries. */
export function validateTransitionPlan(plan: TransitionPlan, scenes: TransitionScene[]): string[] {
  const errors: string[] = [];
  if (!plan || typeof plan !== "object") return ["Transition plan must be an object."];
  if (plan.version !== TRANSITION_PLAN_VERSION) errors.push(`Unsupported transition plan version: ${String(plan.version)}.`);
  if (plan.method !== "ai" && plan.method !== "authored") errors.push("Transition plan method must be ai or authored.");
  if (!Array.isArray(plan.boundaries)) return [...errors, "Boundaries must be an array."];
  if (!Array.isArray(scenes)) return [...errors, "Scenes must be an array."];
  const ids = new Set<string>();
  scenes.forEach((scene, index) => {
    if (!scene || typeof scene.id !== "string" || !scene.id.trim() || ids.has(scene.id)) errors.push(`Scene ${index} has a missing or duplicate ID.`);
    ids.add(scene?.id);
    if (!Number.isFinite(scene?.startSeconds) || !Number.isFinite(scene?.endSeconds) || scene.endSeconds <= scene.startSeconds) errors.push(`Scene ${index} has invalid timing.`);
    if (index && scene.startSeconds < scenes[index - 1]!.endSeconds - EPSILON) errors.push(`Scenes ${index - 1} and ${index} overlap.`);
    if (!Array.isArray(scene?.palette) || !scene.palette.length || scene.palette.some((color) => typeof color !== "string" || !COLOR.test(color))) errors.push(`Scene ${index} needs a nonempty six-digit hex palette.`);
    if (typeof scene?.safety !== "boolean" || typeof scene?.layered !== "boolean") errors.push(`Scene ${index} needs safety and layered flags.`);
  });
  if (plan.boundaries.length !== Math.max(0, scenes.length - 1)) errors.push(`Expected ${Math.max(0, scenes.length - 1)} boundaries, received ${plan.boundaries.length}.`);
  const seen = new Set<string>();
  plan.boundaries.forEach((boundary, index) => {
    const from = scenes[index];
    const to = scenes[index + 1];
    if (!boundary || typeof boundary !== "object") { errors.push(`Boundary ${index} is invalid.`); return; }
    if (!from || !to || boundary.fromId !== from.id || boundary.toId !== to.id) errors.push(`Boundary ${index} must connect adjacent scenes in order.`);
    const key = `${boundary.fromId}\u0000${boundary.toId}`;
    if (seen.has(key)) errors.push(`Boundary ${index} is duplicated.`);
    seen.add(key);
    if (!TRANSITION_TYPES.includes(boundary.type)) errors.push(`Boundary ${index} has an unsupported type.`);
    if (!Number.isFinite(boundary.durationSeconds)) errors.push(`Boundary ${index} has an invalid duration.`);
    else if (boundary.type === "cut" ? boundary.durationSeconds !== 0 : boundary.durationSeconds < MIN_DURATION - EPSILON || boundary.durationSeconds > MAX_DURATION + EPSILON) errors.push(`Boundary ${index} duration must be 0 for a cut or ${MIN_DURATION}–${MAX_DURATION} seconds.`);
    if (typeof boundary.color !== "string" || !COLOR.test(boundary.color) || ![...(from?.palette ?? []), ...(to?.palette ?? [])].some((color) => color.toLowerCase() === boundary.color.toLowerCase())) errors.push(`Boundary ${index} color is outside its neighboring palettes.`);
    if (typeof boundary.rationale !== "string" || !boundary.rationale.trim()) errors.push(`Boundary ${index} needs a rationale.`);
    if ((from?.safety || to?.safety) && boundary.type !== "cut") errors.push(`Boundary ${index} touches safety content and must cut.`);
  });
  // Transitions are centered on existing scene boundaries; their half-windows
  // must fit within every scene without touching each other or the film edges.
  scenes.forEach((scene, index) => {
    const left = (plan.boundaries[index - 1]?.durationSeconds ?? 0) / 2;
    const right = (plan.boundaries[index]?.durationSeconds ?? 0) / 2;
    if (Number.isFinite(left) && Number.isFinite(right) && left + right > scene.endSeconds - scene.startSeconds + EPSILON) errors.push(`Transition windows overlap inside scene ${scene.id}.`);
  });
  return errors;
}
