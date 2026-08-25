# Video Visual System

Status: approved design, not yet implemented (see Prerequisites at the end).

This is the visual/motion spec for the generated narrated video — layout, typography,
illustration, and animation, per `NARRATED_SECTIONS`. Written to be implementable from
cold, the way `schema.md` documents the content schema. Grounded in
`docs/references/infographic_inspo/` (NHS UHL Trust chemo explainer stills) and real
R-CHOP/AC-T content, verified regimen-general — every rule below is keyed off the
entry's own data (drug count, phase count, tag, array position), never a hardcoded fact
from one regimen.

## Typography

- **Font:** Figtree (Google Font, via `@remotion/google-fonts`). Needs one real-render
  load-order check before implementation trusts it — not yet verified.
- **Text-density rule:** headline-only when the slide's own name is already concrete
  (e.g. a specific side-effect name); headline + one-fact phrase when the label is
  generic (Overview, Timeline).
- **Two-tone headline convention** (used by every archetype except Alert and Quote,
  which deliberately break it — see below): two lines, two colors (navy / teal), two
  sizes, off-center in the frame's dead space — never centered over the illustration,
  never one color/size.

## Color principle

Carried over from the illustration library (`web/public/illustrations/MANIFEST.md`),
applies system-wide, not just to Storyset assets:

- **Teal** — doctor/hospital/clinical-system-facing.
- **Coral** — patient shown *doing* something (agency/empowerment); coral as a
  dominant fill, not just an accent.
- **Navy** — patient shown *experiencing* something passively/difficult; used
  sparingly.

## Illustration style convention

Every one of the 19 illustrations in `web/public/illustrations/MANIFEST.md` today is a
`-bro` or `-pana` Storyset variant — both are Storyset's flat, faceless, single-character
styles, closest to the NHS UHL reference look this project is anchored on
(`docs/references/infographic_inspo/`). This was never a stated rule before, just what
happened to get picked each time — stating it now: **prefer `-bro` or `-pana`** for every
future Storyset download. Avoid other variants (`-amico`, `-rafiki`, `-cuate`, etc.) even
if one turns up as a closer literal match for a search term — visual consistency across
the whole illustration set matters more than a marginally better single-illustration fit.
If neither bro nor pana exists for a needed search term, don't silently fall back to a
third style — flag it explicitly so a human can make the call.

**One documented exception:** `overview/overview__oncology-patient-pana.svg` is a Storyset
`amico` variant (isometric room scene, not the flat single-character look), kept after being
flagged, per explicit human direction — the opening shot reads best in this fuller staging.
Single exception, not a precedent for skipping the flag-first rule above.

## The 5 archetypes

### Scene — single lived moment

Off-center whole-body character mid-action, soft irregular gradient blob behind them
(never a hard box), grounding props. Two-tone headline in the dead space beside the
figure. Used for content whose shape is "one person, one moment, one thing they're
managing."

### List — introducing several items at once

No dominant illustration. Short labels at alternating angles/heights, alternating
between the two accent colors, staggered in on a timer. **Not used anywhere in
`side_effects`** (superseded there by the tag-driven Scene rule below, in round 2) —
kept defined for other sections that may need a genuine list later.

### Timeline — spine + nodes

Horizontal spine(s) with nodes along them, callouts alternating above/below connected
by a colored stem — adapted from
`docs/references/infographic_inspo/timeline_stepped_layout.png`. See the multi-spine
mechanism below; this is not a single fixed spine.

### Alert — `emergency` section

Deliberately breaks the palette used everywhere else: hard-edged card (not a soft
blob), higher-contrast red instead of navy/teal, no faceless character acting
anything out. Point: reads as visually different at a glance, before any text is
legible. Video frame keeps the pipeline's real light background (`#F4F7F6`) — the
break is in the cards, not the frame.

- A persistent "EMERGENCY" title sits at the top of the frame for the section's
  whole duration (not just the opening beat) — a constant identifier, unlike every
  other section's two-tone headline which appears once and moves on.
- Opens on a plain calming framing statement, styled normally (not alert-styled), so
  the section doesn't open in false-alarm mode.
- Each `tier: emergency` entry gets a hard-edged red-bordered card, title
  left-aligned and bold — flat/immediate, not the stacked two-tone headline; urgency
  reads better this way.

**Fixed-slot bullet-reveal mechanic (replaces an earlier fade/clear-and-replace
proposal logic-agent flagged as a real risk — see git history of
`docs/references/handoff.md` for that verdict's full reasoning; revised again to
drop position-1 emphasis, per human review of the storyboard mockup — see below).**

- Every entry gets its own fixed row from the start of the section, in a single
  left-aligned column centered at roughly 85% of frame width — not a stack that
  grows/slides as narration proceeds, and not spread across the whole frame or
  alternating sides. Rows not yet reached hold their place as an empty/placeholder
  slot; a card lights up in place when narration reaches it. This is a bullet list
  filling in, not papers piling up.
- A card enters at full saturation — solid red border, filled light-red background —
  while it's the one currently being narrated. That's the "read me now" state.
- Once narration moves to the next entry, the card fades to a lighter/receded shade
  (thin border, near-white background, title still fully legible) and holds there.
  **No card ever clears or leaves the screen once shown** — every entry narrated so
  far stays visible in some form for the rest of the section. This still closes the
  gap logic-agent originally flagged: the fever/neutropenic-fever card (position 1 on
  both regimens) can never be the first thing to disappear, because nothing
  disappears.
- **No permanent per-card emphasis.** An earlier version of this spec kept the
  position-1 card in a permanently-elevated state after settling; human review of the
  storyboard mockup rejected that — only the card currently being narrated is
  highlighted, and every settled card (position 1 included) fades to the same plain
  weight as the others. The never-clears guarantee above is what protects the fever
  card, not a special visual weight. (A follow-up attempt to soften this into a
  frame-level soft-gradient-blob treatment, matching Scene's character wash, was
  tried and rejected as "too intense" — the loudness was structural, from multiple
  rows reading hot at once, not the palette. Scoping "hot" to one row at a time
  inside an otherwise flat/quiet column fixed it without needing a blob wash; approved
  mockup: `docs/references/handoff.md` git history, round 3, design-agent.)
- Cards are title-only at every stage, including while active — there is no separate
  "detail" card state to shrink down from. That's what makes the fixed-slot layout
  fit: title-only cards are short enough that a full column never needs a further
  compaction step. Checked against R-CHOP's 6-entry case (the harder of the two
  regimens) against the 1280×720 frame this pipeline renders at: even the longest
  title on either regimen ("Fever during your low-blood-cell window (neutropenic
  fever)", 61 characters) sets on one line at a legible size in a frame this wide, so
  card height doesn't vary by title length. Six single-line title cards comfortably
  fit the vertical band between the opening framing line and the closing split card,
  with room held in reserve — AC-T's 4-entry case is easier by construction.
  **Fallback for a future regimen with more emergency entries than fit at this
  size:** drop the small tier-label line above the title (title-only becomes
  title-only-tighter) before ever reintroducing clearing — keyed off whatever count
  actually overflows the frame's vertical band at standard card size, never a
  hardcoded number.
- Closes on a two-column split card — 911 side hardest red, care-team side coral
  (`#FF6B4A`, the same coral used system-wide for patient-agency moments, not a
  separate orange) — the one moment where color itself carries the triage logic. This
  is a distinct closing beat/cut after the full column has filled in, not composited
  alongside it — the cards tell the "here's what to watch for" story; the split card
  tells the separate "here's who to call" story once that's done.

### Quote — `patient_voices`

No character at all. A large quotation-mark glyph and the quote text itself are the
dominant visual, on the same soft-gradient-blob background family as Scene (so it
still reads as part of the same video), but muted/desaturated — quieter than every
other section, reflective rather than instructional. Crossfades between quote blocks
(however many the entry has) instead of cutting to a new scene/character.

## Per-section mapping

| Section | Archetype |
|---|---|
| `overview` | Scene |
| `timeline` | Timeline (multi-spine) |
| `daily_life` | Scene |
| `side_effects` | Scene only (tag-driven subject rule) |
| `fertility_intimacy` | Scene (held shot, no build) |
| `emergency` | Alert |
| `patient_voices` | Quote |

### `overview`

Headline "R-CHOP" (navy, large) / "five medicines, one plan" (teal, smaller),
lower-left. Scene: person seated in an infusion chair, IV line visible, calm posture,
small side table with a water cup — the establishing shot for the whole video. Eye
goes to the person first, then down into the headline. Builds in three beats: (1)
scene resolves (character + blob + illustration) as narration opens, (2) headline
appears at "R-CHOP"'s first spoken mention — real STT-timed, not held to the end;
guarded (`narration.ts`'s `findOverviewHeadlineReveal`) so a garbled first mention
falls back to the headline's original immediate-display timing instead of silently
anchoring to a later, correctly-transcribed occurrence, (3) one small labeled tag
animates onto the IV line per drug name as it's spoken — count comes from however
many drugs the entry actually names (5 for R-CHOP, 3 for AC-T), never hardcoded.
Drug-tag beat (3) not yet built — held pending the round-2 regimen-general
drug-name-mistranscription fix (`docs/references/handoff-overview-timing.md`).

Known gap: no schema hook today to visually separate AC-T's two phases (AC vs. T) —
the flat drug-tag list still renders correctly, just doesn't group them. Not a schema
change proposed this round, noted as a future nuance only.

### `timeline` — multi-spine mechanism

One spine per distinct phase-grouping the entry's content actually breaks into, one
node per bullet within that phase. Nodes alternate callouts above/below the spine,
connected by a colored stem.

- **R-CHOP:** one spine, 4 nodes — Day 1 infusion / Days 2-5 taper / Days 7-10 nadir /
  Days 11-21 recovery — looped back to node 1 with a "×6 cycles, ~18 weeks" label.
- **AC-T:** two spines back-to-back — an AC-phase spine (4 bullets, looped ×4) and a
  structurally different T-phase spine with its own node count — necessary because
  AC-T isn't one repeating cycle like R-CHOP, it's two structurally different phases
  months apart.
- Spine count is always however many phases the entry's own content has — never a
  fixed number.

### `daily_life`

Headline "Most days," (navy) / "you keep living them" (teal), off-center upper-right
— the opposite corner from `overview`, so back-to-back sections don't repeat the same
eye path. Scene: person mid-walk outside; small paired icon+word chips slide in near
the figure one per topic as narration moves through them (exercise → driving →
intimacy-pointer → call_team_if), reading as one continuous day rather than slides
stapled together. Ends on the `call_team_if` line as a single alert-colored chip,
previewing the Alert archetype before `emergency` proper. Same mechanism on both
regimens — content differs only in chip text.

### `side_effects` — tag-driven Scene subject rule

Scene-only for every entry in the section, both regimens — no List archetype survives
here (this replaces an earlier 8-Scene/2-List split from round 1). Which subject the
scene depicts is decided by the entry's tag, not by its wording:

- **Felt/visible-symptom tags** (`nausea-appetite`, `hair-skin-appearance`,
  `mouth-digestion`, `nerve-tingling`, `aches-pain`, `urinary`,
  `emotional-support`, `fatigue`) → the scene depicts that symptom directly. `fatigue`
  was added later (R-CHOP's anemia entry uses it, not covered in the original 9-tag
  round) — reuses the pre-existing `tiredness-pana.svg` rather than a newly-sourced
  illustration, human call, not vetted under the current color/style pass.
- **Invisible-condition tags** (`infection-risk`, `bleeding-bruising`) → the scene
  depicts the patient doing that entry's own `self_care` action instead, since the
  condition itself isn't visible. E.g. `infection-risk`: person at a bathroom sink
  washing hands, unhurried, soft gradient blob behind, headline "Watch for
  infection." `bleeding-bruising`: person looking at a bruise on their own forearm,
  pressing it gently with two fingers, calm/matter-of-fact.

Verified identical mechanism on both R-CHOP and AC-T's matching tags — AC-T's
self-care wording differs, the scene doesn't, since it's keyed off tag, not literal
text.

### `fertility_intimacy`

Headline "Before you start," (navy) / "ask about this" (teal). Scene: the existing
`family-bro`/`asian-family-pana` illustrations (family scene, not a couple) — human
call: satisfied with how these look as-is, no new couple-specific illustration
sourced; this paragraph describes the illustration actually in use, not an unmet target.
Softest palette in the video (pastel blob, muted accent) — the most emotionally sensitive
section. No build/reveal: a single held shot the narration plays over. That stillness is
itself a signal — everything else moves in beats; this one holding still says "slow down,
this matters differently." Same mechanism both regimens.

### `emergency`

See the Alert archetype above: opens on the calming framing line, then one card per
`tier: emergency` entry in sequence, closes on the 911-vs-care-team split card.

### `patient_voices`

See the Quote archetype above. Concretely: quote text large, centered-left, small
"— other patients, R-CHOP" attribution beneath in the smaller/teal weight (no stacked
two-tone headline — the quote *is* the content). Large faded quotation mark behind/
behind-left of the text as the only "illustration." Crossfades between quotes as
narration moves between them — same mechanism whether the entry has 2 quotes or 3.
Closes on the app's own framing line ("Everyone's experience is different...") — two full
sentences, not a 2-4 word headline, so it uses Alert's title-card sizing rather than the
tight two-tone headline treatment, split navy (first sentence)/teal (second) in the same
primary/secondary relationship, doubling as the bridge back to Scene for whatever section
follows. Small progress dots, bottom-right, one per quote (however many the entry has) —
added during the R-CHOP storyboard mockup round so a viewer can tell how far through the
section they are across sequential crossfades with no character/scene change to signal it;
CSS only, no new asset.

Verified against a real interactive mockup: `docs/references/handoff.md`, Phase 2a goal #6
storyboard round, design-agent.

## Prerequisites — satisfied

Both blockers below have landed; implementation is unblocked.

1. **AC-T's `emergency` section restructure.** Done — `docs/content/act.md`'s
   `emergency` section is now per-item `###`/`tier: emergency` entries (4 emergency
   items plus the non-emergency framing/closing entries), matching R-CHOP's structure
   (`9d68873`). The Alert archetype has something to iterate over on both regimens.
2. **New Storyset illustrations for `side_effects`.** Done — `a6be703` added the
   9 tag-specific illustrations the tag-driven rule above calls for (`nausea`,
   `mouth-digestion`, `nerve-tingling`, `hair-loss`, `urinary`, `aches-pain`,
   `emotional-support`, `handwashing`, `checking-bruise`), covering all 7 felt/visible
   tags and both invisible-condition tags. Verified against
   `web/public/illustrations/MANIFEST.md`.

Verified for the Phase 2a goal #6 storyboard round — see the R-CHOP
storyboard mockup this round produced for how the spec above actually lays out
against real content.
