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
blob), higher-contrast red/orange instead of navy/teal, no faceless character acting
anything out. Point: reads as visually different at a glance, before any text is
legible.

- Opens on a plain calming framing statement, styled normally (not alert-styled), so
  the section doesn't open in false-alarm mode.
- Each `tier: emergency` entry gets a hard-edged red-bordered card, title
  left-aligned and bold — flat/immediate, not the stacked two-tone headline; urgency
  reads better this way.
- The first card by array position gets emphasis. Keyed off position, not a
  hardcoded item — different regimens' first emergency item differs.
- Cards build in sequence as narration reaches them, all sliding in from the same
  edge (not alternating like Scene/List), so the section reads as one continuous
  alarm rather than a sequence of separate beats.
- Closes on a two-column split card — 911 side hardest red, care-team side step-down
  orange — the one moment where color itself carries the triage logic.

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
scene resolves as the "given together" line plays, (2) one small labeled tag animates
onto the IV line per drug name as it's spoken — count comes from however many drugs
the entry actually names (5 for R-CHOP, 3 for AC-T), never hardcoded, (3) headline
settles last.

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
  `emotional-support`) → the scene depicts that symptom directly.
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

Headline "Before you start," (navy) / "ask about this" (teal). Scene: two people
sitting close, hands linked — "hugging and holding hands stays safe" framing, not
romantic/explicit. Softest palette in the video (pastel blob, muted accent) — the
most emotionally sensitive section. No build/reveal: a single held shot the narration
plays over. That stillness is itself a signal — everything else moves in beats; this
one holding still says "slow down, this matters differently." Same mechanism both
regimens.

### `emergency`

See the Alert archetype above: opens on the calming framing line, then one card per
`tier: emergency` entry in sequence, closes on the 911-vs-care-team split card.

### `patient_voices`

See the Quote archetype above. Concretely: quote text large, centered-left, small
"— other patients, R-CHOP" attribution beneath in the smaller/teal weight (no stacked
two-tone headline — the quote *is* the content). Large faded quotation mark behind/
behind-left of the text as the only "illustration." Crossfades between quotes as
narration moves between them — same mechanism whether the entry has 2 quotes or 3.
Closes on the app's own framing line ("Everyone's experience is different...") in the
normal navy/teal two-tone treatment, doubling as the bridge back to Scene for
whatever section follows.

## Prerequisites — not yet satisfied

Implementation is not fully unblocked. Two items must land first:

1. **AC-T's `emergency` section restructure.** It's still one unsplit paragraph,
   unlike R-CHOP's per-item `###`/`tier: emergency` structure (`82d59ea`). The Alert
   archetype has nothing to iterate over until AC-T gets the same restructure. Being
   routed to codebase-agent separately.
2. **New Storyset illustrations for `side_effects`.** Several Scene entries the
   tag-driven rule above calls for don't exist in the current library — checked
   against `web/public/illustrations/MANIFEST.md` (19 generic SVGs today, none match
   the specific scenes proposed here). Human is doing a manual download pass,
   scoped separately.
