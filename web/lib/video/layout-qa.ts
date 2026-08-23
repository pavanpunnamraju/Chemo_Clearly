import type { NarrationPlan } from "./narration";
import type { TimedCaption } from "./captions";

// Phase 2a goal #10c: render-QA text-overflow check. video-composition/
// SlideVideo.tsx's archetypes are fixed absolute-position boxes, not
// data-driven layout, so there's no free-floating collision to detect — the
// real risk is dynamic text (a headline, a title-card sentence, a caption
// chunk) wrapping past the number of lines its box was designed for and
// visually crowding/overlapping a neighboring element (illustration, blob,
// frame edge). Runs on the NarrationPlan/captions already built, before
// rendering — no frame snapshot needed.

// ponytail: no font-measurement library is installed (checked for `canvas`/
// `fontkit` — neither present) — this estimates text width from an average
// char-width-per-fontSize factor (Figtree, a fairly standard sans-serif)
// instead of real glyph metrics. Ceiling: can misjudge width by roughly
// +/-15% for unusual character mixes. Upgrade path: swap in `canvas`'s
// `measureText` (or render a still frame and inspect it) if this proxy
// starts producing false positives/negatives in practice.
const AVG_CHAR_WIDTH_FACTOR: Record<number, number> = { 400: 0.5, 500: 0.52, 600: 0.54, 700: 0.56, 800: 0.58 };

function estimateLineCount(text: string, fontSizePx: number, boxWidthPx: number, fontWeight: number): number {
  const factor = AVG_CHAR_WIDTH_FACTOR[fontWeight] ?? 0.56;
  const widthPx = text.length * fontSizePx * factor;
  return Math.max(1, Math.ceil(widthPx / boxWidthPx));
}

export interface LayoutOverflowIssue {
  location: string;
  text: string;
  estimatedLines: number;
  maxLines: number;
}

interface TextBox {
  widthPx: number;
  fontSizePx: number;
  fontWeight: number;
  maxLines: number;
}

function checkBox(location: string, text: string, box: TextBox): LayoutOverflowIssue | null {
  if (!text.trim()) return null;
  const estimatedLines = estimateLineCount(text, box.fontSizePx, box.widthPx, box.fontWeight);
  if (estimatedLines > box.maxLines) return { location, text, estimatedLines, maxLines: box.maxLines };
  return null;
}

// Boxes mirrored from video-composition/SlideVideo.tsx (source of truth for
// the actual layout) — same "each module reads its own copy of the rule"
// precedent as components.ts's illustration maps, so this check doesn't
// import a Remotion/UI component into the Node-side API route.
const FRAME_WIDTH_PX = 1280; // video-composition/Root.tsx composition width

// Scene archetype's headline box (SlideVideo.tsx SceneSlide): width 38% of
// frame, fontSize 38/weight 800 for the dynamic (non-two-line-fixed) case.
const SCENE_HEADLINE_BOX: TextBox = { widthPx: FRAME_WIDTH_PX * 0.38, fontSizePx: 38, fontWeight: 800, maxLines: 3 };
// The 3 Scene sections with a hardcoded two-line headline (SCENE_FIXED_HEADLINES)
// don't show `slide.headline` at all — nothing to check there.
const SCENE_FIXED_HEADLINE_SECTIONS = new Set(["overview", "daily_life", "fertility_intimacy"]);
const SCENE_SECTIONS = new Set(["overview", "daily_life", "side_effects", "fertility_intimacy"]);
// side_effects' two invisible-condition tags override to a short fixed
// string ("Watch for infection.") — also nothing to check.
const SIDE_EFFECT_HEADLINE_OVERRIDE_TAGS = new Set(["infection-risk", "bleeding-bruising"]);

// Title Card archetype's intro-sentence box (SlideVideo.tsx TitleCard):
// width 66% of frame, fontSize 34/weight 700, vertically centered.
const TITLE_CARD_BOX: TextBox = { widthPx: FRAME_WIDTH_PX * 0.66, fontSizePx: 34, fontWeight: 700, maxLines: 6 };
const TITLE_CARD_SECTIONS = new Set(["timeline", "side_effects"]);

// Caption bar (SlideVideo.tsx CaptionBar): fixed 900px width minus its own
// horizontal padding, fontSize 32/weight 400.
const CAPTION_BOX: TextBox = { widthPx: 900 - 40, fontSizePx: 32, fontWeight: 400, maxLines: 2 };

export function checkLayoutOverflow(plan: NarrationPlan, captions: TimedCaption[]): LayoutOverflowIssue[] {
  const issues: LayoutOverflowIssue[] = [];

  for (const slide of plan.slides) {
    const isTitleCardIntro = TITLE_CARD_SECTIONS.has(slide.sectionId) && slide.entryId === slide.sectionId;
    if (isTitleCardIntro) {
      const issue = checkBox(`TitleCard/${slide.entryId}`, slide.onScreen ?? "", TITLE_CARD_BOX);
      if (issue) issues.push(issue);
      continue;
    }

    if (SCENE_SECTIONS.has(slide.sectionId) && !SCENE_FIXED_HEADLINE_SECTIONS.has(slide.sectionId)) {
      const hasFixedOverride = slide.tags.some((t) => SIDE_EFFECT_HEADLINE_OVERRIDE_TAGS.has(t));
      if (!hasFixedOverride) {
        const issue = checkBox(`Scene/${slide.entryId}`, slide.headline, SCENE_HEADLINE_BOX);
        if (issue) issues.push(issue);
      }
    }
  }

  for (const caption of captions) {
    const issue = checkBox(`Caption@${caption.startSeconds.toFixed(1)}s`, caption.text, CAPTION_BOX);
    if (issue) issues.push(issue);
  }

  return issues;
}
