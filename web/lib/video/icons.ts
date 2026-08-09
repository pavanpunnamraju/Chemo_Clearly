// Side-effect icon registry (Component Placer, design doc §3). Icon source:
// Iconify API (api.iconify.design) serving the Health Icons set
// (healthicons.org, CC0, no attribution needed) — verified via
// api.iconify.design/search?prefix=healthicons that these specific icons
// exist before adding them here.
//
// Code-level mapping, not a DB table, per the design doc — grows by adding
// entries, not by migration. Keyed by the same topic tags already in
// docs/content/schema.md's taxonomy. A tag with no entry here means "no
// icon match" for that side effect, which is an accepted, normal outcome
// (see components.ts) — not every tag needs an entry.
//
// Coverage confirmed present: nausea-appetite, infection-risk (via fever),
// mouth-digestion, nerve-tingling, urinary, emotional-support, aches-pain.
// Confirmed absent (searched, no reasonable match found): bleeding-bruising,
// fatigue, hair-skin-appearance — these side effects are still covered in
// narration, they just render with no icon.
export const SIDE_EFFECT_ICONS: Record<string, string> = {
  "nausea-appetite": "healthicons:nausea",
  "infection-risk": "healthicons:fever",
  "mouth-digestion": "healthicons:mouth",
  "nerve-tingling": "healthicons:nerve",
  urinary: "healthicons:bladder",
  // "happy" over the more clinical-sounding "mental-health" — reads warmer,
  // still an honest match for the tag.
  "emotional-support": "healthicons:happy",
  "aches-pain": "healthicons:pain",
};

// `color` bakes the fill into the SVG server-side. Needed because these
// icons use fill="currentColor", but an <img>-loaded SVG is an isolated
// replaced element — CSS `color` on the <img> tag never reaches inside it,
// so without this param every icon renders in whatever default color the
// raw SVG has (effectively black), regardless of surrounding page styles.
export function iconUrl(iconId: string, color = "#1f3d3a"): string {
  return `https://api.iconify.design/${iconId.replace(":", "/")}.svg?color=${encodeURIComponent(color)}`;
}
