// Google Cloud TTS wrapper, generalized from the video-gen spike's
// scripts/generate-narration.mjs (verified real call: 414 chars billed,
// en-US-Neural2-C, 209,088 audio bytes — see docs/references/handoff.md).
// Same fail-fast-with-a-clear-message behavior: no silent stubbing.
//
// Uses the v1beta1 client (not v1) because SSML mark timepointing —
// `enableTimePointing` / `response.timepoints` — is v1beta1-only. Those
// timepoints are what let the caller sync on-screen slide changes to the
// actual narration audio instead of a word-count estimate.

import type { NarrationTimepoint } from "./narration";

export interface SynthesizeResult {
  audioBuffer: Buffer;
  charactersSent: number;
  voice: string;
  timepoints: NarrationTimepoint[];
  durationSeconds: number;
}

export async function synthesizeNarration(ssml: string, plainScript: string): Promise<SynthesizeResult> {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      "Missing GOOGLE_APPLICATION_CREDENTIALS. Set it to the path of a GCP service-account " +
        "JSON key with Text-to-Speech access (see web/.env.local.example).",
    );
  }

  const { default: textToSpeech } = await import("@google-cloud/text-to-speech");
  const client = new textToSpeech.v1beta1.TextToSpeechClient();

  const voice = "en-US-Neural2-C";
  const [response] = await client.synthesizeSpeech({
    input: { ssml },
    voice: { languageCode: "en-US", name: voice, ssmlGender: "FEMALE" },
    audioConfig: { audioEncoding: "MP3" },
    // SSML_MARK = 1 (see SynthesizeSpeechRequest.TimepointType); passed as a
    // number since the enum isn't imported statically alongside the dynamic
    // `import("@google-cloud/text-to-speech")` above.
    enableTimePointing: [1],
  });

  if (!response.audioContent) {
    throw new Error("Google Cloud TTS returned no audio content.");
  }

  const audioBuffer = Buffer.from(response.audioContent as Uint8Array);
  const timepoints: NarrationTimepoint[] = (response.timepoints ?? []).map((t) => ({
    markName: t.markName ?? "",
    timeSeconds: t.timeSeconds ?? 0,
  }));

  const { parseMedia } = await import("@remotion/media-parser");
  const { slowDurationInSeconds } = await parseMedia({
    src: new Blob([audioBuffer], { type: "audio/mpeg" }),
    fields: { slowDurationInSeconds: true },
  });

  return {
    audioBuffer,
    charactersSent: plainScript.length,
    voice,
    timepoints,
    durationSeconds: slowDurationInSeconds,
  };
}
