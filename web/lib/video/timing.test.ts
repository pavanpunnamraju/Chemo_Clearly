import assert from "node:assert/strict";
import { readLinear16Wav, recognitionChunks, wordsOwnedByChunk, type WordOffset } from "./align";
import { reconcileNarrationTiming, assertReliableTiming, canonicalSpeechTokens } from "./timing";
import { buildDirectedCaptionTrack, captionsToVtt } from "./captions";
import { pcmToWav } from "./tts";

function offsets(text: string, start = 0, spacing = 0.5): WordOffset[] {
  return text.split(/\s+/).map((word, index) => ({ word, startSeconds: start + index * spacing,
    endSeconds: start + index * spacing + spacing * 0.8, confidence: 0.96 }));
}

// Comparison signs and negative numbers carry meaning and cannot disappear as
// punctuation when an independent transcript is compared with the script.
assert.deepEqual(canonicalSpeechTokens("<100"), canonicalSpeechTokens("less than one hundred"));
assert.notDeepEqual(canonicalSpeechTokens("<100"), canonicalSpeechTokens("100"));
assert.notDeepEqual(canonicalSpeechTokens("-5"), canonicalSpeechTokens("5"));
assert.deepEqual(canonicalSpeechTokens("≥100"), canonicalSpeechTokens("greater than or equal to one hundred"));

// The complete word sequence disambiguates repeated entry openings; words at
// the next section's offset must not be mapped back to the first occurrence.
{
  const chunks = [
    { entryId: "first", text: "Call your team about nausea." },
    { entryId: "second", text: "Call your team about fever." },
  ];
  const result = reconcileNarrationTiming(chunks, [...offsets(chunks[0]!.text, 0.2), ...offsets(chunks[1]!.text, 4)], 7);
  assertReliableTiming(result);
  assert.deepEqual(result.entries.map((entry) => [entry.startSeconds, entry.endSeconds, entry.wordStartIndex, entry.wordEndIndex]), [[0.2, 2.6, 0, 5], [4, 6.4, 5, 10]]);
  assert.equal(result.words.map((word) => word.text).join(" "), chunks.map((chunk) => chunk.text).join(" "));
}

// Number phrases map to one actual recognition interval. Never fabricate
// sub-word boundaries when the provider returns "104.0" as one word.
{
  const chunks = [{ entryId: "numbers", text: "R-CHOP at twenty-one days. Call nine one one for one hundred and four point zero." }];
  const recognized = offsets("R chop at 21 days Call 911 for 104.0", 0.1);
  const result = reconcileNarrationTiming(chunks, recognized, 6);
  assertReliableTiming(result);
  assert.equal(result.words[0]!.endSeconds, recognized[1]!.endSeconds);
  assert.equal(result.words[2]!.startSeconds, recognized[3]!.startSeconds);
  const numberWords = result.words.slice(10);
  assert(numberWords.every((word) => word.startSeconds === recognized[8]!.startSeconds && word.endSeconds === recognized[8]!.endSeconds));
}

{
  const chunks = [{ entryId: "drug", text: "AC-T includes cyclophosphamide and doxorubicin." }];
  const good = reconcileNarrationTiming(chunks, offsets("A C T includes cyclophosphamide and doxorubicin"), 5);
  assertReliableTiming(good);
  const missed = reconcileNarrationTiming(chunks, offsets("A C T includes and doxorubicin"), 5);
  assert.equal(missed.diagnostics.valid, false);
  assert.equal(missed.diagnostics.unmatchedTokens[0]!.text, "cyclophosphamide");
  assert.throws(() => assertReliableTiming(missed), /re-alignment or audio review/);
  assert.throws(() => buildDirectedCaptionTrack(missed), /re-alignment or audio review/);
}

// Normalized contractions and punctuation keep every displayed script token;
// a negation in recognition must never disappear through partial token matching.
{
  const text = "Don't wait — call your team.";
  const timing = reconcileNarrationTiming([{ entryId: "a", text }], offsets("Do not wait call your team"), 5);
  assertReliableTiming(timing);
  assert.equal(timing.words.map((word) => word.text).join(" "), text);
  assert.equal(timing.words[2]!.startSeconds, timing.words[1]!.startSeconds);
  const negation = reconcileNarrationTiming([{ entryId: "a", text: "Do wait." }], offsets("Don't wait"), 3);
  assert.equal(negation.diagnostics.valid, false);
  assert(negation.diagnostics.unexpectedWords.some((word) => word.text === "Don't"));
}

{
  const timing = reconcileNarrationTiming([{ entryId: "a", text: "Watch 7–10 days and 100.4°F." }], offsets("Watch 7 to 10 days and 100.4 degrees Fahrenheit"), 6);
  assertReliableTiming(timing);
  const bad = structuredClone(timing);
  bad.words[0]!.text = "Ignore";
  assert.throws(() => assertReliableTiming(bad), /cached word evidence/);
  const staleBoundary = structuredClone(timing);
  staleBoundary.entries[0]!.endSeconds = 1;
  assert.throws(() => assertReliableTiming(staleBoundary), /entry boundaries/);
}

// A missing repeated phrase cannot be papered over by a later occurrence.
{
  const result = reconcileNarrationTiming([{ entryId: "a", text: "Call your team. Call your team." }], offsets("Call your team."), 3);
  assert.equal(result.diagnostics.coverage, 0.5);
  assert.equal(result.diagnostics.valid, false);
}

// Old start-only cache entries, invalid intervals, missing recognition,
// out-of-bounds timing, low confidence and extra speech all fail explicitly.
{
  const chunk = [{ entryId: "a", text: "Call now." }];
  for (const words of [
    [],
    [{ word: "Call", startSeconds: 0 }, { word: "now", startSeconds: 1 }],
    [{ word: "Call", startSeconds: 1, endSeconds: 0.5 }, { word: "now", startSeconds: 2, endSeconds: 2.5 }],
    [{ word: "Call", startSeconds: 0, endSeconds: 1 }, { word: "now", startSeconds: 2, endSeconds: 9 }],
    offsets("Call now").map((word) => ({ ...word, confidence: 0.1 })),
    offsets("Do not Call now"),
  ]) assert.throws(() => assertReliableTiming(reconcileNarrationTiming(chunk, words, 3)), /re-alignment or audio review/);
  assert.throws(() => assertReliableTiming(reconcileNarrationTiming([], [], 0)), /re-alignment or audio review/);
}

// Captions preserve every source token and explicit line breaks, use actual
// word ends, have finite nonoverlapping intervals, and export valid VTT.
{
  const text = "Your care team can help you manage side effects. Keep their phone number nearby so you can call when you need advice.";
  const words = offsets(text, 0.2, 0.5);
  const timing = reconcileNarrationTiming([{ entryId: "a", text }], words, 14);
  const track = buildDirectedCaptionTrack(timing);
  assert.equal(track.diagnostics.valid, true);
  assert.equal(track.captions.map((cue) => cue.text).join(" ").replace(/\s+/g, " "), text);
  assert(track.captions.every((cue) => cue.text.split("\n").length <= 2 && cue.text.split("\n").every((line) => line.length <= 38)));
  assert(track.captions.every((cue, index) => cue.endSeconds > cue.startSeconds && (!index || cue.startSeconds >= track.captions[index - 1]!.endSeconds)));
  assert.equal(track.captions[0]!.startSeconds, 0.2);
  assert(track.captions[track.captions.length - 1]!.endSeconds >= words[words.length - 1]!.endSeconds!);
  assert(track.vtt.startsWith("WEBVTT\n\n1\n00:00:00.200 -->"));
  assert(track.captionJson.every((cue) => "confidence" in cue && "timestampMs" in cue));
  assert(captionsToVtt([{ text: "Use < 5 & > 1", startMs: 3_600_005, endMs: 3_602_000, timestampMs: null, confidence: null }]).includes("01:00:00.005 --> 01:00:02.000\nUse &lt; 5 &amp; &gt; 1"));
}

// A rapid utterance stays visible in diagnostics instead of being accepted
// merely because the caption string matches the script.
{
  const text = "Call your team immediately for these symptoms.";
  const timing = reconcileNarrationTiming([{ entryId: "a", text }], offsets(text, 0, 0.04), 0.4);
  const track = buildDirectedCaptionTrack(timing);
  assert.equal(track.diagnostics.valid, false);
  assert(track.diagnostics.issues.some((issue) => issue.code === "caption-reading-speed"));
}

// WAV parsing tolerates non-audio RIFF chunks and rejects format mismatches.
{
  const pcm = Buffer.alloc(400);
  const wav = pcmToWav(pcm, 24000);
  assert.deepEqual(readLinear16Wav(wav, 24000), pcm);
  assert.throws(() => readLinear16Wav(wav, 16000), /16-bit mono/);
  assert.throws(() => readLinear16Wav(wav.subarray(0, 100), 24000), /Truncated/);
  const junk = Buffer.from([74, 85, 78, 75, 2, 0, 0, 0, 0, 0]);
  const withJunk = Buffer.concat([wav.subarray(0, 36), junk, wav.subarray(36)]);
  withJunk.writeUInt32LE(withJunk.length - 8, 4);
  assert.deepEqual(readLinear16Wav(withJunk, 24000), pcm);
}

// Overlapping recognition windows provide context without losing core audio,
// and midpoint ownership removes duplicated context words at a chunk seam.
{
  const rate = 1000;
  const chunks = recognitionChunks(Buffer.alloc(121 * rate * 2), rate);
  assert.equal(chunks[0]!.coreStartSample, 0);
  assert.equal(chunks[chunks.length - 1]!.coreEndSample, 121 * rate);
  assert(chunks.every((chunk, index) => chunk.endSample - chunk.startSample <= 55 * rate &&
    (!index || chunk.coreStartSample === chunks[index - 1]!.coreEndSample)));
  const seam = chunks[0]!.coreEndSample / rate;
  const word = { word: "fever", startSeconds: seam - 0.1, endSeconds: seam + 0.2 };
  assert.equal(wordsOwnedByChunk([word], chunks[0]!, rate).length, 0);
  assert.equal(wordsOwnedByChunk([word], chunks[1]!, rate).length, 1);
}

console.log("Directed timing/caption tests passed.");
