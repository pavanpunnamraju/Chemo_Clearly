# Live Task Progress — Chemo Patient Education App

Durable, session-to-session status tracker. Structured around the design doc's phases and
goals, not a chronological log. Latest info only — no narrative history (see git log /
design doc for that).

Status values: **not started / in progress / blocked / done**

## Phase 1 — Backend: get the workflow running

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Vetted content pipeline (AI draft → Dr. Reddy review/approve → canonical) | done (AI/logic-agent loop) | AI-draft/logic-agent fix loop complete. Human handles the Dr. Reddy review/approval step directly, outside this pipeline — don't touch `docs/content/*.md`. Open questions for Dr. Reddy queued in `docs/questions/questions_for_dr.md`. |
| 2 | Intake logic (education level + topics → personalization input) | done | `web/lib/intake/schema.ts`; `POST /api/intake` persists to Supabase. Verified via `npm run demo:intake`. |
| 3 | Video generation workflow (approved content + intake → tailored video) | done | Full pipeline (content → intake filter → Gemini selection → TTS → Remotion render → Supabase storage) verified end-to-end with real calls: real Gemini selection, real TTS, real render, real Supabase persistence. Frame-overflow and audio/sync bugs found and fixed; human confirmed sync by watching the real video. `gemini-flash-latest` model swap approved and kept. No open items. |
| 4 | Watch-tracking capture (per patient) | not started | |
| 5 | Notes capture (patient's chat questions, saved + retrievable) | not started | |
| 6 | QR → regimen picker/confirm flow | not started | |
| 7 | Credentials/APIs wired end-to-end (pipeline runs without a finished UI) | not started | |

## Phase 2 — Frontend: app design, theme, the actual experience

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Real patient journey (QR → picker → intake → generating → video → chat → notes) | not started | |
| 2 | Visual/tonal design for newly diagnosed/overwhelmed audience | not started | Human requirement: must read as genuinely engaging/"cool" visuals, not placeholder slides. Goes through brainstorming/discovery when this phase starts. |
| 3 | Care-team visibility view (Dr. Reddy sees per-patient watch status) | not started | |
| 4 | Overall polish target (reads as a real product, not backend-with-UI-bolted-on) | not started | |

## Phase 3 — Security: harden what exists

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Secured/non-guessable QR tokens; encryption in transit and at rest | not started | |
| 2 | No real patient identifiers required (already true by design — verify holds) | not started | |
| 3 | Access control on care-team view (Dr. Reddy only) | not started | |
| 4 | Confirmed as scaffolding only — full HIPAA/BAA is a future phase, not this one | not started | |

## Decided (locked in)

- Regimens: R-CHOP and AC-T.
- Video-gen: Remotion (self-hosted) + Google Cloud TTS, ~$0 at demo scale. Elai.io documented fallback. Remotion Lambda/AWS **deferred** until a real public deploy — local rendering only for now.
- App framework/hosting: Next.js (App Router, TS) + Vercel + Supabase (Postgres + Auth/RLS + Storage).
- Care-team auth: simple shared passcode (Dr. Reddy only, single user).
- Content depth (short/detailed): tag-driven intake question; video is the sole delivery format.

## Known non-blocking items

- `npm audit` in `web/` flags 3 high-severity advisories, all transitive Next.js build/dev-tooling deps (`postcss`, `sharp`). Fix requires Next.js 16 (breaking) — needs a decision before a real deploy, not urgent for local demo.
- `video-test/` (superseded spike dir) still present in the worktree, nothing depends on it — safe to delete whenever.

## Future considerations (not active work)

- Hospital-provided standard-of-care documentation as a grounding source, instead of/alongside open research — revisit if this moves toward real patients.
