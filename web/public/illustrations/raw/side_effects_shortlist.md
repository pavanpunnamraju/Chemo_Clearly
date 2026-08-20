# `side_effects` illustration shortlist (round 2)

For the human's manual Storyset download pass. `MANIFEST.md`'s 3 existing `side_effects`
SVGs (tiredness, stress, sleep-analysis) are generic and currently reused as placeholders
across every entry — they stay as-is for the `fatigue` tag (already a reasonable match).
This list covers the other distinct tags used across `rchop.md` + `act.md`'s
`side_effects` sections, per `docs/design/video_visual_system.md`'s tag-driven Scene
rule: felt-symptom tags depict the symptom itself; invisible-condition tags depict the
entry's own `self_care` action instead.

## Style constraint: bro/pana only

Per `docs/design/video_visual_system.md`'s illustration style convention: **prefer
`-bro` or `-pana` variants** for every download — every one of the 19 existing
illustrations is already one of these two, and this list's real links below were
found by checking bro/pana existence specifically, not just that *a* Storyset page
exists for the term. Don't substitute `-amico`/`-rafiki`/`-cuate`/other variants
just because they show up in search results, even if bro/pana looks like a slightly
worse visual match — only fall back to a third style if neither bro nor pana exists
for a term, and flag it explicitly (see `nerve-tingling` below, the one row where
this happened).

## Steps per illustration

Same as `README.md`'s round-1 steps: open the real link below (verify it's still live —
Storyset content shifts), set the color-customizer to the palette hex below (map
dominant/accent slots in order), download SVG, rename to the filename in the table, drop
into this folder for placement at `side_effects/<filename>`.

- Coral/orange primary: `#FF6B4A`
- Teal/mint secondary: `#2FBFA0`
- Navy: `#1C2B45`
- Cream (background): `#FFF6EA`

## Shortlist (9 tags)

Real Storyset URLs below were confirmed live (HTTP 200, correct title) via `WebFetch`
this round — not just search-term guesses. Both `-bro` and `-pana` variants exist and
were verified for every row except `nerve-tingling`.

| Tag | Depicts (per tag-driven rule) | Storyset URL (bro / pana) | Color | Filename |
|---|---|---|---|---|
| `infection-risk` | self-care action: washing hands at a sink, unhurried | [bro](https://storyset.com/illustration/handwashing/bro) / [pana](https://storyset.com/illustration/handwashing/pana) | Coral (patient doing something) | `side_effects__handwashing.svg` |
| `bleeding-bruising` | self-care action: checking a bruise/injury on own forearm | [bro](https://storyset.com/illustration/injury/bro) / [pana](https://storyset.com/illustration/injury/pana) | Coral | `side_effects__checking-bruise.svg` |
| `nausea-appetite` | symptom itself: nausea / not wanting to eat | [bro](https://storyset.com/illustration/eating-disorder/bro) / [pana](https://storyset.com/illustration/eating-disorder/pana) | Navy (patient experiencing) | `side_effects__nausea.svg` |
| `mouth-digestion` | symptom itself: mouth/digestive discomfort | [bro](https://storyset.com/illustration/stomachache/bro) / [pana](https://storyset.com/illustration/stomachache/pana) | Navy | `side_effects__mouth-digestion.svg` |
| `nerve-tingling` | symptom itself: tingling/numbness in hands or feet | **No bro/pana match found** — tried `numbness`, `tingling`, `neuropathy`, `paresthesia`, `pins-and-needles`, `hand-pain`, `wrist-pain`, `diabetes`, `hand-numbness` (all 404 on Storyset). Search term guess only: "numbness" or "tingling hands" — eyeball whatever variant Storyset actually offers, may not be bro/pana | Navy | `side_effects__nerve-tingling.svg` |
| `hair-skin-appearance` | symptom itself: hair loss | [bro](https://storyset.com/illustration/oncology-patient/bro) / [pana](https://storyset.com/illustration/oncology-patient/pana) — confirmed live pages, but couldn't visually confirm the scene shows hair loss specifically (vs. another oncology-patient detail) — eyeball before committing | Navy | `side_effects__hair-loss.svg` |
| `urinary` | symptom itself: bladder/urinary discomfort | [bro](https://storyset.com/illustration/at-the-bathroom/bro) / [pana](https://storyset.com/illustration/at-the-bathroom/pana) | Navy | `side_effects__urinary.svg` |
| `aches-pain` | symptom itself: joint/muscle ache | [bro](https://storyset.com/illustration/physical-therapy-exercise/bro) / [pana](https://storyset.com/illustration/physical-therapy-exercise/pana) — closest bro/pana match found; leans slightly toward the self-care action (exercise) rather than the ache itself, no purer "body ache" bro/pana exists | Navy | `side_effects__aches-pain.svg` |
| `emotional-support` | symptom itself: mood/restlessness (steroid effects) | [bro](https://storyset.com/illustration/anxiety/bro) / [pana](https://storyset.com/illustration/anxiety/pana) | Navy | `side_effects__emotional-support.svg` |

Once downloaded, add each row to `MANIFEST.md`'s table under `side_effects` (same shape
as the existing 3 rows) with its real Storyset URL and collection attribution.
