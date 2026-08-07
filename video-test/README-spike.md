# Video-gen feasibility spike (Phase 1 goal 3 pre-work)

Not the real pipeline — a throwaway/extendable proof that Remotion + Google Cloud TTS can
produce a narrated slides video end-to-end. See `docs/references/handoff.md` at the repo
root for the full report back to the orchestrator agent.

## What's here

- `src/content/rchop-excerpt.mjs` — curated narration script + slide beats, pulled verbatim
  from the "Low white blood cells / infection risk" entry in `docs/content/rchop.md`.
- `src/SlideVideo.tsx` — Remotion composition (`RchopInfectionRiskSpike`) that times slides
  to the narration and plays `public/narration.mp3`.
- `scripts/generate-narration.mjs` — calls Google Cloud TTS, writes `public/narration.mp3`
  (gitignored — regenerated, not committed) and `out/audio/narration.meta.json`.

## One-time GCP setup (needed before the narration step will work)

1. Create a GCP project (or reuse one): https://console.cloud.google.com/projectcreate
2. Enable the Cloud Text-to-Speech API for that project:
   https://console.cloud.google.com/apis/library/texttospeech.googleapis.com
3. Create a service account with the "Cloud Text-to-Speech User" role (or broader, for a
   spike): https://console.cloud.google.com/iam-admin/serviceaccounts
4. Create a JSON key for that service account and download it (do not commit it).
5. Copy `.env.local.example` to `.env.local` in this directory and set
   `GOOGLE_APPLICATION_CREDENTIALS` to the absolute path of the downloaded key file.

Google Cloud TTS free tier: 4M characters/month (WaveNet/Neural2 voices), doesn't expire.
This spike's script sends ~340 characters — effectively free.

## Running the spike

```bash
npm install                # already done once
npm run spike:narration    # calls GCP TTS -> public/narration.mp3 + out/audio/narration.meta.json
npm run spike:render       # renders out/rchop-infection-risk-spike.mp4
```

Or open `npm run dev` (Remotion Studio) and preview the `RchopInfectionRiskSpike`
composition live in the browser.

## Status as of this spike round

- Remotion scaffold, slide composition, and render pipeline: verified working (see handoff
  for the no-audio test render: 540 frames / 18s / 846.7 kB mp4, ~a few seconds to render
  locally).
- Google Cloud TTS call: **not yet run** — no GCP project/credentials exist yet. The script
  fails fast with a clear message pointing here when `GOOGLE_APPLICATION_CREDENTIALS` is
  unset, rather than silently stubbing anything out.
