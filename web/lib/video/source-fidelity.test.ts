import assert from "node:assert/strict";
import { loadRegimenContent } from "../content";
import { SECTION_IDS, type ContentEntry } from "../content/types";
import { EDUCATION_LEVELS, DEPTH_PREFERENCES, VOICE_TONES, toPersonalizationFilter } from "../intake/schema";
import { buildSourcePacket, canonicalSourceEntry, detailInstructionPassages, sourcePacketText } from "./source-packet";
import { deterministicSourceSelection, hasExactEntryCoverage } from "./select";
import { checkEntityDiff, checkProtectedNumbers, checkReadingLevel } from "./guardrail";
import { buildRewritePrompt, buildCriticPrompt, hasExpectedStructure, validateCriticResponse, validateRewrittenNarration } from "./rewrite";

const entry: ContentEntry = {
  id: "side_effects.nausea", sectionId: "side_effects", name: "Nausea", tags: ["nausea-appetite"],
  tier: "self_care", anecdotal: false,
  plain: "Nausea may happen.",
  selfCare: "1. Take your medicine on schedule.\n2. Eat small meals.",
  callTeamIf: "Call your team for vomiting over 24 hours or if you cannot keep fluids down.",
  detail: "Your team can explain the medicine's mechanism.",
};
const short = buildSourcePacket(entry, false);
assert.deepEqual(short.passages.map((p) => p.field), ["plain", "selfCare", "callTeamIf"]);
assert.match(sourcePacketText(short), /Take your medicine on schedule/);
assert.match(sourcePacketText(short), /24 hours/);
assert.doesNotMatch(sourcePacketText(short), /1\.|2\.|mechanism/);
assert.match(sourcePacketText(buildSourcePacket(entry, true)), /mechanism/);
assert.match(short.detailContext!.text, /mechanism/, "short narration still receives complete context");
assert.notDeepEqual(canonicalSourceEntry(entry), canonicalSourceEntry({ ...entry, callTeamIf: "Call immediately." }));
assert.notDeepEqual(canonicalSourceEntry(entry), canonicalSourceEntry({ ...entry, tier: "emergency" }));
assert.notDeepEqual(canonicalSourceEntry(entry), canonicalSourceEntry({ ...entry, onScreen: "Call your team" }));

assert.equal(checkEntityDiff("Call after 24 hours.", [entry], false).ok, true, "action-field quantities belong to source");
assert.equal(checkEntityDiff("Call after 48 hours.", [entry], false).ok, false);
assert.equal(checkEntityDiff("Call after forty eight hours.", [entry], false).ok, false, "spelling out an invented quantity cannot bypass the gate");
assert.equal(checkProtectedNumbers([{ entryId: entry.id, text: "Call if vomiting lasts twenty four hours or fluids will not stay down." }], [entry]).ok, true);
assert.equal(checkProtectedNumbers([{ entryId: entry.id, text: "Call if vomiting lasts 48 hours." }], [entry]).ok, false);
assert.equal(checkProtectedNumbers([{ entryId: entry.id, text: "Nausea can happen. Eat small meals." }], [entry]).ok, false, "dropped escalation quantity fails");
const fever = { ...entry, name: "Fever", selfCare: undefined, callTeamIf: "Call for a temperature of 100.4 degrees Fahrenheit (38.0 degrees Celsius)." };
assert.equal(checkProtectedNumbers([{ entryId: fever.id, text: "Call for one hundred point four degrees Fahrenheit, thirty eight degrees Celsius." }], [fever]).ok, true);

const anecdote: ContentEntry = { ...entry, id: "patient_voices.example", sectionId: "patient_voices", name: "Patient experience", anecdotal: true,
  plain: "A patient felt tired and rested. Rest helped with fatigue.", selfCare: undefined, callTeamIf: undefined, detail: undefined };
for (const noun of ["patient", "person"]) for (const verb of ["shared", "said", "noted", "reported", "described", "recalled", "explained", "mentioned"]) {
  const text = `One ${noun} ${verb} that they felt tired and rested.`;
  assert.equal(checkEntityDiff(text, [anecdote]).ok, true, `source-attributed anecdote is not a clinical quantity: ${text}`);
  assert.equal(checkEntityDiff(`Treatment can feel tiring. ${text}`, [anecdote]).ok, true);
  assert.equal(checkEntityDiff(text, [{ ...anecdote, anecdotal: false }]).ok, false, "non-anecdotal entries cannot use the attribution exemption");
  assert.equal(checkEntityDiff(text, [anecdote, entry]).ok, false, "a mixed source union cannot authorize attribution by borrowing an anecdotal flag");
}
for (const text of [
  "One patient per day felt tired.", "One person takes medicine daily.", "One pill helps with fatigue.",
  "One patient shared that they took one pill.", "One person reported resting for one day.",
  "One patient noted that one dose helped.", "Only one patient said they felt tired.",
  "One of the medicines can cause fatigue.", "1 patient shared their experience.",
]) assert.equal(checkEntityDiff(text, [anecdote]).ok, false, `unsupported counts stay protected: ${text}`);
const anecdoteWithQuantity = { ...anecdote, plain: "A patient reported resting for 1 day." };
assert.equal(checkProtectedNumbers([{ entryId: anecdote.id, text: "One patient reported resting." }], [anecdoteWithQuantity]).ok, false, "attribution cannot satisfy a missing clinical quantity");
assert.equal(checkProtectedNumbers([{ entryId: anecdote.id, text: "One patient reported resting for one day." }], [anecdoteWithQuantity]).ok, true);
for (const [opening, closing] of [["\"", "\""], ["“", "”"], ["'", "'"], ["‘", "’"]]) {
  const text = `A patient said, ${opening}Fatigue was hard.${closing} They rested. A patient said, ${opening}Rest helped.${closing} They felt better.`;
  assert.deepEqual(checkReadingLevel(text, 8), { ok: true, avgWordsPerSentence: text.split(/\s+/).length / 4 }, "quoted sentence endings count toward actual sentence length");
  assert.equal(checkEntityDiff(text, [anecdote]).introduced.includes("they"), false, "sentence-initial They after a closing quote is not a medical entity");
  assert.equal(checkEntityDiff(`A patient said, ${opening}Rest helped.${closing} One person mentioned feeling tired.`, [anecdote]).ok, true, "anecdote attribution can follow a quoted sentence");
  assert.equal(checkEntityDiff(`A patient said, ${opening}Rest helped.${closing} They took Zofran.`, [anecdote]).ok, false, "medical names after quote boundaries remain checked");
}
assert.equal(checkReadingLevel("The reading was 100.4 degrees. Call your team.", 8).avgWordsPerSentence, 4, "decimal punctuation is not a sentence boundary");

const chunks = [{ entryId: entry.id, text: "Nausea may happen." }];
const completeChecks = short.passages.map((p) => ({ sourceRef: p.sourceRef, preserved: true }));
assert.equal(validateCriticResponse({ pass: true }, [entry], false), null, "a bare model pass is insufficient");
assert.equal(validateCriticResponse({ pass: true, checks: completeChecks.slice(0, 1) }, [entry], false), null, "review must account for action fields");
assert.equal(validateCriticResponse({ pass: true, checks: [...completeChecks, completeChecks[0]] }, [entry], false), null);
assert.equal(validateCriticResponse({ pass: true, checks: completeChecks }, [entry], false)?.pass, true);
for (const field of ["selfCare", "callTeamIf"]) {
  const checks = completeChecks.map((check) => check.sourceRef.endsWith(`:${field}`)
    ? { ...check, preserved: false, issue: "A distinct instruction was omitted or reversed." } : check);
  assert.equal(validateCriticResponse({ pass: true, checks }, [entry], false)?.pass, false, `${field} failure overrides a contradictory global pass`);
}
assert.equal(validateCriticResponse({ pass: true, checks: completeChecks, violations: [{ entryId: entry.id, issue: "Invented a treatment." }] }, [entry], false)?.pass, false);
const filter = toPersonalizationFilter({ regimenId: "rchop", educationLevel: "basic", depthPreference: "short", voiceTone: "friendly" });
// Public candidate revalidation must retain every cheap gate and stop before
// the paid semantic reviewer when a deterministic failure already exists.
assert.match((await validateRewrittenNarration([entry], filter, [])).feedback!, /required shape/);
assert.match((await validateRewrittenNarration([entry], filter, [{ entryId: entry.id, text: " " }])).feedback!, /required shape/);
assert.match((await validateRewrittenNarration([entry], filter, [{ entryId: entry.id, text: "Call after 48 hours." }])).feedback!, /introduced content/);
assert.match((await validateRewrittenNarration([entry], filter, [{ entryId: entry.id, text: "Nausea may happen." }])).feedback!, /required source quantities/);
assert.match((await validateRewrittenNarration([entry], filter, [{ entryId: entry.id, text: "Call after 24 hours. *pauses*" }])).feedback!, /speech synthesis/);
const anchorEntry: ContentEntry = { ...entry, id: "overview", sectionId: "overview", plain: "A typical course includes 6 cycles, 3 weeks apart, 18 weeks total.", selfCare: undefined, callTeamIf: undefined, detail: undefined, cycleCount: 6, weeksApart: 3, weeksTotal: 18 };
assert.match((await validateRewrittenNarration([anchorEntry], filter, [{ entryId: anchorEntry.id, text: "Treatment includes 6 cycles, 3 weeks apart, 18 weeks total." }])).feedback!, /wording a video beat needs/);
assert.match((await validateRewrittenNarration([entry], filter, [{ entryId: entry.id, text: "Call after 24 hours if you are still vomiting and cannot keep fluids down because your team needs to know about this so they can help you with what to do next." }])).feedback!, /sentences are too long/);
const rewritePrompt = buildRewritePrompt([entry], filter);
const criticPrompt = buildCriticPrompt([entry], chunks, false);
for (const prompt of [rewritePrompt, criticPrompt]) {
  assert.match(prompt, /Take your medicine on schedule/);
  assert.match(prompt, /24 hours/);
  assert.doesNotMatch(prompt, /1000-1100|only for entries marked tier/);
}

for (const regimenId of ["rchop", "ac-t"]) {
  const content = loadRegimenContent(regimenId);
  const patientVoices = content.entries.filter((source) => source.sectionId === "patient_voices");
  assert.ok(patientVoices.length > 0);
  for (const depthPreference of DEPTH_PREFERENCES) {
    const voicePrompt = buildRewritePrompt(patientVoices, toPersonalizationFilter({ regimenId, educationLevel: "basic", depthPreference, voiceTone: "hopeful" }));
    const sourceJson = voicePrompt.split("Source entries (JSON):\n")[1]!.split("\n\nRespond with ONLY")[0]!;
    const packets = JSON.parse(sourceJson) as { lengthGuidance: string }[];
    for (const packet of packets) {
      assert.match(packet.lengthGuidance, /every distinct source experience and its attribution/);
      assert.match(packet.lengthGuidance, /specific anecdote details and qualifications/);
      assert.match(packet.lengthGuidance, /never turn them into general advice, a promise, or an unsupported claim/);
      assert.match(packet.lengthGuidance, /short sentences with a flexible sentence count; no sentence cap/);
      assert.match(packet.lengthGuidance, /Short attributed paraphrases are allowed/);
      assert.match(packet.lengthGuidance, /'A patient\.\.\.' rather than numerical attribution/);
      assert.doesNotMatch(packet.lengthGuidance, /1-2 sentences|not a full anecdote|other patients feel this too/);
    }
  }
  const routines = content.entries.find((entry) => entry.id === "daily_life.helpful-routines")!;
  for (const text of [
    "Keeping your symptom notes in one place helps you and your team spot patterns.",
    "One simple way to spot patterns is to keep a symptom log.",
    "One helpful habit is keeping a symptom log.",
    "A symptom log is one thing that can help you and your team spot patterns.",
    "A simple symptom log can help you and your team spot patterns from one cycle to the next.",
  ]) assert.equal(checkEntityDiff(text, [routines]).ok, true, `grammatical one must not be an invented quantity: ${text}`);
  for (const text of [
    "Keep your symptom notes for one day.",
    "Take one dose after writing in your symptom log.",
    "Take one tablet each morning.",
    "Call if one side of your body feels weak.",
    "Drink one glass of water.",
    "Wait forty eight hours before calling.",
    "Take 1 dose.",
    "The treatment lasts one cycle.",
  ]) assert.equal(checkEntityDiff(text, [routines]).ok, false, `unsupported clinical quantities remain blocked: ${text}`);
  for (const text of ["Keep a log: These notes can help you spot patterns.", "Keep a log — This can help you spot patterns.", "Keep a log: For your team, it can help reveal patterns."]) {
    assert.equal(checkEntityDiff(text, [routines]).ok, true, "capitalized function words after a clause boundary are not names");
  }
  assert.equal(checkEntityDiff("Ask your team: For Zofran, call first.", [routines]).ok, false, "removing clause-initial For must not hide an invented following drug name");
  const selection = deterministicSourceSelection(content);
  const heart = content.entries.find((e) => e.id === "emergency.heart-symptoms")!;
  const heartShort = buildSourcePacket(heart, false);
  const disclosure = heartShort.passages.find((p) => p.field === "detailInstruction" && /disclosing prior treatment/.test(p.text));
  assert.ok(disclosure, `${regimenId}: prior-treatment disclosure survives short depth`);
  assert.ok(heartShort.detailContext?.text.includes("doxorubicin"), "excerpt retains full context for resolving 'it' and prior drug exposure");
  const checks = heartShort.passages.map((p) => ({ sourceRef: p.sourceRef, preserved: p.sourceRef !== disclosure!.sourceRef }));
  assert.equal(validateCriticResponse({ pass: true, checks }, [heart], false)?.pass, false, "dropped disclosure instruction cannot pass short review");
  if (regimenId === "ac-t") {
    const neuropathy = content.entries.find((e) => e.id === "side_effects.nerve-tingling-numbness")!;
    assert.ok(detailInstructionPassages(neuropathy).some((p) => /ask your team which schedule/.test(p.text)));
    const infection = content.entries.find((e) => e.id === "side_effects.low-blood-counts-infection-risk")!;
    assert.ok(detailInstructionPassages(infection).some((p) => /same-day care regardless/.test(p.text)));
  }
  assert.equal(hasExactEntryCoverage(selection.entryIds, content.entries), true);
  assert.equal(hasExactEntryCoverage([...selection.entryIds.slice(1), selection.entryIds[1]!], content.entries), false, "duplicate cannot conceal omission");
  assert.equal(hasExactEntryCoverage([...selection.entryIds, "invented"], content.entries), false);
  assert.equal(new Set(content.entries.map((e) => e.sectionId)).size, SECTION_IDS.length);
  assert.throws(() => deterministicSourceSelection({ ...content, entries: content.entries.filter((e) => e.sectionId !== "practical_life") }), /missing required sections/);
  assert.equal(hasExpectedStructure([{ entryId: entry.id, text: "one" }, { entryId: entry.id, text: "two" }], [entry, entry]), false);
  for (const educationLevel of EDUCATION_LEVELS) for (const depthPreference of DEPTH_PREFERENCES) for (const voiceTone of VOICE_TONES) {
    const prefs = toPersonalizationFilter({ regimenId, educationLevel, depthPreference, voiceTone });
    assert.equal(prefs.includeDetail, depthPreference === "detailed");
    for (const sourceEntry of content.entries) {
      const packet = buildSourcePacket(sourceEntry, prefs.includeDetail);
      for (const field of ["selfCare", "callTeamIf", "call911", "callTeam"] as const) {
        if (sourceEntry[field]) assert.ok(packet.passages.some((p) => p.field === field), `${sourceEntry.id} loses ${field}`);
      }
    }
  }
}
console.log("Source fidelity tests passed: complete packets, all sections/preferences, exact coverage, numeric protection and complete semantic review reports.");
