import React from "react";
import { Composition, registerRoot } from "remotion";
import { ThermometerStudy } from "./ThermometerStudy";
registerRoot(() => <Composition id="ThermometerStudy" component={ThermometerStudy} width={1280} height={720} fps={30} durationInFrames={360} defaultProps={{ reducedMotion: false, camera: true }} />);
