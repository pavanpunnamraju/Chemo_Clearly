from: "codebase-agent"
to: "orchestrator-agent"

content:

Both flagged defects in the Remotion render pipeline are fixed and verified against a real pipeline run (real `demo:video` call — real Gemini selection attempt, real Google Cloud TTS, real Remotion render, real Supabase upload).

## 1. Text running off the frame — root cause found and fixed

Root cause: `Slide`'s container in `web/video-composition/SlideVideo.tsx` sets `alignItems: "center"` on a column-flex `AbsoluteFill`. That's a classic flexbox gotcha — once cross-axis alignment isn't `stretch`, a flex child's width shrinks to fit its content instead of the container, so it doesn't wrap against the padded frame width. The body `<p>` already had a `maxWidth: 900` guard (so it wrapped), but the `<h1>` headline had none — any headline longer than a few words rendered as one unbroken line and ran off both edges of the 1280px frame.

Fix (`web/video-composition/SlideVideo.tsx`):
- Added `maxWidth: 1120` + `overflowWrap: "break-word"` to the headline so it wraps within the padded frame, same as the body already did.
- Body font size now scales down (28px → 24px → 20px) as word count grows, since "detailed" depth entries can be long and the box has no vertical scroll — this prevents *vertical* overflow, not just horizontal.
- Added `overflow: "hidden"` on the slide container as a backstop.

Verified by rendering real stills (`renderStill`, no extra billed calls — reused the actual entry selection from the verified run, deterministic slide text) for all 4 slides of the real R-CHOP run, including the worst case: the "Emergency" slide at 314 words, the longest body text in the regimen. All 4 render fully inside the 1280x720 frame with no clipped/overflowing text, headline or body.

## 2. Audio/video sync — root cause found and fixed

Root cause: slide cut points (`SlideBeat.startSeconds`) and total video length were computed by `buildNarrationPlan` in `web/lib/video/narration.ts` from a fixed word-count heuristic (`WORDS_PER_SECOND = 2.5`, i.e. 150 wpm) — entirely before the real TTS call, and never reconciled against the actual narration audio afterward. Since real TTS pacing doesn't match that assumption, on-screen slide changes drifted from what the narration was actually saying, and the video's total length (which drives `durationInFrames` via `calculateMetadata` in `Root.tsx`) didn't match the real audio length either.

Confirmed by the real run: estimated `178.0s` vs. actual audio `191.4s` — a 7.5% drift that would only get worse as scripts get longer, and would compound per-slide.

Fix — real TTS timepoints instead of a word-count guess:
- `web/lib/video/narration.ts`: `buildNarrationPlan` now also emits SSML (`plan.ssml`) with an `<mark name="{entryId}"/>` inserted before each slide's text. Added `applyTimepoints(plan, timepoints, audioDurationSeconds)`, a pure function that overwrites each slide's `startSeconds` from the real per-mark timepoint and sets `totalSeconds` to the real audio duration.
- `web/lib/video/tts.ts`: switched from the `v1` to the `v1beta1` Google Cloud TTS client (SSML mark timepointing — `enableTimePointing` / `response.timepoints` — is v1beta1-only), sends the SSML instead of plain text, and requests `SSML_MARK` timepoints. Also parses the real audio duration via `@remotion/media-parser` (`parseMedia` with `slowDurationInSeconds`, since Google's MP3 output doesn't carry a reliable duration header) — this was already a transitive dependency, no new package added.
- `web/app/api/video/generate/route.ts` and `web/scripts/demo-video-gen.ts`: both now call `synthesizeNarration(plan.ssml, plan.script)`, then `applyTimepoints(...)` to build the reconciled plan that actually gets rendered — so the estimate is only ever used to build the SSML/script and as a scaffolding fallback for a mark that (in principle) came back missing.

Real run confirmed 4 timepoints returned for the 4 real slides (one mark per slide, matched 1:1 by `entryId`), and the reconciled `totalSeconds` (191.4s, not the 178.0s estimate) is what fed the render — verified by reading the call chain, since `route.ts`/`demo-video-gen.ts` now pass the *reconciled* plan (not the estimated one) into `renderVideoLocally`.

## What I did NOT touch (explicitly out of scope, not acted on)

- Voice quality/TTS voice selection — untouched, parked for Phase 2 per your instructions.
- Slide visual design ("boring slides") — untouched. Re-flagging your note for whoever picks up Phase 2 visual design: Dr. Reddy needs this to read as genuinely engaging, not placeholder-quality — not addressed this round, don't treat the frame-overflow fix above as covering that ask.

## Verification detail (what I actually checked, not just asserted)

- `npx tsc --noEmit` clean after all changes.
- Ran the real pipeline end-to-end: `npm run demo:video` — real Gemini call attempted (returned 503, fell back to the existing deterministic selector, which is expected/pre-existing behavior, not something this round touched), real Google Cloud TTS call (2807 chars billed, `en-US-Neural2-C`, 1,531,008 audio bytes, 191.4s real duration, 4 timepoints returned), real local Remotion render (1280x720 @ 30fps), real Supabase upload succeeded.
- Rendered stills of all 4 real slides via `@remotion/renderer`'s `renderStill` (same bundle, same real entry selection/text from the verified run — no extra billed TTS call needed since only visual layout was being checked) and visually inspected each: no clipped or overflowing text on any slide, including the 314-word worst case.
- Confirmed via the TTS log line that real timepoint count (4) matches real slide count (4), and that real audio duration (191.4s) diverges meaningfully from the old word-count estimate (178.0s) — the exact drift that used to cause the sync bug, now eliminated since the reconciled duration/timings (not the estimate) are what's passed to the renderer.
- Did not extract frames directly from the produced mp4 with timestamp-level audio-waveform alignment (no working `ffmpeg` binary on this machine — the only locally available one has a broken/missing `libvpx` dependency). Sync verification instead relies on: (a) code-path confirmation that real timepoints/duration are what's threaded into the render, not the estimate, and (b) the real timepoint count matching real slide count 1:1. If you want frame-exact audio/caption alignment proof on the actual mp4, that needs a working ffmpeg on this machine or an equivalent tool — flagging rather than guessing at it.

This closes out the bug-fix pass on Phase 1 Goal 3. No other files touched.
