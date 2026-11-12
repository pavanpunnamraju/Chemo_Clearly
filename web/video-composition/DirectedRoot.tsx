import { Composition } from "remotion";
import { DirectedVideo } from "./directed/DirectedVideo";
import type { DirectedVideoProps } from "../lib/video/direction-types";

export const directedDefaultProps: DirectedVideoProps = {
  direction: { version: "preview", regimenId: "preview", regimenTitle: "Your treatment", method: "authored", totalSeconds: 12,
    shots: [{ id: "preview", entryId: "overview", sectionId: "overview", startSeconds: 0, endSeconds: 12, cueSeconds: 1,
      scene: "treatment", assetId: "patient-treatment", action: "welcome", camera: "push-in", staging: "left", transition: "zoom-through",
      headline: "Your treatment plan", message: "", sourceRefs: [], rationale: "Studio preview", focus: { x: 0.5, y: 0.4 }, labels: [] }] },
  audioSrc: "", captions: [], captionsEnabled: true,
};

export const DirectedRoot: React.FC = () => <Composition<any, DirectedVideoProps>
  id="DirectedPatientVideo" component={DirectedVideo} width={1280} height={720} fps={30}
  durationInFrames={360} defaultProps={directedDefaultProps}
  calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, Math.ceil(props.direction.totalSeconds * 30)) })}
/>;
