# Directed chemotherapy education videos

Status: design approved by Pavan ("Yes, implement"). Implementation in progress on `astra-test`.

## Objective and confirmed decisions

Build the video-generation pipeline, not the patient app. Produce source-grounded,
personalized, visually directed regimen videos with natural character actions,
purposeful camera movement, legible synchronized captions, and reviewed output.

- Cover all nine content sections, including practical safety and longer-term outlook.
- Preserve distinct safety instructions in short and detailed versions. Short means
  concise language, with flexible runtime; education changes language independently.
- Keep a consistent warm illustrated style; vary staging and motion. NHS UHL's
  reference is inspiration, not a ceiling or mandatory style template.
- Design for phones, including landscape/full-screen playback.
- Several minutes per new variant is acceptable. Generate and review variants ahead
  of time and cache the reviewed result.
- Preserve the current voice where it works. Content is currently AI-drafted; technical
  checks and visual approval do not imply clinical approval.

## Architecture

1. Normalize source entries into a complete source packet, including self-care and
   call-team instructions. Keep stable source references and prove unique coverage.
2. Rewrite by section for education, detail and tone; check structure, facts,
   instructions, omissions and meaning before speech synthesis.
3. Generate speech, reconcile recognized words with the exact narration, and retain
   start/end times and uncertainty. Captions and visual events share this clock.
4. An AI visual director selects semantic assets/actions, staging, camera targets,
   readable holds and transitions. It returns a validated storyboard, not executable
   code. Patient-visible messages come from source-bound choices.
5. Render the storyboard using reusable vector rigs and deterministic frame-based
   motion. Captions stay on a screen-fixed layer. Camera transitions must not shorten
   or shift narration timing.
6. Validate content coverage, timing, visual compatibility and actual rendered layout.
   Inspect representative motion sequences and full videos; produce a review bundle.
   A generated candidate and an explicitly reviewed variant are different states.

Authoring is separate from variant generation: reusable characters have named joints,
prop attachments, pose ranges and camera targets. New concepts can be handled by a
semantically appropriate scene or flagged for new asset authoring, never an arbitrary
symptom image. Keep rig geometry editable for variable timing and close-ups.

Cache source, narration/audio, alignment and visual stages separately. Keys include
relevant content, preferences, models/prompts and implementation versions. Changes to
motion should not force regeneration of unchanged narration/audio.

## Implementation tasks

- [ ] Complete source packets, exact selection coverage and independent preferences.
- [ ] Strengthen narration omission/meaning checks and cache identity.
- [ ] Add reliable timing diagnostics and readable caption exports.
- [ ] Implement source-bound visual direction and storyboard validation.
- [ ] Author reusable patient-friendly rigs, actions and contextual scenes.
- [ ] Implement continuous camera moves and background-color transitions.
- [ ] Integrate a canonical CLI video-generation workflow and review artifacts.
- [ ] Verify automated invariants and actual rendered layout/motion.
- [ ] Render complete R-CHOP and AC-T candidates with contrasting preferences.
- [ ] Review complete videos and record limitations and approval state honestly.

## Verification

Exercise all regimen/preference combinations in inexpensive structural tests; use
representative real generation for personalization, speech fidelity and timing.
Test omissions, duplicates, altered instructions, unsupported visual choices, stale
caches and missing alignment rather than only happy paths. Assess phone-sized frames,
caption boundaries, long labels, emergency instructions and first/last audio frames.
Look at moving limbs at multiple points and camera transitions through their whole
duration. Passing unit tests or a successful MP4 encode alone does not establish quality.

## Baseline evidence

Before implementation, typechecking and existing parse/narration/pipeline/arm/curve/
layout/ducking tests pass. Content validation has four existing warnings for untiered
emergency framing/closing entries. Audits found omitted source action fields, duplicate
selection acceptance, excluded sections, R-CHOP-specific visual labels, uncertain
timing fallbacks, differing CLI/HTTP pipelines, incomplete cache keys, and standalone
motion experiments that are absent from the main renderer.

## Researched alternatives

- Recommended: AI director plus reusable vector motion, rendered with Remotion.
- Rive is a possible future asset-authoring tool (bones/IK); it adds an authoring and
  runtime integration workflow. It is not required for the first implementation.
- Generated video clips can expand the visual library after review; they add cost and
  variability and should not own exact clinical text or numerical displays.

Sources consulted 2026-09-10:
- https://www.remotion.dev/docs/transitions/presentations/custom
- https://rive.app/docs/editor/constraints/ik-constraint
- https://rive.app/docs/runtimes/web/low-level-api-usage
- https://rive.app/pricing
- https://blog.google/innovation-and-ai/products/notebooklm/generate-your-own-cinematic-video-overviews-in-notebooklm/
- https://www.w3.org/WAI/media/av/captions/
- https://github.com/m-bain/whisperX (alignment alternatives have limitations too;
  benchmark actual narration rather than assuming a provider swap establishes sync).

The reference's thermometer approach-to-ear action is visible in the existing frames
13–15. Earlier notes sampled a later stationary window and must not narrow this target.
