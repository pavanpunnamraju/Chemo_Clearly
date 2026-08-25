// Runnable self-check for the narration-rewrite entity-diff guardrail
// (lib/video/guardrail.ts) — Phase 1 goal #3c. No LLM/network needed; this
// exercises the guardrail against fixed cases before rewrite.ts (the LLM
// caller) exists. Run: npm run demo:guardrail

import assert from "node:assert/strict";
import { checkAnchorPhrases, checkEntityDiff, checkReadingLevel, checkTtsSafety } from "../lib/video/guardrail";
import type { ContentEntry } from "../lib/content/types";

// Markdown shapes exercised here all come from real docs/content/*.md
// entries (see rchop.md) — bold-split acronym letters, citation markers,
// bullet dashes, and a multi-word bold span all needed cleanForSpeechAndDisplay
// to be applied before comparison, not just the single leading-letter-bold
// case that first surfaced the bug.
const sourceEntries: ContentEntry[] = [
  {
    id: "side_effects.nausea-and-vomiting",
    sectionId: "side_effects",
    name: "Nausea and vomiting",
    tags: ["nausea-appetite"],
    tier: "self_care",
    plain: "Nausea is common after **O**ndansetron doses. [S1, S2]\n- Call your team if vomiting lasts more than 24 hours.",
    detail: "Most patients take Ondansetron 8mg before each cycle.",
    anecdotal: false,
  },
  {
    id: "overview",
    sectionId: "overview",
    tags: ["what-it-is"],
    plain: "R-CHOP is given in cycles, typically every 21 days, for a **total of six cycles**.",
    anecdotal: false,
  },
  {
    // Mirrors the real timeline bug (docs/references/handoff.md): the day
    // range and "nadir" live only in the heading, never restated in plain.
    id: "timeline.roughly-days-7-10",
    sectionId: "timeline",
    name: 'Roughly days 7-10 (the "nadir")',
    tags: [],
    plain: "Your blood counts are typically at their lowest here, which is why infection risk peaks during this window.",
    anecdotal: false,
  },
];

const cases: { name: string; text: string; expectOk: boolean }[] = [
  {
    name: "paraphrase reusing only source facts",
    text: "You might feel nauseous after your Ondansetron dose. If vomiting sticks around for more than 24 hours, call your care team. Cycles happen every 21 days, six in total.",
    expectOk: true,
  },
  {
    name: "sentence-initial capitalized words, no invented facts",
    text: "The nausea usually passes. Your team wants to hear from you if it doesn't.",
    expectOk: true,
  },
  {
    name: "invented number",
    text: "About 40% of patients feel nauseous after treatment.",
    expectOk: false,
  },
  {
    name: "invented drug name",
    text: "Taking Zofran alongside your regular medication can help with nausea.",
    expectOk: false,
  },
  {
    name: "reuses a word from inside a multi-word bold span",
    text: "Patients go through a total of six cycles in all.",
    expectOk: true,
  },
  {
    name: "reuses a word that was only adjacent to a citation marker",
    text: "Your team should know if vomiting doesn't ease up within a day.",
    expectOk: true,
  },
  {
    name: "sentence-initial transition words absent verbatim from source",
    text: "Regarding your next cycle, nausea is common. Now, remember to call your team if vomiting lasts more than a day. Another thing to know: cycles run every 21 days.",
    expectOk: true,
  },
  {
    name: "invented drug name still caught mid-sentence",
    text: "Your team may suggest Zofran alongside your regular medication.",
    expectOk: false,
  },
  {
    // Day numbers and "nadir" live only in timeline.roughly-days-7-10's
    // heading (see sourceEntries above), never in its plain/detail — a
    // faithful narration has to say them.
    name: "reuses a number and proper noun present only in the entry heading",
    text: "Days 7 to 10 are usually the nadir, when your counts are lowest.",
    expectOk: true,
  },
  {
    name: "invented fact absent from heading, plain, and detail alike",
    text: "Days 7 to 10 carry about a 40% infection risk, per Dr. Zofran's team.",
    expectOk: false,
  },
];

for (const c of cases) {
  const result = checkEntityDiff(c.text, sourceEntries);
  console.log(`${result.ok === c.expectOk ? "PASS" : "FAIL"} — ${c.name}`, result.ok ? "" : result.introduced);
  assert.equal(result.ok, c.expectOk, `case "${c.name}" expected ok=${c.expectOk}, got ok=${result.ok} (introduced: ${result.introduced.join(", ")})`);
}

const ttsCases: { name: string; text: string; expectOk: boolean }[] = [
  { name: "plain prose", text: "You might feel nauseous after your dose. Call your team if it lasts more than a day.", expectOk: true },
  { name: "markdown bold", text: "You might feel **nauseous** after your dose.", expectOk: false },
  { name: "markdown header", text: "# Nausea\nYou might feel nauseous.", expectOk: false },
  { name: "asterisk stage direction", text: "*pauses* You might feel nauseous after your dose.", expectOk: false },
  { name: "bracket stage direction", text: "[softly] You might feel nauseous after your dose.", expectOk: false },
];

for (const c of ttsCases) {
  const result = checkTtsSafety(c.text);
  console.log(`${result.ok === c.expectOk ? "PASS" : "FAIL"} — tts-safety: ${c.name}`, result.ok ? "" : result.issues);
  assert.equal(result.ok, c.expectOk, `case "${c.name}" expected ok=${c.expectOk}, got ok=${result.ok} (issues: ${result.issues.join(", ")})`);
}

const readingLevelCases: { name: string; text: string; expectOk: boolean }[] = [
  { name: "short sentences", text: "You might feel sick. Call your team if it lasts a day. Rest when you can.", expectOk: true },
  {
    name: "one long run-on sentence",
    text: "You might feel sick after your dose which is a common and expected side effect that many patients experience during and after treatment and it usually passes within a day or two but you should still call your care team if it continues for longer than that because it could be a sign of something else going on.",
    expectOk: false,
  },
];

for (const c of readingLevelCases) {
  const result = checkReadingLevel(c.text);
  console.log(`${result.ok === c.expectOk ? "PASS" : "FAIL"} — reading-level: ${c.name}`, `avg=${result.avgWordsPerSentence.toFixed(1)}`);
  assert.equal(result.ok, c.expectOk, `case "${c.name}" expected ok=${c.expectOk}, got ok=${result.ok} (avg=${result.avgWordsPerSentence.toFixed(1)})`);
}

// Round 9: `checkAnchorPhrases` — overview's countdown-cards beat (round 8)
// times its cut/reveals off "A typical course" surviving the LLM rewrite
// verbatim. Nothing else catches a rewrite that paraphrases it away (that's
// not an "introduced fact" checkEntityDiff would flag), so this needs its
// own check.
const anchorEntries: ContentEntry[] = [
  {
    id: "overview",
    sectionId: "overview",
    tags: ["what-it-is"],
    plain: "A typical course is 6 cycles, 3 weeks apart, so about 18 weeks total.",
    cycleCount: 6,
    weeksApart: 3,
    weeksTotal: 18,
    anecdotal: false,
  },
  {
    // No cycleCount/weeksApart/weeksTotal — requiredAnchorPhrase is
    // undefined for this one, so it has no anchor requirement at all
    // (this is AC-T's exact shape: the gate is the 3 fields, not the
    // regimen or section id).
    id: "timeline",
    sectionId: "timeline",
    tags: [],
    plain: "Here's roughly what one 3-week cycle feels like.",
    anecdotal: false,
  },
];

const anchorCases: { name: string; chunks: { entryId: string; text: string }[]; expectOk: boolean }[] = [
  {
    name: "phrase preserved verbatim",
    chunks: [
      { entryId: "overview", text: "A typical course is six cycles, three weeks apart, about 18 weeks total." },
      { entryId: "timeline", text: "Here's what one cycle feels like." },
    ],
    expectOk: true,
  },
  {
    name: "phrase preserved with different surrounding wording and whitespace",
    chunks: [
      { entryId: "overview", text: "You'll go through this: a  typical\ncourse involves 6 cycles." },
      { entryId: "timeline", text: "Here's what one cycle feels like." },
    ],
    expectOk: true,
  },
  {
    name: "phrase paraphrased away — the exact bug this guardrail exists to catch",
    chunks: [
      { entryId: "overview", text: "You'll typically get 6 cycles, spaced 3 weeks apart, about 18 weeks total." },
      { entryId: "timeline", text: "Here's what one cycle feels like." },
    ],
    expectOk: false,
  },
  {
    name: "entry with no anchor requirement never flagged, whatever its wording",
    chunks: [
      { entryId: "overview", text: "A typical course is six cycles." },
      { entryId: "timeline", text: "Every 3 weeks, a new cycle begins." },
    ],
    expectOk: true,
  },
];

for (const c of anchorCases) {
  const result = checkAnchorPhrases(c.chunks, anchorEntries);
  console.log(`${result.ok === c.expectOk ? "PASS" : "FAIL"} — anchor-phrases: ${c.name}`, result.ok ? "" : result.missing);
  assert.equal(result.ok, c.expectOk, `case "${c.name}" expected ok=${c.expectOk}, got ok=${result.ok} (missing: ${result.missing.join(", ")})`);
}

console.log("\nAll guardrail self-checks passed.");
