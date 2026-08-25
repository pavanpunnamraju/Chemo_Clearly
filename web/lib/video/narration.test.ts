// Regression test for the ambiguity-aware phrase matching and the
// drift-check hard-failure (docs/references/handoff.md). No framework; run
// directly with tsx. Run: npm run test:narration

import assert from "node:assert/strict";
import { applyTimepoints, matchTimestamps } from "./narration";
import type { NarrationPlan, SlideBeat } from "./narration";

function alignedFrom(words: string[], secondsPerWord = 1): { word: string; startSeconds: number }[] {
  return words.map((word, i) => ({ word, startSeconds: i * secondsPerWord }));
}

// (a) A repeated 3-word phrase must not cause a false early match — the
// second slide's anchor ("call your care team") appears twice in the
// transcript; the real occurrence is the second one, further along after
// unrelated words. Matching should skip the ambiguous first hit and land on
// the unique longer phrase instead of yanking the cursor back to the earlier
// occurrence.
{
  const aligned = alignedFrom([
    "if", "you", "have", "a", "fever", "call", "your", "care", "team", "right", "away",
    "for", "questions", "about", "your", "medication", "schedule", "call", "your", "care",
    "team", "during", "office", "hours",
  ]);
  const anchors = ["call your care team during office hours"];
  const [match] = matchTimestamps(anchors, aligned);
  assert.notEqual(match, null, "expected a match");
  // "call your care team" alone appears at index 5 and 17; the unique
  // continuation ("...during office hours") only appears at 17.
  assert.equal(match, aligned[17]!.startSeconds, "should resolve the ambiguous phrase to its unique occurrence");
}

// (b) applyTimepoints throws when drift exceeds the threshold instead of
// warning and continuing. Slide 1's text has no alignment match at all (so
// it keeps its own — artificially high — word-count estimate); slide 2's
// text does match, early in the transcript. The forward-only clamp then
// pins slide 2 to slide 1's inflated estimate, far from its real matched
// position, which is exactly the mistiming this check exists to catch.
{
  const slide1: SlideBeat = {
    entryId: "s1",
    sectionId: "overview",
    startSeconds: 100,
    headline: "Overview",
    body: "nonexistent words here",
    tags: [],
  };
  const slide2: SlideBeat = {
    entryId: "s2",
    sectionId: "side_effects",
    startSeconds: 0,
    headline: "Side effects",
    body: "nausea and vomiting are common",
    tags: [],
  };
  const plan: NarrationPlan = {
    script: `${slide1.body} ${slide2.body}`,
    slides: [slide1, slide2],
    totalSeconds: 20,
  };
  const aligned = alignedFrom(["nausea", "and", "vomiting", "are", "common"]);
  assert.throws(
    () => applyTimepoints(plan, aligned, 20),
    /Illustration timing check/,
    "expected applyTimepoints to throw on drift over threshold",
  );
}

// (c) Round-7 regression: Speech-to-Text can drop a whole run of words from
// its transcript outright, not just mis-hear one. When an anchor's true
// phrase falls entirely in such a gap, the weak 1-/2-word fallback must not
// lock onto a coincidental, unrelated occurrence of an ordinary word within
// its bounded lookahead — that silently strands the forward-only cursor
// ahead of every anchor still waiting behind it (the freeze-then-catch-up
// bug: docs/references/handoff.md). It should return null instead, same as
// if no fallback existed at all, whenever that weak match isn't unique in
// its lookahead window.
{
  // "typically a full course..." is entirely missing from the transcript
  // (the STT dropout) except for two coincidental, unrelated "a"s further
  // along. Pre-fix, the 1-word fallback blindly took the first "a" it found
  // and advanced the shared cursor past it — permanently stranding the next
  // anchor's real (earlier) occurrence behind the cursor. Post-fix, the
  // fallback must recognize "a" is ambiguous in its lookahead window and
  // return null instead, leaving the cursor at 0 so the next anchor's real,
  // unambiguous match is still reachable.
  const aligned = alignedFrom([
    "each", "cycle", "is", "spaced", "3", "weeks", "apart", "meaning", "your",
    "total", "treatment", "time", "will", "be", "about", "18", "weeks",
    "a", "random", "a", "words",
  ]);
  const anchors = [
    "typically a full course of r-chop involves six cycles of treatment",
    "each cycle is spaced three weeks apart",
  ];
  const [firstMatch, secondMatch] = matchTimestamps(anchors, aligned);
  assert.equal(firstMatch, null, "ambiguous weak fallback should not guess a position");
  assert.equal(
    secondMatch,
    aligned[0]!.startSeconds,
    "next anchor's real, unambiguous match should still be found — cursor must not have been wrongly advanced",
  );
}

// (d) Round-8 regression: unlike (c), the coincidental weak-fallback word
// here has only ONE occurrence in its lookahead window, so it passes round
// 2's ambiguity guard — yet it still isn't this anchor's word, it belongs to
// the *next* anchor's sentence, which shares a common short word ("is").
// This is exactly the live failure (docs/references/handoff.md): a caption
// anchor's real content is entirely missing from the transcript (dropped by
// Speech-to-Text), and the weak tier locks onto a nearby-but-unrelated
// anchor's word instead of admitting no match — corrupting the shared cursor
// so the next anchor (whose real words ARE present) can't find its true,
// now-behind-the-cursor position either.
{
  const aligned = alignedFrom([
    // "is a pill you'll take..." (anchor 1) never appears — dropped by STT.
    // Anchor 2's real words start here; "is" is the only coincidence.
    "each", "cycle", "is", "spaced", "three", "weeks", "apart",
  ]);
  const anchors = [
    "is a pill you will take at home for five days",
    "each cycle is spaced three weeks apart",
  ];
  const [firstMatch, secondMatch] = matchTimestamps(anchors, aligned);
  assert.equal(firstMatch, null, "a coincidental, uncorroborated single-word match must not be accepted");
  assert.equal(
    secondMatch,
    aligned[0]!.startSeconds,
    "next anchor's real match must still be found — the cursor must not have been stolen by the coincidence",
  );
}

// (e) Round-2 headline-reveal guard: `applyTimepoints` must find "R-CHOP"'s
// first spoken mention for `overview`'s headline-reveal beat, and must NOT
// fall back to a later, correctly-transcribed occurrence when the first one
// is garbled — verified against the actual STT output pattern from a real
// R-CHOP render (docs/references/handoff-overview-timing.md round 1):
// Speech-to-Text heard "our chop" for the true first mention and "r chop"
// for a later one. A naive anchor search finds the later, wrong occurrence;
// the guard must reject it and leave headlineRevealSeconds undefined instead
// (caller falls back to immediate/default headline timing).
{
  const aligned = alignedFrom([
    "let's", "talk", "about", "our", "chop", "today", "this", "treatment", "uses",
    "5", "medicines", "given", "together", "the", "name", "r", "chop", "itself",
    "is", "an", "acronym",
  ]);
  const slide: SlideBeat = {
    entryId: "overview",
    sectionId: "overview",
    startSeconds: 0,
    headline: "R-CHOP",
    body: aligned.map((w) => w.word).join(" "),
    tags: [],
  };
  const plan: NarrationPlan = { script: slide.body, slides: [slide], totalSeconds: 21 };
  const [result] = applyTimepoints(plan, aligned, 21).slides;
  assert.equal(
    result!.headlineRevealSeconds,
    undefined,
    "garbled first mention outside the guard window must not fall back to the later correct occurrence",
  );
}

// (f) Same guard, happy path: a clean, correctly-transcribed "r chop" right
// at the section's start must resolve to its real timestamp.
{
  const aligned = alignedFrom(["let's", "talk", "about", "r", "chop", "today"]);
  const slide: SlideBeat = {
    entryId: "overview",
    sectionId: "overview",
    startSeconds: 0,
    headline: "R-CHOP",
    body: aligned.map((w) => w.word).join(" "),
    tags: [],
  };
  const plan: NarrationPlan = { script: slide.body, slides: [slide], totalSeconds: 6 };
  const [result] = applyTimepoints(plan, aligned, 6).slides;
  assert.equal(result!.headlineRevealSeconds, aligned[3]!.startSeconds, "clean early mention should resolve directly");
}

// (g) Round-4 drug-tag beat: neighbor-context anchors resolve names that
// transcribe cleanly; a name whose STT is unrecoverable (real evidence,
// docs/references/handoff-overview-timing.md: doxorubicin/Hydroxydaunorubicin
// garbles into unrelated tokens even with context) falls back to an
// interpolated timestamp between its nearest resolved neighbors instead of
// being left unplaced.
{
  const aligned = alignedFrom([
    "the", "name", "comes", "from", "rituximab", "cyclophosphamide", "doxear",
    "rubis", "which", "you", "might", "also", "hear", "called", "hydroxy",
    "donor", "ruben", "vincristine", "also", "known", "as", "ansuon", "and",
    "prednisone", "four", "of", "these",
  ]);
  const slide: SlideBeat = {
    entryId: "overview",
    sectionId: "overview",
    startSeconds: 0,
    headline: "R-CHOP",
    body:
      "The name comes from Rituximab, Cyclophosphamide, doxorubicin, which you might also hear called Hydroxydaunorubicin, vincristine, also known as Oncovin, and Prednisone. Four of these",
    tags: [],
    drugNames: ["Rituximab", "Cyclophosphamide", "Hydroxydaunorubicin", "Vincristine", "Prednisone"],
  };
  const plan: NarrationPlan = { script: slide.body, slides: [slide], totalSeconds: 27 };
  const [result] = applyTimepoints(plan, aligned, 27).slides;
  const reveals = result!.drugTagReveals!;
  assert.equal(reveals.length, 5, "one reveal per drug name");
  assert.equal(reveals[0], aligned[4]!.startSeconds, "Rituximab resolves directly");
  assert.equal(reveals[1], aligned[5]!.startSeconds, "Cyclophosphamide resolves directly");
  assert.equal(reveals[3], aligned[17]!.startSeconds, "Vincristine resolves directly");
  assert.equal(reveals[4], aligned[23]!.startSeconds, "Prednisone resolves directly");
  // Hydroxydaunorubicin never appears verbatim (STT garbled it into two
  // unrelated tokens) — must be interpolated, not left null, and must land
  // strictly between its resolved neighbors (Cyclophosphamide, Vincristine)
  // in sequential order.
  assert.ok(
    reveals[2]! > reveals[1]! && reveals[2]! < reveals[3]!,
    `unresolved drug tag should interpolate between neighbors, got ${reveals[2]}`,
  );
}

// (h) Round-4 regression, found live against the real cached R-CHOP render:
// `overview` is one long slide, so the first drug name commonly sits past
// `MAX_1WORD_LOOKAHEAD` (40 words) from a fresh cursor, and a comma-packed
// drug list ("Rituximab, Cyclophosphamide, ...") leaves no safe trailing
// word before the *next* drug's own name — so the first real per-drug
// anchor can be as short as the bare drug name, which fails outright this
// far in without a lead-in anchor to advance the cursor first.
{
  const preamble = Array.from({ length: 50 }, (_, i) => `filler${i}`);
  const aligned = alignedFrom([...preamble, "rituximab", "cyclophosphamide", "prednisone"]);
  const slide: SlideBeat = {
    entryId: "overview",
    sectionId: "overview",
    startSeconds: 0,
    headline: "R-CHOP",
    body: `${preamble.join(" ")} Rituximab, Cyclophosphamide, Prednisone.`,
    tags: [],
    drugNames: ["Rituximab", "Cyclophosphamide", "Prednisone"],
  };
  const plan: NarrationPlan = { script: slide.body, slides: [slide], totalSeconds: 53 };
  const [result] = applyTimepoints(plan, aligned, 53).slides;
  const reveals = result!.drugTagReveals!;
  assert.equal(reveals[0], aligned[50]!.startSeconds, "Rituximab resolves despite sitting past the bare lookahead cap");
  assert.equal(reveals[1], aligned[51]!.startSeconds, "Cyclophosphamide resolves directly");
  assert.equal(reveals[2], aligned[52]!.startSeconds, "Prednisone resolves directly");
}

console.log("narration.test: ok");
