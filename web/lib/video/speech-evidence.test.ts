import assert from "node:assert/strict";
import { validateSegmentEvidence, type SegmentEvidence } from "./speech-evidence";
import { digest } from "./stage-cache";

const rate = 24000;
const first = Buffer.from([1, 0, 2, 0]);
const second = Buffer.from([3, 0, 4, 0]);
const pad = Buffer.alloc(Math.round(.18 * rate) * 2);
const scripts = ["Take prednisone.", "Call your team."];
const segments: SegmentEvidence[] = [first, second].map((pcm, i) => ({
  script: scripts[i]!, report: { transcript: scripts[i]!, faithful: true, uncertain: false, discrepancies: [], notes: "Test fixture" },
  pcmDigest: digest(pcm), pcmBytes: pcm.length, sampleRateHertz: rate, paddingAfterMs: i ? 0 : 180,
}));
const pcm = Buffer.concat([first, pad, second]);
const script = scripts.join(" ");
validateSegmentEvidence(pcm, script, rate, segments);
const changed = Buffer.from(pcm); changed[0] = 7;
assert.throws(() => validateSegmentEvidence(changed, script, rate, segments), /does not match/);
const spokenJoin = Buffer.from(pcm); spokenJoin[100] = 1;
assert.throws(() => validateSegmentEvidence(spokenJoin, script, rate, segments), /segment join/);
assert.throws(() => validateSegmentEvidence(Buffer.concat([pcm, first]), script, rate, segments), /outside/);
assert.throws(() => validateSegmentEvidence(pcm, script, rate, segments.slice(1)), /cover/);
assert.throws(() => validateSegmentEvidence(pcm, script, rate, [{ ...segments[0]!, report: { ...segments[0]!.report, transcript: "Take prednisolone." } }, segments[1]!]), /does not match/);
assert.throws(() => validateSegmentEvidence(pcm, script, rate, [{ ...segments[0]!, paddingAfterMs: 0 }, segments[1]!]), /padding duration/);
console.log("Segment speech evidence tests passed: exact script/audio binding, independent reviews, silent joins and no extra audio.");
