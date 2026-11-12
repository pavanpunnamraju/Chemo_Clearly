import assert from "node:assert/strict";
import { directTransitions } from "./transition-director";
import { TRANSITION_PLAN_VERSION, type TransitionPlan, type TransitionScene, validateTransitionPlan } from "./transition-plan";

const scenes: TransitionScene[] = [
  { id: "a", startSeconds: 0, endSeconds: 4, summary: "treatment", palette: ["#F4F7F6"], safety: false, layered: true },
  { id: "b", startSeconds: 4, endSeconds: 8, summary: "daily life", palette: ["#FFFFFF"], safety: false, layered: false },
  { id: "c", startSeconds: 8, endSeconds: 12, summary: "call the team", palette: ["#F4F7F6"], safety: true, layered: true },
];
const valid: TransitionPlan = { version: TRANSITION_PLAN_VERSION, method: "ai", model: "gemini-2.5-flash", boundaries: [
  { fromId: "a", toId: "b", type: "dissolve", durationSeconds: 0.6, color: "#FFFFFF", rationale: "Quietly connect the two whole frames." },
  { fromId: "b", toId: "c", type: "cut", durationSeconds: 0, color: "#F4F7F6", rationale: "Keep the call instruction clear." },
] };

assert.deepEqual(validateTransitionPlan(valid, scenes), []);
assert.match(validateTransitionPlan({ ...valid, boundaries: [valid.boundaries[0]!] }, scenes).join(" "), /Expected 2 boundaries/);
assert.match(validateTransitionPlan({ ...valid, boundaries: [valid.boundaries[0]!, { ...valid.boundaries[1]!, toId: "a" }] }, scenes).join(" "), /adjacent scenes/);
assert.match(validateTransitionPlan({ ...valid, boundaries: [{ ...valid.boundaries[0]!, color: "#123456" }, valid.boundaries[1]!] }, scenes).join(" "), /outside its neighboring palettes/);
assert.match(validateTransitionPlan({ ...valid, boundaries: [valid.boundaries[0]!, { ...valid.boundaries[1]!, type: "dissolve", durationSeconds: 0.5 }] }, scenes).join(" "), /safety content/);
assert.deepEqual(validateTransitionPlan({ ...valid, boundaries: [{ ...valid.boundaries[0]!, type: "board-slide" }, valid.boundaries[1]!] }, scenes), []);

const short = scenes.map((scene, index) => ({ ...scene, startSeconds: index === 0 ? 0 : index === 1 ? 1 : 1.6, endSeconds: index === 0 ? 1 : index === 1 ? 1.6 : 2.6, safety: false, layered: true }));
const twoTransitions: TransitionPlan = { ...valid, boundaries: [
  { ...valid.boundaries[0]!, durationSeconds: 0.8 },
  { ...valid.boundaries[1]!, type: "dissolve", durationSeconds: 0.8 },
] };
assert.match(validateTransitionPlan(twoTransitions, short).join(" "), /windows overlap inside scene b/);

let calls = 0;
const repaired = await directTransitions(scenes, async ({ attempt, feedback }) => {
  calls++;
  if (attempt === 0) return { ...valid, boundaries: [{ ...valid.boundaries[0]!, color: "#123456" }, valid.boundaries[1]!] };
  assert.match(feedback.join(" "), /outside its neighboring palettes/);
  return valid;
});
assert.equal(calls, 2);
assert.deepEqual(repaired, valid);
await assert.rejects(() => directTransitions(scenes, async () => ({ ...valid, boundaries: [] })), /after initial plan and 2 repairs/);
console.log("transition plan tests passed");
