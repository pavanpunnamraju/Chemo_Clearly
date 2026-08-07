import { Audio, Sequence, AbsoluteFill, useVideoConfig, staticFile } from "remotion";
import type { SlideBeat } from "../lib/video/narration";

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
  [key: string]: unknown;
}

const TAIL_SECONDS = 2;

export const SlideVideo: React.FC<SlideVideoProps> = ({ slides, audioSrc, totalSeconds }) => {
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
    </AbsoluteFill>
  );
};

const Slide: React.FC<{ headline: string; body?: string }> = ({ headline, body }) => (
  <AbsoluteFill
    style={{
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      padding: 80,
      fontFamily: "system-ui, sans-serif",
      textAlign: "center",
    }}
  >
    <h1 style={{ fontSize: 56, color: "#1f3d3a", marginBottom: 24 }}>{headline}</h1>
    {body ? <p style={{ fontSize: 28, color: "#3a5a56", maxWidth: 900 }}>{body}</p> : null}
  </AbsoluteFill>
);

export function slideVideoDurationInFrames(totalSeconds: number, fps: number): number {
  return Math.round((totalSeconds + TAIL_SECONDS) * fps);
}
