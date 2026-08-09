# Implementation Plan — Chemo Patient Education App

Live, session-to-session plan and status tracker. Replaces
`docs/live_task_progress.md`. Structured around what's next, not a
chronological log — see git log for history. Think present, not past: once a
line item is done and stable, its detail belongs in `product_requirements.md`
/ `backend_schema.md` / `technical_requirement_document.md`, not here.

Status values: **not started / in progress / blocked / done**

## Phase 1 — Backend: get the workflow running

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Vetted content pipeline (AI draft → Dr. Reddy review/approve → canonical) | done | Stats-strip re-pass done by logic-agent: both `rchop.md`/`act.md` read in full, one real statistic found and rewritten (CHF risk % → qualitative dose-dependence framing, source tag preserved), `act.md` needed no changes. Dosing thresholds and action-thresholds (fever/bleeding triggers) deliberately kept — not in scope of "no stats." Two non-blocking flags left for a later nurse content-cleanup pass (a study-cohort claim wearing qualitative language; uncalibrated frequency-word vocabulary across the two files) — human deferred both, along with the two open Dr. Reddy questions (per-medicine vs per-regimen organization; unnamed-combo handling, see `requirements_Nataraj.md`), to that later pass rather than blocking Phase 1 on them. Human handles Dr. Reddy review/approval directly, outside the pipeline. |
| 2 | Intake logic (education level + topics → personalization input) | done | `web/lib/intake/schema.ts`; `POST /api/intake` persists to Supabase. Verified via `npm run demo:intake`. |
| 3 | Video generation workflow (approved content + intake → tailored video) | done | Core pipeline (selection → TTS → alignment → Remotion render → Supabase storage) verified end-to-end with real calls, including per-slide timestamp correctness. #3a-#3d all done — see below. |
| 3a | Natural-voice TTS (Gemini-TTS, Chirp 3 HD fallback) | done | Landed on Gemini-TTS (`gemini-2.5-flash-preview-tts`, "Kore" voice) via **Vertex AI** (not AI Studio — AI Studio's free tier caps this model at 10 requests/day, hit during verification). Verified with real calls at 3 `voiceTone` values (neutral/friendly/hopeful); Chirp 3 HD fallback not needed. Replaces the fixed Neural2 voice + SSML `<mark>`s entirely. |
| 3b | Alignment-based slide sync (Cloud Speech-to-Text word offsets) | done | `web/lib/video/align.ts` — chunked synchronous `recognize` calls (inline audio has a duration cap; long-running recognize needs a GCS bucket we don't have, so this avoids that infra). `applyTimepoints` in `narration.ts` matches by a 3-word content anchor (falling back to 2, then 1), not word position — position-based matching drifted because Speech-to-Text expands numbers ("100.4°F") into multiple spoken words, and a single-word anchor could false-match inside an earlier slide's own audio, which is what caused a real reported bug (a slide's on-screen duration collapsing to ~0). Verified with real per-slide timestamps, e.g. overview 0.0s → timeline 31.1s → daily_life 87.7s → low-wbc 110.8s → nausea 128.0s → emergency 134.3s, strictly increasing with reasonable gaps, full video watched end-to-end by the human. |
| 3c | LLM-in-the-loop narration rewrite (guarded) + side-effect component triggers | done | Built and live-verified end-to-end (`npm run demo:video`). Logic-agent review found the entity-diff guardrail alone missed a meaning-inversion bug on the emergency fever instruction (safety-relevant, not just a fact error) — fixed by adding a second, adversarial "safety-critic" LLM step (checks meaning inversion, emergency-tier omission, misattribution) that loops with feedback back to the rewrite step, capped at 3 attempts total, fails closed (404) on exhaustion same as before. Human approved the critic's prompt/design directly in the building session. Verified with real Gemini calls (`npm run demo:rewrite`, `npm run demo:guardrail`), `tsc --noEmit` clean. Not yet committed. Non-blocking findings from the same review (ungrammatical sentence reaching TTS, raw `°F`/`°C` symbols on screen, jargon-heavy opening) logged as known Phase 1 ceilings, not actioned — revisit if they recur in practice. Doc reference: `docs/agentic_design_live.md` (plain-language write-up of the 4 judgment-making pipeline agents, written for a doctor/investor audience). |
| 3d | Generation caching by personalization-filter combination | done | `filter_hash` (sha256 over regimen + sorted tags + depth + education level + voice tone) computed in `web/lib/intake/schema.ts`; `POST /api/video/generate` checks `generated_videos` by `(regimen_id, filter_hash)` before running the pipeline, inserts with the hash on a miss, handles concurrent-insert races (Postgres `23505` → re-select winning row). Note: `filter_hash` wasn't actually in the live DB despite `backend_schema.md` saying so — added via direct SQL (no migrations folder in this repo), legacy rows backfilled with random unique placeholders so they never false-match a cache hit. Verified against the live Supabase project (hash order-independence, cache-hit lookup, race handling), `npm run demo:video` end-to-end, and the literal HTTP round-trip through the live route (miss: 7m55.8s real pipeline run, HTTP 200; hit: 0.48s, `storageBackend: "cache"`, byte-identical response). Fully verified, no caveats. |
| 4 | Watch-tracking capture (per patient) | done | `web/lib/watch/status.ts` (`recordPlaybackEvent`) + `POST /api/watch-status`. `in_progress` on playback start, `done` on playback-end, sticky (re-watch never reverts). Verified live against real Supabase: RLS-scoped (patient's own JWT, not service-role key), 401 without auth, real curl round-trip through the actual HTTP route. |
| 5 | Notes capture (patient's chat questions, saved + retrievable) | done | `web/lib/notes/store.ts` (`saveNote`/`listNotes`) + `POST`/`GET /api/notes`, mirrors the `/api/watch-status` auth/route pattern. Verified live against Supabase: save/list round-trip, per-regimen scoping, RLS cross-patient isolation confirmed. `npm run demo:notes`. Patient-only, no care-team-facing code touched. |
| 6 | QR → regimen assignment flow | **in progress (minimal slice done)** | `web/lib/watch/status.ts` (`assignRegimen`) + `POST /api/scan` built and verified: plain regimen-id-in-URL scan by a logged-in patient creates a `not_started` `watch_status` row; re-scanning the same regimen only touches `updated_at`. No picker/search page, per scope. **Not built**: actual QR code generation/printable form, and the scan-time UI (Phase 2). Doctor-prescribes-to-patient + printable QR PDF still deferred (see `product_requirements.md`). QR token security hardening still Phase 3. |
| 7 | Credentials/APIs wired end-to-end | done | Live Supabase project provisioned, schema applied (incl. `voice_tone` migration), all env vars set (`GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). `GEMINI_API_KEY`/AI Studio retired in favor of Vertex AI (billed against GCP credit, no free-tier daily cap). Cloud Speech-to-Text + Vertex AI APIs both enabled on the GCP project. |
| 7a | Patient auth (Supabase Auth, email + password) | done | `web/lib/supabase/client.ts` (`getSupabaseUserClient`, RLS-scoped by patient JWT) + `web/lib/auth/patient.ts` (`getAuthenticatedPatient`, derives `patient_id` from the verified token only — never from request body/params). Verified live: real self-serve `signUp()` → immediate `signInWithPassword()` (no confirmation-link friction — `mailer_autoconfirm: true`, set project-wide via Supabase Management API, human-approved), RLS cross-patient isolation confirmed (patient A cannot read/write patient B's rows). No signup/login UI yet — that's Phase 2, calls Supabase's own client SDK directly. |
| 7b | Care-team auth (shared passcode) | done | `web/lib/auth/careTeam.ts` — `CARE_TEAM_PASSCODE` env var, timing-safe compare, stateless bearer token (sha256 of the passcode, so the plaintext secret is never resent after login — human confirmed this scheme over a plainer token=passcode option). `POST /api/care-team/login`. Verified live: wrong passcode 401, correct → token. |
| 7c | Care-team list page (patients + regimen + watch status, no notes) | done (backend only) | `listCareTeamPatients` in `web/lib/watch/status.ts` (service-role client, joins `watch_status` to `auth.users` emails) + `GET /api/care-team/patients`, gated by #7b's token. Verified live against real synthetic patients; confirmed no `notes` field anywhere in the response. UI/page is Phase 2 goal #3, not built here. |

## Phase 2 — Frontend: app design, theme, the actual experience

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Real patient journey (landing → login/signup → picker → intake → generating → video → chat → notes) | not started | See `app_flow.md` for the page map. |
| 2 | Visual/tonal design for newly diagnosed/overwhelmed audience | not started | Must read as genuinely engaging/"cool," not placeholder slides. Real brainstorming/discovery happens when this phase starts — `UI_UX_design_brief.md` is currently a stub. Human steer (2026-08-08, informal, not yet a scoped decision): considering a "NotebookLM-style" richer info display over the current monotone slide-deck-plus-icon look — possibly little/no on-screen text, more animation. Revisit properly via brainstorming-skill discovery when this phase kicks off. |
| 3 | Care-team visibility view (nurses see per-patient watch status) | not started | Backend piece tracked as #7c above; this is the polished UI pass. |
| 4 | Overall polish target (reads as a real product, not backend-with-UI-bolted-on) | not started | |

## Phase 3 — Security: harden what exists

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Secured/non-guessable QR tokens; encryption in transit and at rest | not started | |
| 2 | No real patient identifiers required | not started | Holds by design — patient accounts are self-identified (email only), no MRN/EHR data. Verify this stays true as #7a is built. |
| 3 | Access control on care-team view (nurses only, shared passcode) | not started | |
| 4 | Confirmed as scaffolding only — full HIPAA/BAA is a future phase | not started | |

## Immediate Next Step

**All Phase 1 goals are done.** #1-#7c (incl. #3d caching, #5 notes, #7b/#7c
care-team backend) are complete — detail is in the table above. Nothing
committed to git yet; a Phase 1 close-out commit is the next action, routed
to git-agent, then Phase 2 (frontend) begins per human direction.

Smaller open items, not blocking anything:
- Goal #1: two follow-up questions from Dr. Reddy remain undecided (see
  `requirements_Nataraj.md`) — per-medicine vs. per-regimen content
  organization, and what to do when a prescribed combo has no official
  regimen name. Deferred to a later nurse-assisted content cleanup, along
  with two smaller flags from the stats-strip pass (a study-cohort claim
  wearing qualitative language in `act.md`; uncalibrated frequency-word
  vocabulary across `rchop.md`/`act.md`).
- Icon-trigger looseness in the #3c component-timing feature (a keyword
  match can fire on the wrong side effect; 3 side effects have no icon at
  all) — human already accepted both as Phase 1 scope, real fix folded
  into the Phase 2 "NotebookLM-style" visual redesign discovery, not
  before then.

**Queued: stale-file cleanup before the Phase 1 git commit.** `video-test/`
(old Remotion spike, superseded by the real pipeline in `web/`) and
`docs/live_task_progress.md` (superseded by this file) are already staged
for deletion in git status — confirmed intentional, not accidental. Route a
broader pass to codebase-agent right before the end-of-Phase-1 commit (not
now, mid-goal) to catch anything else dead — that's the natural point,
since everything lands in one commit anyway.

## Future Considerations (not active work)

- Doctor-prescribes-patient flow: doctor adds a patient, selects their
  regimen, generates a printable per-patient QR PDF. Deferred out of v1 —
  revisit after the simplified QR→picker flow (#6) is solid.
- Hospital-provided standard-of-care documentation as a grounding source,
  instead of/alongside open research — revisit if this moves toward real
  patients.

## Known Non-Blocking Items

- `npm audit` in `web/` flags 3 high-severity advisories, all transitive
  Next.js build/dev-tooling deps (`postcss`, `sharp`). Fix requires Next.js
  16 (breaking) — needs a decision before a real deploy, not urgent for
  local demo.
