import { createHash } from "node:crypto";
import { z } from "zod";

// Phase 1 goal 2 — intake logic. Captures the three personalization inputs the
// design doc specifies: education level, topics of interest, and content-depth
// preference. Video is the sole delivery format (no text-reading mode), so
// `depth` is a video-length/detail lever, not an alternate format — it maps to
// which content layer(s) narration draws from (`plain` vs `plain` + `detail`).
//
// Tag values must stay in sync with the shared taxonomy in
// docs/content/schema.md ("Topic tag taxonomy").
export const TOPIC_TAGS = [
  "what-it-is",
  "schedule",
  "how-it-feels-daily",
  "nausea-appetite",
  "hair-skin-appearance",
  "infection-risk",
  "bleeding-bruising",
  "fatigue",
  "nerve-tingling",
  "aches-pain",
  "mouth-digestion",
  "heart",
  "urinary",
  "fertility-intimacy",
  "emergency-signs",
  "work-daily-life",
  "household-safety",
  "emotional-support",
  "long-term-outlook",
] as const;

export const EDUCATION_LEVELS = ["basic", "some_college", "advanced"] as const;
export const DEPTH_PREFERENCES = ["short", "detailed"] as const;
export const VOICE_TONES = ["neutral", "friendly", "hopeful"] as const;

export const IntakeSchema = z.object({
  regimenId: z.string().min(1),
  educationLevel: z.enum(EDUCATION_LEVELS),
  topics: z.array(z.enum(TOPIC_TAGS)).min(1, "Pick at least one topic of interest"),
  depthPreference: z.enum(DEPTH_PREFERENCES),
  voiceTone: z.enum(VOICE_TONES),
  /** Optional free-form follow-up questions from the post-intake chat (Phase 1 goal 5's source). */
  followUpQuestions: z.array(z.string()).optional(),
});

export type Intake = z.infer<typeof IntakeSchema>;

export interface PersonalizationFilter {
  regimenId: string;
  /** Topic tags to include, always unioned with emergency-signs (never filterable out). */
  tags: string[];
  /** Whether narration should draw from `detail` text in addition to `plain`. */
  includeDetail: boolean;
  voiceTone: string;
  /** Drives narration reading-level wording (lib/video/rewrite.ts), separate from includeDetail's amount-of-content lever. */
  educationLevel: string;
}

/**
 * Pure transform: intake -> the filter spec the video-gen selection step consumes.
 * No I/O, no side effects — this is the "working intake logic" itself, independent
 * of how it's captured (API route, CLI, future UI form) or persisted.
 */
export function toPersonalizationFilter(intake: Intake): PersonalizationFilter {
  const tags = new Set(intake.topics);
  // Emergency-signs content is never patient-filterable — it's always shown,
  // per the design doc's "emergency" section being pulled out and unambiguous.
  tags.add("emergency-signs");

  return {
    regimenId: intake.regimenId,
    tags: [...tags],
    // "basic" education level gets plain-language only; some_college/advanced
    // get detail too if the patient asked for the detailed depth preference.
    // Short-depth patients always get plain-only regardless of education level.
    includeDetail: intake.depthPreference === "detailed" && intake.educationLevel !== "basic",
    voiceTone: intake.voiceTone,
    educationLevel: intake.educationLevel,
  };
}

/**
 * Deterministic cache key for a personalization filter — same inputs always
 * produce the same hash regardless of tag ordering. Used to dedupe video
 * generation across patients/submissions that resolve to the same filter
 * (see `generated_videos.filter_hash`).
 */
export function hashPersonalizationFilter(filter: PersonalizationFilter): string {
  const canonical = JSON.stringify({
    regimenId: filter.regimenId,
    tags: [...filter.tags].sort(),
    includeDetail: filter.includeDetail,
    voiceTone: filter.voiceTone,
    educationLevel: filter.educationLevel,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
