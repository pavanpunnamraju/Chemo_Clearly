// Gemini-TTS narration synthesis — verified real call (both via AI Studio
// and Vertex AI): model `gemini-2.5-flash-preview-tts`, prebuilt "Kore"
// voice, natural-language style prompt for tone instead of manual SSML
// <prosody>. Replaces the old Google Cloud TTS v1beta1 client, which existed
// only because SSML mark timepointing needed v1beta1 — alignment-based sync
// (see lib/video/align.ts) no longer needs any TTS-side timing feature, so
// plain text + a style prompt is all this sends.
//
// Routed through Vertex AI (lib/gemini/client.ts), not the AI-Studio
// API-key path — AI Studio's free tier caps this model at 10 requests/day,
// which the pipeline hit during verification. Vertex bills against the GCP
// project's Cloud Billing account instead.

import { getGenAIClient } from "../gemini/client";

const MODEL = "gemini-2.5-flash-preview-tts";
const VOICE_NAME = "Kore";

// Subtle inflection differences per voiceTone (schema.ts), not caricatures.
const VOICE_TONE_STYLES: Record<string, string> = {
  neutral: "Say in a calm, clear, informative tone:",
  friendly: "Say in a warm, friendly, conversational tone:",
  hopeful: "Say in a warm, hopeful, reassuring tone:",
};

export interface SynthesizeResult {
  /** WAV container wrapping 16-bit LINEAR16 PCM, mono. */
  audioBuffer: Buffer;
  charactersSent: number;
  voice: string;
  durationSeconds: number;
  sampleRateHertz: number;
}

function pcmToWav(pcm: Buffer, sampleRateHertz: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRateHertz * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRateHertz, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export async function synthesizeNarration(script: string, voiceTone: string): Promise<SynthesizeResult> {
  const ai = await getGenAIClient();
  if (!ai) {
    throw new Error(
      "Missing GOOGLE_CLOUD_PROJECT. Gemini-TTS runs via Vertex AI, using the GCP project id " +
        "and the existing GOOGLE_APPLICATION_CREDENTIALS service account (see web/.env.local.example).",
    );
  }

  const { Modality } = await import("@google/genai");
  const style = VOICE_TONE_STYLES[voiceTone] ?? VOICE_TONE_STYLES.neutral;
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: `${style} ${script}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } } },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part?.inlineData?.data) {
    throw new Error("Gemini-TTS returned no audio content.");
  }

  const rateMatch = /rate=(\d+)/.exec(part.inlineData.mimeType ?? "");
  const sampleRateHertz = rateMatch ? Number(rateMatch[1]) : 24000;
  const pcm = Buffer.from(part.inlineData.data, "base64");
  const audioBuffer = pcmToWav(pcm, sampleRateHertz);
  const durationSeconds = pcm.length / (sampleRateHertz * 2); // 16-bit mono: 2 bytes/sample

  return {
    audioBuffer,
    charactersSent: script.length,
    voice: VOICE_NAME,
    durationSeconds,
    sampleRateHertz,
  };
}
