# Chemo Patient Education App — Design Doc

Status (2026-10-17): broader app design retained as background. Active work is
the R-CHOP video milestone, not app construction or clinical deployment. See
[active video plan](../plans/rchop-v1.md) and [broader roadmap](../implementation_plan.md).

Feature/scope details have moved to `docs/product_requirements.md` (what the
app does), `docs/implementation_plan.md` (live status/sequencing),
`docs/app_flow.md` (pages/navigation), and `docs/backend_schema.md`
(data model). This doc keeps only the problem statement, philosophy, and
market grounding that motivated the project — the "why," not the "what."

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
`docs/notes/requirements_Nataraj.md`.

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

## Market Grounding (checked, not assumed)

- `patienteducationsheets.com` confirmed real: ONS/NCODA/ACCC/HOPA-run, ~300
  static text sheets, ~200k visits/month — confirms the UI/coverage gap Dr.
  Reddy described.
- HIPAA-compliant AI video generation is a proven category (OnDoc.ai, Tavus,
  VidifyAI all offer BAAs for healthcare) — validates technical feasibility
  for a future HIPAA-grade phase.
