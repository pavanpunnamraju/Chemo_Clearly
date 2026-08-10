// Runnable, standalone demonstration of Phase 1 goal 2 (intake logic) —
// no server, no DB needed. Run: npm run demo:intake

import { IntakeSchema, toPersonalizationFilter, TOPIC_TAGS } from "../lib/intake/schema";

const samples = [
  {
    regimenId: "rchop",
    educationLevel: "basic" as const,
    depthPreference: "short" as const,
    voiceTone: "friendly" as const,
  },
  {
    regimenId: "ac-t",
    educationLevel: "advanced" as const,
    depthPreference: "detailed" as const,
    voiceTone: "hopeful" as const,
    followUpQuestions: ["Will I need a port for this?"],
  },
];

for (const sample of samples) {
  const intake = IntakeSchema.parse(sample);
  const filter = toPersonalizationFilter(intake);
  console.log("\nIntake:", JSON.stringify(intake, null, 2));
  console.log("-> Personalization filter:", JSON.stringify(filter, null, 2));
  if (filter.tags.length !== TOPIC_TAGS.length) {
    throw new Error(`Expected full tag coverage (${TOPIC_TAGS.length}), got ${filter.tags.length}`);
  }
}

// Also demonstrate validation rejecting bad input (missing required field).
const invalid = IntakeSchema.safeParse({ regimenId: "rchop", depthPreference: "short" });
console.log("\nInvalid intake (no educationLevel) rejected:", !invalid.success, invalid.success ? "" : invalid.error.flatten().fieldErrors);
