// Google Cloud TTS wrapper, generalized from the video-gen spike's
// scripts/generate-narration.mjs (verified real call: 414 chars billed,
// en-US-Neural2-C, 209,088 audio bytes — see docs/references/handoff.md).
// Same fail-fast-with-a-clear-message behavior: no silent stubbing.

export interface SynthesizeResult {
  audioBuffer: Buffer;
  charactersSent: number;
  voice: string;
}

export async function synthesizeNarration(script: string): Promise<SynthesizeResult> {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "Missing GOOGLE_APPLICATION_CREDENTIALS. Set it to the path of a GCP service-account " +
        "JSON key with Text-to-Speech access (see web/.env.local.example).",
    );
  }

  const { default: textToSpeech } = await import("@google-cloud/text-to-speech");
  const client = new textToSpeech.TextToSpeechClient();

  const voice = "en-US-Neural2-C";
  const [response] = await client.synthesizeSpeech({
    input: { text: script },
    voice: { languageCode: "en-US", name: voice, ssmlGender: "FEMALE" },
    audioConfig: { audioEncoding: "MP3" },
  });

  if (!response.audioContent) {
    throw new Error("Google Cloud TTS returned no audio content.");
  }

  return {
    audioBuffer: Buffer.from(response.audioContent as Uint8Array),
    charactersSent: script.length,
    voice,
  };
}
