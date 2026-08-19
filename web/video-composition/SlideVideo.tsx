import { Audio, Img, Sequence, AbsoluteFill, useVideoConfig, staticFile } from "remotion";
import type { SlideBeat } from "../lib/video/narration";
import { illustrationForSlide, type TimedComponent } from "../lib/video/components";
import type { TimedCaption } from "../lib/video/captions";

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
  /** Side-effect illustration overlays (Component Placer, #3c) — layered on
   * top of the plain slide deck, not a redesign of it (Phase 2 owns the
   * visual design). Local Storyset SVGs under public/illustrations/. */
  components: TimedComponent[];
  /** Caption track (goal #4) — real per-chunk start/end timing from
   * lib/video/captions.ts, built from Speech-to-Text word alignment. */
  captions: TimedCaption[];
  /** Off by default per the goal wording — no app-chrome toggle exists yet
   * (Phase 2b), so this is the only control for now. */
  captionsEnabled?: boolean;
  [key: string]: unknown;
}

const TAIL_SECONDS = 2;
// How long a side-effect illustration stays on screen once its aligned
// timestamp hits, at most — a fixed display window, not tied to slide
// boundaries, since a component's mention can land mid-slide. Clamped
// per-instance below to the gap until the next component so illustrations
// never overlap (display is sequential, one on screen at a time).
const ICON_DISPLAY_SECONDS = 4;

export const SlideVideo: React.FC<SlideVideoProps> = ({
  slides,
  audioSrc,
  totalSeconds,
  components,
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
    <AbsoluteFill style={{ backgroundColor: "#f4f7f6" }}>
      <Audio src={staticFile(audioSrc)} />
      {slides.map((beat, i) => {
        const nextStart = slides[i + 1]?.startSeconds ?? endSeconds;
        const from = Math.round(beat.startSeconds * fps);
        const durationInFrames = Math.max(1, Math.round((nextStart - beat.startSeconds) * fps));
        // side_effects slides get their illustrations from the finer
        // keyword-trigger mechanism (the `components` overlay below)
        // instead — no per-slide illustration here for that section.
        const illustrationSrc =
          beat.sectionId === "side_effects" ? null : illustrationForSlide(beat.sectionId, sectionIndexes[i]!);
        return (
          <Sequence key={beat.entryId} from={from} durationInFrames={durationInFrames}>
            <Slide headline={beat.headline} body={beat.body} illustrationSrc={illustrationSrc} />
          </Sequence>
        );
      })}
      {components.map((c, i) => {
        const nextStart = components[i + 1]?.startSeconds ?? c.startSeconds + ICON_DISPLAY_SECONDS;
        const from = Math.round(c.startSeconds * fps);
        const gapSeconds = Math.max(0, nextStart - c.startSeconds);
        const durationInFrames = Math.max(1, Math.round(Math.min(ICON_DISPLAY_SECONDS, gapSeconds) * fps));
        return (
          <Sequence key={`${c.tag}-${i}`} from={from} durationInFrames={durationInFrames}>
            <IllustrationBadge src={c.illustrationSrc} />
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

// Solid backing bar (same white-card contrast precedent as IllustrationBadge
// above) rather than plain text-over-video — reads against any slide
// background/illustration.
const CaptionBar: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: 40 }}>
    <div
      style={{
        width: 900,
        minHeight: 83 + 24, // ~2 lines at fontSize 32 / lineHeight 1.3, plus vertical padding
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        color: "#ffffff",
        borderRadius: 12,
        padding: "12px 24px",
        fontSize: 32,
        fontFamily: "system-ui, sans-serif",
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

const IllustrationBadge: React.FC<{ src: string }> = ({ src }) => (
  <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-end", padding: 40 }}>
    <div
      style={{
        width: 160,
        height: 160,
        borderRadius: 24,
        backgroundColor: "#ffffff",
        boxShadow: "0 2px 12px rgba(31, 61, 58, 0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
  </AbsoluteFill>
);

// Long `detail` bodies (depth: "detailed") need a smaller size to stay
// within the frame's vertical space — same box, same padding, just less
// text per line/more lines, so it scales down as word count grows.
function bodyFontSize(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  if (words > 130) return 20;
  if (words > 80) return 24;
  return 28;
}

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
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
      overflow: "hidden",
    }}
  >
    {/* Bottom-left, low-key — deliberately distinct from the side_effects
        overlay badge (top-right, small, white circle) so the two don't
        read as the same component doing two jobs. */}
    {illustrationSrc ? (
      <Img
        src={staticFile(illustrationSrc)}
        style={{ position: "absolute", bottom: 24, left: 24, width: 220, height: 220, objectFit: "contain" }}
      />
    ) : null}
    <h1 style={{ fontSize: 56, color: "#1f3d3a", marginBottom: 24, maxWidth: 1120, overflowWrap: "break-word" }}>
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
