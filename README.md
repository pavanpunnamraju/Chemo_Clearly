# Chemotherapy Education Video Prototype

An AI-assisted project for turning structured chemotherapy education content into narrated, captioned animations. The intended audience is people receiving chemotherapy; the current milestone is an R-CHOP demonstration for feedback from clinicians and collaborators.

**Status: local research and development prototype.** There is no completed patient-facing interface or deployed product. Source documents are AI-drafted; clinical approval has not been established. Automated checks and animation approvals are not clinical validation. No patient outcomes or adoption claims are made.

## What is implemented

- Structured R-CHOP and AC-T source documents and parsing.
- Narration personalization by language complexity, explanation depth, and voice tone.
- Source-coverage and wording checks intended to preserve distinct self-care and call-team instructions.
- Synthetic speech generation, independent automated speech review, and local word timing.
- Remotion video rendering with captions, illustrated actions, reusable animation components, and selected generated clips.
- Stage caches, artifact fingerprints, and tools for inspecting exported audio/video and phone-size framing.
- An earlier Next.js API backend for intake, regimen assignment, saved questions, and playback start/end events.

The newer directed-video workflow runs locally and is separate from the patient API. The homepage is a backend placeholder, not the intended patient experience.

## Current scope and limitations

The current R-CHOP milestone targets five sections—overview, timeline, daily life, side effects, and emergency guidance—in a friendly video under six minutes. This is a target, not a verified completed deliverable. The full nine-section source remains available.

Several individual animations have recorded design approval. Final short-video assembly and integration remain unfinished. Transition-selector code is experimental; a production creative-director tool-calling harness is proposed, not implemented and validated. Historical demos and synthetic fixtures are not evidence of real users or clinical effectiveness.

## How it works

Structured source → checked narration → synthetic speech → speech review → measured word timing → storyboard and captions → rendered video → technical and human review.

TypeScript, React, and Next.js provide the application and orchestration code. Google Vertex AI services support narration and speech generation. Python/TorchAudio provides local acoustic alignment. Remotion renders SVG illustrations, Three.js scenes, and video clips. Supabase integration supports the earlier application backend; video storage can fall back to local disk.

Three deliberate choices:

1. Language complexity and amount of explanation are separate preferences.
2. The system checks the generated speech separately from the written script: timing alone cannot establish that a medicine name was spoken correctly.
3. Captions and visual cues share the narration clock, and reusable stages are cached independently so a visual edit need not regenerate speech.

## Local development

Use a Node.js version compatible with the pinned dependencies (Node 22 is a suitable baseline). From the repository root:

```sh
cd web
npm ci
cp .env.local.example .env.local
npm run typecheck
```

Fill the local environment file with your own configuration. Keep service-account JSON outside the repository and point `GOOGLE_APPLICATION_CREDENTIALS` to it. Do not commit environment values, account keys, or patient information.

Generation requires configured Google Cloud access and can incur charges. Supabase configuration is needed for authenticated backend features; it is not required merely to inspect the code. The example environment file lists the settings.

The directed workflow also needs `uv`, Python 3.11, FFmpeg/ffprobe, and Remotion's browser dependencies. Alignment setup installs pinned Python packages and downloads a model:

```sh
npm run video:setup-alignment
```

See [the directed pipeline](docs/directed-video-pipeline.md) for generation, rendering, and review commands, and [the alignment contract](web/lib/video/ALIGNMENT.md) for model setup and limitations. Experimental transition work means a fresh full generation should not be treated as an accepted production output.

## Verification

Focused checks can run without starting the app or generating new narration:

```sh
cd web
npm run typecheck
node --import tsx lib/content/parse.test.ts
node --import tsx lib/video/source-fidelity.test.ts
node --import tsx lib/video/speech-evidence.test.ts
node --import tsx lib/video/timing.test.ts
node --import tsx lib/video/stage-cache.test.ts
```

Rendering, speech verification, visual approval, and clinical review are separate steps. Passing unit tests does not establish clinical safety or natural-looking motion.

## Repository guide

| Path | Purpose |
| --- | --- |
| `docs/content/` | Regimen source documents and schema |
| `web/app/api/` | Earlier application backend |
| `web/lib/video/` | Narration, speech, timing, direction, and verification |
| `web/video-composition/` | Remotion scenes and animation components |
| `web/public/` | Runtime artwork, fonts, audio, and animation assets |
| `web/fixtures/` | Retained synthetic narration fixtures for reproducible studies |
| `web/scripts/` | Generation, rendering, and inspection tools |
| `docs/design/approved-animations.json` | Compact animation approval records |

Generated previews, caches, local credentials, and assistant session files are excluded from Git. Some historical development notes refer to local-only records or discarded previews; those are not distributed demo links. Runtime assets and synthetic fixtures are intentionally retained even when they are generated files.

## Attribution and sharing

The illustrations include adapted Storyset artwork; emoji assets include Twemoji; the bundled Figtree font includes its OFL license. See [the illustration manifest](web/public/illustrations/MANIFEST.md), asset provenance alongside study files, and the bundled license notices. Some source URLs and attribution requirements still need verification before public distribution. No blanket license for third-party assets is granted by this README.

Before sharing a medical demonstration publicly, review its exact narration, framing, attribution, and permissions, and clearly identify it as a prototype. Do not treat animation approval as clinician endorsement.
