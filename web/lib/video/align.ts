// Aligns finished Gemini-TTS audio to the already-known narration script via
// Google Cloud Speech-to-Text word-level time offsets. This is alignment,
// not transcription — the exact script is already known (see narration.ts),
// STT just reports when each word was actually spoken. Replaces SSML
// <mark>-based timepointing entirely; decouples slide sync from whichever
// TTS voice/provider is in use.

export interface WordOffset {
  word: string;
  startSeconds: number;
  /** Absent only in legacy caches. Strict directed timing rejects those caches. */
  endSeconds?: number;
  confidence?: number | null;
  chunkIndex?: number;
}

// Speech-to-Text caps each speechContexts phrase at 100 chars — chunk the
// script into word-boundary pieces under that limit rather than sending it
// as a single (invalid) phrase.
const MAX_PHRASE_LENGTH = 100;

// Keep synchronous requests below 60s, seeking a quiet boundary and including
// context on both sides so a boundary word is not cut out of recognition.
const CHUNK_SECONDS = 55;
const CONTEXT_SECONDS = 0.5;

export const ALIGNMENT_VERSION = "speech-ends-silence-context-v2";

/** Parse RIFF chunks rather than assuming every WAV has a 44-byte header. */
export function readLinear16Wav(wav: Buffer, expectedRate: number): Buffer {
  if (wav.length < 12 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Alignment requires a valid PCM WAV container.");
  }
  let validFormat = false;
  let pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString("ascii", offset, offset + 4);
    const length = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > wav.length) throw new Error("Truncated WAV chunk.");
    if (id === "fmt ") {
      validFormat = length >= 16 && wav.readUInt16LE(start) === 1 &&
        wav.readUInt16LE(start + 2) === 1 && wav.readUInt32LE(start + 4) === expectedRate &&
        wav.readUInt16LE(start + 14) === 16;
    } else if (id === "data") {
      pcm = wav.subarray(start, start + length);
    }
    offset = start + length + (length % 2);
  }
  if (!validFormat || !pcm?.length || pcm.length % 2) {
    throw new Error("Alignment requires nonempty 16-bit mono PCM at the requested sample rate.");
  }
  return pcm;
}

export interface RecognitionChunk {
  startSample: number;
  endSample: number;
  coreStartSample: number;
  coreEndSample: number;
}

export function recognitionChunks(pcm: Buffer, sampleRate: number): RecognitionChunk[] {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0 || pcm.length % 2) throw new Error("Invalid PCM sample rate or length.");
  const sampleCount = pcm.length / 2;
  const context = Math.round(CONTEXT_SECONDS * sampleRate);
  const coreLimit = Math.floor((CHUNK_SECONDS - 2 * CONTEXT_SECONDS) * sampleRate);
  const window = Math.max(1, Math.round(0.08 * sampleRate));
  const chunks: RecognitionChunk[] = [];
  for (let coreStart = 0; coreStart < sampleCount;) {
    let coreEnd = Math.min(sampleCount, coreStart + coreLimit);
    if (coreEnd < sampleCount) {
      let quietestEnergy = Infinity;
      let quietestEnd = coreEnd;
      // Search the last three seconds; prefer an 80ms quiet region.
      for (let candidate = Math.max(coreStart + window, coreEnd - 3 * sampleRate); candidate <= coreEnd; candidate += window) {
        let energy = 0;
        for (let i = candidate - window; i < candidate; i += 8) energy += pcm.readInt16LE(i * 2) ** 2;
        if (energy <= quietestEnergy) {
          quietestEnergy = energy;
          quietestEnd = candidate - Math.floor(window / 2);
        }
      }
      coreEnd = quietestEnd;
    }
    chunks.push({ startSample: Math.max(0, coreStart - context), endSample: Math.min(sampleCount, coreEnd + context), coreStartSample: coreStart, coreEndSample: coreEnd });
    coreStart = coreEnd;
  }
  return chunks;
}

/** Context appears in both neighboring calls. Own a word by its midpoint. */
export function wordsOwnedByChunk(words: WordOffset[], chunk: RecognitionChunk, sampleRate: number): WordOffset[] {
  const start = chunk.coreStartSample / sampleRate;
  const end = chunk.coreEndSample / sampleRate;
  return words.filter((word) => {
    const midpoint = (word.startSeconds + (word.endSeconds ?? word.startSeconds)) / 2;
    return midpoint >= start && midpoint < end;
  });
}

function chunkIntoPhrases(script: string, maxLength: number): string[] {
  const words = script.split(/\s+/).filter(Boolean);
  const phrases: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength) {
      if (current) phrases.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) phrases.push(current);
  // Individual technical words are useful hints even when a drug is surrounded
  // by a long clause. Context alone previously misrecognized drug names.
  const technicalTerms = words.map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9-]+$/gi, ""))
    .filter((word) => word.length >= 8 || /^[A-Z][A-Z-]+$/.test(word));
  return [...new Set([...phrases, ...technicalTerms])].filter((phrase) => phrase.length <= maxLength);
}

export async function alignAudioToScript(
  wavAudioBuffer: Buffer,
  script: string,
  sampleRateHertz: number,
): Promise<{ words: WordOffset[]; durationSeconds: number }> {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "Missing GOOGLE_APPLICATION_CREDENTIALS. Set it to the path of a GCP service-account " +
        "JSON key with Cloud Speech-to-Text access (see web/.env.local.example).",
    );
  }

  const pcm = readLinear16Wav(wavAudioBuffer, sampleRateHertz);
  const phrases = chunkIntoPhrases(script, MAX_PHRASE_LENGTH);

  const bytesPerSecond = sampleRateHertz * 2; // 16-bit mono
  const words: WordOffset[] = [];
  const durationSeconds = pcm.length / bytesPerSecond;
  const chunks = recognitionChunks(pcm, sampleRateHertz);
  const { SpeechClient } = await import("@google-cloud/speech");
  const client = new SpeechClient();
  try {
    for (const [chunkIndex, bounds] of chunks.entries()) {
      const chunk = pcm.subarray(bounds.startSample * 2, bounds.endSample * 2);
      const offsetSeconds = bounds.startSample / sampleRateHertz;

      const [response] = await client.recognize({
        audio: { content: chunk.toString("base64") },
        config: {
          encoding: "LINEAR16",
          sampleRateHertz,
          languageCode: "en-US",
          enableWordTimeOffsets: true,
          enableWordConfidence: true,
          speechContexts: [{ phrases, boost: 10 }],
        },
      });

      const chunkWords: WordOffset[] = [];
      for (const result of response.results ?? []) {
        for (const w of result.alternatives?.[0]?.words ?? []) {
          const startSeconds = offsetSeconds + Number(w.startTime?.seconds ?? 0) + Number(w.startTime?.nanos ?? 0) / 1e9;
          const endSeconds = offsetSeconds + Number(w.endTime?.seconds ?? 0) + Number(w.endTime?.nanos ?? 0) / 1e9;
          chunkWords.push({ word: w.word ?? "", startSeconds, endSeconds, confidence: w.confidence ?? result.alternatives?.[0]?.confidence ?? null, chunkIndex });
        }
      }

      words.push(...wordsOwnedByChunk(chunkWords, bounds, sampleRateHertz));
    }
  } finally {
    await client.close();
  }
  return { words, durationSeconds };
}
