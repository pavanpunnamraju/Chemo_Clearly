# Directed video pipeline

This is the new **local video-generation workflow**, not a patient-app migration.
The existing app/legacy video routes remain separate. Do not assume that a patient
button currently invokes this renderer.

## What it does

The general CLI supports all nine sections in source order. The active R-CHOP v1
scope is five confirmed sections and a target under six minutes; preserve the
nine-section source and distinct safety instructions. See [active plan](plans/rchop-v1.md). Education changes the language;
detail changes explanatory depth; neither removes distinct safety instructions.
Short versions have a flexible runtime. The source documents are AI-drafted and
have **not** been established as clinically approved.

1. Build complete source packets, including self-care and call-team instructions.
2. Rewrite and review every source passage, checking missing/extra entries,
   quantities, entities, instructions, conditions, and meaning.
3. Synthesize the requested tone and separately audit the actual spoken words.
   A transcript inconsistent with the reference cannot pass merely because a model
   says “faithful.” Failed audio attempts remain available for diagnosis.
   After three rejected whole-section takes, retry source passages separately,
   with up to three takes per passage and sentence-bounded groups of at most 180
   words. Every passage must pass the same speech check. Accepted PCM is joined
   with 180 ms silence; per-passage transcripts and audio checksums stay in the
   review evidence. This may add pauses and requires full listening review.
4. Measure word timing locally with CTC acoustic alignment. This gives timing, not
   proof that the audio is correct. Keep low-acoustic-score spans for listening review.
5. Let the visual director select source-compatible actions, staging, close-ups,
   cues and transitions from the reusable vector library. It never emits executable
   code or invents patient-visible medical text.
6. Render fixed-clock Remotion scenes and screen-fixed captions. Export the video
   silently, then encode the original narration WAV to AAC once and copy the video
   track unchanged. This avoids an intermediate AAC encoder delay. Transitions do not
   shorten the audio timeline. The fever card keeps both source thresholds,
   alternative conditions, immediate-call instruction and applicability together.
7. Measure rendered text bounds and review the full candidate before approval.

The current renderer combines adapted Storyset SVGs with original care-object
illustrations. Source snapshots, attribution and adaptation decisions are recorded
in the [illustration manifest](../web/public/illustrations/MANIFEST.md), study source metadata and [approval records](design/approved-animations.json). NHS UHL's reference informed the direction;
it does not establish a clinical or licensing endorsement.

Visual direction was corrected after user review: preserve the original demo's
Figtree/navy/teal identity and pale background. The custom character is **not
approved**: wrist/forearm and torso defects were confirmed. Existing illustrations
are the artistic baseline; future custom assets must match their style and quality.
See [current v1 plan](plans/rchop-v1.md).

## Setup and commands

Run from `web/`. Existing Google project credentials in `.env.local` are used for
rewriting, speech and automated review. Only generic regimen content and synthetic
audio are needed; this workflow does not need patient records.

```sh
npm install
npm run video:setup-alignment

npm run video:generate -- --regimen rchop --tone friendly --education some_college --detail short
npm run video:generate -- --regimen ac-t --tone hopeful --education basic --detail detailed
```

Local alignment setup uses `uv`, Python 3.11, pinned Torch/TorchAudio and a verified
approximately 360 MB model. Provision it ahead of time in deployment images. See
[alignment setup and limitations](../web/lib/video/ALIGNMENT.md). No local-model
download happens silently during generation.

Add `--prepare-only` to stop after source/audio/timing/storyboard preparation.
Artifacts are written under `web/out/directed/<preferences>/<variant>/`.

```sh
npm run video:render -- out/directed/<preferences>/<variant>
npm run video:qa -- out/directed/<preferences>/<variant>
npm run video:inspect -- out/directed/<preferences>/<variant>
npm run video:review-page -- out/directed/<preferences>/<variant>
npm run video:motion-preview
```

`video:motion-preview` is a silent, explicitly authored motion audition. Its synthetic
timing is **not** evidence that a generated narrated video is synchronized.
`video:qa` measures real browser text bounds and exact text at every caption cue,
source-message page change, timed label, artwork boundary and representative shot
hold, with camera motion disabled. It verifies actual artwork routing, absence of
the generic patient rig, source-entry diversity and unchanged bundle checksums.
`video:inspect` decodes the complete encoded audio/video, checks frame count and
duration, compares both the encoded narration envelope and overlapping 200 ms
waveform windows to the verified WAV on the same clock, and extracts
motion/transition contact sheets and phone frames. Evidence binds the current
source, prepared files, renderer and final MP4 checksums; extracted samples have
individual hashes and a fresh run directory.
`video:review-page` creates local playback/navigation and evidence links only. None
of these commands records human approval or replaces full playback review.

## Review and caching

Each bundle includes narration WAV/text, caption JSON/VTT, storyboard, word/entry
timing, acoustic flags, speech-review reports, render props and an integrity manifest.
Checksums detect stale or accidentally edited files; these are not cryptographic
reviewer signatures. Rendering validates the current source and linked evidence.

Separate caches preserve source, narration, audio, review, timing and direction.
Changing motion does not require recreating unchanged narration. Exact unchanged
render requests reuse the MP4. A stale source, checker or renderer requires new
verification/review; a cache hit must not imply patient readiness.

After personally watching and listening to the **entire** candidate, checking captions,
source-bound clinical displays and flagged acoustic spans:

```sh
npm run video:review -- out/directed/<preferences>/<variant> \
  --reviewer "Your name" --notes "Specific review findings" --confirm-full-playback
```

This explicit command requires a current successful layout audit. It records visual/
listening review and **does not establish clinical approval**. Generation never runs
it automatically. States distinguish `prepared`, `rendered_candidate` and
`visually_reviewed_candidate`; none is a substitute for the institution's clinical
content approval process.

## Verification (historical results; current checks must be rerun) and limitations

The 72-second repeating calling/drinking integration received user visual approval.
At that historical checkpoint, the renderer used inspected source SVG adaptations
and distinct care-object scenes, with 37/28 unique primary entry bindings and
measured-word detail cutaways. Current approval and queue status is maintained in
`docs/plans/rchop-v1.md`; it is not an exhaustive historical asset inventory. Native motions repeat at their original
speed with calm returns; brief remaining intervals use still poses. The complete
fever card retains both alternatives and the action/applicability together.

Both complete candidates finished on 2026-09-11: R-CHOP is 17:14 and AC-T is 21:21.
All nine source, actual-speech and timing sections passed for each. Actual-timing
layout passed 423 R-CHOP and 464 AC-T samples. Both complete encoded audio/video
streams decoded successfully, all 22,588 active local speech windows passed, and
neither video had a detected narration offset. Sampled motion, transitions and
phone frames received agent visual inspection with no blocking findings.
These are historical pipeline results, not current v1 completion evidence.
Old review outputs may have been deleted after review. See the
[current v1 plan](plans/rchop-v1.md) for retained implementation/approval records
and outstanding work; AC-T is outside the active milestone.
Full human visual/listening review and clinical approval remain pending.

```sh
npm run typecheck
npm run test:source-fidelity
npm run test:speech-fidelity
npm run test:segmented-speech
npm run test:speech-evidence
npm run test:timing
npm run test:director
npm run test:library-direction
npm run test:approved-artwork
npm run test:review-bundle
npm run test:stage-cache
python3 lib/video/forced-align.test.py
```

Automated checks cannot guarantee no clinical errors. Source review is still required.
Both narration models and speech review can fail; generation stops after bounded
attempts rather than hiding failures. Alignment's acoustic scores are not calibrated
ASR confidence. The AI director is limited to supported semantic actions; a new
regimen may require a newly authored action or source display projection. A missing
fever-card projection is reported, not filled with guessed numerical instructions.

New variants may take more than several minutes, especially with retries and local
CPU rendering. Pre-generation and review are the intended delivery workflow. Measure
actual costs/latency on approved complete variants before promising a hospital SLA.

Pronunciation guidance was checked against the NCI Dictionary of Cancer Terms:
[rituximab](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/rituximab),
[prednisone](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/prednisone),
[cyclophosphamide](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/cyclophosphamide),
[doxorubicin](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/doxorubicin-hydrochloride),
[vincristine](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/vincristine-sulfate).
These pronunciation references do not validate the project's clinical content.


### Approved Flow clip integration study (2026-10-19)

Reusable `FlowClipScene.tsx` supports approved source-time playback, held endings,
complete stretch cycles and support heart overlays. Production director routing is
not yet switched. Reproduce the four-scene30fps study from `web/` with
`node --import tsx scripts/preview-flow-integration.ts --run=<fresh-name>`;
verify audio/mux with `python3 scripts/verify-flow-export.py out/flow-integration/<run>`
and inspect encoded event neighbors with `python3 scripts/inspect-flow-integration.py out/flow-integration/<run>`.
`node --import tsx scripts/check-work-flow-fps.ts` checks24/30fps pixel equivalence.
Uses historical verified narration fixture; not the final short-v1 script.
