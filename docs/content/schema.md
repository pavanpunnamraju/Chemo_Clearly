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
- **Tagged, not rewritten per patient.** Every video always covers the full
  content set for the regimen — personalization is education level, content
  depth, and voice tone, never which topics are included. Tags exist to
  drive the video's visual layer (which entries get a matching illustration/
  icon), not to filter what's narrated. The content itself is written once.
  Two reading depths (`plain` / `detail`) exist per section so "education
  level" has something concrete to switch on without a separate rewrite per
  patient.

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

## Topic tag taxonomy (drives video illustration/component matching)

Each section/entry carries one or more tags from this shared list. Tags don't filter
what's narrated — every video covers everything — they drive which entries get a
matching on-screen illustration/icon in the video. Kept identical across regimens so
that matching logic doesn't need per-regimen special-casing:

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

## `daily_life` sub-entries

`daily_life`'s Exercise/Driving/Intimacy/Helpful-routines content (currently bold inline
labels in both `rchop.md` and `act.md`) becomes `###` sub-entries — the exact same shape
`side_effects` already uses. No parser change is needed: `parse.ts`'s
`parseRegimenContent`/`parseEntry` already handle any section's `###` sub-headers
generically. This turns a parser gap into a content-doc formatting fix, which is what keeps
the parser's field vocabulary regimen-general instead of growing a `daily_life`-only
allowance.

Per sub-entry:

```
name: string      (### header text — Exercise | Driving | Intimacy | Helpful routines)
tags: [topic tags]
plain: string      (narrate-eligible — same default as every other `plain` field in this
                    schema; daily_life's sub-entries are short practical guidance meant to
                    be heard, not captions, so none of the four need a visual-only field.
                    No `tier` field: these are practical-life items, not a severity-triaged
                    catalog like side_effects/emergency.)
source: source id(s)   (optional per sub-entry — omit if it matches the section's overall
                        source line)
```

The section-level intro paragraph (today's unlabeled opening `**plain:**`) stays exactly as
it parses today: an unnamed entry captured from the text before the first `###`. Its
`call_team_if`/`source` fields should sit right after that intro paragraph and before the
first `### Exercise` (currently they trail after "Helpful routines" in both docs — move them
up during the content-doc rewrite, since they apply to the whole section, not to one
sub-entry).

**Schema rule for `Intimacy` specifically** (not just this entry's wording — a standing rule
so every future regimen follows it too): its `plain` field must be a short pointer only (one
sentence — intimacy is generally safe, see `fertility_intimacy`). Any substantive detail
(barrier-method/bodily-fluid specifics, timing) belongs in `fertility_intimacy`'s
`plain`/`detail`, never restated in `daily_life`.

## Per-entry fields (side_effects, emergency)

```
name: string
tags: [topic tags]
tier: emergency | call_team | self_care   (side_effects/emergency sections only)
plain: string
detail: string (optional)
self_care: [string]                        (self_care/call_team tiers)
call_team_if: [string]                     (concrete, numeric where possible)
drug_names: [`Drug Name`, ...]             (overview only — the regimen's own drug
                                            names, backtick-quoted, comma-separated,
                                            in the order they're narrated. Structured
                                            duplicate of what `plain` already spells
                                            out, same reasoning as call_911/call_team:
                                            the video's per-drug tag beat needs the
                                            list without parsing free text, which has
                                            no consistent convention across regimens.)
cycle_count: number                        (overview only, optional — the video's
weeks_apart: number                        countdown-cards beat's 3 numbers, structured
weeks_total: number                        duplicates of what `plain` already states in
                                            prose. Only present when the regimen's
                                            schedule reduces to one clean cycles/
                                            interval/total-duration triple (e.g.
                                            R-CHOP's "6 cycles, 3 weeks apart, ~18 weeks
                                            total"); omitted entirely — not guessed or
                                            averaged — when a regimen's schedule is
                                            multi-phase or interval/total are given as a
                                            range rather than one number (e.g. AC-T).
                                            Presence of all three is what gates the
                                            video beat on, not the regimen name.)
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
(read vs. listen, short vs. detailed) — i.e. tone/format preference, beyond education
level and depth. Surfacing this note per the handoff instruction; not designing or building
it this round, it belongs in a future pass at Phase 1 goal 2's intake design.
