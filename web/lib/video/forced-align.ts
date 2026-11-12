import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { readLinear16Wav, type WordOffset } from "./align";
import { assertReliableTiming, reconcileNarrationTiming, type TimingChunk, type DirectedTiming } from "./timing";

export const FORCED_ALIGNMENT_VERSION = "wav2vec2-960h-ctc-v1";
export const ALIGNMENT_MODEL_FILE = "wav2vec2_fairseq_base_ls960_asr_ls960.pth";
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const alignmentWebRoot = path.resolve(moduleDirectory, "../..");

export interface AcousticWordOffset extends WordOffset {
  endSeconds: number;
  /** No calibrated ASR confidence is produced by forced alignment. */
  confidence: null;
  acousticScore: number;
  minimumCharacterScore: number;
  spokenForm: string;
  timingMethod: "ctc-forced";
}
export interface ForcedAlignmentResult {
  method: typeof FORCED_ALIGNMENT_VERSION;
  durationSeconds: number;
  words: AcousticWordOffset[];
  diagnostics: {
    sourceTokenCount: number;
    alignedTokenCount: number;
    timingResolutionMs: number;
    flaggedSpans: (AcousticWordOffset & { index: number })[];
    independentSpeechVerificationRequired: true;
    greedyTranscript: string;
    spokenForms: string[];
  };
}

/**
 * CTC aligns the provided script to acoustic frames, without pretending that
 * forcing those characters proves they were spoken. Callers MUST independently
 * verify speech fidelity and retain flagged spans in the review artifact.
 */
export async function forceAlignNarration(
  audio: Buffer,
  chunks: TimingChunk[],
  sampleRate: number,
  options: { pythonPath?: string; modelDirectory?: string } = {},
): Promise<{ timing: DirectedTiming; alignment: ForcedAlignmentResult }> {
  const pcm = readLinear16Wav(audio, sampleRate);
  if (pcm.every((byte) => byte === 0)) throw new Error("Audio is digital silence; no speech can be aligned.");
  const pythonPath = options.pythonPath ?? process.env.CHEMO_ALIGNMENT_PYTHON ?? path.join(alignmentWebRoot, ".video-cache/alignment-venv/bin/python");
  const modelDirectory = options.modelDirectory ?? process.env.CHEMO_ALIGNMENT_MODELS ?? path.join(alignmentWebRoot, ".video-cache/torch");
  if (!existsSync(pythonPath) || !existsSync(path.join(modelDirectory, "hub/checkpoints", ALIGNMENT_MODEL_FILE))) {
    throw new Error("Local acoustic alignment is not set up. Run node --import tsx lib/video/setup-alignment.ts from web/, or configure CHEMO_ALIGNMENT_PYTHON and CHEMO_ALIGNMENT_MODELS. No timing estimates were substituted.");
  }
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "chemo-forced-alignment-"));
  try {
    const audioPath = path.join(tempDirectory, "audio.wav");
    const scriptPath = path.join(tempDirectory, "script.json");
    const outputPath = path.join(tempDirectory, "alignment.json");
    const script = chunks.map((chunk) => chunk.text.trim()).join(" ");
    await Promise.all([
      writeFile(audioPath, audio),
      writeFile(scriptPath, JSON.stringify({ script })),
    ]);
    await promisify(execFile)(pythonPath, [path.join(moduleDirectory, "forced-align.py"),
      "--audio", audioPath, "--script-json", scriptPath, "--model-directory", modelDirectory, "--output", outputPath,
    ], { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 });
    const alignment = JSON.parse(await readFile(outputPath, "utf8")) as ForcedAlignmentResult;
    if (alignment.method !== FORCED_ALIGNMENT_VERSION || !Array.isArray(alignment.words) ||
      alignment.diagnostics?.independentSpeechVerificationRequired !== true ||
      Math.abs(alignment.durationSeconds - pcm.length / (sampleRate * 2)) > 0.001 ||
      alignment.words.some((word) => word.timingMethod !== "ctc-forced" || word.confidence !== null ||
        !Number.isFinite(word.acousticScore) || !Number.isFinite(word.minimumCharacterScore))) {
      throw new Error("Acoustic alignment output failed structural validation.");
    }
    const timing = reconcileNarrationTiming(chunks, alignment.words, alignment.durationSeconds);
    assertReliableTiming(timing);
    return { timing, alignment };
  } finally {
    // Only files in this function's fresh temporary directory are removed.
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
