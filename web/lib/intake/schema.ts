import { createHash } from "node:crypto";
import { z } from "zod";

// Phase 1 goal 2 — intake logic. Captures the personalization inputs: education
// level, content-depth preference, and voice tone. Video is the sole delivery
// format (no text-reading mode), so `depth` is a video-length/detail lever, not
// an alternate format — it maps to which content layer(s) narration draws from
// (`plain` vs `plain` + `detail`).
//
// 2026-08-10 scope amendment: patients no longer pick topics of interest — the
// video always covers the full regimen side-effect set. TOPIC_TAGS stays as the
// content tag taxonomy (still used to build the always-full tag set below and
// by content entries themselves); it's just no longer a patient-facing input.
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
  depthPreference: z.enum(DEPTH_PREFERENCES),
  voiceTone: z.enum(VOICE_TONES),
  /** Optional free-form follow-up questions from the post-intake chat (Phase 1 goal 5's source). */
  followUpQuestions: z.array(z.string()).optional(),
});

export type Intake = z.infer<typeof IntakeSchema>;

export interface PersonalizationFilter {
  regimenId: string;
  /** Always the full tag taxonomy — patients no longer filter by topic, video covers every side effect. */
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
  return {
    regimenId: intake.regimenId,
    // No patient topic selection anymore — always the full tag set, so
    // selection (lib/video/select.ts) includes every side effect.
    tags: [...TOPIC_TAGS],
    // Amount of information and language complexity are independent choices.
    includeDetail: intake.depthPreference === "detailed",
    voiceTone: intake.voiceTone,
    educationLevel: intake.educationLevel,
  };
}

/**
 * Deterministic cache key for a personalization filter. `tags` is excluded —
 * it's always the full TOPIC_TAGS set now (patients no longer pick topics),
 * so it no longer differentiates cache entries. Used to dedupe video
 * generation across patients/submissions that resolve to the same filter
 * (see `generated_videos.filter_hash`).
 *
 * 2026-08-10: dropped `tags` from the hash input (was dead weight once tags
 * stopped varying). Rows written under the old formula are left to orphan —
 * they just miss cache once and re-cache correctly under this formula.
 */
export function hashPersonalizationFilter(filter: PersonalizationFilter): string {
  const canonical = JSON.stringify({
    regimenId: filter.regimenId,
    includeDetail: filter.includeDetail,
    voiceTone: filter.voiceTone,
    educationLevel: filter.educationLevel,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
