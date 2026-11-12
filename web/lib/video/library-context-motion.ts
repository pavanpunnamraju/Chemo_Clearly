export interface ContextArtworkRecipe {
  id: string;
  publicPath: string | null;
  semantics: string;
  sourceSha256?: string;
  /** Source context is a capability, never independent permission to give advice. */
  sourceKind: "storyset" | "original-vector";
}

const source = (id: string, publicPath: string, sourceSha256: string, semantics: string): ContextArtworkRecipe =>
  ({ id, publicPath: `illustrations/${publicPath}`, sourceSha256, semantics, sourceKind: "storyset" });
const object = (id: string, semantics: string): ContextArtworkRecipe => ({ id, publicPath: null, semantics, sourceKind: "original-vector" });

export const LIBRARY_CONTEXT_ARTWORK: readonly ContextArtworkRecipe[] = [
  source("context-infusion", "overview/overview__oncology-patient-pana.svg", "86bedce3698e62d3ab5fe35c31ade22da1481725beeece2813d12ebf5d6cc650", "Patient seated for an infusion; original connected treatment apparatus retained; no dose or flow indication."),
  source("context-clinician", "overview/overview__doctor-pana.svg", "e3dda7605fbe4236392b4df14581294324c452fcd0a8659afdb98b7c80251e99", "Clinician listening with a clipboard; no imaging or medicine recommendation."),
  source("context-support", "fertility_intimacy/fertility_intimacy__family-bro.svg", "7b57a6cc2aebe6ece9bd6c576e23e2597858bdf45f9e3366ba8b66aab4b19589", "Two adults seated together, with child layers removed; no fertility or outcome implication."),
  source("context-community", "patient_voices/patient_voices__community-pana.svg", "c9a868ef0096d193b33af6ea80ae4ecdda6e9933401c2e46baf00c42636efbda", "Adult community support, with child and parent-child contact removed; no fertility or outcome implication."),
  source("context-hospital", "emergency/emergency__hospital-building-pana.svg", "7635228b9599ea87a317b11b34c78ba52eeabf8a954ee4ec3205e05909f62dd1", "Hospital establishing illustration; helicopter removed; no transport instruction."),
  source("context-call-center", "emergency/emergency__call-center-bro.svg", "3d86159616bd7288279233ba7a2af6587edce74af9e37531a10351dcb739a22d", "Receiving side of a care-team call; source headsets and connected upper bodies retained."),
  source("context-calendar", "timeline/timeline__calendar-pana.svg", "c1c1cbfc3dc4c933f264dc86ff4917f2186625c98492d945a73233a244054bd0", "Blank calendar with original people; all stock marks and dates removed. Source dates must be displayed separately."),
  source("context-schedule", "timeline/timeline__schedule-pana.svg", "fda8ba9580aa92af748c801bc8fac04b7041911ae073e0d4a1d61f1c8665769c", "Planning screen and person; stock month, dates, times and yoga labels removed."),
  source("context-timeline", "timeline/timeline__timeline-bro.svg", "b1cda0ff2fec9a80577e6c317c79957963f92bb742a377dc60b134826c0fcf0a", "Planning board and pen; stock weeks, labels and schedule markings removed."),
  source("context-online-doctor", "overview/overview__online-doctor-bro.svg", "0865b4373d6e1ef3dd81db7afda08a68f63bf7fccba68a1670768143a855422f", "Remote conversation with a clinician; all medication bottle and blister-pack props removed."),
  source("context-patient-voice", "patient_voices/patient_voices__online-review-pana.svg", "756ae583ecba2edc894d680884b4e530e4636f459f65305ca91927a530915df7", "Person using a laptop; review cards, stars and ratings removed. Not a depicted quoted real patient."),
  object("care-oral", "Soft toothbrush and rinse cup; no concentration, medicine or brushing technique implied."),
  object("care-foot-inspection", "Foot outline and inspection lens; no lesion, diagnosis or treatment implied."),
  object("care-bland-meal", "Small bowl and plain toast; no invented medicine or dietary quantity."),
  object("care-laundry", "Laundry basket, clothes and washing-machine door; no unsupported settings or handling procedure."),
  object("care-toilet", "Closed toilet lid and flush handle; source directions remain in narration and text."),
  object("care-scalp-sun", "Sun hat and sun-protection context; no product, dose, SPF or guarantees."),
  object("care-nails", "Fingertips and nails with an inspection lens; no discoloration, damage or treatment claim."),
  object("care-journal", "Open notebook and pen for keeping notes; no fabricated patient records."),
  object("care-thermometer", "Standalone blank-display thermometer; does not depict technique or a measured temperature."),
  object("care-heart", "Simple heart schematic; no numerical rate, ECG reading or pathology."),
  object("care-brain", "Head outline with brain schematic; no location-specific pathology or diagnosis."),
  object("care-blood-counts", "Schematic blood cells; illustrative arrangement is not a laboratory count or result."),
  object("care-medication-plan", "Breakfast and blank checklist; actual source medication names and timing belong in source-bound text."),
  object("care-work-plan", "Work bag, notebook and task sheet; no invented workload or employment advice."),
  object("care-questions-history", "Question notebook and records folder; no invented test results or medical history."),
  object("care-skin", "Skin/forearm schematic and magnifier; no invented bruise, rash or diagnosis."),
];

export function contextArtworkRecipe(id: string): ContextArtworkRecipe | undefined {
  return LIBRARY_CONTEXT_ARTWORK.find((recipe) => recipe.id === id);
}

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
/** A slow intentional inclination, pause and return, followed by a quiet hold.
 * All geometry attached to a selected layer receives the same rigid transform. */
export function contextMotion(seconds: number, reducedMotion = false, phase = 0) {
  if (reducedMotion || !Number.isFinite(seconds) || seconds <= 0) return { attention: 0, angle: 0, scan: 0, draw: 1 };
  const time = Math.max(0, seconds - phase) % 9;
  const attention = time < .7 ? 0 : time < 2.5 ? smooth((time - .7) / 1.8) : time < 4 ? 1 : time < 6 ? 1 - smooth((time - 4) / 2) : 0;
  return { attention, angle: .65 * attention, scan: 18 * attention, draw: 1 - .28 * attention };
}
