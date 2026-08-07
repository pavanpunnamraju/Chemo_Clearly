import "./index.css";
import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { SlideVideo, slideVideoDurationInFrames } from "./SlideVideo";

const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <Composition
        id="RchopInfectionRiskSpike"
        component={SlideVideo}
        durationInFrames={slideVideoDurationInFrames(FPS)}
        fps={FPS}
        width={1280}
        height={720}
      />
    </>
  );
};
