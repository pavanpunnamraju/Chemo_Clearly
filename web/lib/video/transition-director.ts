import { getGenAIClient } from "../gemini/client";
import { TRANSITION_PLAN_VERSION, type TransitionPlan, type TransitionScene, validateTransitionPlan } from "./transition-plan";

export const TRANSITION_DIRECTOR_MODEL = "gemini-2.5-flash";
export interface TransitionRepairRequest {
  scenes: TransitionScene[];
  attempt: number;
  feedback: string[];
}

function parseResponse(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(clean);
}

/** Request a whole-film boundary plan, retrying invalid output twice. The
 * model's choices and rationale are persisted by the caller; rendering is pure. */
export async function directTransitions(
  scenes: TransitionScene[],
  request?: (repair: TransitionRepairRequest) => Promise<unknown>,
): Promise<TransitionPlan> {
  const preflight = validateTransitionPlan({ version: TRANSITION_PLAN_VERSION, method: "ai", boundaries: [] }, scenes)
    .filter((error) => !error.startsWith("Expected "));
  if (preflight.length) throw new Error(`Invalid transition scenes: ${preflight.join(" ")}`);
  if (scenes.length < 2) return { version: TRANSITION_PLAN_VERSION, method: "authored", boundaries: [] };

  let ask = request;
  if (!ask) {
    const client = await getGenAIClient();
    if (!client) throw new Error("Transition direction requires the configured Vertex AI model.");
    ask = async ({ scenes: sequence, attempt, feedback }) => {
      const prompt = [
        "You are the creative director for a friendly, short patient-education film. Choose transitions for the entire sequence, one per adjacent scene boundary. Save a specific visual rationale for each choice.",
        "Allowed types: bubble-bridge, board-slide, dissolve, cut. Use the sequence and both neighboring shots to choose purposeful variation; avoid mechanical repetition or random variety.",
        "A bubble-bridge zooms into a colored background shape then resolves the next composition. A board-slide moves the entire frame sideways like moving around a whiteboard. A dissolve blends whole frames. A cut is immediate.",
        "Opaque baked video must transition as a whole frame, including board-slide. Layered metadata is only for future object-level motion and does not constrain these four transitions. Do not invent anatomy, artwork details, clinical text, timing, colors, or visual layers.",
        "If either neighbor has safety=true, choose cut so every safety instruction remains clear. Cuts have durationSeconds=0; other types use 0.35 to 0.8 seconds. Color must be exactly one color supplied in either neighbor's palette.",
        "Transitions occupy existing narration-clock time around the boundary. Keep neighboring half-windows from overlapping within a short scene. Do not shift scenes, audio, or captions.",
        `Return ONLY JSON: {"version":"${TRANSITION_PLAN_VERSION}","method":"ai","model":"${TRANSITION_DIRECTOR_MODEL}","boundaries":[{"fromId":"...","toId":"...","type":"cut","durationSeconds":0,"color":"#...","rationale":"brief reason"}]}.`,
        `Attempt: ${attempt + 1}. Validation feedback: ${JSON.stringify(feedback)}.`,
        `Scenes in narration order: ${JSON.stringify(sequence)}.`,
      ].join("\n");
      const response = await client.models.generateContent({
        model: TRANSITION_DIRECTOR_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json", temperature: 0.5 },
      });
      return response.text ?? "";
    };
  }

  let feedback: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    let candidate: unknown;
    try { candidate = parseResponse(await ask({ scenes, attempt, feedback })); }
    catch (error) { feedback = [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`]; continue; }
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) { feedback = ["Response must be one JSON transition-plan object."]; continue; }
    const plan = candidate as TransitionPlan;
    feedback = validateTransitionPlan(plan, scenes);
    if (plan.method !== "ai") feedback.push("Generated transition decisions must declare method ai.");
    if (!plan.model || typeof plan.model !== "string") feedback.push("Generated transition decisions must identify the model.");
    if (!feedback.length) return plan;
  }
  throw new Error(`Transition direction failed validation after initial plan and 2 repairs: ${feedback.join(" ")}`);
}
