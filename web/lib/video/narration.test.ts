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

console.log("narration.test: ok");
