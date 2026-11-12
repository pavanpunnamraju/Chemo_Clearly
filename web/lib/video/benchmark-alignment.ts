/** One saved-audio benchmark. No TTS calls. Not imported by production. */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { SpeechClient } from "@google-cloud/speech";
import { readLinear16Wav } from "./align";
import { reconcileNarrationTiming } from "./timing";
import { getGenAIClient } from "../gemini/client";

dotenv.config({ path: ".env.local", quiet: true });
const [audioFile, narrationFile, outputDirectory] = process.argv.slice(2);
if (!audioFile || !narrationFile || !outputDirectory) throw new Error("Usage: benchmark-alignment.ts audio.wav narration-cache.json output-directory");
const wav = fs.readFileSync(audioFile);
const narration = JSON.parse(fs.readFileSync(narrationFile, "utf8")).value;
const rate = wav.readUInt32LE(24);
const pcm = readLinear16Wav(wav, rate);
fs.mkdirSync(outputDirectory, { recursive: true });

await Promise.allSettled(["latest_long", "medical_conversation"].map(async (model) => {
  const client = new SpeechClient();
  try {
    const [response] = await client.recognize({
      audio: { content: pcm.toString("base64") },
      config: { encoding: "LINEAR16", sampleRateHertz: rate, languageCode: "en-US", model,
        enableWordTimeOffsets: true, enableWordConfidence: true,
        ...(model === "latest_long" ? { speechContexts: [{ phrases: ["R-CHOP", "Rituximab", "Cyclophosphamide", "doxorubicin", "Hydroxydaunorubicin", "vincristine", "Oncovin", "Prednisone"], boost: 15 }] } : {}),
      },
    });
    const words = (response.results ?? []).flatMap((result) => (result.alternatives?.[0]?.words ?? []).map((word) => ({
      word: word.word ?? "", startSeconds: Number(word.startTime?.seconds ?? 0) + Number(word.startTime?.nanos ?? 0) / 1e9,
      endSeconds: Number(word.endTime?.seconds ?? 0) + Number(word.endTime?.nanos ?? 0) / 1e9, confidence: word.confidence ?? null,
    })));
    const timing = reconcileNarrationTiming(narration.chunks, words, pcm.length / (rate * 2));
    fs.writeFileSync(path.join(outputDirectory, `${model}.json`), JSON.stringify({ response, words, diagnostics: timing.diagnostics }, null, 2));
    console.log(model, JSON.stringify(timing.diagnostics));
  } catch (error) {
    console.error(model, error);
  } finally { await client.close(); }
}));

const ai = await getGenAIClient();
if (!ai) throw new Error("Gemini audio inspection requires configured credentials.");
const result = await ai.models.generateContent({
  model: "gemini-2.5-pro",
  contents: [{ role: "user", parts: [
    { inlineData: { mimeType: "audio/wav", data: wav.toString("base64") } },
    { text: `Audit this audio against the reference narration below. Do not assume the audio matches it. Identify every audible omission, added word, substituted drug, number error or pronunciation that sounds like a different medicine. Distinguish uncertain recognition from clear speaker errors. Return JSON with faithfulTranscript, discrepancies:[{reference,heard,approximateSeconds,certainty}], assessment. This is a technical speech-fidelity review, not clinical approval. Reference:\n${narration.script}` },
  ] }], config: { responseMimeType: "application/json", temperature: 0 },
});
fs.writeFileSync(path.join(outputDirectory, "gemini-audio-review.json"), result.text!);
console.log("GEMINI", result.text);
