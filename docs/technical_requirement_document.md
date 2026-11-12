# Technical Requirements — Chemo Patient Education App

Stack, tools, APIs, and credentials. Update when a tool/service choice
changes; this is the reference for "how it's built," not "what it does" (see
`product_requirements.md`) or "when" (see `implementation_plan.md`).

## Current workflow boundary — 2026-10-17

This document includes legacy app/slide-generation infrastructure. Active video
work uses the separate [directed pipeline](directed-video-pipeline.md): local CTC
forced alignment follows independent actual-speech checks. The Cloud Speech
anchor-matching description below concerns the legacy slide path; it is not the
current directed timing contract. See [alignment contract](../web/lib/video/ALIGNMENT.md).
Patient-app integration and deployment are outside the current R-CHOP milestone.

## Stack

- **App framework**: Next.js (App Router, TypeScript)
- **Hosting**: Vercel (target — not deployed yet, see Deploy Status below)
- **Database / Auth / Storage**: Supabase (Postgres + Auth + Storage, RLS
  enabled)
- **Video generation**: Remotion (self-hosted rendering, local only for now)
- **Text-to-speech**: Gemini-TTS (`gemini-2.5-flash-preview-tts`, prebuilt
  "Kore" voice) via `@google/genai`, routed through **Vertex AI** — verified
  with real calls, so the Chirp 3 HD fallback wasn't needed. Chosen for voice
  quality and natural-language style-prompt tone steering (`voiceTone` maps
  to a style prefix, e.g. "Say in a warm, hopeful, reassuring tone:"), not
  for any timestamp/marker feature (see Narration Sync below). No fallback
  TTS provider is wired — if `GOOGLE_CLOUD_PROJECT` is unset, TTS fails
  outright.
- **Narration sync**: Google Cloud Speech-to-Text with word-level time
  offsets, run on the finished narration audio (chunked into sub-60s pieces
  via synchronous `recognize` — inline audio has a duration cap, and using
  `longRunningRecognize` for longer audio needs a GCS bucket this project
  doesn't have) against the known script text — alignment, not
  transcription, since the exact text is already known. Slide boundaries are
  matched by finding a run of 3 consecutive words (falling back to 2, then
  1) from each slide's start, not by word position/count — position drifted
  because Speech-to-Text expands numbers ("100.4°F") into several spoken
  words, and single-word anchors could false-match inside an earlier slide's
  own audio. Verified end-to-end with real per-slide timestamps, human
  confirmed via full video playback. Decouples slide-sync from whichever TTS
  voice is in use.
- **Content-selection + narration-rewrite LLM**: Gemini (`gemini-2.5-flash`)
  via `@google/genai`, routed through **Vertex AI** — one step selects which
  approved content to include, a second step rewrites it into natural spoken
  narration, guardrailed to only rephrase (never introduce facts/numbers/drug
  names beyond the source), plus a third adversarial "safety critic" step
  that checks the rewrite for meaning inversions the entity-diff guardrail
  can't catch (e.g. an emergency instruction losing its urgency). Loop capped
  at 3 attempts total, fails closed (404) on exhaustion. See
  `implementation_plan.md` #3c and `docs/agentic_design_live.md`.
- **Gemini API routing**: both of the above go through **Vertex AI**, not
  the AI-Studio API-key path (`GEMINI_API_KEY`, now retired) — AI Studio's
  free tier caps `gemini-2.5-flash-preview-tts` at 10 requests/day, which
  the pipeline hit during verification. Vertex AI bills against the GCP
  project's Cloud Billing account instead, using the same
  `GOOGLE_APPLICATION_CREDENTIALS` service account already used for
  Speech-to-Text (`web/lib/gemini/client.ts`). Note: Vertex's
  `generateContent` requires an explicit `role: "user"` on each content
  entry (AI Studio defaults this).
- **Validation**: Zod

## Deploy Status

Local-only. No live Vercel deployment exists yet. Remotion rendering runs
locally; Remotion Lambda/AWS is explicitly deferred until there's a real
public deploy to justify it.

## Required Environment Variables

Names only — actual values live in `web/.env.local` (gitignored). See
`web/.env.local.example` for the authoritative template.

| Variable | Purpose | Required for |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service-account JSON key with Cloud Speech-to-Text + Vertex AI enabled | Alignment-based slide sync, Gemini calls (selection + TTS) |
| `GOOGLE_CLOUD_PROJECT` | GCP project id | Routes Gemini calls through Vertex AI (selection falls back to deterministic filter if unset; TTS has no fallback) |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI region | Optional, defaults to `us-central1` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Persistence (intake, videos, watch-tracking, notes, patient auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key | Server-side writes/reads that bypass RLS (doctor care-team view, pipeline writes) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | Client-side, RLS-scoped patient auth (`getSupabaseUserClient`) — separate from the service-role key, which bypasses RLS |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token (Management API) | `npm run sync:schema`; also used to toggle project-level Auth config (e.g. `mailer_autoconfirm`) without dashboard access |

Without a live Supabase project, storage falls back to local-disk/in-memory —
pipeline stays runnable but nothing persists across restarts. All vars are
set in `web/.env.local` against a live Supabase project — Phase 1 goal #7
("credentials wired end-to-end") is satisfied for the goals built so far.

## Third-Party Services

- **Supabase project**: provisioned and live, schema applied
  (`web/supabase/schema.sql`, including `voice_tone` on `intake_responses`).
- **GCP project** (configured locally): provisioned, service-account
  credentials set. Cloud Speech-to-Text API and Vertex AI API
  (`aiplatform.googleapis.com`) both enabled and verified with real calls.
- **Google AI Studio**: no longer used — retired in favor of Vertex AI (see
  Stack section above).

## Patient Auth

Supabase Auth, email + password. Standard Supabase-managed sessions — no
custom auth server or third-party identity provider. Backend built and
verified (`web/lib/supabase/client.ts`, `web/lib/auth/patient.ts`) — RLS-
scoped client per request, `patient_id` always derived from the verified
JWT, never from request body/params. Email confirmation is **off**
(`mailer_autoconfirm: true`, project-wide) — a real decision, not a
default, made for this synthetic-patient demo stage; revisit if this ever
moves toward real patients. No signup/login UI yet (Phase 2).

## Care-Team Auth

Simple shared passcode (not a Supabase account) — nurse-facing, shared
across multiple nurses, no per-user accounts needed at this scale.
