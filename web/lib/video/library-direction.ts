import type { ContentEntry } from "../content/types";
import type { ArtworkBeat, DirectedShot } from "./direction-types";

/** Reviewed concept bindings use the actual subjects in the SVG inventory,
 * never filename similarity. Distinct entries get distinct primary artwork.
 * Missing new source concepts fail closed and require a deliberate binding. */
export const ENTRY_ARTWORK: Record<string, string> = {
  overview: "context-infusion",
  timeline: "context-calendar",
  "timeline.day-1": "context-schedule",
  "timeline.days-2-5": "care-medication-plan",
  "timeline.roughly-days-7-10": "care-blood-counts",
  "timeline.days-11-21": "context-timeline",
  daily_life: "care-work-plan",
  "daily_life.exercise": "patient-stretch",
  "daily_life.driving": "patient-car",
  "daily_life.intimacy": "context-support",
  "daily_life.helpful-routines": "care-journal",
  side_effects: "context-online-doctor",
  "side_effects.low-white-blood-cells-infection-risk": "patient-washing",
  "side_effects.low-blood-counts-infection-risk": "patient-washing",
  "side_effects.low-platelets-bruising-and-bleeding": "care-bruising",
  "side_effects.bruising-bleeding": "care-bruising",
  "side_effects.low-red-blood-cells-anemia": "patient-rest",
  "side_effects.nausea-and-vomiting": "care-bland-meal",
  "side_effects.nausea-and-appetite-loss": "care-bland-meal",
  "side_effects.mouth-sores": "care-oral",
  "side_effects.diarrhea-constipation": "patient-abdomen",
  "side_effects.diarrhea": "care-bowel",
  "side_effects.nerve-tingling-numbness": "patient-hand",
  "side_effects.hair-loss": "patient-hair",
  "side_effects.bladder-irritation": "approved-drinking",
  "side_effects.steroid-effects": "patient-sleep",
  "side_effects.joint-and-muscle-aches": "care-warm-compress",
  "side_effects.skin-nail-changes-and-sun-sensitivity": "care-skin",
  "emergency.about-this-list": "context-hospital",
  "emergency.fever-during-your-low-blood-cell-window": "care-thermometer",
  "emergency.infusion-reaction": "care-alert-staff",
  "emergency.infusion-or-allergic-reaction": "care-alert-staff",
  "emergency.serious-allergic-or-skin-reaction": "care-skin",
  "emergency.heart-symptoms": "care-heart",
  "emergency.serious-brain-or-nerve-problem": "care-brain",
  "emergency.tumor-lysis-syndrome": "care-warning",
  "emergency.severe-low-blood-count-complications": "care-blood-counts",
  "emergency.when-to-call-911-vs-your-care-team": "approved-calling",
  fertility_intimacy: "context-clinician",
  practical_life: "care-questions-history",
  "patient_voices.day-3-crash": "context-patient-voice",
  "patient_voices.losing-hair-gradually": "care-headwear",
  "patient_voices.mouth-sores-and-mental-fog": "care-thoughts",
  "patient_voices.closing-note": "context-community",
  patient_voices: "context-patient-voice",
  big_picture: "care-treatment-history",
};

// These cutaways are added at observed narration words, not equal-duration
// guesses. They supplement the entry's content; no source text is replaced.
const DETAILS: Record<string, { id: string; trigger: RegExp; field: string; minimumRemaining?: number }[]> = {
  "side_effects.nerve-tingling-numbness": [{ id: "care-foot-inspection", trigger: /^(?:check|inspect|checking|inspect(?:ing)?)$/i, field: "selfCare" }],
  "side_effects.hair-loss": [{ id: "care-scalp-sun", trigger: /^(?:hats?|scarves|sun|scalp|sunlight|sunshine)$/i, field: "selfCare" }],
  "side_effects.skin-nail-changes-and-sun-sensitivity": [{ id: "care-nails", trigger: /^(?:nails|nail)$/i, field: "plain" }],
  practical_life: [
    { id: "care-toilet", trigger: /^(?:toilet|toilets)$/i, field: "plain" },
    { id: "care-laundry", trigger: /^(?:wash|washing|laundry|soiled)$/i, field: "plain", minimumRemaining: 2 },
  ],
};

type TimedWord = { text: string; startSeconds: number; endSeconds: number };

const SELF_CARE_ARTWORK = new Set(["approved-drinking", "patient-washing", "care-oral", "care-bland-meal", "care-warm-compress"]);
const DETAIL_SUBJECT: Record<string, RegExp> = {
  "care-foot-inspection": /\b(?:feet|foot)\b/i,
  "care-scalp-sun": /\b(?:hats?|scarves|sun|scalp|sunlight|sunshine)\b/i,
  "care-nails": /\bnails?\b/i,
  "care-toilet": /\btoilets?\b/i,
  "care-laundry": /\b(?:laundry|soiled)\b/i,
};

export function planLibraryArtwork(entry: ContentEntry, shot: Pick<DirectedShot, "startSeconds" | "endSeconds">, words: TimedWord[]): ArtworkBeat[] {
  const id = ENTRY_ARTWORK[entry.id];
  if (!id) throw new Error(`No inspected artwork concept for source entry: ${entry.id}`);
  const primaryField = SELF_CARE_ARTWORK.has(id) ? "selfCare" : "plain";
  if (!entry[primaryField]?.trim()) throw new Error(`Missing artwork source field: ${entry.id}:${primaryField}`);
  const starts: Omit<ArtworkBeat, "endSeconds">[] = [{ artworkId: id, startSeconds: shot.startSeconds,
    sourceRef: `${entry.id}:${primaryField}`, rationale: "Source-entry concept bound to inspected original artwork or a distinct object vignette." }];
  for (const detail of DETAILS[entry.id] ?? []) {
    const field = entry[detail.field as "plain" | "selfCare"];
    if (!field || !DETAIL_SUBJECT[detail.id]!.test(field)) continue;
    const candidates = words.filter((word) => word.startSeconds >= shot.startSeconds + 5 &&
      word.endSeconds <= shot.endSeconds - (detail.minimumRemaining ?? 4) && detail.trigger.test(word.text.replace(/[^a-z]/gi, "")) &&
      // A generic “check” is insufficient: the same measured phrase must name
      // feet. Do not cue an inspection on an unrelated check earlier in speech.
      (!["care-foot-inspection", "care-laundry"].includes(detail.id) || DETAIL_SUBJECT[detail.id]!.test(words.filter((nearby) =>
        nearby.startSeconds >= word.startSeconds && nearby.endSeconds <= Math.min(shot.endSeconds, word.startSeconds + 3))
        .slice(0, 6).map((nearby) => nearby.text).join(" "))));
    const mention = candidates.find((word) => word.startSeconds - starts.at(-1)!.startSeconds >= 5);
    if (!mention) continue;
    starts.push({ artworkId: detail.id, startSeconds: mention.startSeconds,
      sourceRef: `${entry.id}:${detail.field}`, rationale: `Cutaway begins on the measured narration word “${mention.text}”.` });
  }
  return starts.map((beat, index) => ({ ...beat, endSeconds: starts[index + 1]?.startSeconds ?? shot.endSeconds }));
}

export function activeArtworkBeat(shot: DirectedShot, absoluteSeconds: number): ArtworkBeat | undefined {
  return shot.artworkBeats?.find((beat) => beat.startSeconds <= absoluteSeconds && absoluteSeconds < beat.endSeconds);
}

export function libraryDiversity(shots: DirectedShot[]) {
  const uses = shots.flatMap((shot) => (shot.artworkBeats ?? []).map((beat) => ({ entryId: shot.entryId, artworkId: beat.artworkId })));
  const counts = new Map<string, number>();
  for (const use of uses) counts.set(use.artworkId, (counts.get(use.artworkId) ?? 0) + 1);
  return { entries: shots.length, beats: uses.length, uniqueArtwork: counts.size,
    repeatedArtwork: [...counts].filter(([, count]) => count > 1).map(([artworkId, count]) => ({ artworkId, count })),
    adjacentRepeatedArtwork: uses.slice(1).filter((use, index) => use.artworkId === uses[index]!.artworkId), uses };
}
