import React from "react";
import { Composition, registerRoot } from "remotion";
import { CallingStudy } from "./CallingStudy";

registerRoot(() => <Composition id="CallingStudy" component={CallingStudy} width={1280} height={720} fps={30} durationInFrames={360} defaultProps={{ reducedMotion: false, camera: true }} />);
