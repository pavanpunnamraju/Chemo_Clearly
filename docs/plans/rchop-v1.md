# R-CHOP v1 — active plan

## 2026-10-19 — Production creative-director agent: research/plan first

Pavan, verbatim:

> We don't want to overfit the calls it has to make or let an llm just generate a tool call with not enough context. I need us to CREATE A PRODUCTION LEVEL AGENT. So search up best practices for this use case, we supply tool registry, context, create a tool calling harness for this to happen! come back with a plan before you go ahead.

Transition implementation is paused pending plan review. The existing uncommitted selector/renderer wiring is an unvalidated prototype, not a production agent. No transition model request or transition render has been run. Approved palette remains bubble bridge, whole-scene sideways whiteboard slide, dissolve and cut; selection is during generation. Do not hardcode a call sequence or infer approval of the harness. Separately authorized car-loop candidate was produced by the worker; lead visual review and user approval remain pending.

### Proposed architecture — awaiting Pavan's review

Build one stateful creative-director agent with a typed domain-tool registry, multimodal context assembly, durable execution harness, deterministic render/validation tools, and outcome evaluations. Start with transitions while keeping tools reusable for later scene direction. Existing renderer primitives may be reused after validation; replace the one-response selector as the orchestration layer.

Context: supply the full-film brief, ordered storyboard, narration/caption clock, latest explicit creative direction, approved asset identities and available capabilities. Retrieve actual scene/boundary frames, short clips, timings, layer/opacity metadata, measured palettes, composition and prior findings as needed. Pin context and media hashes. Unknown information stays unknown; inspection evidence refers to exact media versions. Retrieved asset text is data, not privileged instructions.

Registry: each tool declares purpose, typed inputs/outputs, preconditions, effects, permissions, version, timeout/cost class, idempotency and structured errors. Initial domain tools: inspect_scene/boundary; query_assets; get_capabilities; propose_edit; validate_edit; render_preview; inspect_render; submit_candidate. Render returns a durable job ID; status/cancel tools manage long jobs. Effects are parameters in a capability registry, not one hardcoded tool per effect. No arbitrary generated shell/FFmpeg execution. The initial approved palette is extensible through implemented capabilities, not hallucinated tool names.

Harness: assemble context and relevant registry -> native model function calls -> validate permissions/schema/semantic preconditions -> execute -> return structured observations and actual media -> repeat until verified candidate, explicit blocker or budget limit. Preserve provider call IDs and required message parts. The model chooses its path; enforce evidence and artifact invariants rather than exact tool order. Rendering requires a valid plan and current evidence. Submission requires completed render, matching hashes, technical checks and visual findings. Human and clinical approvals cannot be created by the agent.

Reliability: persisted run events/checkpoints; idempotent job creation; transient retries with backoff; cancellation/deadlines; run-level token/render/time budgets; concurrency controls; explicit failure statuses. Record model, prompt, tool and context versions, tool results, concise decision rationale, hashes and costs. Invalidate affected visual caches without invalidating independent narration audio. Never report completion from a model message alone.

Validation: preserve approved source bytes, narration/caption timing, source-fps conversion, safety text readability, allowed layers, scene coverage and no duplicate assets/content. Inspect rendered boundary neighbors and 16:9 normal/phone views. Separate deterministic results, model aesthetic assessment, human animation approval and clinical review.

Runtime choice: compare a direct existing Vertex SDK harness with Google ADK TypeScript against the same resume/cancel/tool-response/multimodal requirements. Prefer ADK for runtime plumbing if its TypeScript integration passes that compatibility slice; retain project-owned domain contracts and validators. Avoid a multi-agent creative team until evaluation demonstrates need. Model selection uses representative tool-use plus visual-review evaluations; do not presume the existing Flash selection is adequate.

Delivery after approval: (1) contracts, context fixtures, held-out evaluation set and runtime compatibility decision; (2) one-boundary end-to-end inspect/propose/render/review/revise slice; (3) persistence, retry/cancel/budget/error injection; (4) four-scene shadow run and human comparison; (5) opt-in generation integration with rollback. No default production enablement before acceptance.

Acceptance: all deterministic invariant fixtures pass; injected failures cannot yield false completion, duplicate renders or stale submissions; crash/resume preserves one job identity; held-out trials assess requested intent, visual continuity/readability and recovery across durations, orders and missing metadata. Judge outcomes and necessary evidence, not an exact call transcript. Record repeated-run success, latency, cost and human-calibrated visual ratings; set release quality/budget thresholds before held-out evaluation. Current four-scene test is a smoke test, not sufficient production evidence.

Research (official primary sources, accessed 2026-10-19):
- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling
- https://adk.dev/runtime/
- https://developers.openai.com/api/docs/guides/function-calling

## Earlier milestones (historical; newest direction above takes precedence)

## 2026-10-19 — Patient-car animation APPROVED

Pavan: “Here, looks good to me”, supplying
`Animate_illustration_of_parked_car_20261019163027.mp4`.
Approval binds to SHA256 `1207ede13934c4b51e0980f6300cb2fa05dc03ad18ff09fe98bc9c42eb9e5e5a`.
Retained exact source: `web/public/studies/patient-car/car-flow-approved.mp4`
(1920×1080,24fps,10s; includes generated audio). Mute source audio during future
narrated integration. No separate loop edit prepared or approved; do not claim
seamless repeat from this approval. Final production routing remains pending.

Source copy hash matches supplied file. Full decode passed;1-second encoded
samples inspected for composition. No assistant normal-speed playback/listening
claim. Human visual approval is distinct from clinical/source-speech approval.
Preserve the accepted output; original SVG, wide reference, prompt and source.json
remain alongside compact approval in docs/design/approved-animations.json.
Removed 2 disposable preview files (833472 bytes); Downloads untouched.
Active asset: `context-support` (`daily_life.intimacy`); Flow character motion approved. Coded hearts and final scene review remain pending. No commit or unrelated cleanup.

## 2026-10-19 — Patient-stretch loop APPROVED

Pavan: “Yeah looks god” — approval of the presented three-cycle loop review,
SHA256 `0f71712ba37dc1c500299036ed4b3117d9916ed08d39bd6820d077f7c9406b3b`.
Keep source frames11–184 inclusive at24fps, followed by2.5s rest with a0.5s
blend to the starting pose during the final rest segment. Cycle9.75s, silent.
Retained runtime: `web/public/studies/patient-stretch/stretch-flow-loop.mp4`.
Original generated source, original SVG, wide reference and source provenance
remain intact. Exact source/runtime/review hashes and edit contract are in
`web/public/studies/patient-stretch/stretch-loop-edit.json` and
`docs/design/approved-animations.json`. Runtime copied byte-for-byte from the
reviewed cycle; no animation changes or rerender in closeout.

Direction remains: exact supplied character, locked camera, continuous hand/shoe
contact, localized torso/ankle movement and planted lower body. No breeze added.
Approval covers motion/loop, not clinical review or full narrated integration.
Disposable stretch previews/contact sheets and intermediate review exports removed.
Next asset: `patient-car` (`daily_life.driving`); show source before motion choices.
Stretch production scene routing remains pending in the later integration pass.

## Work-planning scene APPROVED — 2026-10-16

Pavan: “Perfect all good, update memory and remove any unnecessary files.”
Approval binds to trimmed full-scene MP4 SHA256
`ccf993737a2119686e59aa4b7ee2d1594e3471763a620939942a981ecdbaddec`,
1280×720,24fps,569frames/23.708333s. Compact source/render fingerprints, props,
trim checks and exact approval are in `docs/design/approved-animations.json`,
record `care-work-plan-flow-final-scene`. Review videos/frames are now disposable
and deleted; do not direct Pavan to old `web/out/work-planning-review` links.

**Retained implementation:** `WorkPlanningFlowScene.tsx`,
`work-planning-flow-index.tsx`, `prepare-work-planning-flow-layers.py`, and
`preview-work-planning-flow.ts`. Original generated source:
`web/public/studies/work-planning/working-to-relax-flow-wide-candidate.mp4`
(the filename retains candidate suffix; the motion is approved), SHA256
`9ad5cad79f9e9e99c0da5659cd3ae66e78e3ba870850f645cbd73bb111bc4883`.
Keep runtime `flow-layers/` PNGs/manifest, SVGs and license/source provenance.
Keep previously approved small native arm proof and its source; historical custom
large-angle poses were never approved and must not replace accepted Flow motion.

**Approved direction:** complete overhead lift, hands settle behind head, both
legs extend, supported recline. Source frames0–72 then85–179 play at24fps; remove
73–84 (0.5s hesitation), hold179 from shot167 through narration. One source-frame
clock drives video and foreground overlays. Props nudge RIGHT then exit RIGHT at
overlapping staggered times; desk/laptop/cup leave first. Background props pass
behind the unchanged character; all are retired before the final LEFT swipe.
Shared gentle12% zoom/head-upper-body follow; preserve narration/caption clock.
Reduced motion uses original rest. This scene's hold lasts through narration;
`working-flow-approved-edit.json` remains the historical10s character approval,
not the final scene edit specification. Final mapping lives in component + record.

**Verification/lessons:** typecheck and focused render checks passed. Bind source
SHA and edit contract to approval, fingerprint every runtime layer including rest,
verify rest against decoded frame0, synchronize overlay/video frames, inspect cut
neighbors, retire departed props, and preserve captions independently of trims.
Opening room framing uses40px downward staging and SVG overflow to prevent clipped
windows. Half-second cut uses closely matching source72/85; encoded71–75 inspected.
Narration AAC packets, caption/prop JSON, before-cut frame24 and settled frame240
match pre-trim version exactly. Source/technical, human visual and clinical approval
remain separate; assistant frame inspection did not claim normal-speed listening.

**Reproduce:** from `web/`,
`node --import tsx scripts/preview-work-planning-flow.ts --run=<fresh-name>`.
If regenerating foreground layers, run
`python3 scripts/prepare-work-planning-flow-layers.py` first. Chromium requires
sandbox escalation here. Review exports remain disposable after approval.

**Next:** work-planning standalone asset is finished. Production scene routing is
still pending in the later integration pass. Resume one-asset queue with
`patient-car` (`daily_life.driving`): show original asset and obtain motion
direction before implementing. Do not redesign this approved work scene.

## Approved animation implementations

| Animation | Reusable implementation | Integration status |
| --- | --- | --- |
| Calling / drinking | `CallingArtwork`, `DrinkingArtwork`, `ApprovedArtworkStage` | Routed in directed renderer |
| Infusion | `InfusionArtwork`, `infusion-motion.ts` | Approved standalone study; final wiring pending |
| Calendar | `CalendarArtwork`, `calendar-motion.ts` | Approved standalone study; final wiring pending |
| Schedule dates | `ScheduleArtwork`, `schedule-number-cues.ts` | Approved standalone study; final wiring pending |
| Breakfast medication stamp | `MedicationStampArtwork`, `medication-stamp-motion.ts` | Approved standalone study; final wiring pending |
| Arm-to-vessel low counts | `ContinuousArmVesselOpening`, `CurvedVesselArtwork` | Approved standalone study; final wiring pending |
| Driving | Approved Flow source in `public/studies/patient-car/` | Supplied motion approved; final wiring pending |
| Patient stretch | Retained Flow loop + source and exact edit recipe | Motion/loop approved; final wiring pending |
| Work planning | `WorkPlanningFlowScene`, Flow source + synchronized foreground layers | Approved full standalone scene; final wiring pending |
| Reading recovery | `ReadingRecoveryArtwork`, `reading-recovery-motion.ts` | Approved standalone study; final wiring pending |

Components live in `web/video-composition/directed/`; motion helpers in
`web/lib/video/`. All original/runtime artwork remains under `web/public/` and
selected immutable source SVGs under `docs/references/`. Exact user direction is in
`creative_direction_pavan.md`; compact recorded approvals and reviewed artifact
hashes in `docs/design/approved-animations.json`. Review videos/frames were deleted
at Pavan's request. Approval applies to the reviewed implementation, not a claim
of clinical approval or completed full-v1 integration.

Reading: no page flip; original hands/book stay still. Enter from an all-teal
extreme closeup of the actual cover, then pull back; keep seated-left placement,
contented expression/return and ten imported centered Twemoji scale pops.
Vessel: preserve glossy curved red walls, blue plasma, moving RBC/WBCs and staggered
WBC dim/dissolve; the same live3D vessel forms the thin red middle zoom.
Calendar/schedule/stamp/infusion and existing calling/drinking motions retain their
approved geometry and timing. Reuse across regimens must derive narration cues and
eligibility from regimen data. No repeated assets/sections within the final video.

## Review workflow and next asset

Pavan supplies/approves the creative direction for one asset at a time. Plan
construction and verify implementation autonomously using
[the motion verification protocol](../design/motion-verification.md). Inspect
actual event/neighbor frames and exports, normal/phone framing, attachment/contact,
source clock and reduced motion. Fix preventable defects before presenting. Do not
record human approval automatically or claim playback that was not performed.

Active asset: `context-support` (`daily_life.intimacy`). Approved Flow source and 16:9 reference retained in `web/public/studies/context-support/`; next add/review coded floating hearts.

| Order | Asset | Source entry | Status |
| --- | --- | --- | --- |
| 1 | `context-infusion` | `overview` | Approved implementation; see table above |
| 2 | `context-calendar` | `timeline` | Approved implementation; see table above |
| 3 | `context-schedule` | `timeline.day-1` | Approved implementation; see table above |
| 4 | `care-medication-plan` | `timeline.days-2-5` | Approved implementation; see table above |
| 5 | `curved-arm-vessel` | `timeline.roughly-days-7-10` | Approved implementation; see table above |
| 6 | `reading-recovery` | `timeline.days-11-21` | Approved implementation; see table above |
| 7 | `care-work-plan` | `daily_life` | Full Flow room composition approved; final wiring pending |
| 8 | `patient-stretch` | `daily_life.exercise` | Source motion and loop approved; final wiring pending |
| 9 | `patient-car` | `daily_life.driving` | Supplied Flow motion approved; final wiring pending |
| 10 | `context-support` | `daily_life.intimacy` | Flow hug/lean + coded hearts authorized; prompt/reference in `web/public/studies/context-support/`. Character motion approved; hearts + four-scene review ready in `web/out/flow-integration/review-6/`; user review pending. |
| 11 | `care-journal` | `daily_life.helpful-routines` | Awaiting direction |
| 12 | `context-online-doctor` | `side_effects` | Awaiting direction |
| 13 | `patient-washing` | `side_effects.low-white-blood-cells-infection-risk` | Awaiting direction |
| 14 | `care-bruising` | `side_effects.low-platelets-bruising-and-bleeding` | Awaiting direction |
| 15 | `patient-rest` | `side_effects.low-red-blood-cells-anemia` | Awaiting direction |
| 16 | `care-bland-meal` | `side_effects.nausea-and-vomiting` | Awaiting direction |
| 17 | `care-oral` | `side_effects.mouth-sores` | Awaiting direction |
| 18 | `patient-abdomen` | `side_effects.diarrhea-constipation` | Awaiting direction |
| 19 | `patient-hand` | `side_effects.nerve-tingling-numbness` | Awaiting direction |
| 20 | `care-foot-inspection` | `side_effects.nerve-tingling-numbness` | Awaiting direction |
| 21 | `patient-hair` | `side_effects.hair-loss` | Awaiting direction |
| 22 | `care-scalp-sun` | `side_effects.hair-loss` | Awaiting direction |
| 23 | `approved-drinking` | `side_effects.bladder-irritation` | Existing approved motion; preserve |
| 24 | `patient-sleep` | `side_effects.steroid-effects` | Awaiting direction |
| 25 | `context-hospital` | `emergency.about-this-list` | Awaiting direction |
| 26 | `care-thermometer` | `emergency.fever-during-your-low-blood-cell-window` | Awaiting direction |
| 27 | `care-alert-staff` | `emergency.infusion-reaction` | Awaiting direction |
| 28 | `care-skin` | `emergency.serious-allergic-or-skin-reaction` | Awaiting direction |
| 29 | `care-heart` | `emergency.heart-symptoms` | Awaiting direction |
| 30 | `care-brain` | `emergency.serious-brain-or-nerve-problem` | Awaiting direction |
| 31 | `care-warning` | `emergency.tumor-lysis-syndrome` | Awaiting direction |
| 32 | `approved-calling` | `emergency.when-to-call-911-vs-your-care-team` | Existing approved motion; preserve |

## Remaining v1 work

Restore/confirm the earlier cycle infographic and cumulative teal drug-name reveal
as regimen-data-driven concepts. Complete the single-asset review queue, then wire
approved components into source-bound scene routing and inspect integrated renders.
The historical five sections measured13:39/1956 aligned words, so the under-six-
minute target requires deliberate rewriting, not simply dropping four sections.
The earlier5:45 budget was a proposal, not approved narration. Do not remove
separate mouth care, nausea care, infusion-alert or emergency instructions.

The extensive transition research pass remains deferred. Preserve Pavan's
bubble zoom/color match/sideways staggered reveal idea from feedback_v1.md; the
approved reading cover zoom is implemented already, but cross-scene assembly is
still pending. Full clinical review, actual-speech listening and final playback
approval remain separate gates.

## Reproduction and cleanup

Preview/inspection scripts generate fresh disposable outputs under `web/out`.
Historical synthetic narration/timing/speech verification needed by studies now
lives in `web/fixtures/study-narration/rchop`; production uses content and independent
`.video-cache` stages. The approved Flow source MP4 and derived foreground PNGs ARE runtime dependencies; review exports are not.
After approval, delete generated review media, obsolete handoffs and completed
asset plans. Keep runtime/source assets, licenses, compact approval provenance,
this active plan, current architecture and durable verification instructions.


## 2026-10-19 — MP4 integration feasibility assessed

User requested consideration of using approved MP4s in actual generation. Verified:
work-planning standalone already uses muted OffthreadVideo plus held frames and
foreground layers; main DirectedRoot is30fps while its standalone study is24fps.
Do not transplant Freeze(sourceFrame24) directly into30fps composition: convert
source time to composition frames or use a dedicated time mapping. Stretch/car/
support main library routes still use older SVG implementations. Production routing
for all four approved Flow scenes remains pending.

Four intended landscape sources (work wide, stretch loop, car, support) total
6,715,108 bytes (~6.4MiB), all24fps. Work wide is1280×720; others1920×1080.
Use approved wide work clip, not retained portrait historical source. Stretch loop
9.75s approved; car10s has no approved seamless loop; support10s should play once
then hold with coded hearts. Mute generated audio; narration/caption clock remains
independent. Use a reusable clip registry with approval hashes, trim/hold/loop rules,
source fps and reduced-motion stills. Include MP4/overlay bytes in render cache keys.
Opaque baked backgrounds constrain independent prop edits and background transitions;
whole-frame placement and overlays remain feasible. Current render copies public/
for each bundle; optimize dependency collection later if library growth warrants it.
No render-time benchmark or new integration render performed; no performance claim.
Assessment only; no production routing changed. Context-support hearts remain the
active pending asset work, followed by integrated duration/framing verification.


## 2026-10-19 — Four Flow scenes + hearts review ready (not approved)

Pavan authorized finishing hearts and testing the four existing Flow scenes before
animating any new asset (“Got it, continue then”). Active asset remains context-support.
Review: `web/out/flow-integration/review-6/four-scenes.mp4` (1280×720,30fps,
2303frames/76.7667s), SHA256 `c42dd0410fc4a339a5e0dcd9cb4f99f5508d1b4465ccaebcf4569df31e701f1d`.
Separate `hug-hearts.mp4` and640×360 `phone.mp4` beside it. Full reviewed historical
work/exercise/driving/intimacy passages reused with aligned captions; no new TTS.
Historical intimacy passage references another section: technical proof, not final
short-v1 wording, complete video or clinical approval. Main production routing
remains unchanged; reusable FlowClipScene and test composition demonstrate playback.

Hug plays once, holds, three Twemoji hearts pop/float/fade after4s contact cue;
next cycle only starts if its fade completes by the last rendered frame. Stretch
runs two complete9.75s cycles then holds; car plays once then holds. Work source
and foreground share24fps source clock, correctly mapped into30fps Freeze. Work
exit is disabled for this test so final narration has visible scene. Car/stretch/
support use92% placement for caption clearance. Generated audio is muted.

Typecheck and focused24/30fps tests pass. Six work timestamps render pixel-identically
at24/30fps. Reduced-motion pixel equality passes all four shots. Final full decode,
unchanged mux video packets and four audio windows pass (zero16kHz-sample lag;
minimum correlation0.9999548). Encoded event-neighbor sheets, full-size heart and
phone still inspected. No normal-speed playback/listening claim. Successful render/
export measured109.5s after browser setup on this machine, not a general benchmark.
Worker implemented clip/heart component; lead built runner/composition/export checks
and corrected internal defects; independent reviewer verified source/timing scope.

Evidence/fingerprints, source narration hashes and output hashes are beside preview.
Disposed superseded/internal interrupted review1–5 and fps diagnostic images; retain
current review6 for user review, reusable scripts, source/runtime files and compact
fps evidence. No commit. Next: Pavan reviews hearts and four-scene test; do not start
another asset or mark integration/heart approval automatically.



## 2026-10-19 — Four-scene feel approved; continuous driving and transition director requested

Pavan, verbatim:

> Hey! they feel great together, good job.
>
> 1. I'd like an infinite loop on the driving scene, looked static for a bit
> 2. Transitions between scenes also has to be chosen by a creative director agent and done live so if we can start working on that part of the pipeline that would be great!

Clarification: “Yes—during video generation”. Support hearts/four-scene feel accepted, bound to review6 SHA256 c42dd0410fc4a339a5e0dcd9cb4f99f5508d1b4465ccaebcf4569df31e701f1d. Driving needs continuous looping; earlier complete-cycle-only rule is superseded for this asset. Newly authorized transition work supersedes prior deferral. Agent must choose transitions during generation and renderer must apply them without changing narration/caption timing. No new loop/transition approval inferred. Review6 retained temporarily for comparison during active revision; compact evidence saved before eventual scoped cleanup.
