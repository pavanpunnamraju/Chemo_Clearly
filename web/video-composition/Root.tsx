import { Composition } from "remotion";
import { SlideVideo, slideVideoDurationInFrames, type SlideVideoProps } from "./SlideVideo";

const FPS = 30;

const defaultProps: SlideVideoProps = {
  slides: [{ entryId: "overview", startSeconds: 0, headline: "Loading...", body: "" }],
  audioSrc: "",
  totalSeconds: 3,
  components: [],
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition<any, SlideVideoProps>
      id="PatientSlideVideo"
      component={SlideVideo}
      fps={FPS}
      width={1280}
      height={720}
      durationInFrames={slideVideoDurationInFrames(defaultProps.totalSeconds, FPS)}
      defaultProps={defaultProps}
      calculateMetadata={async ({ props }: { props: SlideVideoProps }) => ({
        durationInFrames: slideVideoDurationInFrames(props.totalSeconds, FPS),
      })}
    />
  );
};
