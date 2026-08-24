// Regression test for stitchSections' duration accounting (round-7
// investigation, docs/references/handoff.md): it must offset word timestamps
// and total duration by each section's *actual* audio length, not
// align.ts's Speech-to-Text-derived `durationSeconds` estimate (which
// consistently under-reports real clip length by the trailing audio after
// the last recognized word). No framework; run directly with tsx.
// Run: npm run test:pipeline

import assert from "node:assert/strict";
import { groupEntriesBySection, hashSection, stitchSections } from "./pipeline";
import type { SectionPipelineOutput } from "./pipeline";
import type { ContentEntry } from "../content/types";
import { pcmToWav, silencePcm } from "./tts";

const SAMPLE_RATE = 24000;

function fakeSection(sectionId: string, realSeconds: number, sttDurationSeconds: number): SectionPipelineOutput {
  const numSamples = Math.round(realSeconds * SAMPLE_RATE);
  const pcm = Buffer.alloc(numSamples * 2); // 16-bit mono silence
  return {
    sectionId,
    hash: "fake",
    chunks: [{ entryId: sectionId, text: "x" }],
    tts: { sampleRateHertz: SAMPLE_RATE, charactersSent: 1 } as SectionPipelineOutput["tts"],
    audioBuffer: pcmToWav(pcm, SAMPLE_RATE),
    // A word ending well before the clip's real end — the STT under-report
    // this test exists to guard against.
    words: [{ word: "hi", startSeconds: 0 }],
    durationSeconds: sttDurationSeconds,
  };
}

{
  // Two sections, each 0.5s "longer" in real audio than align.ts reported.
  const a = fakeSection("a", 10, 9.5);
  const b = fakeSection("b", 10, 9.5);
  const stitched = stitchSections([a, b]);

  const padSeconds = silencePcm(400, SAMPLE_RATE).length / (SAMPLE_RATE * 2);
  const expectedTotal = 10 + padSeconds + 10;
  assert.ok(
    Math.abs(stitched.durationSeconds - expectedTotal) < 1e-6,
    `expected total duration ${expectedTotal}, got ${stitched.durationSeconds} — must track real audio length, not the STT estimate`,
  );

  // Section b's word must be offset by section a's *real* 10s, not its
  // under-reported 9.5s estimate.
  const expectedBWordStart = 10 + padSeconds;
  assert.ok(
    Math.abs(stitched.words[1]!.startSeconds - expectedBWordStart) < 1e-6,
    `expected section b's word at ${expectedBWordStart}s, got ${stitched.words[1]!.startSeconds}s`,
  );
}

{
  // Regression test (docs/references/handoff.md, round 4): selectContent()'s
  // Gemini call reorders same-section entries non-deterministically across
  // renders. hashSection must produce the same hash for the same entry set
  // regardless of input order, or a section like side_effects (many
  // similarly-tagged entries) never cache-hits. groupEntriesBySection must
  // NOT reorder entries — some sections (timeline) depend on narrating in
  // the given sequence, and ids aren't uniformly formatted enough to
  // re-sort into that sequence generically.
  const fakeEntry = (id: string): ContentEntry =>
    ({ id, sectionId: "side_effects", plain: `text for ${id}` }) as ContentEntry;

  const forward = [fakeEntry("a"), fakeEntry("b"), fakeEntry("c")];
  const shuffled = [fakeEntry("c"), fakeEntry("a"), fakeEntry("b")];

  const groupsForward = groupEntriesBySection(forward);
  const groupsShuffled = groupEntriesBySection(shuffled);

  assert.deepEqual(
    groupsForward[0]!.entries.map((e) => e.id),
    ["a", "b", "c"],
    "groupEntriesBySection must preserve narration order as given",
  );
  assert.deepEqual(
    groupsShuffled[0]!.entries.map((e) => e.id),
    ["c", "a", "b"],
    "groupEntriesBySection must preserve narration order as given, even when it differs run to run",
  );

  const hashForward = hashSection("side_effects", groupsForward[0]!.entries);
  const hashShuffled = hashSection("side_effects", groupsShuffled[0]!.entries);
  assert.equal(
    hashForward,
    hashShuffled,
    "hashSection must produce the same hash for the same entry set regardless of Gemini's incidental ordering",
  );
}

console.log("pipeline.test: ok");
