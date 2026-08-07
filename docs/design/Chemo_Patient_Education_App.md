# Chemo Patient Education App — Design Doc

Date: 2026-08-06
Status: Approved design, pre-build (v1 target: demo for Dr. Nataraj Reddy)

## Problem

Patients getting diagnosed and starting chemo get ~5 minutes of explanation from
the oncologist and an hour with a nurse who "isn't all-knowing at the end of the
day." The hospital's current fallback, patienteducationsheets.com, is a static
text-sheet resource (ONS/HOPA-run, ~300 sheets) with weak UI and incomplete
regimen coverage. Patients are left scared, confused, and under-informed at the
exact moment they most need clarity.

## Source / Context

Idea originated from a conversation with Dr. Nataraj Reddy (oncologist, 25 years
experience, sees 150-180 patients/week). Full context in
`networking/Dr.Nataraj_Reddy_Oncologist.md`.

## Live Requirements (chemo-relevant only, from Dr. Reddy's notes)

- "Enter the cancer regimen... teach [patient] everything they need to know" —
  informative tool
- Make it an app; chemo-specific
- Could be patient specific — take symptoms/topics and highlight what's
  important to watch out for (personalization hook)

Out of scope from his notes (separate ideas, not this project): NGS/pathology
screening synopsis before seeing a patient, clinical trial matching, nurse
training tool.

## Design Philosophy

Build the final product step by step — each phase adds a real, working slice of
the end product (not a rough MVP that gets iterated into something better
later). Tools are chosen during the build, not pre-committed in this doc.

## v1 Scope Decisions

- **Audience**: Dr. Reddy only, as a polished demo to earn his buy-in to try it
  with real patients. Not deployed to real patients in v1.
- **Content accuracy**: AI drafts regimen content (mechanism, side effects,
  typical course, stats); Dr. Reddy reviews/edits/approves once per regimen.
  Approved content becomes the canonical source — no live AI generation of
  medical facts at request time.
- **Video style**: narrated slides/animation (not an AI avatar/talking head).
- **Intake**: quick structured form (education level, topics of interest,
  content-depth preference — short vs. detailed) up front; optional follow-up
  chat afterward for anything deeper. Video is the sole delivery format in v1
  — there is no separate text-reading mode.
- **Regimen selection**: patient scans QR → picks/confirms their regimen
  themselves. No EHR integration, no pre-loaded patient identity in v1.
- **Watch tracking**: exists for care-team visibility (Dr. Reddy can see
  patient progress), not just a compliance log.
- **Notes/questions**: patient's personal scratchpad only in v1 — not
  surfaced to Dr. Reddy.
- **Regimen breadth**: 1-2 regimens, fully polished, rather than broad
  coverage.
- **Success bar**: the whole experience (QR → video → notes → Dr. Reddy
  seeing tracking) needs to feel polished end-to-end — that's what earns the
  "yes, try it with real patients."

## Phase 1 — Backend: get the workflow running

Goals achieved:

1. **Vetted content pipeline**: AI drafts regimen content for the 1-2 chosen
   regimens → Dr. Reddy reviews/edits/approves → locked as canonical source
   of truth.
2. **Intake logic**: form captures education level, topics of interest, and
   content-depth preference (short vs. detailed); output feeds video
   personalization. Optional chat afterward captures free-form follow-up
   questions.
3. **Video generation workflow**: takes approved regimen content + patient's
   intake selections (including depth preference) → produces a tailored
   narrated slides/animation video. Generation is agentic at the
   selection/assembly layer — an LLM step chooses which approved content and
   how to assemble it per patient's intake input, guardrailed via prompt
   engineering to draw only from that pre-approved canonical set, never
   introducing facts, claims, or phrasing outside it. Video generation itself
   runs on-demand per patient.
4. **Watch-tracking capture**: records status as **not started / in
   progress / done** per patient, queryable by a later care-team-facing view.
5. **Notes capture**: patient's questions from the optional chat are saved
   and retrievable by the patient.
6. **QR → regimen flow**: scan leads to a regimen picker/confirm step.
7. Credentials/APIs wired up enough that the full pipeline runs end-to-end,
   even without a finished UI.

## Phase 2 — Frontend: app design, theme, the actual experience

Goals achieved:

1. Real patient journey: QR landing → regimen picker → intake form →
   "generating" state → video player → optional chat → personal notes view.
2. Visual/tonal design calibrated for someone newly diagnosed and
   overwhelmed — calm, plain-language, low-friction, accessible.
3. Care-team visibility surface: a simple view for Dr. Reddy showing each
   patient's watch status (not started / in progress / done) — the "hospital
   reference" deliverable made real.
4. Overall polish target: needs to read as a real product in the room with
   Dr. Reddy, not a backend demo with a UI bolted on.

## Phase 3 — Security: harden what exists

Goals achieved:

1. Standard app security: secured/non-guessable QR tokens, encrypted data in
   transit and at rest.
2. No real patient identifiers required in v1 (self-selected regimen, no EHR
   integration) — deliberately reduces what needs protecting for now.
3. Access control on the care-team visibility view so only Dr. Reddy can see
   it.
4. Explicitly scaffolding, not the finish line: full HIPAA/BAA-grade
   compliance is a distinct future phase once real patients are involved, not
   solved here.

## Explicitly Out of Scope for v1 (YAGNI)

- EHR/patient-record integration, real PHI
- More than 1-2 regimens
- Doctor-facing view of patient questions (patient-only for now)
- HIPAA/BAA-grade infrastructure
- Clinical-trial-matching / nurse-training ideas from Dr. Reddy's notes
  (separate projects)

## Market Grounding (checked, not assumed)

- `patienteducationsheets.com` confirmed real: ONS/NCODA/ACCC/HOPA-run, ~300
  static text sheets, ~200k visits/month — confirms the UI/coverage gap Dr.
  Reddy described.
- HIPAA-compliant AI video generation is a proven category (OnDoc.ai, Tavus,
  VidifyAI all offer BAAs for healthcare) — validates technical feasibility
  for a future HIPAA-grade phase.
