// Spike script: sends the curated narration text (src/content/rchop-excerpt.ts) to Google
// Cloud Text-to-Speech and saves the resulting audio to out/audio/narration.mp3, plus writes
// out/audio/narration.meta.json with the response metadata (audio format, duration estimate,
// voice used) referenced in the handoff report.
//
// Requires GOOGLE_APPLICATION_CREDENTIALS (path to a GCP service-account JSON key) to be set
// in the environment, or a .env.local file in this directory with that var. See
// video-test/README-spike.md for setup steps.

import "dotenv/config";
import { config as loadEnvLocal } from "dotenv";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvLocal({ path: path.join(__dirname, "..", ".env.local") });

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "\nMissing GOOGLE_APPLICATION_CREDENTIALS.\n" +
        "Set it to the path of a GCP service-account JSON key with Text-to-Speech access,\n" +
        "either as an env var or in video-test/.env.local (see README-spike.md).\n",
    );
    process.exitCode = 1;
    return;
  }

  const { default: textToSpeech } = await import("@google-cloud/text-to-speech");
  const { narrationScript } = await import("../src/content/rchop-excerpt.mjs");

  const client = new textToSpeech.TextToSpeechClient();

  const [response] = await client.synthesizeSpeech({
    input: { text: narrationScript },
    voice: {
      languageCode: "en-US",
      name: "en-US-Neural2-C",
      ssmlGender: "FEMALE",
    },
    audioConfig: {
      audioEncoding: "MP3",
    },
  });

  // Remotion's <Audio> reads from the public/ folder via staticFile(), so the mp3 goes there;
  // metadata (not needed by Remotion) goes to out/audio, which is gitignored.
  const publicDir = path.join(__dirname, "..", "public");
  const audioPath = path.join(publicDir, "narration.mp3");
  writeFileSync(audioPath, response.audioContent, "binary");

  const metaDir = path.join(__dirname, "..", "out", "audio");
  if (!existsSync(metaDir)) mkdirSync(metaDir, { recursive: true });

  const meta = {
    charactersSent: narrationScript.length,
    voice: "en-US-Neural2-C",
    audioEncoding: "MP3",
    audioBytes: response.audioContent.length,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(path.join(metaDir, "narration.meta.json"), JSON.stringify(meta, null, 2));

  console.log(`Wrote ${audioPath} (${meta.audioBytes} bytes)`);
  console.log(meta);
}

main().catch((err) => {
  console.error("TTS generation failed:", err);
  process.exitCode = 1;
});
