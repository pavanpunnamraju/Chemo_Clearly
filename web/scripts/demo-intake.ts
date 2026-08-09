// Runnable, standalone demonstration of Phase 1 goal 2 (intake logic) —
// no server, no DB needed. Run: npm run demo:intake

import { IntakeSchema, toPersonalizationFilter } from "../lib/intake/schema";

const samples = [
  {
    regimenId: "rchop",
    educationLevel: "basic" as const,
    topics: ["nausea-appetite", "infection-risk", "hair-skin-appearance"] as const,
    depthPreference: "short" as const,
    voiceTone: "friendly" as const,
  },
  {
    regimenId: "ac-t",
    educationLevel: "advanced" as const,
    topics: ["nerve-tingling", "heart", "long-term-outlook"] as const,
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
}

// Also demonstrate validation rejecting bad input.
const invalid = IntakeSchema.safeParse({ regimenId: "rchop", educationLevel: "basic", topics: [], depthPreference: "short" });
console.log("\nInvalid intake (no topics) rejected:", !invalid.success, invalid.success ? "" : invalid.error.flatten().fieldErrors);
