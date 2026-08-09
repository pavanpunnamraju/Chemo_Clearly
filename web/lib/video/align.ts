// Aligns finished Gemini-TTS audio to the already-known narration script via
// Google Cloud Speech-to-Text word-level time offsets. This is alignment,
// not transcription — the exact script is already known (see narration.ts),
// STT just reports when each word was actually spoken. Replaces SSML
// <mark>-based timepointing entirely; decouples slide sync from whichever
// TTS voice/provider is in use.

export interface WordOffset {
  word: string;
  startSeconds: number;
}

// Speech-to-Text caps each speechContexts phrase at 100 chars — chunk the
// script into word-boundary pieces under that limit rather than sending it
// as a single (invalid) phrase.
const MAX_PHRASE_LENGTH = 100;

// Inline (non-GCS) audio content has a duration cap well under our typical
// ~3 minute narration — chunk into sub-60s pieces and use synchronous
// `recognize` per chunk instead of standing up a GCS bucket for
// longRunningRecognize. ponytail: fixed-size chunking, not silence-aware
// splitting; revisit if word-boundary artifacts show up at chunk seams.
const CHUNK_SECONDS = 55;

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
  return phrases;
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

  const { SpeechClient } = await import("@google-cloud/speech");
  const client = new SpeechClient();

  // Speech-to-Text wants raw LINEAR16 content, not a WAV container — strip
  // the 44-byte header written by tts.ts's pcmToWav.
  const pcm = wavAudioBuffer.subarray(44);
  const phrases = chunkIntoPhrases(script, MAX_PHRASE_LENGTH);

  const bytesPerSecond = sampleRateHertz * 2; // 16-bit mono
  const chunkBytes = CHUNK_SECONDS * bytesPerSecond;

  const words: WordOffset[] = [];
  let durationSeconds = 0;
  let offsetSeconds = 0;

  for (let start = 0; start < pcm.length; start += chunkBytes) {
    const end = Math.min(start + chunkBytes, pcm.length);
    const chunk = pcm.subarray(start, end);

    const [response] = await client.recognize({
      audio: { content: chunk.toString("base64") },
      config: {
        encoding: "LINEAR16",
        sampleRateHertz,
        languageCode: "en-US",
        enableWordTimeOffsets: true,
        // Exact script as a speech-context hint improves accuracy; not required.
        speechContexts: [{ phrases }],
      },
    });

    for (const result of response.results ?? []) {
      for (const w of result.alternatives?.[0]?.words ?? []) {
        const startSeconds = offsetSeconds + Number(w.startTime?.seconds ?? 0) + Number(w.startTime?.nanos ?? 0) / 1e9;
        const endSeconds = offsetSeconds + Number(w.endTime?.seconds ?? 0) + Number(w.endTime?.nanos ?? 0) / 1e9;
        words.push({ word: w.word ?? "", startSeconds });
        durationSeconds = Math.max(durationSeconds, endSeconds);
      }
    }

    offsetSeconds += (end - start) / bytesPerSecond;
  }

  return { words, durationSeconds };
}
