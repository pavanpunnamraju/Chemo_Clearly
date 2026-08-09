# Product Requirements — Chemo Patient Education App

Canonical, living list of everything the app needs to do. Feature-area catalog,
not phase-ordered — phasing/sequencing lives in `implementation_plan.md`.
Update this doc whenever scope changes; it's the source of truth for "what,"
not "when" or "how."

Status: v1 target is a polished demo for Dr. Nataraj Reddy, not a real-patient
deployment. See `docs/design/Chemo_Patient_Education_App.md` for problem
statement, philosophy, and market grounding.

## Accounts & Auth

- **Patient accounts**: real accounts (Supabase Auth, email + password).
  Returning patients log in; new patients create an account. Notes and watch
  history persist per account.
- **Care-team access**: nurse-facing (not doctor-facing) — multiple nurses
  share a single passcode, no per-nurse accounts needed at this scale.
- Landing page splits into two paths: "I'm a patient" (login/signup) vs.
  "Care team" (passcode entry).
- No real patient identifiers (MRN, EHR data) required or stored. Patient
  accounts are self-identified (email + whatever name they choose), not tied
  to hospital record systems.

## Regimen Selection

- No picker/search page — patients never browse or search regimens. QR is
  the only path to a regimen.
- QR codes encode a regimen (not a patient). Scanning one assigns that
  regimen to the logged-in patient's account (persisted, not just carried
  through the current session) and takes them straight to their video.
- A patient with no assigned regimen yet (hasn't scanned) sees a simple
  prompt: "Scan your QR code to access your regimen." Nothing else is
  visible or searchable.
- Regimen breadth: 1-2 regimens (R-CHOP, AC-T), fully polished, not broad
  coverage.

## Content Pipeline

- AI drafts regimen content (mechanism, side effects, typical course) for
  each regimen — **no stats**. Side effects only, not incidence rates,
  percentages, or other statistics; existing approved content that includes
  stats needs a re-pass to strip them (logic-agent, not a doc-only change —
  see `implementation_plan.md`).
- Tone: not clinical/dry, not boring — concise, warm, engaging. Applies to
  both the source content and the narration-rewrite step (#3c).
- Dr. Reddy reviews/edits/approves once per regimen. Approved content becomes
  the canonical source — no live AI generation of medical facts at request
  time.
- Emergency-signs content is never patient-filterable — always included in
  every generated video regardless of intake selections.

## Intake

- Structured form: education level, topics of interest (tag-driven),
  content-depth preference (short vs. detailed), and desired voice tone
  (neutral, friendly, hopeful).
- Output feeds video personalization (`web/lib/intake/schema.ts`) — voice
  tone becomes a style prompt for the narration TTS step, not a manual
  pitch/rate adjustment.
- Optional follow-up chat after the video for anything deeper.

## Video Generation

- Seamless narrated video with infographics (not a slide presentation, not
  an AI avatar/talking head) — reusable Remotion components/icons for each
  side effect appear as they're mentioned, not static slide-per-topic.
- Takes approved regimen content + patient's intake selections → tailored
  video, generated per unique combination of regimen + intake filter (see
  Generation Caching below) rather than always from scratch.
- Agentic selection/assembly layer (fixed sequential pipeline, no
  autonomous control-flow agent — see
  `docs/plans/2026-08-08-narration-rewrite-component-triggers-design.md`):
  an LLM step chooses which approved content to include per patient's
  intake input; a second LLM step rewrites the **combined** selected
  content into one continuous natural spoken narration script (whole-script,
  not per-entry) — guardrailed to only rephrase, never introduce facts,
  claims, numbers, or drug names beyond the union of the source entries. A
  deterministic check rejects any rewrite that introduces content not
  present in the source before it's allowed to reach TTS.
- Side-effect visual components: deterministic keyword match (against the
  existing side-effect tag vocabulary) decides which side effects get an
  icon/component, deduped to one trigger per side effect per video on first
  meaningful mention. A separate small LLM step picks the best moment
  within the matched text for natural on-screen timing — visual timing
  only, not guardrailed against facts (it doesn't touch narration content).
- Narration audio uses a natural-sounding TTS voice, with tone (see Intake)
  steered by a style prompt rather than manual pitch/rate tuning.
- Slide timing is derived by aligning the finished audio back against the
  known narration text (word-level timestamps), not estimated and not
  dependent on any TTS-side timestamp/marker feature — this keeps voice
  choice decoupled from sync, so the voice model can change without
  rearchitecting sync.
- Video is the sole delivery format in v1 — no separate text-reading mode.

## Generation Caching

- A generated video is uniquely determined by (regimen, education level,
  topics, depth preference, voice tone) — the same combination should reuse
  the same generated video rather than regenerating per patient.
- New patients whose intake matches an existing combination get the cached
  video; a new combination triggers generation once, then is cached for
  future matches.

## Watch Tracking

- Records status per patient per regimen: **not started / in progress /
  done**.
- Doubles as the patient's regimen assignment: a `watch_status` row existing
  for a patient IS "you have a prescribed regimen" (created on successful QR
  scan, starting at `not_started`) — no separate assignment table.
- Queryable by the care-team view.
- Exists for care-team visibility, not just a compliance log.

## Notes

- Patient's questions from the optional post-video chat are saved and
  retrievable by that patient.
- Patient-only in v1 — **not** surfaced to Dr. Reddy or the care-team view.

## Care-Team View

- Single list page (no per-patient drill-down in v1): all patient accounts,
  their regimen, and watch status.
- Patients appear automatically once they have an account + a selected
  regimen — no separate "doctor adds patient" step in v1.
- Notes are excluded from this view (see Notes, above).
- Access restricted to care team (nurses), shared passcode.

## Security

- Encrypted data in transit and at rest.
- Secured/non-guessable QR tokens (regimen-level, not patient-level, in v1).
- Access control on the care-team view (nurses only, shared passcode).
- Explicitly scaffolding, not the finish line — full HIPAA/BAA-grade
  compliance is a distinct future phase, not solved in v1.

## Explicitly Out of Scope for v1 (YAGNI)

- EHR/patient-record integration, real PHI, real patient identifiers (MRN
  etc.)
- Doctor prescribing a regimen to a specific patient + generating a
  per-patient printable QR PDF — deferred to a later phase (see
  `implementation_plan.md` future considerations)
- Doctor-facing view of patient notes/questions (patient-only for now)
- More than 1-2 regimens, and newer drugs not yet on patienteducationsheets.com
- HIPAA/BAA-grade infrastructure
- Clinical-trial-matching / nurse-training ideas from Dr. Reddy's original
  notes (separate projects)

## Success Bar

The whole experience — login/QR → video → notes → care team (nurses) seeing
tracking — needs to feel polished end-to-end. That's what earns "yes, try it
with real patients."
