import { digest } from "./stage-cache";
import { speechReviewPassed, type SpeechReview } from "./speech-fidelity";

export interface SegmentEvidence {
  script: string;
  report: SpeechReview;
  pcmDigest: string;
  pcmBytes: number;
  sampleRateHertz: number;
  paddingAfterMs: number;
}

/** Recheck the exact accepted passages and silent joins in a section waveform. */
export function validateSegmentEvidence(pcm: Buffer, script: string, rate: number, segments: SegmentEvidence[]): void {
  if (!Array.isArray(segments) || !segments.length || segments.map((s) => s.script).join(" ") !== script) {
    throw new Error("Segmented speech does not cover the section script.");
  }
  let cursor = 0;
  for (const [index, segment] of segments.entries()) {
    if (!speechReviewPassed(segment.report, segment.script) || segment.sampleRateHertz !== rate ||
      !Number.isSafeInteger(segment.pcmBytes) || segment.pcmBytes <= 0 || segment.pcmBytes % 2 !== 0 ||
      digest(pcm.subarray(cursor, cursor + segment.pcmBytes)) !== segment.pcmDigest) {
      throw new Error(`Segment ${index + 1} speech evidence does not match its audio.`);
    }
    cursor += segment.pcmBytes;
    const expectedPadding = index === segments.length - 1 ? 0 : 180;
    if (segment.paddingAfterMs !== expectedPadding) throw new Error("Unexpected segmented speech padding duration.");
    const padBytes = Math.round(expectedPadding / 1000 * rate) * 2;
    if (pcm.subarray(cursor, cursor + padBytes).some((byte) => byte !== 0)) throw new Error("Unreviewed audio in a segment join.");
    cursor += padBytes;
  }
  if (cursor !== pcm.length) throw new Error("Unreviewed audio outside speech segments.");
}
