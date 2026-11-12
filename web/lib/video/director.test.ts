import assert from "node:assert/strict";
import { loadRegimenContent } from "../content";
import { toPersonalizationFilter } from "../intake/schema";
import { authoredDecisions, compileDirection, compositionCapabilities, displayMessages, eligibleAssets, validateDirection, directionCacheKey, directorImplementationFingerprint, directorCueOptions, directVideoWithRepairs, regimenDisplayTitle, sourceLabelCues, type DirectorInput } from "./director";
import { projectFeverSafetyCard, safetyDisplayWarning } from "./safety-display";

const cueTiming = { entryId: "symptom", startSeconds: 10, endSeconds: 30 };
const cueWords = "If you have diarrhea, call your team. If you have constipation, ask your team.".split(" ").map((text, index) => ({ text, startSeconds: 10 + index, endSeconds: 10.5 + index }));
const cueOptions = directorCueOptions(cueTiming, cueWords);
assert.equal(cueOptions[0], "");
assert.ok(cueOptions.includes("If you have diarrhea,") && cueOptions.includes("If you have constipation,"), "distinct conditional branches retain separate exact anchors");
assert.ok(!cueOptions.includes("If you have"), "repeated conditional prefix is never offered");
assert.deepEqual(directorCueOptions(cueTiming, []), [""], "no timing evidence offers only the existing opening cue");
const repeatedCueWords = "Call your team now. Call your team now.".split(" ").map((text, index) => ({ text, startSeconds: 10 + index, endSeconds: 10.5 + index }));
assert.deepEqual(directorCueOptions(cueTiming, repeatedCueWords), [""], "repeated sentences cannot produce invented cross-sentence anchors");
assert.deepEqual(directorCueOptions(cueTiming, [...cueWords, { text: "Outside", startSeconds: 31, endSeconds: 32 }]), cueOptions, "another entry cannot supply a cue");

for (const regimenId of ["rchop", "ac-t"]) {
  const content = loadRegimenContent(regimenId);
  const input: DirectorInput = { content,
    filter: toPersonalizationFilter({ regimenId, educationLevel: "basic", depthPreference: "detailed", voiceTone: "hopeful" }),
    chunks: content.entries.map((e) => ({ entryId: e.id, text: e.plain })),
    entries: content.entries.map((e, i) => ({ entryId: e.id, startSeconds: i * 10, endSeconds: (i + 1) * 10 })),
    words: [], totalSeconds: content.entries.length * 10 };
  const decisions = authoredDecisions(input);
  const result = compileDirection(input, decisions, "authored");
  assert.deepEqual(validateDirection(result, content), []);
  assert.equal(new Set(result.shots.map((s) => s.sectionId)).size, 9);
  assert.equal(result.shots[0]!.headline, regimenId === "rchop" ? "R-CHOP" : "AC-T");
  assert.equal(result.regimenTitle, regimenDisplayTitle(content));
  assert.throws(() => compileDirection(input, decisions.map((decision, index) => index === 0 ? { ...decision, staging: "center" } : decision), "ai"), /staging/);
  const centeredCache = structuredClone(result);
  centeredCache.shots[0]!.staging = "center";
  assert.ok(validateDirection(centeredCache, content).some((issue) => /staging/.test(issue)), "unsupported center is rejected in stored plans too");
  for (const [index, entry] of content.entries.entries()) {
    const capabilities = compositionCapabilities(entry);
    const decision = decisions[index]!;
    assert.ok(capabilities.cameras.includes(decision.camera));
    assert.ok(capabilities.stagings.includes(decision.staging));
    assert.ok(capabilities.transitions.includes(decision.transition));
    if (entry.sectionId === "timeline") assert.deepEqual(capabilities, { cameras: ["establish"], stagings: ["right"], transitions: ["zoom-through", "match-cut", "settle"] });
    if (entry.sectionId === "patient_voices") assert.deepEqual(capabilities.stagings, ["right"]);
    if (entry.sectionId === "emergency") {
      assert.deepEqual(capabilities.stagings, ["left"]);
      if (projectFeverSafetyCard(entry)) assert.deepEqual(capabilities.cameras, ["establish"]);
      else assert.ok(capabilities.cameras.includes("detail") && capabilities.cameras.includes("drift"));
    }
    for (const invalid of [
      ...(["establish", "push-in", "detail", "drift"] as const).filter((camera) => !capabilities.cameras.includes(camera)).map((camera) => ({ camera })),
      ...(["left", "right"] as const).filter((staging) => !capabilities.stagings.includes(staging)).map((staging) => ({ staging })),
      ...(["zoom-through", "match-cut", "settle"] as const).filter((transition) => !capabilities.transitions.includes(transition)).map((transition) => ({ transition })),
    ]) {
      assert.throws(() => compileDirection(input, decisions.map((item, decisionIndex) => decisionIndex === index ? { ...item, ...invalid } : item), "ai"), /Unsupported scene composition/);
      const invalidCache = structuredClone(result);
      Object.assign(invalidCache.shots[index]!, invalid);
      assert.ok(validateDirection(invalidCache, content).some((issue) => /Unsupported scene composition/.test(issue)), "cache cannot bypass renderer capabilities");
    }
  }
  assert.deepEqual(result.shots[0]!.labelCues, [], "silent authored preview has no fabricated label clock");
  const overview = content.entries.find((entry) => entry.sectionId === "overview")!;
  const labelWords = ["Welcome", "to", "treatment.", ...overview.drugNames!.flatMap((name) => [`${name}—this`, "medicine", "helps."]), "The", "course", "takes", "several", "weeks."];
  const labelEvidence = labelWords.map((text, index) => ({ text, startSeconds: .4 + index * .25, endSeconds: .6 + index * .25 }));
  const exactCues = sourceLabelCues(overview, input.entries[0]!, labelEvidence);
  assert.deepEqual(exactCues.map((cue) => cue.text), overview.drugNames, "only original source labels are shown");
  for (const [index, cue] of exactCues.entries()) {
    assert.equal(cue.startSeconds, labelEvidence[3 + index * 3]!.startSeconds, "medicine joined to an emdash still starts at its real timed word");
    assert.equal(cue.endSeconds, labelEvidence[5 + index * 3]!.endSeconds, "label stops at medicine sentence end, not an equal-duration partition");
  }
  assert.ok(exactCues[0]!.startSeconds > labelEvidence[2]!.endSeconds, "intro has no unrelated medicine label");
  assert.ok(exactCues.at(-1)!.endSeconds < labelEvidence[labelWords.length - 5]!.startSeconds, "schedule discussion has no leftover medicine label");
  const timedInput = { ...input, words: labelEvidence, chunks: input.chunks.map((chunk, index) => index === 0 ? { ...chunk, text: labelWords.join(" ") } : chunk) };
  const timedDirection = compileDirection(timedInput, decisions, "ai");
  assert.deepEqual(validateDirection(timedDirection, content, timedInput), []);
  assert.ok(validateDirection(timedDirection, content).some((issue) => /timing evidence is required/.test(issue)), "AI cache cannot validate guessed label timing without speech evidence");
  const wrongLabelTime = structuredClone(timedDirection);
  wrongLabelTime.shots[0]!.labelCues![0]!.startSeconds += .01;
  assert.ok(validateDirection(wrongLabelTime, content, timedInput).some((issue) => /Unbound source label timing/.test(issue)));
  const missingLabelTimes = structuredClone(timedDirection);
  delete missingLabelTimes.shots[0]!.labelCues;
  assert.ok(validateDirection(missingLabelTimes, content, timedInput).some((issue) => /Unbound source label timing/.test(issue)));
  const wrongLabel = structuredClone(timedDirection);
  wrongLabel.shots[0]!.labelCues![0]!.text = "Invented medicine";
  assert.ok(validateDirection(wrongLabel, content, timedInput).some((issue) => /label/.test(issue)));
  if (regimenId === "rchop") {
    const substituted = labelEvidence.map((word) => ({ ...word, text: word.text.replace(/Prednisone/i, "Prednisolone") }));
    assert.ok(!sourceLabelCues(overview, input.entries[0]!, substituted).some((cue) => cue.text === "Prednisone"), "similar drug names never receive a fuzzy label match");
  }
  const unpunctuated = [{ text: overview.drugNames![0]!, startSeconds: 1, endSeconds: 1.4 }, { text: "then", startSeconds: 1.5, endSeconds: 1.7 }, { text: "unrelated", startSeconds: 1.8, endSeconds: 2.1 }];
  assert.equal(sourceLabelCues(overview, input.entries[0]!, unpunctuated)[0]!.endSeconds, 1.4, "missing punctuation cannot extend a label through the remaining overview");
  assert.throws(() => compileDirection(input, decisions.slice(1), "ai"), /cover/);
  assert.throws(() => compileDirection(input, decisions.map((d, i) => i === 1 ? decisions[0] : d), "ai"), /cover/);
  assert.throws(() => compileDirection(input, decisions.map((d, i) => i === 0 ? { ...d, assetId: "unknown" } : d), "ai"), /Unsupported/);
  assert.throws(() => compileDirection(input, decisions.map((d, i) => i === 0 ? { ...d, messageIndex: 999 } : d), "ai"), /Unknown source message/);
  assert.throws(() => compileDirection(input, decisions.map((d, i) => i === 0 ? { ...d, cue: "invented medical text" } : d), "ai"), /cannot be timed/);
  const changed = structuredClone(result);
  changed.shots[0]!.message = "A fabricated clinical claim";
  assert.ok(validateDirection(changed, content).some((s) => /Unbound/.test(s)));
  const mutations: ((value: typeof result) => void)[] = [
    (value) => { value.regimenId = "wrong-regimen"; },
    (value) => { value.regimenTitle = "Unrelated title"; },
    (value) => { value.version = "outdated"; },
    (value) => { value.totalSeconds = NaN; },
    (value) => { value.shots[0]!.cueSeconds = NaN; },
    (value) => { value.shots[0]!.cueSeconds = Infinity; },
    (value) => { value.shots[0]!.headline = "Invented clinical heading"; },
    (value) => { value.shots[0]!.labels = ["Invented drug"]; },
    (value) => { value.shots[0]!.scene = "emergency"; },
    (value) => { value.shots[0]!.sourceRefs = ["unrelated-entry"]; },
    (value) => { value.shots[0]!.focus.x = .99; },
    (value) => { value.shots[0]!.id = "unexpected-id"; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(result);
    mutate(candidate);
    assert.ok(validateDirection(candidate, content).length > 0, "altered cached source/identity/geometry/timing must fail");
  }
  assert.ok(validateDirection({ ...result, shots: undefined } as unknown as typeof result, content).length > 0, "malformed cached data fails without trusting TypeScript types");
  const mouth = content.entries.find((entry) => entry.id === "side_effects.mouth-sores")!;
  assert.ok(!eligibleAssets(mouth).some((choice) => choice.actions.includes("drink")), "drinking difficulty is not drinking advice");
  const reaction = content.entries.find((entry) => entry.sectionId === "emergency" && /infusion.*reaction/i.test(entry.name ?? ""))!;
  assert.ok(!eligibleAssets(reaction).some((choice) => choice.actions.includes("temperature")), "fever mentioned during reaction does not authorize checking temperature instead of alerting staff");
  assert.ok(!eligibleAssets(reaction).some((choice) => choice.asset.id === "patient-temperature"), "observe cannot sneak in an unsupported thermometer asset");
  assert.ok(!eligibleAssets(reaction).some((choice) => choice.actions.includes("call")), "in-person urgent staff instruction does not become a phone demonstration");
  const fever = content.entries.find((entry) => entry.sectionId === "emergency" && /fever/i.test(entry.name ?? ""))!;
  const card = projectFeverSafetyCard(fever)!;
  assert.deepEqual(card.criteria, ["100.4°F (38.0°C) or higher sustained for an hour", "a single reading of 101°F (38.3°C) or higher"]);
  assert.equal(card.action, 'Call your care team immediately, day or night — don\'t wait for office hours or "see if it comes down."');
  assert.equal(card.applicability, "at any point in treatment");
  assert.deepEqual(result.shots.find((shot) => shot.entryId === fever.id)!.safetyCard, card);
  assert.equal(safetyDisplayWarning(fever), undefined);
  assert.equal(projectFeverSafetyCard(mouth), undefined, "non-fever entries never receive fever cards");
  const changedSource = { ...fever, plain: fever.plain.replace("100.4°F (38.0°C)", "102.2°F (39.0°C)").replace("an hour", "two hours").replace("101°F (38.3°C)", "103.1°F (39.5°C)") };
  const changedCard = projectFeverSafetyCard(changedSource)!;
  assert.deepEqual(changedCard.criteria, ["102.2°F (39.0°C) or higher sustained for two hours", "a single reading of 103.1°F (39.5°C) or higher"], "both criteria and duration come from source, never hardcoded clinical values");
  assert.equal(changedCard.action, card.action);
  assert.equal(changedCard.applicability, card.applicability);
  const changedFeverInput = structuredClone(input);
  changedFeverInput.content.entries = content.entries.map((entry) => entry.id === fever.id ? changedSource : entry);
  const recompiled = compileDirection(changedFeverInput, authoredDecisions(changedFeverInput), "authored");
  assert.deepEqual(recompiled.shots.find((shot) => shot.entryId === fever.id)!.safetyCard, changedCard);
  assert.ok(validateDirection(result, changedFeverInput.content).some((issue) => /safety card/.test(issue)), "source threshold change invalidates old cached card");
  for (const mutate of [
    (value: typeof card) => { value.criteria[0] = "100.4°F"; },
    (value: typeof card) => { value.criteria[1] = "101°F"; },
    (value: typeof card) => { value.action = "Wait until morning."; },
    (value: typeof card) => { value.applicability = "Only during low counts."; },
  ]) {
    const candidate = structuredClone(result);
    mutate(candidate.shots.find((shot) => shot.entryId === fever.id)!.safetyCard!);
    assert.ok(validateDirection(candidate, content).some((issue) => /safety card/.test(issue)));
  }
  const missingCard = structuredClone(result);
  delete missingCard.shots.find((shot) => shot.entryId === fever.id)!.safetyCard;
  assert.ok(validateDirection(missingCard, content).some((issue) => /safety card/.test(issue)), "known card cannot be omitted from cache");
  for (const unsupported of [
    fever.plain.replace("or higher sustained", "or lower sustained"),
    fever.plain.replace("Call your care team immediately", "Call your care team next week"),
    fever.plain.replace("at any point in treatment", "only during the low-count window"),
    fever.plain.replace("or a single reading", "and a single reading"),
    fever.plain.replace("Call your care team immediately", "Do not Call your care team immediately"),
    fever.plain.replace(/treat a fever at/i, "Do not treat a fever at"),
  ]) {
    const source = { ...fever, plain: unsupported };
    assert.equal(projectFeverSafetyCard(source), undefined, "unknown clinical relationship cannot be approximated");
    assert.match(safetyDisplayWarning(source)!, /no safety card generated/);
  }
  assert.ok(eligibleAssets(fever).some((choice) => choice.actions.includes("temperature")), "actual fever-threshold entry supports thermometer scene");
  assert.deepEqual(eligibleAssets(fever).map((choice) => ({ assetId: choice.asset.id, actions: choice.actions })), [{ assetId: "patient-temperature", actions: ["temperature"] }], "complete fever card only advertises its actual fixed thermometer illustration");
  assert.deepEqual(compositionCapabilities(fever).transitions, ["match-cut", "settle"], "complete fever card suppresses zoom and cannot advertise it");
  for (const invalid of [{ assetId: "patient-contact", action: "call" }, { assetId: "patient-temperature", action: "observe" }, { assetId: "patient-observe", action: "observe" }]) {
    assert.throws(() => compileDirection(input, decisions.map((decision) => decision.entryId === fever.id ? { ...decision, ...invalid } : decision), "ai"), /Unsupported visual action/);
    const invalidCache = structuredClone(result);
    Object.assign(invalidCache.shots.find((shot) => shot.entryId === fever.id)!, invalid);
    assert.ok(validateDirection(invalidCache, content).some((issue) => /Unsupported action/.test(issue)), "cached fever plans cannot substitute unsupported actions");
  }
  const nonCardFever = { ...fever, plain: fever.plain.replace("at any point in treatment", "only during the low-count window") };
  assert.ok(eligibleAssets(nonCardFever).some((choice) => choice.actions.includes("call")), "standard emergency scene retains a source-supported phone action when no fixed card is projected");
  assert.ok(!displayMessages(fever).some((message) => /this threshold/.test(message)), "threshold-dependent sentence cannot appear without its threshold");
  const bladder = content.entries.find((entry) => entry.id === "side_effects.bladder-irritation")!;
  assert.ok(eligibleAssets(bladder).some((choice) => choice.actions.includes("drink")), "affirmative hydration instruction supports drinking");
  const restriction = { ...mouth, plain: "Do not exercise. You have trouble walking.", selfCare: "Avoid drinking water for now.", callTeamIf: undefined };
  assert.ok(!eligibleAssets(restriction).some((choice) => choice.actions.some((action) => ["drink", "stretch", "walk"].includes(action))), "negated actions cannot be illustrated as recommendations");
  const positive = { ...mouth, plain: "Wash your hands. Gentle activity is useful. Walk slowly.", selfCare: "Hand hygiene, avoid sick contacts.", callTeamIf: undefined };
  assert.ok(eligibleAssets(positive).some((choice) => choice.actions.includes("wash-hands")));
  assert.ok(eligibleAssets(positive).some((choice) => choice.actions.includes("stretch")));
  assert.ok(eligibleAssets(positive).some((choice) => choice.actions.includes("walk")));
  for (const selfCare of ["Sip fluids regularly.", "Sip water throughout the day.", "Drink small amounts of fluids.", "Take small sips of clear fluids.", "Sip small amounts of clear fluids.", "Drink enough water."]) {
    assert.ok(eligibleAssets({ ...mouth, selfCare }).some((choice) => choice.actions.includes("drink")), `affirmative hydration variant: ${selfCare}`);
  }
  for (const selfCare of ["Avoid drinking water.", "Do not sip fluids.", "You have trouble sipping water.", "Drink fluids only if prescribed; otherwise do not drink fluids."]) {
    // Explicit contraindication examples must remain blocked. Conditional
    // prescriptions require separate clinician-bound asset authoring.
    assert.ok(!eligibleAssets({ ...mouth, selfCare }).some((choice) => choice.actions.includes("drink")), `restriction: ${selfCare}`);
  }
  const exercise = content.entries.find((entry) => entry.id === "daily_life.exercise")!;
  assert.ok(eligibleAssets(exercise).some((choice) => choice.actions.includes("walk")));
  assert.ok(eligibleAssets(exercise).some((choice) => choice.actions.includes("stretch")), "light and gentle activity both support gentle movement");
  assert.equal(decisions.find((decision) => decision.entryId === exercise.id)!.action, "walk", "authored preview prioritizes the explicitly named walking action");
  const figurative = { ...mouth, plain: "Restlessness may happen. The rest of the cycle varies. This can be a tougher stretch.", selfCare: undefined, callTeamIf: undefined };
  assert.ok(!eligibleAssets(figurative).some((choice) => choice.actions.some((action) => action === "rest" || action === "stretch")), "figurative words and word prefixes cannot authorize physical actions");
  const nausea = content.entries.find((entry) => entry.id.includes("nausea-and-"))!;
  assert.ok(!eligibleAssets(nausea).some((choice) => choice.actions.includes("drink")), "current nausea source advises food/medication, not hydration");
  for (const { entry, assetId, action } of [
    { entry: reaction, assetId: "patient-contact", action: "call" },
    { entry: mouth, assetId: "patient-hydration", action: "drink" },
    { entry: nausea, assetId: "patient-hydration", action: "drink" },
    { entry: nausea, assetId: "patient-hydration", action: "rest" },
  ] as const) {
    assert.throws(() => compileDirection(input, decisions.map((decision) => decision.entryId === entry.id ? { ...decision, assetId, action } : decision), "ai"), /Unsupported visual action/, "approved artwork cannot substitute an unsupported source action");
    const invalidCache = structuredClone(result);
    Object.assign(invalidCache.shots.find((shot) => shot.entryId === entry.id)!, { assetId, action });
    assert.ok(validateDirection(invalidCache, content).some((issue) => /Unsupported action/.test(issue)), "cached direction cannot bypass source eligibility, including passive hydration poses");
  }
  const ambiguous = structuredClone(input);
  ambiguous.words = ["call", "now", "call", "now"].map((text, i) => ({ text, startSeconds: i, endSeconds: i + .5 }));
  assert.throws(() => compileDirection(ambiguous, decisions.map((decision, i) => i === 0 ? { ...decision, cue: "call now" } : decision), "ai"), /ambiguous/);
  const changedInput = structuredClone(input);
  changedInput.content.entries[0]!.plain += " Changed source.";
  assert.notEqual(directionCacheKey(input), directionCacheKey(changedInput));
  assert.match(directorImplementationFingerprint(), /^[a-f0-9]{64}$/);
  for (const [i, shot] of result.shots.entries()) assert.ok(displayMessages(content.entries[i]!).includes(shot.message));
}
{
  const content = loadRegimenContent("rchop");
  const input: DirectorInput = { content,
    filter: toPersonalizationFilter({ regimenId: "rchop", educationLevel: "some_college", depthPreference: "short", voiceTone: "friendly" }),
    chunks: content.entries.map((entry) => ({ entryId: entry.id, text: entry.plain })),
    entries: content.entries.map((entry, index) => ({ entryId: entry.id, startSeconds: index * 10, endSeconds: (index + 1) * 10 })),
    words: ["call", "now", "call", "now"].map((text, index) => ({ text, startSeconds: index, endSeconds: index + .5 })),
    totalSeconds: content.entries.length * 10 };
  const choices = authoredDecisions(input);
  const first = choices[0]!;
  const timeline = choices.find((choice) => content.entries.find((entry) => entry.id === choice.entryId)?.sectionId === "timeline")!;
  const stable = choices.find((choice) => choice.entryId !== first.entryId && choice.entryId !== timeline.entryId)!;
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (message: unknown) => { warnings.push(String(message)); };
  try {
    const requested: string[][] = [];
    const repaired = await directVideoWithRepairs(input, async ({ entryIds, accepted, feedback }) => {
      requested.push(entryIds);
      if (requested.length === 1) return choices.map((choice) => choice.entryId === first.entryId ? { ...choice, cue: "call now" } : choice.entryId === timeline.entryId ? { ...choice, staging: "left" } : choice);
      if (requested.length === 2) {
        assert.equal(accepted.length, choices.length - 2, "valid AI entries survive unrelated composition and cue failures");
        assert.match(feedback[first.entryId]!, /ambiguous/);
        assert.match(feedback[timeline.entryId]!, /Unsupported scene composition/);
        return [timeline];
      }
      assert.equal(accepted.length, choices.length - 1);
      return [{ ...stable, assetId: "invented-asset" }, first];
    });
    assert.deepEqual(requested, [choices.map((choice) => choice.entryId), [first.entryId, timeline.entryId], [first.entryId]], "repairs request only unresolved AI entries in source order");
    assert.deepEqual(repaired, compileDirection(input, choices, "ai"), "accepted choices cannot be replaced by an unsolicited invalid repair");
    assert.equal(repaired.method, "ai");

    let boundedCalls = 0;
    await assert.rejects(() => directVideoWithRepairs(input, async () => ++boundedCalls === 1 ? [first] : []), /initial plan and 3 repairs/);
    assert.equal(boundedCalls, 4, "one initial plan and three repairs is a hard bound; authored scaffolding cannot fill missing AI entries");

    let duplicateCalls = 0;
    const duplicateRepair = await directVideoWithRepairs(input, async ({ entryIds, feedback }) => {
      if (++duplicateCalls === 1) return [first, ...choices];
      assert.deepEqual(entryIds, [first.entryId]);
      assert.match(feedback[first.entryId]!, /Duplicate/);
      return [first];
    });
    assert.deepEqual(duplicateRepair, repaired, "duplicate entries require an explicit unique AI repair");

    let malformedCalls = 0;
    const malformedRepair = await directVideoWithRepairs(input, async ({ entryIds }) => {
      assert.equal(entryIds.length, choices.length);
      return ++malformedCalls === 1 ? "not JSON" : choices;
    });
    assert.deepEqual(malformedRepair, repaired, "malformed output cannot manufacture accepted entries");
    assert.ok(warnings.some((message) => message.includes("validated AI decisions")));
  } finally { console.warn = warn; }
}
console.log("director.test: ok");
