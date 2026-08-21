// Types for the approved regimen content, per docs/content/schema.md.
// Loaded from docs/content/<regimen>.md — this app never edits those files
// (they're owned by the content pipeline / Dr. Reddy's review, per the
// design doc). This is a read-only consumer.

export type Tier = "emergency" | "call_team" | "self_care";

export const SECTION_IDS = [
  "overview",
  "timeline",
  "daily_life",
  "side_effects",
  "emergency",
  "fertility_intimacy",
  "practical_life",
  "patient_voices",
  "big_picture",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

// A single addressable unit of narratable content: either a whole
// section (overview, timeline, ...) or one entry inside `side_effects`.
export interface ContentEntry {
  /** Stable id used by the selection step and narration assembly, e.g. "overview" or "side_effects.nausea-and-vomiting" */
  id: string;
  sectionId: SectionId;
  /** Sub-entry name, e.g. "Nausea and vomiting" — undefined for section-level entries. */
  name?: string;
  tags: string[];
  tier?: Tier;
  plain: string;
  detail?: string;
  selfCare?: string;
  callTeamIf?: string;
  /** Alert archetype closing split-card fields (video_visual_system.md) —
   * structured duplicates of the entry's own `plain` wording, so
   * SlideVideo.tsx doesn't need to parse bold spans out of narration text. */
  call911?: string;
  callTeam?: string;
  source?: string;
  anecdotal: boolean;
}

export interface RegimenContent {
  regimenId: string;
  title: string;
  entries: ContentEntry[];
}
