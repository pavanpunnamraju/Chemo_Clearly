# Regimen content schema (Phase 1 goal 1)

Applied consistently to every regimen (R-CHOP, AC-T, and any future addition). Organized
around what a patient actually wants to know, in roughly the order they'd want to know it —
not around drug taxonomy. This is what the PES critique (`docs/references/PES_R-CHOP.md`)
found missing: a timeline, severity triage, and any acknowledgment that the reader is scared.

## Design principles behind the schema

- **Timeline over taxonomy.** The single biggest gap in the PES was no sense of "what
  happens to me and when." This schema puts a day-by-day cycle timeline right after the
  overview, before the side-effect catalog.
- **Triaged severity, not a flat list.** Every side-effect entry carries a `tier` (see
  below) so the UI can visually separate "common and manageable" from "rare and call
  911" — the PES puts hair loss and cytokine release syndrome in the same visual weight.
  This *is* patient-concern-first: "is this normal or should I panic" is the question,
  severity tiering answers it directly.
- **Sourced, not vibes.** Every factual claim carries a `source` id resolving to the
  regimen's source list. Forum/anecdotal material is marked `anecdotal: true` and is never
  used for a clinical claim (dosing, mechanism, timing, risk).
- **Tagged for filtering, not rewritten per patient.** Personalization = which
  sections/entries get shown, driven by the future intake's education level + topics of
  interest (Phase 1 goal 2). The content itself is written once. Two reading depths
  (`plain` / `detail`) exist per section so "education level" has something concrete to
  switch on without a separate rewrite per patient.

## Top-level section list (in display order)

1. **`overview`** — What it is, what it's for, how it's given, basic schedule shape (cycle
   length, how many cycles). This is the R/C/H/O/P-style drug table, kept short.
2. **`timeline`** — A day-by-day walk through one cycle: infusion day, the crash window,
   nadir (infection-risk trough), recovery, right up to the next cycle. This is the
   section the PES is missing entirely.
3. **`daily_life`** — What day-to-day function looks like: energy for work/errands,
   what's safe (exercise, driving, intimacy), what routines help.
4. **`side_effects`** — The triaged catalog. Each entry: name, plain-language description,
   `tier` (see below), self-care steps, and a "call your care team if" list with concrete
   thresholds (numbers, not vague language — this is something the PES does well and we
   keep it).
5. **`emergency`** — Boxed-warning-grade items pulled out and translated to plain
   language, unambiguously flagged as "get help now / call 911," separate from the
   general side-effect catalog so they aren't buried.
6. **`fertility_intimacy`** — Fertility, contraception, pregnancy, breastfeeding,
   intimacy/body-image. Kept as its own section (not folded into side effects) because
   it's a distinct concern with its own emotional weight.
7. **`practical_life`** — Household/family logistics: body-fluid handling windows,
   medication disclosure, work/insurance-adjacent notes, what visitors/caregivers should
   know.
8. **`patient_voices`** — Real language and concerns pulled from patient forums,
   **always `anecdotal: true`**, never a clinical claim — framed as "other patients have
   said..." to normalize the experience, directly answering the emotional-acknowledgment
   gap the PES has (zero reassurance framing).
9. **`big_picture`** — Longer-horizon facts: typical outcomes/remission context, cumulative
   dose limits, secondary-cancer risk, what "done with treatment" looks like.

## Side-effect severity tiers (`tier` field)

- **`emergency`** — boxed-warning grade / call 911 or go to ER. Lives in the `emergency`
  section, never mixed into the general catalog. Explicitly includes neutropenic fever
  (fever during a low-white-blood-cell window) — this is a medical emergency (mortality
  4-30%, outcome depends on time-to-antibiotics), not a routine call-team item.
- **`call_team`** — common, expected, but the patient should contact their care team
  (not an ER visit) — e.g., vomiting >24h, mouth sores interfering with eating.
- **`self_care`** — expected and manageable at home with the listed self-care steps;
  care team contact is optional/if-it-worsens.

## Topic tag taxonomy (for intake filtering — Phase 1 goal 2 input)

Each section/entry carries one or more tags from this shared list so a future intake's
"topics of interest" can filter what's shown. Kept identical across regimens so the intake
UI doesn't need per-regimen logic:

`what-it-is` · `schedule` · `how-it-feels-daily` · `nausea-appetite` · `hair-skin-appearance` ·
`infection-risk` · `bleeding-bruising` · `fatigue` · `nerve-tingling` · `aches-pain` ·
`mouth-digestion` · `heart` · `urinary` · `fertility-intimacy` · `emergency-signs` ·
`work-daily-life` · `household-safety` · `emotional-support` · `long-term-outlook`

## Reading-depth field (`depth`)

Each section body is written in two layers:

- **`plain`** — always present. Short, plain-language, 6th-8th grade reading level.
- **`detail`** — optional expansion for patients who want more: mechanism, context, and
  specifics beyond the plain-language summary (including pharmacologic names, and numeric
  rates where a clean, specific source supports one). Omitted content still needs a
  `plain` layer; `detail` is additive, not a replacement.

This is the concrete hook for "education level" from intake — low education level shows
`plain` only, higher shows `plain` + `detail` expandable.

## Per-entry fields (side_effects, emergency)

```
name: string
tags: [topic tags]
tier: emergency | call_team | self_care   (side_effects/emergency sections only)
plain: string
detail: string (optional)
self_care: [string]                        (self_care/call_team tiers)
call_team_if: [string]                     (concrete, numeric where possible)
source: source id(s)
anecdotal: bool (default false)
review_note: string (optional, non-rendering)  (sourcing caveats, cross-check flags, or
                                                other reviewer-facing context — never
                                                read aloud in narration or shown to
                                                patients; goes here instead of inline in
                                                plain/detail text)
```

## Flagged, not built, this round

**Candidate intake addition**: patient choice in *how* they want to receive content
(read vs. listen, short vs. detailed) — i.e. tone/format preference, not just education
level + topics. Surfacing this note per the handoff instruction; not designing or building
it this round, it belongs in a future pass at Phase 1 goal 2's intake design.
