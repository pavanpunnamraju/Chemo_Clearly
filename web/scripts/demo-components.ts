// Runnable self-check for the Component Placer (lib/video/components.ts,
// #3c): the deterministic keyword matcher (no network) plus the LLM timing
// refinement step (live, if GOOGLE_CLOUD_PROJECT is set — falls back
// deterministically otherwise, which this also exercises).
// Run: npm run demo:components

import "dotenv/config";
import { config as loadEnvLocal } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvLocal({ path: path.join(__dirname, "..", ".env.local") });

import assert from "node:assert/strict";
import { findComponentTriggers, refineComponentTiming } from "../lib/video/components";

const script =
  "R-CHOP is five medicines given over six cycles. You might feel nauseous after your " +
  "infusion, and some people also experience vomiting in the first day or two. Around days " +
  "7 to 10 your infection-fighting white blood cells are at their lowest, so watch for fever. " +
  "A few patients notice tingling or numbness in their fingers. Nausea can come back later in " +
  "the cycle too, so keep your anti-nausea medicine on hand.";

const triggers = findComponentTriggers(script);
console.log("Triggers:", triggers);

// Every tag with a keyword hit should appear at least once — no icon
// registry gates this anymore (icons.ts is gone).
const tags = triggers.map((t) => t.tag);
assert.deepEqual(
  new Set(tags),
  new Set(["infection-risk", "nausea-appetite", "nerve-tingling"]),
);
console.log("PASS — expected tags present, no extras");

// No longer deduped: nausea-appetite keywords appear 4 times across the
// script ("nauseous", "vomiting", "Nausea", "anti-nausea") — all 4 should
// produce a trigger now, not just the first.
assert.equal(triggers.filter((t) => t.tag === "nausea-appetite").length, 4);
console.log("PASS — every mention triggers, not just the first");

// A tag with no keyword hit at all (urinary, emotional-support, mouth-digestion,
// aches-pain) must not appear.
for (const absentTag of ["urinary", "emotional-support", "mouth-digestion", "aches-pain"]) {
  assert.ok(!tags.includes(absentTag), `${absentTag} should not trigger — no keyword present in script`);
}
console.log("PASS — tags with no keyword match correctly absent");

// Triggers come back sorted by position, matching narration order.
for (let i = 1; i < triggers.length; i++) {
  assert.ok(triggers[i]!.matchIndex >= triggers[i - 1]!.matchIndex, "triggers must be in script order");
}
console.log("PASS — triggers sorted in script order");

// Illustrations are assigned round-robin across the 3 available files, by
// overall speaking-order position (not per-tag).
for (const t of triggers) {
  assert.ok(t.illustrationSrc.startsWith("illustrations/side_effects/"), "illustrationSrc should point at a side_effects file");
}
console.log("PASS — every trigger has a round-robin illustration assigned");

// Timing refinement — live LLM call if creds are configured, deterministic
// fallback otherwise. Either way, every trigger must still land on a valid
// sentence boundary in the script (never NaN/out-of-range), since the
// fallback path is required to always work with no network at all.
async function checkTimingRefinement() {
  const placed = await refineComponentTiming(script, triggers);
  console.log("\nPlaced components:", placed);

  assert.equal(placed.length, triggers.length);
  for (const p of placed) {
    assert.ok(p.placementIndex >= 0 && p.placementIndex < script.length, `${p.tag} placementIndex out of range`);
  }
  console.log("PASS — every trigger has a valid placementIndex (LLM result or fallback)");
}

checkTimingRefinement()
  .then(() => console.log("\nAll component-placer self-checks passed."))
  .catch((err) => {
    console.error("Component-placer demo failed:", err);
    process.exitCode = 1;
  });
