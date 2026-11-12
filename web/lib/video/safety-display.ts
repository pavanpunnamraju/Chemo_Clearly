import type { ContentEntry } from "../content/types";
import type { DirectedShot } from "./direction-types";
import { cleanForSpeechAndDisplay } from "./narration";

export type SafetyCard = NonNullable<DirectedShot["safetyCard"]>;

export function isFeverSafetyEntry(entry: ContentEntry): boolean {
  return entry.sectionId === "emergency" && entry.tier === "emergency" && /\bfever\b/i.test(entry.name ?? "");
}

/** Project recognized source wording, never calculate or author clinical values.
 * Unknown structure is deliberately unsupported: do not approximate or omit
 * a condition merely to get a short display card. */
export function projectFeverSafetyCard(entry: ContentEntry): SafetyCard | undefined {
  if (!isFeverSafetyEntry(entry)) return undefined;
  const source = cleanForSpeechAndDisplay(entry.plain);
  const temperature = String.raw`\d+(?:\.\d+)?°F\s*\(\d+(?:\.\d+)?°C\)`;
  const duration = String.raw`(?:an?|\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|thirty|sixty)\s+(?:hours?|minutes?)`;
  const criteriaPattern = new RegExp(
    String.raw`\ba temperature of (${temperature} or higher sustained for ${duration}), or (a single reading of ${temperature} or higher), is a medical emergency\b`, "g",
  );
  const criteria = [...source.matchAll(criteriaPattern)];
  // This exact instruction keeps urgency, night-time access and the prohibition
  // on waiting together. A changed action requires a newly reviewed projection.
  const actions = [...source.matchAll(/(?:^|[.!?]\s+)(Call your care team immediately, day or night — don't wait for office hours or "see if it comes down\.")/g)];
  const applicability = [...source.matchAll(/\bat any point in treatment\b/g)];
  if (criteria.length !== 1 || actions.length !== 1 || applicability.length !== 1) return undefined;
  // Bind the applicability phrase to the actual instruction about THIS fever
  // threshold, not an unrelated occurrence elsewhere in the entry.
  if (!/(?:^|[.!?]\s+|— but )Treat a fever at this threshold as an emergency at any point in treatment, not only (?:during this|in that) window\b/i.test(source)) return undefined;
  return {
    criteria: [criteria[0]![1]!, criteria[0]![2]!],
    action: actions[0]![1]!,
    applicability: applicability[0]![0],
  };
}

export function safetyDisplayWarning(entry: ContentEntry): string | undefined {
  return isFeverSafetyEntry(entry) && !projectFeverSafetyCard(entry)
    ? `${entry.id}: fever display projection does not recognize the complete source criteria/action/applicability; no safety card generated.`
    : undefined;
}
