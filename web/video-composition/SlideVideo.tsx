import { Audio, Img, Sequence, AbsoluteFill, useVideoConfig, staticFile } from "remotion";
import type { SlideBeat } from "../lib/video/narration";
import type { TimedComponent } from "../lib/video/components";
import { iconUrl } from "../lib/video/icons";

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
  /** Side-effect icon overlays (Component Placer, #3c) — layered on top of
   * the plain slide deck, not a redesign of it (Phase 2 owns the visual
   * design). Iconify-hosted SVGs, fetched over HTTP at render time. */
  components: TimedComponent[];
  [key: string]: unknown;
}

const TAIL_SECONDS = 2;
// How long a side-effect icon stays on screen once its aligned timestamp
// hits — a fixed display window, not tied to slide boundaries, since a
// component's mention can land mid-slide.
const ICON_DISPLAY_SECONDS = 4;

export const SlideVideo: React.FC<SlideVideoProps> = ({ slides, audioSrc, totalSeconds, components }) => {
  const { fps } = useVideoConfig();
  const endSeconds = totalSeconds + TAIL_SECONDS;

  return (
    <AbsoluteFill style={{ backgroundColor: "#f4f7f6" }}>
      <Audio src={staticFile(audioSrc)} />
      {slides.map((beat, i) => {
        const nextStart = slides[i + 1]?.startSeconds ?? endSeconds;
        const from = Math.round(beat.startSeconds * fps);
        const durationInFrames = Math.max(1, Math.round((nextStart - beat.startSeconds) * fps));
        return (
          <Sequence key={beat.entryId} from={from} durationInFrames={durationInFrames}>
            <Slide headline={beat.headline} body={beat.body} />
          </Sequence>
        );
      })}
      {components.map((c) => {
        const from = Math.round(c.startSeconds * fps);
        const durationInFrames = Math.max(1, Math.round(ICON_DISPLAY_SECONDS * fps));
        return (
          <Sequence key={c.tag} from={from} durationInFrames={durationInFrames}>
            <IconBadge iconId={c.iconId} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const IconBadge: React.FC<{ iconId: string }> = ({ iconId }) => (
  <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-end", padding: 40 }}>
    <div
      style={{
        width: 96,
        height: 96,
        borderRadius: "50%",
        backgroundColor: "#ffffff",
        boxShadow: "0 2px 12px rgba(31, 61, 58, 0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Img src={iconUrl(iconId)} style={{ width: 56, height: 56 }} />
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

const Slide: React.FC<{ headline: string; body?: string }> = ({ headline, body }) => (
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
