import { Composition } from "remotion";
import { SlideVideo, slideVideoDurationInFrames, type SlideVideoProps } from "./SlideVideo";
import { DailyLifeCurveSection, dailyLifeSectionEndSeconds, type DailyLifeCurveSectionProps } from "./DailyLifeCurve";
import { DAILY_LIFE_PREVIEW_TOPICS } from "./daily-life-preview-data.generated";
import { ArmBend, armBendDefaultProps, armBendSchema, type ArmBendProps } from "./ArmBend";
import { DirectedRoot } from "./DirectedRoot";

const FPS = 30;

// Isolated Studio preview only — daily_life's energy-curve archetype isn't
// wired into SlideVideo.tsx's section dispatch yet. Reveal timing is real
// STT-anchored per-topic timing from the cached R-CHOP TTS output (see
// docs/references/daily_life_motion_spec.md, gen-daily-life-preview-data.ts),
// not evenly-spaced stand-in beats. §5 path B: no closer.
const dailyLifePreviewProps: DailyLifeCurveSectionProps = {
  sectionStartSeconds: 0,
  topics: DAILY_LIFE_PREVIEW_TOPICS,
};
const DAILY_LIFE_PREVIEW_TOTAL_SECONDS = dailyLifeSectionEndSeconds(
  DAILY_LIFE_PREVIEW_TOPICS[DAILY_LIFE_PREVIEW_TOPICS.length - 1]!.revealSeconds,
  FPS,
);

const defaultProps: SlideVideoProps = {
  slides: [
    { entryId: "overview", sectionId: "overview", startSeconds: 0, headline: "Loading...", body: "", tags: [] },
  ],
  audioSrc: "",
  totalSeconds: 3,
  captions: [],
  captionsEnabled: false,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <DirectedRoot />
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
      <Composition<any, DailyLifeCurveSectionProps>
        id="DailyLifeCurve"
        component={DailyLifeCurveSection}
        fps={FPS}
        width={1280}
        height={720}
        durationInFrames={Math.round(DAILY_LIFE_PREVIEW_TOTAL_SECONDS * FPS)}
        defaultProps={dailyLifePreviewProps}
      />
      <Composition<any, ArmBendProps>
        id="ArmBend"
        component={ArmBend}
        schema={armBendSchema}
        fps={FPS}
        width={750}
        height={500}
        durationInFrames={6 * FPS}
        defaultProps={armBendDefaultProps}
      />
    </>
  );
};
