// Regression test for the layout-overflow render-QA check (Phase 2a goal
// #10c). No framework; run directly with tsx. Run: npm run test:layout-qa

import assert from "node:assert/strict";
import { checkLayoutOverflow } from "./layout-qa";
import type { NarrationPlan, SlideBeat } from "./narration";

function slide(overrides: Partial<SlideBeat>): SlideBeat {
  return {
    entryId: "s1",
    sectionId: "side_effects",
    startSeconds: 0,
    headline: "Nausea",
    body: "",
    tags: [],
    ...overrides,
  };
}

function plan(slides: SlideBeat[]): NarrationPlan {
  return { script: "", slides, totalSeconds: 0 };
}

// A short Scene headline fits its box — no issue.
assert.deepEqual(checkLayoutOverflow(plan([slide({ headline: "Fatigue" })]), []), []);

// A long side_effects headline (no fixed-string override tag) overflows its box.
const longHeadline = "A dramatically overlong side effect headline nobody actually authored like this";
const overflow = checkLayoutOverflow(plan([slide({ headline: longHeadline })]), []);
assert.equal(overflow.length, 1);
assert.equal(overflow[0]!.location, "Scene/s1");

// The same long text on a fixed-headline section (overview) isn't checked —
// SCENE_FIXED_HEADLINES shows a hardcoded string there, not slide.headline.
assert.deepEqual(
  checkLayoutOverflow(plan([slide({ sectionId: "overview", headline: longHeadline })]), []),
  [],
);

// The infection-risk override tag also short-circuits the check.
assert.deepEqual(
  checkLayoutOverflow(plan([slide({ headline: longHeadline, tags: ["infection-risk"] })]), []),
  [],
);

// A Title Card intro (entryId === sectionId) checks its onScreen text instead.
const titleCardOverflow = checkLayoutOverflow(
  plan([slide({ entryId: "timeline", sectionId: "timeline", onScreen: longHeadline.repeat(5) })]),
  [],
);
assert.equal(titleCardOverflow.length, 1);
assert.equal(titleCardOverflow[0]!.location, "TitleCard/timeline");

// A caption chunk that's too wide for the caption bar is flagged too.
const captionOverflow = checkLayoutOverflow(plan([]), [
  { text: longHeadline.repeat(2), startSeconds: 1, endSeconds: 2 },
]);
assert.equal(captionOverflow.length, 1);

console.log("layout-qa.test: ok");
