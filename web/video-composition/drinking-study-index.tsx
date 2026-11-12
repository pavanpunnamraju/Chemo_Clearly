import React from "react";
import { Composition, registerRoot } from "remotion";
import { DrinkingStudy } from "./DrinkingStudy";

registerRoot(() => <Composition id="DrinkingStudy" component={DrinkingStudy} width={1280} height={720} fps={30} durationInFrames={314} defaultProps={{ reducedMotion: false, camera: true }} />);
