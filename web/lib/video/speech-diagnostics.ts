import { speechComparisonTokens, type SpeechReview } from "./speech-fidelity";

/** Explain deterministic disagreement even when the model claims fidelity.
 * Kept separate from acceptance logic so log edits do not invalidate reviews. */
export function speechReviewFailure(review: SpeechReview, script: string): string {
  if (review.discrepancies.length) return review.discrepancies.map((d) => `${d.expected} / heard ${d.heard}`).join("; ");
  if (review.uncertain) return `Unresolved listening uncertainty: ${review.notes}`;
  const expected = speechComparisonTokens(script);
  const heard = speechComparisonTokens(review.transcript);
  const index = expected.findIndex((word, i) => word !== heard[i]);
  if (index >= 0 || expected.length !== heard.length) {
    const at = index >= 0 ? index : expected.length;
    return `Transcript mismatch at token ${at + 1}: expected "${expected.slice(Math.max(0, at - 3), at + 8).join(" ")}" / heard "${heard.slice(Math.max(0, at - 3), at + 8).join(" ")}".`;
  }
  return review.faithful ? "" : `Listening review rejected audio: ${review.notes}`;
}
