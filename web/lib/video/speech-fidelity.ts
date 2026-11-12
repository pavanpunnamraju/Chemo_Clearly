import { z } from "zod";
import { getGenAIClient } from "../gemini/client";
import { canonicalSpeechTokens } from "./timing";

export const SPEECH_REVIEW_MODEL = "gemini-2.5-pro";
const SpeechReviewSchema = z.object({
  transcript: z.string().trim().min(1),
  faithful: z.boolean(),
  uncertain: z.boolean(),
  discrepancies: z.array(z.object({ expected: z.string(), heard: z.string(), reason: z.string(),
    approximateSeconds: z.number().nonnegative(), certainty: z.enum(["clear", "uncertain"]) }).strict()),
  notes: z.string(),
}).strict();
export type SpeechReview = z.infer<typeof SpeechReviewSchema>;

/** Speech review is separate from forced alignment: timing known text cannot
 * establish that the speaker actually said it. This automated check does not
 * replace clinical or human listening approval. Uncertainty fails closed. */
export async function reviewSpokenNarration(audio: Buffer, script: string): Promise<SpeechReview> {
  const ai = await getGenAIClient();
  if (!ai) throw new Error("Speech-fidelity review requires the configured model.");
  const response = await ai.models.generateContent({ model: SPEECH_REVIEW_MODEL,
    contents: [{ role: "user", parts: [
      { inlineData: { mimeType: "audio/wav", data: audio.toString("base64") } },
      { text: [
        "Listen carefully to the attached synthetic patient-education narration. Audit the AUDIO, not the expected words.",
        "Produce an honest transcript preserving what was actually heard, even when it differs from the reference.",
        "Identify any omitted, added or changed word that alters meaning; drug-name substitutions; missing negations; quantities, units, duration, conditions or call instructions spoken incorrectly.",
        "Especially distinguish prednisone from prednisolone. Do NOT silently repair a medical word to match the reference.",
        "Normal speech equivalents are NOT discrepancies: digits spoken as number words, acronyms spoken as letters, contractions, punctuation, hyphenation and capitalization.",
        "Do not report ordinary spoken rendering of '1' as 'one' or punctuation as missing. If a clinical word is unclear, report uncertainty, never assume it is correct.",
        'Return JSON only: {"transcript":"actually heard words", "faithful":true, "uncertain":false, "discrepancies":[{"expected":"...","heard":"...","reason":"...","approximateSeconds":0,"certainty":"clear or uncertain"}],"notes":"brief listening assessment"}.',
        "Transcribe every word, including small joining words. Set uncertain=true for ANY unresolved speech uncertainty; do not hide it only in notes.",
        "faithful must be false if discrepancies or unresolved uncertainty remain. This is technical audio review, NOT clinical approval.",
        `Reference script:\n${script}`,
      ].join("\n") },
    ] }], config: { responseMimeType: "application/json", temperature: 0 },
  });
  return SpeechReviewSchema.parse(JSON.parse(response.text ?? ""));
}

export function speechReviewPassed(review: SpeechReview, script: string): boolean {
  const checked = SpeechReviewSchema.safeParse(review);
  return checked.success && checked.data.faithful && !checked.data.uncertain && checked.data.discrepancies.length === 0 &&
    JSON.stringify(speechComparisonTokens(checked.data.transcript)) === JSON.stringify(speechComparisonTokens(script));
}

/** Case-sensitive acronym typography only. The everyday verb "act" is not
 * equivalent to A C T; an omitted C or T is never supplied. */
export function speechComparisonTokens(text: string): string[] {
  const tokens = canonicalSpeechTokens(text.replace(/\bACT\b/g, "A C T").replace(/\bR C H O P\b/g, "R CHOP"));
  // Temperature-scale orthography only, after an explicit numeric value and
  // degree marker. Preserve the exact number, scale and every surrounding word.
  // Standalone letters/acronyms and a missing scale or degree marker stay distinct.
  return tokens.map((token, index) => tokens[index - 1] === "degrees" && /^\d+(?:\.\d+)?$/.test(tokens[index - 2] ?? "")
    ? token === "f" ? "fahrenheit" : token === "c" ? "celsius" : token
    : token);
}
