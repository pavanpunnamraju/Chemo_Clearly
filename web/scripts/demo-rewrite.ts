// Runnable demonstration + acceptance check for the narration rewrite step
// (lib/video/rewrite.ts, #3c). Verifies, against real content and a real
// Gemini call, that:
//   1. the guardrail passes (rewriteNarration() doesn't throw)
//   2. the three voiceTones produce meaningfully different wording for the
//      same source content (same bar #3a used for distinct audio per tone)
// Requires GOOGLE_APPLICATION_CREDENTIALS + GOOGLE_CLOUD_PROJECT (see
// web/.env.local.example). Run: npm run demo:rewrite

import "dotenv/config";
import { config as loadEnvLocal } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvLocal({ path: path.join(__dirname, "..", ".env.local") });

import { IntakeSchema, toPersonalizationFilter } from "../lib/intake/schema";
import { loadRegimenContent } from "../lib/content";
import { selectContent } from "../lib/video/select";
import { rewriteNarration } from "../lib/video/rewrite";
import { VOICE_TONES } from "../lib/intake/schema";

function wordSet(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

// Jaccard similarity of word sets — a crude but adequate distinctness proxy:
// same wording -> ~1.0, meaningfully reworded -> notably lower.
function similarity(a: string, b: string): number {
  const setA = wordSet(a);
  const setB = wordSet(b);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

async function main() {
  const content = loadRegimenContent("rchop");
  const scripts: Record<string, string> = {};

  for (const voiceTone of VOICE_TONES) {
    const intake = IntakeSchema.parse({
      regimenId: "rchop",
      educationLevel: "some_college",
      topics: ["nausea-appetite", "infection-risk"],
      depthPreference: "short",
      voiceTone,
    });
    const filter = toPersonalizationFilter(intake);

    const selection = await selectContent(content, filter);
    const entries = content.entries.filter((e) => selection.entryIds.includes(e.id));

    console.log(`\n--- voiceTone: ${voiceTone} ---`);
    const result = await rewriteNarration(entries, filter);
    console.log(result.script);
    scripts[voiceTone] = result.script;
  }

  console.log("\n--- Pairwise word-overlap similarity (lower = more distinct) ---");
  const tones = [...VOICE_TONES];
  let maxSimilarity = 0;
  for (let i = 0; i < tones.length; i++) {
    for (let j = i + 1; j < tones.length; j++) {
      const sim = similarity(scripts[tones[i]!]!, scripts[tones[j]!]!);
      console.log(`${tones[i]} vs ${tones[j]}: ${sim.toFixed(2)}`);
      maxSimilarity = Math.max(maxSimilarity, sim);
    }
  }

  if (maxSimilarity > 0.85) {
    throw new Error(
      `Tones aren't meaningfully distinct (highest pairwise overlap ${maxSimilarity.toFixed(2)}) — expected < 0.85.`,
    );
  }
  console.log("\nAll tones produced meaningfully distinct wording. Guardrail passed for all three.");
}

main().catch((err) => {
  console.error("Rewrite demo failed:", err);
  process.exitCode = 1;
});
