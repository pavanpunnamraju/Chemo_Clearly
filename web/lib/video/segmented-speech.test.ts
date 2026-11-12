import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { splitSpeechSegments, synthesizeReviewedSegments, type SegmentedSpeechServices } from "./segmented-speech";
import { pcmToWav, type SynthesizeResult } from "./tts";
import { readLinear16Wav } from "./align";
import { speechReviewPassed, type SpeechReview } from "./speech-fidelity";
import { validateSegmentEvidence } from "./speech-evidence";
import { audioCachePath, readStage } from "./stage-cache";

function reviewed(script: string): SpeechReview {
  return { transcript: script, faithful: true, uncertain: false, discrepancies: [], notes: "Offline test fixture; no real speech assessment." };
}
function fixtureAudio(seed: number, script: string, rate = 1000): SynthesizeResult {
  // Byte fixtures exercise caching/PCM assembly only; they are not speech.
  const pcm = Buffer.alloc(200);
  for (let index = 0; index < pcm.length; index += 2) pcm.writeInt16LE(seed * 100, index);
  return { audioBuffer: pcmToWav(pcm, rate), charactersSent: script.length, voice: "Kore", durationSeconds: 100 / rate, sampleRateHertz: rate };
}
const temporaryRoots: string[] = [];
function cache(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "chemo-segmented-speech-test-"));
  temporaryRoots.push(root);
  return root;
}

try {
  // Long passages split at whole sentences, keep every token, and reject a
  // single oversized sentence before any generation can occur.
  const sentence = `Word ${Array.from({ length: 94 }, () => "word").join(" ")}.`;
  const long = `${sentence} ${sentence}`;
  const split = splitSpeechSegments([{ entryId: "long", text: long }]);
  assert.equal(split.length, 2);
  assert.equal(split.map((part) => part.script).join(" "), long);
  assert(split.every((part) => part.script.split(/\s+/).length <= 180));
  assert.throws(() => splitSpeechSegments([{ entryId: "long", text: Array(181).fill("word").join(" ") }]), /sentence longer/);
  assert.throws(() => splitSpeechSegments([{ entryId: "empty", text: " " }]), /Empty narration/);
  assert.throws(() => splitSpeechSegments([{ entryId: "a", text: "First." }, { entryId: "a", text: "Second." }]), /duplicate/);

  // Actual accepted PCM remains unchanged; the only inserted bytes are 180ms
  // of silence. Aggregate exact transcript and child evidence validate again.
  {
    const cacheRoot = cache();
    let syntheses = 0;
    let reviews = 0;
    const passedScripts: string[] = [];
    const services: SegmentedSpeechServices = {
      cacheIdentity: "accepted-fixture-v1",
      synthesize: async (script) => { passedScripts.push(script); return fixtureAudio(++syntheses, script); },
      review: async (_audio, script) => { reviews++; return reviewed(script.replace("1", "one")); },
    };
    const chunks = [{ entryId: "a", text: "The AC and T phases follow AC-T treatment." }, { entryId: "b", text: "Call 1 time." }];
    const result = await synthesizeReviewedSegments(chunks, "friendly", { cacheRoot, services });
    assert.equal(syntheses, 2);
    assert.equal(reviews, 2);
    assert.equal(passedScripts[0], "The A C and T phases follow A C T treatment.");
    assert.equal(result.segments[0]!.script, chunks[0]!.text);
    assert.deepEqual(result.segments.map((segment) => segment.paddingAfterMs), [180, 0]);
    assert.deepEqual(result.segments.map((segment) => segment.startSeconds), [0, 0.28]);
    assert.equal(result.audio.durationSeconds, 0.38);
    assert(speechReviewPassed(result.review, chunks.map((chunk) => chunk.text).join(" ")));
    const pcm = readLinear16Wav(result.audio.audioBuffer, 1000);
    assert.deepEqual(pcm.subarray(0, 200), readLinear16Wav(fixtureAudio(1, "").audioBuffer, 1000));
    assert(pcm.subarray(200, 560).every((byte) => byte === 0));
    assert.deepEqual(pcm.subarray(560), readLinear16Wav(fixtureAudio(2, "").audioBuffer, 1000));
    validateSegmentEvidence(pcm, chunks.map((chunk) => chunk.text).join(" "), 1000, result.segments);
    assert(readStage(cacheRoot, "segmented-speech-assembly", result.assemblyKey));
    const cached = await synthesizeReviewedSegments(chunks, "friendly", { cacheRoot, services });
    assert.equal(syntheses, 2);
    assert.equal(reviews, 2);
    assert.deepEqual(cached.audio.audioBuffer, result.audio.audioBuffer);

    // A modified WAV cannot inherit a passed review solely from stale metadata.
    const firstFile = audioCachePath(cacheRoot, result.segments[0]!.audioKey);
    const corrupt = readFileSync(firstFile); corrupt[44] = corrupt[44]! ^ 0x7f;
    writeFileSync(firstFile, corrupt);
    await synthesizeReviewedSegments(chunks, "friendly", { cacheRoot, services });
    assert.equal(syntheses, 3);
    assert.equal(reviews, 3);
    await synthesizeReviewedSegments(chunks, "hopeful", { cacheRoot, services });
    assert.equal(syntheses, 5, "voice-tone changes invalidate audio");
    await synthesizeReviewedSegments(chunks, "hopeful", { cacheRoot, services: { ...services, cacheIdentity: "accepted-fixture-v2" } });
    assert.equal(syntheses, 7, "service implementation changes invalidate audio");
  }

  // A false-positive faithful flag cannot hide a missing negation. The rejected
  // audio/review is retained and the second attempt is independently accepted.
  {
    const cacheRoot = cache();
    let syntheses = 0;
    let reviews = 0;
    const progress: string[] = [];
    const services: SegmentedSpeechServices = {
      cacheIdentity: "retry-fixture",
      synthesize: async (script) => fixtureAudio(++syntheses, script),
      review: async (_audio, script) => reviewed(++reviews === 1 ? script.replace("not ", "") : script),
    };
    const result = await synthesizeReviewedSegments([{ entryId: "safety", text: "Do not wait." }], "neutral", { cacheRoot, services, onProgress: (message) => progress.push(message) });
    assert.equal(syntheses, 2);
    assert.equal(result.segments[0]!.attempt, 2);
    assert.equal(readdirSync(path.join(cacheRoot, "segmented-audio-attempt")).length, 2);
    assert.equal(readdirSync(path.join(cacheRoot, "segmented-speech-review")).length, 2);
    assert(progress.some((message) => message.includes("rejected speech attempt 1")));
    assert(progress.some((message) => message.includes("Transcript mismatch")), "rejection explains missing words even when reviewer claims fidelity");
    await synthesizeReviewedSegments([{ entryId: "safety", text: "Do not wait." }], "neutral", { cacheRoot, services });
    assert.equal(syntheses, 2, "retained attempts are reused without repeating rejected calls");
    assert.equal(reviews, 2);
  }

  // All three uncertain attempts fail closed and remain bounded after resume.
  {
    const cacheRoot = cache();
    let syntheses = 0;
    let reviews = 0;
    const services: SegmentedSpeechServices = {
      cacheIdentity: "uncertain-fixture",
      synthesize: async (script) => fixtureAudio(++syntheses, script),
      review: async (_audio, script) => { reviews++; return { ...reviewed(script), uncertain: true }; },
    };
    for (let run = 0; run < 2; run++) await assert.rejects(() => synthesizeReviewedSegments([{ entryId: "a", text: "Call now." }], "neutral", { cacheRoot, services }), /after 3 attempts/);
    assert.equal(syntheses, 3);
    assert.equal(reviews, 3);
  }

  // API failures are recorded as failures; they cannot become accepted reviews.
  {
    const cacheRoot = cache();
    let syntheses = 0;
    const services: SegmentedSpeechServices = {
      cacheIdentity: "failed-fixture",
      synthesize: async (script) => fixtureAudio(++syntheses, script),
      review: async () => { throw new Error("Fixture review unavailable"); },
    };
    for (let run = 0; run < 2; run++) await assert.rejects(() => synthesizeReviewedSegments([{ entryId: "a", text: "Call now." }], "neutral", { cacheRoot, services }), /after 3 attempts/);
    assert.equal(syntheses, 3);
    assert.equal(readdirSync(path.join(cacheRoot, "segmented-attempt-error")).length, 3);
  }

  // Accepted reviews do not authorize resampling or switching voice midsection.
  {
    let syntheses = 0;
    const services: SegmentedSpeechServices = {
      cacheIdentity: "mixed-rate-fixture",
      synthesize: async (script) => fixtureAudio(++syntheses, script, syntheses === 1 ? 1000 : 2000),
      review: async (_audio, script) => reviewed(script),
    };
    await assert.rejects(() => synthesizeReviewedSegments([{ entryId: "a", text: "First." }, { entryId: "b", text: "Second." }], "neutral", { cacheRoot: cache(), services }), /different sample rates/);
  }
  console.log("Segmented speech tests passed: bounded reviewed retries, exact PCM joins, caches, orthography, and failure gates.");
} finally {
  // Only fresh test directories created above are removed.
  for (const directory of temporaryRoots) rmSync(directory, { recursive: true, force: true });
}
