import { Audio, Img, Sequence, AbsoluteFill, useVideoConfig, staticFile } from "remotion";
import { loadFont, fontFamily } from "@remotion/google-fonts/Figtree";
import type { SlideBeat } from "../lib/video/narration";
import { illustrationForSlide, sceneIllustrationForSideEffectTags } from "../lib/video/components";
import type { TimedCaption } from "../lib/video/captions";

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
  [key: string]: unknown;
}

const TAIL_SECONDS = 2;

// video_visual_system.md color principle — system-wide, not just the
// illustration library. Teal = clinical/system-facing, coral = patient doing
// something (agency), navy = patient passively experiencing something.
const NAVY = "#1c2b45";
const TEAL = "#2fbfa0";
const CORAL = "#ff6b4a";
const FRAME_BG = "#f4f7f6";

// Scene archetype sections this round (video_visual_system.md's per-section
// mapping) — daily_life/side_effects/fertility_intimacy/overview only.
// Timeline/Alert/Quote sections keep the pre-existing plain Slide below,
// untouched, since those archetypes are out of scope this round.
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

export const SlideVideo: React.FC<SlideVideoProps> = ({
  slides,
  audioSrc,
  totalSeconds,
  captions,
  captionsEnabled = false,
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
      const idx = counters[beat.sectionId] ?? 0;
      counters[beat.sectionId] = idx + 1;
      sectionIndexes.push(idx);
    }
  }

  return (
    <AbsoluteFill style={{ backgroundColor: FRAME_BG, fontFamily }}>
      <Audio src={staticFile(audioSrc)} />
      {slides.map((beat, i) => {
        const nextStart = slides[i + 1]?.startSeconds ?? endSeconds;
        const from = Math.round(beat.startSeconds * fps);
        const durationInFrames = Math.max(1, Math.round((nextStart - beat.startSeconds) * fps));

        if (SCENE_SECTIONS.has(beat.sectionId)) {
          return (
            <Sequence key={beat.entryId} from={from} durationInFrames={durationInFrames}>
              <SceneSlide
                sectionId={beat.sectionId}
                headline={beat.headline}
                tags={beat.tags}
                indexInSection={sectionIndexes[i]!}
              />
            </Sequence>
          );
        }

        const illustrationSrc = illustrationForSlide(beat.sectionId, sectionIndexes[i]!);
        return (
          <Sequence key={beat.entryId} from={from} durationInFrames={durationInFrames}>
            <Slide headline={beat.headline} body={beat.body} illustrationSrc={illustrationSrc} />
          </Sequence>
        );
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
}> = ({ sectionId, headline, tags, indexInSection }) => {
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
      <div
        style={{
          position: "absolute",
          [characterOnLeft ? "right" : "left"]: "6%",
          [layout.headlineVAlign]: "10%",
          width: "38%",
          textAlign: characterOnLeft ? "right" : "left",
        }}
      >
        {twoLine ? (
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
        )}
      </div>
    </AbsoluteFill>
  );
};

// Long `detail` bodies (depth: "detailed") need a smaller size to stay
// within the frame's vertical space — same box, same padding, just less
// text per line/more lines, so it scales down as word count grows.
function bodyFontSize(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > 130) return 20;
  if (words > 80) return 24;
  return 28;
}

// Pre-existing plain slide layout — still used by the archetypes out of
// scope this round (timeline, emergency, patient_voices).
const Slide: React.FC<{ headline: string; body?: string; illustrationSrc?: string | null }> = ({
  headline,
  body,
  illustrationSrc,
}) => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      padding: 80,
      textAlign: "center",
      overflow: "hidden",
    }}
  >
    {illustrationSrc ? (
      <Img
        src={staticFile(illustrationSrc)}
        style={{ position: "absolute", bottom: 24, left: 24, width: 220, height: 220, objectFit: "contain" }}
      />
    ) : null}
    <h1 style={{ fontSize: 56, color: NAVY, marginBottom: 24, maxWidth: 1120, overflowWrap: "break-word" }}>
      {headline}
    </h1>
    {body ? (
      <p
        style={{
          fontSize: bodyFontSize(body),
          lineHeight: 1.4,
          color: "#3a5a56",
          maxWidth: 900,
          overflowWrap: "break-word",
        }}
      >
        {body}
      </p>
    ) : null}
  </AbsoluteFill>
);

export function slideVideoDurationInFrames(totalSeconds: number, fps: number): number {
  return Math.round((totalSeconds + TAIL_SECONDS) * fps);
}
