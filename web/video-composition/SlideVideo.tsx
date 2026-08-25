import { Audio, Img, Sequence, AbsoluteFill, useVideoConfig, useCurrentFrame, staticFile, interpolate } from "remotion";
import { loadFont, fontFamily } from "@remotion/google-fonts/Figtree";
import type { SlideBeat } from "../lib/video/narration";
import { illustrationForSlide, sceneIllustrationForSideEffectTags } from "../lib/video/components";
import type { TimedCaption } from "../lib/video/captions";
import type { DuckingEnvelope } from "../lib/video/ducking";

// video_visual_system.md's Typography section: Figtree system-wide, loaded
// once at module scope so Remotion's renderer waits on it (loadFont
// self-registers delayRender/continueRender) before any frame renders.
// Verified against a real bundle+render this round (font-check spike) — not
// just trusted from the package existing.
loadFont("normal", { weights: ["400", "700", "800"] });

export interface SlideVideoProps {
  slides: SlideBeat[];
  /**
   * Filename of the narration audio, relative to the bundle's public dir.
   * The public dir is generated fresh per render (see lib/video/render.ts,
   * which writes narration.mp3 there and points @remotion/bundler's
   * `publicDir` at it) since the audio is generated per patient, not a
   * static asset checked into the repo's own public/ folder.
   */
  audioSrc: string;
  totalSeconds: number;
  /** Caption track (goal #4) — real per-chunk start/end timing from
   * lib/video/captions.ts, built from Speech-to-Text word alignment. */
  captions: TimedCaption[];
  /** Off by default per the goal wording — no app-chrome toggle exists yet
   * (Phase 2b), so this is the only control for now. */
  captionsEnabled?: boolean;
  /** `prefers-reduced-motion` (goal #5) — same "off by default, no live
   * app-chrome toggle yet" shape as captionsEnabled above: rendering happens
   * server-side (lib/video/render.ts), not in the viewer's own browser, so
   * there's no browser media query to read yet. Wire this to an actual
   * viewer signal once Phase 2b's player exists; until then it's a plumbing
   * seam only. Suppresses the one continuous/looping decorative animation
   * (Timeline's active-node pulse) rather than the content-legibility fades
   * (Quote crossfade, Timeline node reveal), which stay as-is per the goal's
   * own "don't just disable motion outright" instruction. */
  reducedMotion?: boolean;
  /** Background music bed (Phase 2a #7) — filename relative to the bundle's
   * public dir, same shape as audioSrc. Undefined until the human sources a
   * real track file (lib/video/render.ts checks for it and leaves both this
   * and `ducking` undefined otherwise). */
  musicSrc?: string;
  /** Auto-ducking envelope computed from the real narration audio
   * (lib/video/ducking.ts) — undefined has the same effect as an
   * empty/missing envelope: music plays at flat base volume. */
  ducking?: DuckingEnvelope;
  [key: string]: unknown;
}

const TAIL_SECONDS = 2;

// "Low-volume" per the goal wording — the music bed should read as ambience,
// not compete with narration even at its "open" (non-ducked) multiplier.
const MUSIC_BASE_VOLUME = 0.12;

// Fade-in applied at the start of every top-level section Sequence (Part B,
// visual pacing pass) — long enough to read as a gentle transition, short
// enough not to eat into the section's own content time.
const SECTION_FADE_IN_FRAMES = 18;

/** Linear interpolation between DuckingEnvelope step values at `seconds`.
 * Returns 1 (no ducking) if `ducking` is undefined/empty, so musicSrc
 * without a ducking envelope just plays at base volume. */
function duckingVolumeAt(seconds: number, ducking: DuckingEnvelope | undefined): number {
  if (!ducking || ducking.values.length === 0) return 1;
  const { stepSeconds, values } = ducking;
  const pos = seconds / stepSeconds;
  const i0 = Math.max(0, Math.min(values.length - 1, Math.floor(pos)));
  const i1 = Math.min(values.length - 1, i0 + 1);
  const t = pos - i0;
  return values[i0]! + (values[i1]! - values[i0]!) * t;
}

/** Wraps a top-level section Sequence's content in a short opacity fade-in,
 * relative to the Sequence's own local frame 0 (Remotion resets
 * useCurrentFrame() per-Sequence for its children) — replaces every
 * section-to-section hard cut with a consistent gentle fade (Part B). */
const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, SECTION_FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ opacity, width: "100%", height: "100%" }}>{children}</div>;
};

/** Same short opacity fade as `FadeIn`, but without forcing `width/height:
 * 100%` — `FadeIn` assumes it wraps a full section block with a defined
 * height; `overview`'s headline-reveal beat (round 2 reorder) fades in an
 * inline text block inside an auto-height, `position: absolute` container,
 * where a 100%-height div would collapse to 0. */
const HeadlineFadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, SECTION_FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <div style={{ opacity }}>{children}</div>;
};

/** `overview`'s per-drug tag beat (round 4 mechanism, round 6 styling) — a
 * bold labeled tag, one per drug name, animating onto the IV line as its own
 * name is spoken. Mounted unconditionally by the caller (one per
 * `drugNames` entry, positioned by index — see `DRUG_TAG_CASCADE` below);
 * `revealFrame` gates when it fades in, same `layout="none"` + small-fade
 * approach as the headline reveal above (this container has no defined
 * height either). `textTransform: uppercase` handles display casing
 * generally (content-file `drugNames` values match source prose verbatim,
 * including mid-sentence lowercase — round 5) — no per-word JS needed now
 * that the reference styling calls for all-caps regardless. */
const DrugTagChip: React.FC<{ name: string; revealFrame: number; top: string; right: string }> = ({
  name,
  revealFrame,
  top,
  right,
}) => {
  const chip = (
    <div
      style={{
        position: "absolute",
        top,
        right,
        padding: "10px 18px",
        borderRadius: 8,
        background: TEAL,
        color: "#ffffff",
        fontWeight: 800,
        fontSize: 22,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </div>
  );
  if (revealFrame <= 0) return chip;
  return (
    <Sequence from={revealFrame} layout="none">
      <HeadlineFadeIn>{chip}</HeadlineFadeIn>
    </Sequence>
  );
};

// Loose diagonal zigzag cascade down the frame's right side (reference
// storyboard, round 6) — trends downward while alternating left/right, so it
// reads as "down-and-slightly-right then back-left" rather than a straight
// stack or scattered layout. Position-by-index, not a fixed list: works for
// any drug count (5 for R-CHOP, 3 for AC-T) without regimen-specific code.
// Ends above ~65% frame height, clear of the headline's own bottom-10% band.
const DRUG_TAG_TOP_START = 16;
const DRUG_TAG_TOP_STEP = 11;
const DRUG_TAG_RIGHT_ZIGZAG = [18, 6] as const; // alternating right-offset (%), index parity picks one
function drugTagCascadePosition(index: number): { top: string; right: string } {
  return {
    top: `${DRUG_TAG_TOP_START + index * DRUG_TAG_TOP_STEP}%`,
    right: `${DRUG_TAG_RIGHT_ZIGZAG[index % 2]}%`,
  };
}

// video_visual_system.md color principle — system-wide, not just the
// illustration library. Teal = clinical/system-facing, coral = patient doing
// something (agency), navy = patient passively experiencing something.
const NAVY = "#1c2b45";
const TEAL = "#2fbfa0";
const CORAL = "#ff6b4a";
const FRAME_BG = "#f4f7f6";

// Alert archetype (video_visual_system.md) — deliberate palette break from
// the navy/teal/coral system above, verified against the approved mockup
// (docs/references/handoff.md, round 3, design-agent).
const ALERT_RED = "#c23b34";
const ALERT_RED_DEEP = "#9c2a24";
const ALERT_CARD_BG = "#fff8f6";
const ALERT_SETTLED_BG = "#fdfbfa";
const ALERT_SETTLED_BORDER = "#e7d9d6";
const ALERT_EMPTY_BORDER = "#dcd7cb";

// Scene archetype sections (video_visual_system.md's per-section mapping) —
// daily_life/side_effects/fertility_intimacy/overview. Timeline/Alert/Quote
// each have their own dedicated component below (TimelineSection/
// AlertSection/QuoteSection) — together these 7 section ids cover every
// entry in NARRATED_SECTIONS (lib/video/select.ts), so no generic fallback
// slide layout is needed any more.
const SCENE_SECTIONS = new Set(["overview", "daily_life", "side_effects", "fertility_intimacy"]);

// Fixed two-line two-tone headlines for the 3 Scene sections that are a
// single content entry (one scene, one headline, not per-entry text) — text
// given verbatim by video_visual_system.md's per-section write-ups.
const SCENE_FIXED_HEADLINES: Partial<Record<string, [string, string]>> = {
  overview: ["R-CHOP", "five medicines, one plan"],
  daily_life: ["Most days,", "you keep living them"],
  fertility_intimacy: ["Before you start,", "ask about this"],
};

// side_effects's two invisible-condition tags get a short spec-styled
// headline ("Watch for X.") instead of the entry's own (longer, clinical)
// name — video_visual_system.md gives "Watch for infection." verbatim for
// infection-risk; bleeding-bruising follows the same pattern, extended here
// since the spec doesn't spell that one out explicitly.
const SIDE_EFFECT_HEADLINE_OVERRIDE: Record<string, string> = {
  "infection-risk": "Watch for infection.",
  "bleeding-bruising": "Watch for bruising.",
};

// Which side the character occupies vs. which dead-space corner the
// headline sits in, per section — taken from the human-approved storyboard
// mockup's actual layout (round 2 decision #1), not the design doc prose's
// literal left/right words, which read as mirror-flipped from what was
// actually built and approved. Corners alternate section to section so
// back-to-back sections don't repeat the same eye path.
type Side = "left" | "right";
const SCENE_LAYOUT: Record<string, { characterSide: Side; headlineVAlign: "top" | "bottom"; blobTint: string }> = {
  overview: { characterSide: "left", headlineVAlign: "bottom", blobTint: TEAL },
  daily_life: { characterSide: "right", headlineVAlign: "top", blobTint: CORAL },
  side_effects: { characterSide: "left", headlineVAlign: "bottom", blobTint: NAVY },
  fertility_intimacy: { characterSide: "left", headlineVAlign: "top", blobTint: "#e08a6b" },
};
// Both invisible-condition tags get the "Watch for X." headline treatment,
// but only `infection-risk` gets the coral (patient-doing-something) blob
// tint — verified against the illustrations' own established colors
// (`grep -o '#[0-9A-Fa-f]\{6\}'` on the SVGs), not assumed from the tag
// category: `handwashing.svg` uses our exact coral (#FF6B4A) as its accent,
// but `checking-bruise.svg` uses our exact navy (#1C2B45) — same as every
// felt/visible-symptom illustration in the section — so bleeding-bruising
// keeps the section's default navy tint rather than a forced coral that
// visually contradicts the asset it's applied to.
const SIDE_EFFECT_CORAL_TAGS = new Set(["infection-risk"]);

// Title Card archetype (video_visual_system.md) — full-frame, character-free
// section-opening beat for the 2 sections that otherwise open cold (no
// headline/scene treatment of their own): `timeline`/`side_effects`'s
// section-level intro sentence (the pre-first-`###` `**plain:**` text the
// parser fix above now captures as its own nameless entry, id === sectionId)
// gets its own card instead of being silently dropped. The other 5 narrated
// sections keep their existing opening treatment untouched.
const TITLE_CARD_SECTIONS = new Set(["timeline", "side_effects"]);

// The single phrase (verbatim substring of the entry's own `plain`, per
// `entryOnScreen` in lib/video/narration.ts) that names what makes each
// section distinct — switches to teal inline, per the approved mockup
// (docs/references/handoff.md, design-agent round). Hardcoded per-regimen,
// same precedent as SCENE_FIXED_HEADLINES/TIMELINE_LOOP_LABEL/QuoteBlock's
// attribution line above — AC-T's title cards get their own phrase(s) when
// that regimen's round lands.
const TITLE_CARD_TEAL_PHRASE: Partial<Record<string, string>> = {
  timeline: "3-week cycle",
  side_effects: "some just need simple self-care, others are worth a call to your team",
};

function isTitleCardIntro(beat: SlideBeat): boolean {
  return TITLE_CARD_SECTIONS.has(beat.sectionId) && beat.entryId === beat.sectionId;
}

export const SlideVideo: React.FC<SlideVideoProps> = ({
  slides,
  audioSrc,
  totalSeconds,
  captions,
  captionsEnabled = false,
  reducedMotion = false,
  musicSrc,
  ducking,
}) => {
  const { fps } = useVideoConfig();
  const endSeconds = totalSeconds + TAIL_SECONDS;

  // Round-robin index of each slide within its own section (e.g. the 2nd
  // "timeline" slide gets index 1) — used to pick that section's Nth
  // curated illustration file. Precomputed here rather than mutated inside
  // the render map below.
  const sectionIndexes: number[] = [];
  {
    const counters: Record<string, number> = {};
    for (const beat of slides) {
      // The Title Card intro beat isn't a real illustrated entry — skip it
      // so it doesn't consume an index and shift every real entry after it.
      if (isTitleCardIntro(beat)) {
        sectionIndexes.push(-1);
        continue;
      }
      const idx = counters[beat.sectionId] ?? 0;
      counters[beat.sectionId] = idx + 1;
      sectionIndexes.push(idx);
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: FRAME_BG, fontFamily }}>
      <Audio src={staticFile(audioSrc)} />
      {musicSrc ? (
        <Audio
          src={staticFile(musicSrc)}
          loop
          volume={(f) => MUSIC_BASE_VOLUME * duckingVolumeAt(f / fps, ducking)}
        />
      ) : null}
      {slides.map((beat, i) => {
        const nextStart = slides[i + 1]?.startSeconds ?? endSeconds;
        const from = Math.round(beat.startSeconds * fps);
        const durationInFrames = Math.max(1, Math.round((nextStart - beat.startSeconds) * fps));

        if (isTitleCardIntro(beat)) {
          return (
            <Sequence key={beat.entryId} from={from} durationInFrames={durationInFrames}>
              <FadeIn>
                <TitleCard text={beat.onScreen ?? ""} tealPhrase={TITLE_CARD_TEAL_PHRASE[beat.sectionId]} />
              </FadeIn>
            </Sequence>
          );
        }

        if (beat.sectionId === "emergency") {
          // Alert archetype (video_visual_system.md, round 2 decision #2):
          // one AlertSection mounted for the whole section span, not a
          // Sequence per beat — that's what lets a settled card keep
          // rendering past its own beat's Sequence window. Only the first
          // beat in the section's contiguous run emits a Sequence; the rest
          // are covered by it and render nothing here.
          const isRunStart = slides[i - 1]?.sectionId !== "emergency";
          if (!isRunStart) return null;

          let runEnd = i;
          while (slides[runEnd + 1]?.sectionId === "emergency") runEnd++;
          const runNextStart = slides[runEnd + 1]?.startSeconds ?? endSeconds;
          const runDurationInFrames = Math.max(1, Math.round((runNextStart - beat.startSeconds) * fps));

          return (
            <Sequence key={beat.entryId} from={from} durationInFrames={runDurationInFrames}>
              <FadeIn>
                <AlertSection beats={slides.slice(i, runEnd + 1)} />
              </FadeIn>
            </Sequence>
          );
        }

        if (beat.sectionId === "patient_voices") {
          // Quote archetype (video_visual_system.md) — one QuoteSection
          // mounted for the whole section span, same "run" grouping as
          // AlertSection above, so the crossfade math has every beat's real
          // startSeconds to compute boundaries against instead of being
          // reconstructed per-Sequence.
          const isRunStart = slides[i - 1]?.sectionId !== "patient_voices";
          if (!isRunStart) return null;

          let runEnd = i;
          while (slides[runEnd + 1]?.sectionId === "patient_voices") runEnd++;
          const runNextStart = slides[runEnd + 1]?.startSeconds ?? endSeconds;
          const runDurationInFrames = Math.max(1, Math.round((runNextStart - beat.startSeconds) * fps));

          return (
            <Sequence key={beat.entryId} from={from} durationInFrames={runDurationInFrames}>
              <FadeIn>
                <QuoteSection beats={slides.slice(i, runEnd + 1)} />
              </FadeIn>
            </Sequence>
          );
        }

        if (beat.sectionId === "timeline") {
          // Timeline archetype (video_visual_system.md) — one spine + node
          // per bullet, mounted once for the whole section span, same "run"
          // grouping as AlertSection/QuoteSection so real per-node
          // startSeconds (already threaded through matchTimestamps() same
          // as every other section, since each bullet is now its own
          // `###` sub-entry/beat) drive node-reveal timing. The section's
          // own Title Card intro beat (handled above) shares `sectionId`
          // "timeline" but isn't part of this run — without excluding it,
          // the real first node (right after it) reads as a run
          // *continuation* instead of a start and TimelineSection never
          // mounts.
          const prev = slides[i - 1];
          const isRunStart = prev?.sectionId !== "timeline" || isTitleCardIntro(prev);
          if (!isRunStart) return null;

          let runEnd = i;
          while (slides[runEnd + 1]?.sectionId === "timeline") runEnd++;
          const runNextStart = slides[runEnd + 1]?.startSeconds ?? endSeconds;
          const runDurationInFrames = Math.max(1, Math.round((runNextStart - beat.startSeconds) * fps));

          return (
            <Sequence key={beat.entryId} from={from} durationInFrames={runDurationInFrames}>
              <FadeIn>
                <TimelineSection beats={slides.slice(i, runEnd + 1)} reducedMotion={reducedMotion} />
              </FadeIn>
            </Sequence>
          );
        }

        if (SCENE_SECTIONS.has(beat.sectionId)) {
          return (
            <Sequence key={beat.entryId} from={from} durationInFrames={durationInFrames}>
              <FadeIn>
                <SceneSlide
                  sectionId={beat.sectionId}
                  headline={beat.headline}
                  tags={beat.tags}
                  indexInSection={sectionIndexes[i]!}
                  startSeconds={beat.startSeconds}
                  headlineRevealSeconds={beat.headlineRevealSeconds}
                  drugNames={beat.drugNames}
                  drugTagReveals={beat.drugTagReveals}
                />
              </FadeIn>
            </Sequence>
          );
        }

        // Every NARRATED_SECTIONS id (lib/video/select.ts) is handled by one
        // of the branches above — nothing else should reach here.
        return null;
      })}
      {captionsEnabled &&
        captions.map((c, i) => {
          const from = Math.round(c.startSeconds * fps);
          const durationInFrames = Math.max(1, Math.round((c.endSeconds - c.startSeconds) * fps));
          return (
            <Sequence key={`caption-${i}`} from={from} durationInFrames={durationInFrames}>
              <CaptionBar text={c.text} />
            </Sequence>
          );
        })}
    </AbsoluteFill>
  );
};

// Solid backing bar (same white-card contrast precedent as the old
// side-effect badge had) rather than plain text-over-video — reads against
// any slide background/illustration.
const CaptionBar: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: 40 }}>
    <div
      style={{
        width: 900,
        minHeight: 42 + 12, // ~1 line at fontSize 32 / lineHeight 1.3, plus vertical padding — most
        // caption chunks are short (see lib/video/captions.ts's chunking), so sizing the floor for
        // 1 line instead of the old 2-line assumption is most of the height reduction; it still
        // grows automatically (this is a floor, not a fixed height) for the rare longer chunk.
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        color: "#ffffff",
        borderRadius: 8,
        padding: "6px 20px",
        fontSize: 32,
        textAlign: "center",
        lineHeight: 1.3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
    >
      {text}
    </div>
  </AbsoluteFill>
);

// Splits `text` on the first verbatim occurrence of `phrase`, for the Title
// Card archetype's inline teal highlight. Returns the whole text as the
// "before" part (no highlight) if `phrase` isn't found or is undefined —
// same defensive shape as splitClosingSentences above, so a content edit
// that changes the intro sentence's wording degrades to plain navy text
// instead of throwing.
function splitOnPhrase(text: string, phrase: string | undefined): [string, string, string] {
  const index = phrase ? text.indexOf(phrase) : -1;
  if (index === -1) return [text, "", ""];
  return [text.slice(0, index), text.slice(index, index + phrase!.length), text.slice(index + phrase!.length)];
}

/**
 * Title Card archetype (video_visual_system.md) — full-frame, character-free
 * opening beat for a section's intro sentence: solid frame background, no
 * gradient blob/illustration, one left-aligned text block roughly two-thirds
 * frame width, vertically centered. The section's own intro sentence sets as
 * one navy block at headline weight, with the single phrase that names what
 * makes the section distinct switching to teal inline — a full sentence,
 * not a two-line authored headline like SceneSlide's, so no split-into-lines
 * treatment. Approved mockup: docs/references/handoff.md, design-agent round.
 */
const TitleCard: React.FC<{ text: string; tealPhrase?: string }> = ({ text, tealPhrase }) => {
  const [before, highlighted, after] = splitOnPhrase(text, tealPhrase);
  return (
    <AbsoluteFill style={{ backgroundColor: FRAME_BG, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: "9%",
          top: "50%",
          transform: "translateY(-50%)",
          width: "66%",
          fontWeight: 700,
          fontSize: 34,
          lineHeight: 1.35,
          color: NAVY,
          overflowWrap: "break-word",
        }}
      >
        {before}
        {highlighted ? <span style={{ color: TEAL }}>{highlighted}</span> : null}
        {after}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Scene archetype (video_visual_system.md): off-center whole-body character,
 * soft irregular gradient blob behind them, two-tone headline in the dead
 * space beside the figure. Static (single-beat) this round — the
 * overview/daily_life reveal builds are deferred (round 2 decision #7).
 */
const SceneSlide: React.FC<{
  sectionId: string;
  headline: string;
  tags: string[];
  indexInSection: number;
  startSeconds: number;
  /** `overview`'s headline-reveal beat (round 2 reorder) — real timestamp of
   * "R-CHOP"'s first spoken mention, computed by narration.ts's
   * `applyTimepoints`. Undefined (guard failed, or not `overview`) renders
   * the headline immediately, same as before the reorder. */
  headlineRevealSeconds?: number;
  /** `overview`'s per-drug tag beat (round 4) — one small labeled tag per
   * drug name, each animating in at its own real (or interpolated-fallback)
   * reveal time from `narration.ts`'s `applyTimepoints`. Either undefined
   * (not `overview`, or content hasn't been authored with `drugNames` yet)
   * — no tags render, same as before this beat existed. */
  drugNames?: string[];
  drugTagReveals?: number[];
}> = ({ sectionId, headline, tags, indexInSection, startSeconds, headlineRevealSeconds, drugNames, drugTagReveals }) => {
  const { fps } = useVideoConfig();
  const layout = SCENE_LAYOUT[sectionId]!;
  const twoLine = SCENE_FIXED_HEADLINES[sectionId];

  let illustrationSrc: string | null;
  let blobTint = layout.blobTint;
  let headlineText = headline;
  if (sectionId === "side_effects") {
    illustrationSrc = sceneIllustrationForSideEffectTags(tags);
    const overrideTag = tags.find((t) => t in SIDE_EFFECT_HEADLINE_OVERRIDE);
    if (overrideTag) {
      headlineText = SIDE_EFFECT_HEADLINE_OVERRIDE[overrideTag]!;
    }
    if (tags.some((t) => SIDE_EFFECT_CORAL_TAGS.has(t))) {
      blobTint = CORAL;
    }
  } else if (sectionId === "overview") {
    // The one Storyset `amico` exception (MANIFEST.md) — the video's
    // opening establishing shot (infusion chair, IV line), not the generic
    // round-robin doctor illustrations this section's folder otherwise has.
    illustrationSrc = "illustrations/overview/overview__oncology-patient-pana.svg";
  } else {
    illustrationSrc = illustrationForSlide(sectionId, indexInSection);
  }

  const characterOnLeft = layout.characterSide === "left";

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: "62%",
          height: "78%",
          [characterOnLeft ? "left" : "right"]: "-6%",
          top: "8%",
          borderRadius: "58% 42% 53% 47% / 44% 55% 45% 56%",
          background: `radial-gradient(circle at ${characterOnLeft ? "40%" : "60%"} 40%, ${blobTint}22, ${FRAME_BG} 72%)`,
        }}
      />
      {illustrationSrc ? (
        <Img
          src={staticFile(illustrationSrc)}
          style={{
            position: "absolute",
            [characterOnLeft ? "left" : "right"]: "2%",
            bottom: 0,
            width: "54%",
            height: "92%",
            objectFit: "contain",
          }}
        />
      ) : null}
      {sectionId === "overview" && drugNames && drugTagReveals
        ? drugNames.map((name, i) => {
            const { top, right } = drugTagCascadePosition(i);
            return (
              <DrugTagChip
                key={name}
                name={name}
                top={top}
                right={right}
                revealFrame={Math.round(((drugTagReveals[i] ?? startSeconds) - startSeconds) * fps)}
              />
            );
          })
        : null}
      <div
        style={{
          position: "absolute",
          [characterOnLeft ? "right" : "left"]: "6%",
          [layout.headlineVAlign]: "10%",
          width: "38%",
          textAlign: characterOnLeft ? "right" : "left",
        }}
      >
        {(() => {
          const headlineNode = twoLine ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 52, lineHeight: 1.1, color: NAVY }}>{twoLine[0]}</div>
              <div style={{ fontWeight: 700, fontSize: 34, lineHeight: 1.2, color: TEAL, marginTop: 8 }}>
                {twoLine[1]}
              </div>
            </>
          ) : (
            <div style={{ fontWeight: 800, fontSize: 38, lineHeight: 1.2, color: NAVY, overflowWrap: "break-word" }}>
              {headlineText}
            </div>
          );

          const revealFrame =
            headlineRevealSeconds != null ? Math.round((headlineRevealSeconds - startSeconds) * fps) : 0;

          if (revealFrame <= 0) return headlineNode;
          return (
            <Sequence from={revealFrame} layout="none">
              <HeadlineFadeIn>{headlineNode}</HeadlineFadeIn>
            </Sequence>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Alert archetype (video_visual_system.md, `emergency` section) — persistent
 * "EMERGENCY" title, a plain calming framing line, then a fixed-slot column
 * (one row per `tier: emergency` entry, filled in place as narration
 * reaches it, never cleared), closing on a 911-vs-care-team split card.
 * Mounted once for the whole section span (see the call site above) so a
 * settled card keeps rendering past its own beat's timing window — approved
 * mockup: docs/references/handoff.md, round 3, design-agent.
 *
 * Deviation from the mockup: the mockup's own doc chrome renders the
 * "EMERGENCY" label in IBM Plex Mono, but the actual video pipeline only
 * loads Figtree (video_visual_system.md's Typography section: "system-wide").
 * Reproduced the label's small-caps/letter-spaced look in Figtree instead of
 * loading a second font family for one four-letter word.
 */
const AlertSection: React.FC<{ beats: SlideBeat[] }> = ({ beats }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const relSeconds = frame / fps;
  const sectionStart = beats[0]!.startSeconds;
  const relStart = (b: SlideBeat) => b.startSeconds - sectionStart;

  const emergencyBeats = beats.filter((b) => b.tier === "emergency");
  // The closing beat is the one carrying the split-card fields (decision #4)
  // rather than "last beat" by position — keyed off the entry's own data,
  // not array position, same rule the rest of this spec follows.
  const closingBeat = beats.find((b) => b.call911 || b.callTeam);
  const framingBeat = beats.find((b) => b !== closingBeat && b.tier !== "emergency");

  if (closingBeat && relSeconds >= relStart(closingBeat)) {
    return <AlertSplitCard call911={closingBeat.call911 ?? ""} callTeam={closingBeat.callTeam ?? ""} />;
  }

  const columnStarted = emergencyBeats.length > 0 && relSeconds >= relStart(emergencyBeats[0]!);
  const closingRelStart = closingBeat ? relStart(closingBeat) : Infinity;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AlertTitle />
      {columnStarted ? (
        <AlertSlotColumn beats={emergencyBeats} relSeconds={relSeconds} relStart={relStart} closingRelStart={closingRelStart} />
      ) : (
        <div
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            top: "38%",
            fontSize: 30,
            fontWeight: 600,
            lineHeight: 1.4,
            color: NAVY,
          }}
        >
          {framingBeat?.body ?? ""}
        </div>
      )}
    </AbsoluteFill>
  );
};

const AlertTitle: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: "5%",
      top: "5%",
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontSize: 18,
      fontWeight: 800,
      letterSpacing: 2,
      textTransform: "uppercase",
      color: ALERT_RED_DEEP,
    }}
  >
    <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: ALERT_RED }} />
    Emergency
  </div>
);

// Fixed row count for the section's whole duration (never grows/shrinks) —
// only border/background/color/fontWeight change per frame, so this is a
// plain property interpolation against a stable flex layout, not a layout
// animation (round 2 decision #8's feasibility flag; verified with a real
// Remotion still-frame render, see handoff.md).
const AlertSlotColumn: React.FC<{
  beats: SlideBeat[];
  relSeconds: number;
  relStart: (b: SlideBeat) => number;
  closingRelStart: number;
}> = ({ beats, relSeconds, relStart, closingRelStart }) => (
  <div
    style={{
      position: "absolute",
      left: "7.5%",
      top: "16%",
      width: "85%",
      bottom: "8%",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}
  >
    {beats.map((beat, i) => {
      const start = relStart(beat);
      const nextStart = i + 1 < beats.length ? relStart(beats[i + 1]!) : closingRelStart;
      let state: "empty" | "active" | "settled" = "empty";
      if (relSeconds >= start && relSeconds < nextStart) state = "active";
      else if (relSeconds >= nextStart) state = "settled";
      return <AlertSlotRow key={beat.entryId} title={beat.headline} state={state} />;
    })}
  </div>
);

const AlertSlotRow: React.FC<{ title: string; state: "empty" | "active" | "settled" }> = ({ title, state }) => {
  const style =
    state === "active"
      ? { border: `3px solid ${ALERT_RED}`, backgroundColor: ALERT_CARD_BG, color: NAVY, fontWeight: 800 as const }
      : state === "settled"
        ? {
            border: `1px solid ${ALERT_SETTLED_BORDER}`,
            backgroundColor: ALERT_SETTLED_BG,
            color: NAVY,
            fontWeight: 600 as const,
          }
        : { border: `1px dashed ${ALERT_EMPTY_BORDER}`, backgroundColor: "transparent", color: "transparent", fontWeight: 600 as const };

  return (
    <div
      style={{
        flex: 1,
        borderRadius: 6,
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        fontSize: 24,
        lineHeight: 1.2,
        overflowWrap: "break-word",
        ...style,
      }}
    >
      {title}
    </div>
  );
};

// Closing beat (video_visual_system.md, Alert archetype) — a distinct cut
// after the column has fully filled, not composited alongside it. Coral is
// the app's real coral constant, not a separate orange (round 2 decision #7).
const AlertSplitCard: React.FC<{ call911: string; callTeam: string }> = ({ call911, callTeam }) => (
  <AbsoluteFill style={{ overflow: "hidden" }}>
    <div
      style={{
        position: "absolute",
        inset: "6%",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <AlertSplitHalf label="Call 911 / ER" text={call911} backgroundColor={ALERT_RED_DEEP} />
      <AlertSplitHalf label="Call your care team" text={callTeam} backgroundColor={CORAL} />
    </div>
  </AbsoluteFill>
);

const AlertSplitHalf: React.FC<{ label: string; text: string; backgroundColor: string }> = ({
  label,
  text,
  backgroundColor,
}) => (
  <div
    style={{
      backgroundColor,
      color: "#ffffff",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      padding: 48,
    }}
  >
    <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", opacity: 0.85, marginBottom: 12 }}>
      {label}
    </div>
    <div style={{ fontSize: 26, lineHeight: 1.4, fontWeight: 500 }}>{text}</div>
  </div>
);

// Quote archetype (video_visual_system.md, `patient_voices`) — no character,
// a large faded quotation-mark glyph + the quote's own pull-quote text are
// the dominant visual, on a muted/desaturated variant of Scene's blob
// background, crossfading between quote blocks instead of cutting. Closes on
// the app's own framing line (`Closing note` entry) as the bridge back to
// Scene. Approved mockup: docs/references/handoff.md (design-agent round).
// Generalizes past the current 3-quote R-CHOP content — everything below
// derives from `quotes.length`/each quote's own on-screen text length, not a
// hardcoded count (AC-T's `patient_voices` entry will have its own count).
const QUOTE_GLYPH = "“";
// Total crossfade width (each side of a boundary) — ~700ms crossfade per the
// approved mockup, "no slide/scale/wipe."
const QUOTE_CROSSFADE_SECONDS = 0.35;

function quoteCrossfadeOpacity(relSeconds: number, start: number, end: number): number {
  const fadeIn = interpolate(relSeconds, [start - QUOTE_CROSSFADE_SECONDS, start + QUOTE_CROSSFADE_SECONDS], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut =
    end === Infinity
      ? 1
      : interpolate(relSeconds, [end - QUOTE_CROSSFADE_SECONDS, end + QUOTE_CROSSFADE_SECONDS], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  return Math.min(fadeIn, fadeOut);
}

// Per-quote sizing off that quote's own on-screen text length (mockup:
// 44px for the two short one-liners, 38px for the longer middle quote) —
// not a fixed size or an index-based lookup, so a differently-worded quote
// set (AC-T) sizes itself the same way.
function quoteFontSize(onScreen: string): number {
  return onScreen.length > 55 ? 38 : 44;
}

// Closing note's `plain` is deliberately two full sentences (design doc) —
// navy sentence first/larger, teal sentence beneath. Splits on the first
// sentence boundary rather than assuming a fixed split point.
function splitClosingSentences(text: string): [string, string | undefined] {
  const match = /^(.*?[.!?])\s+(.*)$/.exec(text.trim());
  if (!match) return [text.trim(), undefined];
  return [match[1]!, match[2]!];
}

const QuoteSection: React.FC<{ beats: SlideBeat[] }> = ({ beats }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const relSeconds = frame / fps;
  const sectionStart = beats[0]!.startSeconds;
  const relStart = (b: SlideBeat) => b.startSeconds - sectionStart;

  // Quote entries carry `onScreen` (the pull-quote); the closing note
  // doesn't — that's what distinguishes it, not array position.
  const quoteBeats = beats.filter((b) => b.onScreen);
  const closingBeat = beats.find((b) => !b.onScreen);
  const closingRelStart = closingBeat ? relStart(closingBeat) : Infinity;

  let activeIndex = -1;
  quoteBeats.forEach((b, i) => {
    if (relSeconds >= relStart(b)) activeIndex = i;
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: FRAME_BG }}>
      {quoteBeats.map((beat, i) => {
        const start = relStart(beat);
        const end = i + 1 < quoteBeats.length ? relStart(quoteBeats[i + 1]!) : closingRelStart;
        const opacity = quoteCrossfadeOpacity(relSeconds, start, end);
        if (opacity <= 0) return null;
        return <QuoteBlock key={beat.entryId} onScreen={beat.onScreen!} opacity={opacity} />;
      })}
      {closingBeat
        ? (() => {
            const opacity = quoteCrossfadeOpacity(relSeconds, closingRelStart, Infinity);
            if (opacity <= 0) return null;
            return <QuoteClosing text={closingBeat.body} opacity={opacity} />;
          })()
        : null}
      {quoteBeats.length > 0 && relSeconds < closingRelStart ? (
        <QuoteDots total={quoteBeats.length} activeIndex={activeIndex} />
      ) : null}
    </AbsoluteFill>
  );
};

const QuoteBlock: React.FC<{ onScreen: string; opacity: number }> = ({ onScreen, opacity }) => (
  <div style={{ position: "absolute", inset: 0, opacity }}>
    {/* Muted/desaturated variant of Scene's blob mechanism (SceneSlide
        above) — centered instead of off to one side, alpha pushed down to
        ~10% for the "quieter than every other section" read. */}
    <div
      style={{
        position: "absolute",
        left: "20%",
        top: "10%",
        width: "60%",
        height: "80%",
        borderRadius: "58% 42% 53% 47% / 44% 55% 45% 56%",
        background: `radial-gradient(circle at 50% 45%, ${TEAL}1a, ${FRAME_BG} 72%)`,
      }}
    />
    <div
      style={{
        position: "absolute",
        left: "4%",
        top: "4%",
        fontSize: 420,
        fontWeight: 800,
        lineHeight: 1,
        color: NAVY,
        opacity: 0.08,
        userSelect: "none",
      }}
    >
      {QUOTE_GLYPH}
    </div>
    <div
      style={{
        position: "absolute",
        left: "8%",
        top: "50%",
        transform: "translateY(-50%)",
        width: "70%",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div style={{ fontSize: quoteFontSize(onScreen), fontWeight: 700, lineHeight: 1.4, color: NAVY }}>
        {onScreen}
      </div>
      {/* R-CHOP fixed for this round, same precedent as SCENE_FIXED_HEADLINES's
          hardcoded "R-CHOP" overview headline — AC-T's patient_voices gets its
          own attribution text when that regimen's round lands. */}
      <div style={{ fontSize: 22, fontWeight: 600, color: TEAL }}>— other patients, R-CHOP</div>
    </div>
  </div>
);

const QuoteClosing: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => {
  const [sentence1, sentence2] = splitClosingSentences(text);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 22,
        padding: "0 10%",
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 800, color: NAVY, textAlign: "center", lineHeight: 1.35 }}>
        {sentence1}
      </div>
      {sentence2 ? (
        <div style={{ fontSize: 24, fontWeight: 600, color: TEAL, textAlign: "center", lineHeight: 1.4 }}>
          {sentence2}
        </div>
      ) : null}
    </div>
  );
};

const QuoteDots: React.FC<{ total: number; activeIndex: number }> = ({ total, activeIndex }) => (
  <div style={{ position: "absolute", right: "6%", bottom: "6%", display: "flex", gap: 10 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: i === activeIndex ? TEAL : `${NAVY}33`,
        }}
      />
    ))}
  </div>
);

// Timeline archetype (video_visual_system.md, `timeline` section) — one
// horizontal spine, one node per bullet, callouts all above the spine,
// connected to their node by a colored stem, closing on a curved loop-back
// arrow once every node has been reached (R-CHOP's timeline is one
// repeating cycle, not a one-off sequence). Node count/positions always
// come from `beats.length` — however many `###` sub-entries the content
// doc's `## timeline` block has (one bullet per phase-grouping) — never
// hardcoded, per the multi-spine mechanism's own rule. Mounted once for the
// whole section span, same "run" pattern as AlertSection/QuoteSection.
const TIMELINE_SPINE_Y_PERCENT = 50;
// Callout boxes are 220px wide, centered on their node — 12%/88% (vs. the
// visually-tighter 8%/92% tried first) leaves enough margin that the first
// and last node's callout doesn't clip against the frame edge (verified
// against a real still render at 1280x720; 8%/92% clipped "the infusion" on
// the leftmost node).
const TIMELINE_NODE_LEFT_PERCENT = 12;
const TIMELINE_NODE_RIGHT_PERCENT = 88;
const TIMELINE_REVEAL_SECONDS = 0.3;
// Gap between the spine and the callout's nearest edge (the stem fills it) —
// was computed as `100 - SPINE - 4`, which is the mirror of the correct
// `100 - SPINE + GAP` (only coincidentally landing on a plausible-looking
// number at SPINE=50%, still 8% short of the intended gap) and left the
// callout box overlapping the spine/dot. Named as its own constant now
// instead of a bare literal buried in the anchor expression.
const TIMELINE_CALLOUT_GAP_PERCENT = 6;
// All 4 callouts sit above the spine (round 5 decision, replacing the
// original above/below alternation) — the loop-back arrow dips below the
// spine on its way from the last node back to the first, and with every
// callout on the far side, that whole half of the frame is guaranteed clear
// of text for the arrow to cross. Alternating callouts left the arrow's dip
// clipping through whichever "below" node sat nearest the dip's midpoint.

// R-CHOP's own loop-back fact, shortened to a label — the exact figure
// ("6 cycles, 3 weeks apart, so about 18 weeks total") already lives
// verbatim in `## overview`, so this isn't new content, just a display
// label for it. Hardcoded per-regimen the same way SCENE_FIXED_HEADLINES
// and QuoteBlock's "— other patients, R-CHOP" attribution are above — AC-T's
// two-spine timeline gets its own label(s) when that round lands.
const TIMELINE_LOOP_LABEL = "×6 cycles, ~18 weeks";

// Pure so the reduced-motion behavior is checkable without a real render
// (see scripts/check-reduced-motion.ts) — reducedMotion freezes the ring at
// its resting scale instead of letting it keep oscillating, since a looping
// pulse is exactly the kind of decorative motion prefers-reduced-motion
// targets (the fades elsewhere are content reveals, not decoration, so they
// stay untouched per the goal's own instruction).
export function timelinePulseScale(relSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  return 1 + 0.25 * (0.5 + 0.5 * Math.sin(relSeconds * Math.PI * 2));
}

const TimelineSection: React.FC<{ beats: SlideBeat[]; reducedMotion: boolean }> = ({ beats, reducedMotion }) => {
  const { fps, width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const relSeconds = frame / fps;
  const sectionStart = beats[0]!.startSeconds;
  const relStart = (b: SlideBeat) => b.startSeconds - sectionStart;

  let activeIndex = -1;
  beats.forEach((b, i) => {
    if (relSeconds >= relStart(b)) activeIndex = i;
  });

  const nodeX = (i: number) =>
    beats.length > 1
      ? TIMELINE_NODE_LEFT_PERCENT + ((TIMELINE_NODE_RIGHT_PERCENT - TIMELINE_NODE_LEFT_PERCENT) * i) / (beats.length - 1)
      : (TIMELINE_NODE_LEFT_PERCENT + TIMELINE_NODE_RIGHT_PERCENT) / 2;

  // Deterministic (frame-driven, not random) pulse on the active node's ring.
  const pulseScale = timelinePulseScale(relSeconds, reducedMotion);

  const lastReveal = interpolate(
    relSeconds,
    [relStart(beats[beats.length - 1]!), relStart(beats[beats.length - 1]!) + TIMELINE_REVEAL_SECONDS],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: `${TIMELINE_NODE_LEFT_PERCENT}%`,
          right: `${100 - TIMELINE_NODE_RIGHT_PERCENT}%`,
          top: `${TIMELINE_SPINE_Y_PERCENT}%`,
          height: 3,
          backgroundColor: `${NAVY}33`,
          borderRadius: 2,
        }}
      />
      {lastReveal > 0 ? (
        <TimelineLoopArrow
          fromXPercent={nodeX(beats.length - 1)}
          toXPercent={nodeX(0)}
          opacity={lastReveal}
          width={width}
          height={height}
        />
      ) : null}
      {beats.map((beat, i) => {
        const opacity = interpolate(relSeconds, [relStart(beat), relStart(beat) + TIMELINE_REVEAL_SECONDS], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <TimelineNode
            key={beat.entryId}
            x={nodeX(i)}
            opacity={opacity}
            active={i === activeIndex}
            pulseScale={pulseScale}
            title={beat.headline}
            onScreen={beat.onScreen ?? ""}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const TimelineNode: React.FC<{
  x: number;
  opacity: number;
  active: boolean;
  pulseScale: number;
  title: string;
  onScreen: string;
}> = ({ x, opacity, active, pulseScale, title, onScreen }) => (
  <>
    {active ? (
      <div
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${TIMELINE_SPINE_Y_PERCENT}%`,
          width: 28,
          height: 28,
          marginLeft: -14,
          marginTop: -14,
          borderRadius: "50%",
          backgroundColor: `${TEAL}33`,
          transform: `scale(${pulseScale})`,
        }}
      />
    ) : null}
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${TIMELINE_SPINE_Y_PERCENT}%`,
        width: 16,
        height: 16,
        marginLeft: -8,
        marginTop: -8,
        borderRadius: "50%",
        // No recede/dim once revealed (round 4 decision) — a node is either
        // not-yet-reached (empty placeholder) or fully teal, no in-between
        // "settled" shade the way Alert's cards fade after their beat ends.
        backgroundColor: opacity > 0.5 ? TEAL : `${NAVY}33`,
        border: `3px solid ${FRAME_BG}`,
        opacity: Math.max(opacity, 0.5),
      }}
    />
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        bottom: `${100 - TIMELINE_SPINE_Y_PERCENT + TIMELINE_CALLOUT_GAP_PERCENT}%`,
        transform: "translateX(-50%)",
        width: 220,
        display: "flex",
        flexDirection: "column-reverse",
        alignItems: "center",
        gap: 8,
        opacity,
      }}
    >
      <div style={{ width: 2, height: 30, backgroundColor: `${TEAL}88` }} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, lineHeight: 1.25 }}>{title}</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: "#3a5a56", marginTop: 4, lineHeight: 1.3 }}>
          {onScreen}
        </div>
      </div>
    </div>
  </>
);

const TimelineLoopArrow: React.FC<{
  fromXPercent: number;
  toXPercent: number;
  opacity: number;
  width: number;
  height: number;
}> = ({ fromXPercent, toXPercent, opacity, width, height }) => {
  const fromX = (fromXPercent / 100) * width;
  const toX = (toXPercent / 100) * width;
  const spineY = (TIMELINE_SPINE_Y_PERCENT / 100) * height;
  const dipY = spineY + 90;
  const midX = (fromX + toX) / 2;

  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <marker id="timeline-loop-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={TEAL} />
          </marker>
        </defs>
        <path
          d={`M ${fromX} ${spineY + 14} Q ${midX} ${dipY} ${toX} ${spineY + 14}`}
          fill="none"
          stroke={TEAL}
          strokeWidth={3}
          markerEnd="url(#timeline-loop-arrowhead)"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: dipY + 14,
          transform: "translateX(-50%)",
          fontSize: 20,
          fontWeight: 800,
          color: TEAL,
          whiteSpace: "nowrap",
        }}
      >
        {TIMELINE_LOOP_LABEL}
      </div>
    </div>
  );
};

export function slideVideoDurationInFrames(totalSeconds: number, fps: number): number {
  return Math.round((totalSeconds + TAIL_SECONDS) * fps);
}
