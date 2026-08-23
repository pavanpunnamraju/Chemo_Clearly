import { createHash } from "node:crypto";
import { SECTION_IDS, type ContentEntry } from "../content/types";
import type { PersonalizationFilter } from "../intake/schema";
import { NARRATED_SECTIONS } from "./select";
import { rewriteNarration, type RewrittenChunk } from "./rewrite";
import { buildNarrationPlanFromChunks } from "./narration";
import { synthesizeNarration, silencePcm, pcmToWav, type SynthesizeResult } from "./tts";
import { alignAudioToScript, type WordOffset } from "./align";

// Phase 2a goal #13: splits the rewrite/TTS/alignment pipeline (previously
// one all-or-nothing call per whole script) into one call per narrated
// section, so editing content in one section doesn't force a full
// non-deterministic re-rewrite + re-TTS + re-align of everything else. See
// docs/references/handoff.md for the resolved design decisions.
//
// Section join gets a short silence pad, not a hard concat — cheap insurance
// against a splice artifact and a natural beat between topics. A spike
// (2 real Gemini-TTS clips concatenated, checked for an amplitude jump at
// the boundary vs. typical in-speech jumps) found no artifact either way,
// but the pad costs nothing and sections are a natural pause point regardless.
const SILENCE_PAD_MS = 400;

export interface SectionGroup {
  sectionId: string;
  entries: ContentEntry[];
}

/**
 * Buckets entries into narrated sections in canonical `SECTION_IDS` order,
 * not the order `entries` was given in. The agentic selection step
 * (select.ts) only guarantees coverage, not strict section grouping — its
 * prompt asks Gemini to order "roughly" by section, which isn't a promise
 * entries from the same section arrive contiguously. Bucketing by canonical
 * order matches what the deterministic fallback already produces, so
 * section-level caching has a stable, well-defined unit to hash regardless
 * of which selection path ran.
 */
export function groupEntriesBySection(entries: ContentEntry[]): SectionGroup[] {
  const bySection = new Map<string, ContentEntry[]>();
  for (const entry of entries) {
    if (!bySection.has(entry.sectionId)) bySection.set(entry.sectionId, []);
    bySection.get(entry.sectionId)!.push(entry);
  }
  const groups: SectionGroup[] = [];
  for (const sectionId of SECTION_IDS) {
    if (!NARRATED_SECTIONS.has(sectionId)) continue;
    const sectionEntries = bySection.get(sectionId);
    if (sectionEntries && sectionEntries.length > 0) groups.push({ sectionId, entries: sectionEntries });
  }
  return groups;
}

/** Staleness key for one section's cached pipeline output: section id + entry ids + entry source text. */
export function hashSection(sectionId: string, entries: ContentEntry[]): string {
  const canonical = JSON.stringify({
    sectionId,
    entries: entries.map((e) => ({ id: e.id, plain: e.plain, detail: e.detail ?? null })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface SectionPipelineOutput {
  sectionId: string;
  hash: string;
  chunks: RewrittenChunk[];
  tts: Omit<SynthesizeResult, "audioBuffer">;
  audioBuffer: Buffer;
  /** Word timestamps local to this section's own audio (0-based) — stitchSections offsets them. */
  words: WordOffset[];
  durationSeconds: number;
}

/** Runs rewrite -> TTS -> alignment for one section's entries. No caching here — callers own that. */
export async function runSectionPipeline(
  sectionId: string,
  entries: ContentEntry[],
  filter: PersonalizationFilter,
  voiceTone: string,
): Promise<SectionPipelineOutput> {
  const hash = hashSection(sectionId, entries);
  const rewrite = await rewriteNarration(entries, filter);
  const script = buildNarrationPlanFromChunks(rewrite.chunks, entries).script;

  const { audioBuffer, ...tts } = await synthesizeNarration(script, voiceTone);
  const { words, durationSeconds } = await alignAudioToScript(audioBuffer, script, tts.sampleRateHertz);

  return { sectionId, hash, chunks: rewrite.chunks, tts, audioBuffer, words, durationSeconds };
}

export interface StitchedPipelineResult {
  chunks: RewrittenChunk[];
  audioBuffer: Buffer;
  words: WordOffset[];
  durationSeconds: number;
  sampleRateHertz: number;
}

/**
 * Combines per-section pipeline outputs into the single continuous
 * chunks/audio/words shape `buildNarrationPlanFromChunks`/`applyTimepoints`
 * already expect — those two functions are unchanged; this is purely the
 * orchestration layer above them.
 */
export function stitchSections(sections: SectionPipelineOutput[]): StitchedPipelineResult {
  if (sections.length === 0) throw new Error("stitchSections: no sections to stitch.");

  const sampleRateHertz = sections[0]!.tts.sampleRateHertz;
  for (const section of sections) {
    if (section.tts.sampleRateHertz !== sampleRateHertz) {
      throw new Error(
        `stitchSections: sample rate mismatch (${section.sectionId} is ${section.tts.sampleRateHertz}Hz, expected ${sampleRateHertz}Hz) — TTS output isn't directly concatenable.`,
      );
    }
  }

  const pad = silencePcm(SILENCE_PAD_MS, sampleRateHertz);
  const padSeconds = SILENCE_PAD_MS / 1000;

  const chunks: RewrittenChunk[] = [];
  const words: WordOffset[] = [];
  const pcmParts: Buffer[] = [];
  let cumulativeSeconds = 0;

  sections.forEach((section, i) => {
    chunks.push(...section.chunks);
    for (const w of section.words) words.push({ word: w.word, startSeconds: w.startSeconds + cumulativeSeconds });
    // Strip each section's own WAV header (tts.ts's pcmToWav) before concatenating raw PCM.
    pcmParts.push(section.audioBuffer.subarray(44));
    cumulativeSeconds += section.durationSeconds;

    if (i < sections.length - 1) {
      pcmParts.push(pad);
      cumulativeSeconds += padSeconds;
    }
  });

  return {
    chunks,
    audioBuffer: pcmToWav(Buffer.concat(pcmParts), sampleRateHertz),
    words,
    durationSeconds: cumulativeSeconds,
    sampleRateHertz,
  };
}
