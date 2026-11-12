import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RewrittenChunk } from "./narration";
import { readLinear16Wav } from "./align";
import { pcmToWav, silencePcm, speechSurface, synthesizeNarration, type SynthesizeResult } from "./tts";
import { reviewSpokenNarration, speechReviewPassed, type SpeechReview } from "./speech-fidelity";
import { audioCachePath, digest, implementationDigest, objectDigest, readStage, saveStage } from "./stage-cache";
import { validateSegmentEvidence } from "./speech-evidence";
import { speechReviewFailure } from "./speech-diagnostics";

const MAX_SEGMENT_WORDS = 180;
const MAX_ATTEMPTS = 3;
const JOIN_MILLISECONDS = 180;

export interface SpeechSegment {
  entryId: string;
  indexWithinEntry: number;
  script: string;
}
export interface SegmentedSpeechServices {
  synthesize(script: string, voiceTone: string): Promise<SynthesizeResult>;
  review(audio: Buffer, script: string): Promise<SpeechReview>;
  /** Explicit identity keeps injected/custom implementations out of production caches. */
  cacheIdentity: string;
}
export interface SegmentedSpeechEvidence extends SpeechSegment {
  segmentIndex: number;
  attempt: number;
  audioKey: string;
  reviewKey: string;
  audioDigest: string;
  pcmDigest: string;
  pcmBytes: number;
  startSeconds: number;
  durationSeconds: number;
  sampleRateHertz: number;
  voice: string;
  paddingAfterMs: number;
  implementationVersion: string;
  synthesisScript: string;
  report: SpeechReview;
}
export interface SegmentedSpeechResult {
  audio: SynthesizeResult;
  review: SpeechReview;
  segments: SegmentedSpeechEvidence[];
  assemblyKey: string;
}

/** Preserve narration verbatim apart from whitespace, splitting only at sentences. */
export function splitSpeechSegments(chunks: RewrittenChunk[]): SpeechSegment[] {
  if (!chunks.length) throw new Error("Segmented speech requires narration chunks.");
  const ids = new Set<string>();
  const segments: SpeechSegment[] = [];
  const count = (text: string) => text.split(/\s+/).filter(Boolean).length;
  for (const chunk of chunks) {
    if (!chunk.entryId || ids.has(chunk.entryId)) throw new Error(`Invalid or duplicate narration entry: ${chunk.entryId}`);
    ids.add(chunk.entryId);
    const text = chunk.text.trim();
    if (!text) throw new Error(`Empty narration entry: ${chunk.entryId}`);
    if (count(text) <= MAX_SEGMENT_WORDS) {
      segments.push({ entryId: chunk.entryId, indexWithinEntry: 0, script: text });
      continue;
    }
    const sentences = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)].map((part) => part.segment.trim()).filter(Boolean);
    let group: string[] = [];
    let words = 0;
    let indexWithinEntry = 0;
    const flush = () => {
      if (group.length) segments.push({ entryId: chunk.entryId, indexWithinEntry: indexWithinEntry++, script: group.join(" ") });
      group = [];
      words = 0;
    };
    for (const sentence of sentences) {
      const sentenceWords = count(sentence);
      if (sentenceWords > MAX_SEGMENT_WORDS) throw new Error(`Narration entry ${chunk.entryId} contains a sentence longer than ${MAX_SEGMENT_WORDS} words; revise sentence boundaries before speech generation.`);
      if (words + sentenceWords > MAX_SEGMENT_WORDS) flush();
      group.push(sentence);
      words += sentenceWords;
    }
    flush();
    const reconstructed = segments.filter((segment) => segment.entryId === chunk.entryId).map((segment) => segment.script).join(" ");
    if (reconstructed !== text) throw new Error(`Sentence segmentation changed narration text: ${chunk.entryId}`);
  }
  return segments;
}

type AudioMeta = Omit<SynthesizeResult, "audioBuffer"> & { sha256: string };
interface AttemptFailure { phase: "synthesis" | "review"; message: string }

function validatedPcm(audio: Buffer, metadata: AudioMeta): Buffer {
  if (digest(audio) !== metadata.sha256) throw new Error("Segment audio checksum mismatch.");
  const pcm = readLinear16Wav(audio, metadata.sampleRateHertz);
  if (!Number.isFinite(metadata.durationSeconds) || Math.abs(metadata.durationSeconds - pcm.length / (metadata.sampleRateHertz * 2)) > 0.001 ||
    !Number.isFinite(metadata.charactersSent) || metadata.charactersSent < 0 || !metadata.voice) {
    throw new Error("Segment audio metadata does not match its actual waveform.");
  }
  return pcm;
}

/**
 * Bounded fallback for sections that failed speech review. Every accepted segment
 * has an exact transcript check and immutable audio hash. Joining inserts silence
 * only; the aggregate review is explicitly derived from individual audio reviews.
 */
export async function synthesizeReviewedSegments(
  chunks: RewrittenChunk[],
  voiceTone: string,
  options: { cacheRoot: string; onProgress?: (message: string) => void; services?: SegmentedSpeechServices },
): Promise<SegmentedSpeechResult> {
  const planned = splitSpeechSegments(chunks);
  const progress = options.onProgress ?? (() => {});
  const services = options.services ?? { synthesize: synthesizeNarration, review: reviewSpokenNarration, cacheIdentity: "configured-gemini-speech" };
  if (!services.cacheIdentity.trim()) throw new Error("Injected speech services need a stable cache identity.");
  const implementation = implementationDigest(["segmented-speech.ts", "tts.ts", "speech-fidelity.ts", "speech-evidence.ts", "timing.ts", "stage-cache.ts", "align.ts"]);
  const reviewImplementation = implementationDigest(["speech-fidelity.ts", "timing.ts", "stage-cache.ts"]);
  const pcmParts: Buffer[] = [];
  const segments: SegmentedSpeechEvidence[] = [];
  let sampleRate: number | undefined;
  let voice: string | undefined;
  let cumulativeSamples = 0;
  let charactersSent = 0;
  for (const [segmentIndex, segment] of planned.entries()) {
    // Orthography only: standalone AC is two letters, not a spoken word. The
    // source/reference/captions remain intact, and no medicine alias is applied.
    const synthesisScript = speechSurface(segment.script).replace(/\bAC\b/g, "A C");
    const segmentKey = objectDigest({ mode: "segmented-speech", script: segment.script, synthesisScript, voiceTone, implementation, service: services.cacheIdentity });
    let accepted: { metadata: AudioMeta; pcm: Buffer; review: SpeechReview; audioKey: string; reviewKey: string; attempt: number } | undefined;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const audioKey = objectDigest({ segmentKey, attempt });
      const audioFile = audioCachePath(options.cacheRoot, audioKey);
      const failure = readStage<AttemptFailure>(options.cacheRoot, "segmented-attempt-error", audioKey);
      if (failure) {
        progress(`${segment.entryId} segment ${segment.indexWithinEntry + 1}: cached ${failure.phase} failure, attempt ${attempt + 1}: ${failure.message}`);
        continue;
      }
      let metadata = readStage<AudioMeta>(options.cacheRoot, "segmented-audio-attempt", audioKey);
      let audio: Buffer | undefined = metadata && existsSync(audioFile) ? readFileSync(audioFile) : undefined;
      if (audio && metadata) {
        try { validatedPcm(audio, metadata); }
        catch { audio = undefined; metadata = null; }
      }
      if (!audio || !metadata) {
        progress(`${segment.entryId} segment ${segment.indexWithinEntry + 1}/${planned.filter((item) => item.entryId === segment.entryId).length}: synthesizing attempt ${attempt + 1}/${MAX_ATTEMPTS}`);
        try {
          const result = await services.synthesize(synthesisScript, voiceTone);
          audio = result.audioBuffer;
          const { audioBuffer: _, ...rest } = result;
          metadata = { ...rest, sha256: digest(audio) };
          validatedPcm(audio, metadata);
          mkdirSync(path.dirname(audioFile), { recursive: true });
          writeFileSync(audioFile, audio);
          saveStage(options.cacheRoot, "segmented-audio-attempt", audioKey, metadata);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          saveStage(options.cacheRoot, "segmented-attempt-error", audioKey, { phase: "synthesis", message });
          progress(`${segment.entryId} segment ${segment.indexWithinEntry + 1}: synthesis failed: ${message}`);
          continue;
        }
      }
      const reviewKey = objectDigest({ audio: metadata.sha256, script: segment.script, reviewImplementation, service: services.cacheIdentity });
      let review = readStage<SpeechReview>(options.cacheRoot, "segmented-speech-review", reviewKey);
      if (!review) {
        progress(`${segment.entryId} segment ${segment.indexWithinEntry + 1}: checking the actual spoken words`);
        try {
          review = await services.review(audio, segment.script);
          saveStage(options.cacheRoot, "segmented-speech-review", reviewKey, review);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          saveStage(options.cacheRoot, "segmented-attempt-error", audioKey, { phase: "review", message });
          progress(`${segment.entryId} segment ${segment.indexWithinEntry + 1}: speech review failed: ${message}`);
          continue;
        }
      }
      if (!speechReviewPassed(review, segment.script)) {
        progress(`${segment.entryId} segment ${segment.indexWithinEntry + 1}: rejected speech attempt ${attempt + 1}: ${speechReviewFailure(review, segment.script) || "Actual transcript did not pass the exact speech check."}`);
        continue;
      }
      accepted = { metadata, pcm: validatedPcm(audio, metadata), review, audioKey, reviewKey, attempt: attempt + 1 };
      break;
    }
    if (!accepted) throw new Error(`Segmented speech fidelity failed after ${MAX_ATTEMPTS} attempts: ${segment.entryId}, segment ${segment.indexWithinEntry + 1}. Rejected audio, reviews and failures are retained in the cache.`);
    if (sampleRate !== undefined && sampleRate !== accepted.metadata.sampleRateHertz) throw new Error("Accepted speech segments have different sample rates; no resampling or unreviewed join was performed.");
    if (voice !== undefined && voice !== accepted.metadata.voice) throw new Error("Accepted speech segments have different voices; refusing an inconsistent narration.");
    sampleRate = accepted.metadata.sampleRateHertz;
    voice = accepted.metadata.voice;
    if (pcmParts.length) {
      const gap = silencePcm(JOIN_MILLISECONDS, sampleRate);
      pcmParts.push(gap);
      cumulativeSamples += gap.length / 2;
    }
    segments.push({ ...segment, segmentIndex, attempt: accepted.attempt, audioKey: accepted.audioKey, reviewKey: accepted.reviewKey,
      audioDigest: accepted.metadata.sha256, pcmDigest: digest(accepted.pcm), pcmBytes: accepted.pcm.length,
      startSeconds: cumulativeSamples / sampleRate, durationSeconds: accepted.metadata.durationSeconds,
      sampleRateHertz: sampleRate, voice, paddingAfterMs: segmentIndex < planned.length - 1 ? JOIN_MILLISECONDS : 0,
      implementationVersion: implementation, synthesisScript, report: accepted.review });
    pcmParts.push(accepted.pcm);
    cumulativeSamples += accepted.pcm.length / 2;
    charactersSent += accepted.metadata.charactersSent;
    progress(`${segment.entryId} segment ${segment.indexWithinEntry + 1}: accepted after exact speech review`);
  }
  const pcm = Buffer.concat(pcmParts);
  const review: SpeechReview = {
    transcript: segments.map((segment) => segment.report.transcript.trim()).join(" "),
    faithful: segments.every((segment) => segment.report.faithful),
    uncertain: segments.some((segment) => segment.report.uncertain),
    discrepancies: [],
    notes: `Aggregate of ${segments.length} individually reviewed speech segments, joined with ${JOIN_MILLISECONDS}ms digital silence. Their original PCM bytes are preserved. Automated speech review only; human listening and clinical approval remain pending.`,
  };
  const completeScript = chunks.map((chunk) => chunk.text.trim()).join(" ");
  if (!speechReviewPassed(review, completeScript)) throw new Error("The joined speech transcript failed the final complete-script check.");
  validateSegmentEvidence(pcm, completeScript, sampleRate!, segments);
  const audio: SynthesizeResult = { audioBuffer: pcmToWav(pcm, sampleRate!), charactersSent, voice: voice!,
    sampleRateHertz: sampleRate!, durationSeconds: pcm.length / (sampleRate! * 2) };
  const assemblyKey = objectDigest({ implementation, completeScript, voiceTone, segments: segments.map((segment) => segment.audioDigest) });
  saveStage(options.cacheRoot, "segmented-speech-assembly", assemblyKey, {
    implementation, reviewImplementation, audioDigest: digest(audio.audioBuffer), pcmDigest: digest(pcm),
    joinMilliseconds: JOIN_MILLISECONDS, segments, review,
  });
  return { audio, review, segments, assemblyKey };
}
