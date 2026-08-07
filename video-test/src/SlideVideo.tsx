import { Audio, Sequence, staticFile, useVideoConfig, AbsoluteFill } from "remotion";
import { slideBeats } from "./content/rchop-excerpt.mjs";

const TOTAL_SECONDS = 18;

export const SlideVideo: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#f4f7f6" }}>
      <Audio src={staticFile("narration.mp3")} />
      {slideBeats.map((beat, i) => {
        const nextStart = slideBeats[i + 1]?.startSeconds ?? TOTAL_SECONDS;
        const from = Math.round(beat.startSeconds * fps);
        const durationInFrames = Math.round((nextStart - beat.startSeconds) * fps);
        return (
          <Sequence key={beat.headline} from={from} durationInFrames={durationInFrames}>
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
    <h1 style={{ fontSize: 64, color: "#1f3d3a", marginBottom: 24 }}>{headline}</h1>
    {body ? <p style={{ fontSize: 32, color: "#3a5a56", maxWidth: 900 }}>{body}</p> : null}
  </AbsoluteFill>
);

export const slideVideoDurationInFrames = (fps: number) => Math.round(TOTAL_SECONDS * fps);
