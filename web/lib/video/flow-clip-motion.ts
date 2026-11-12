/** Timing for the approved 24 fps Flow clips. Source frames are zero based. */
export type FlowClipAsset = 'support' | 'car' | 'stretch';

export const FLOW_CLIPS: Record<FlowClipAsset, {path: string; frames: number}> = {
  support: {path: 'studies/context-support/support-flow-approved.mp4', frames: 240},
  car: {path: 'studies/patient-car/car-flow-approved.mp4', frames: 240},
  stretch: {path: 'studies/patient-stretch/stretch-flow-loop.mp4', frames: 234},
};

export const FLOW_SOURCE_FPS = 24;
export const STRETCH_CYCLE_SECONDS = FLOW_CLIPS.stretch.frames / FLOW_SOURCE_FPS;
const SUPPORT_CONTACT_SECONDS = 4;
const HEART_CYCLE_SECONDS = 2.5;
const EPSILON = 1e-7;

export type FlowHeartState = 'hidden' | 'pop' | 'float' | 'fade' | 'pause';

export function flowClipState({asset, frame, fps, durationSeconds, reducedMotion = false}: {
  asset: FlowClipAsset;
  frame: number;
  fps: number;
  durationSeconds: number;
  reducedMotion?: boolean;
}) {
  if (!(fps > 0) || !Number.isFinite(fps)) throw new Error('Flow clip fps must be positive');
  if (!(durationSeconds >= 0) || !Number.isFinite(durationSeconds)) throw new Error('Flow clip duration must be nonnegative');
  const seconds = Math.max(0, frame / fps);
  let sourceFrame = 0;
  let completedCycles = 0;

  if (!reducedMotion) {
    if (asset === 'stretch') {
      // A cycle starts only if its entire 9.75 seconds fit the shot. After the
      // final complete cycle, the approved calm end pose remains on screen.
      const permittedCycles = Math.floor((durationSeconds + EPSILON) / STRETCH_CYCLE_SECONDS);
      const cycleIndex = Math.floor((seconds + EPSILON) / STRETCH_CYCLE_SECONDS);
      completedCycles = Math.min(cycleIndex, permittedCycles);
      sourceFrame = permittedCycles === 0 ? 0 : cycleIndex >= permittedCycles
        ? FLOW_CLIPS.stretch.frames - 1
        : Math.min(FLOW_CLIPS.stretch.frames - 1,
            Math.floor((seconds - cycleIndex * STRETCH_CYCLE_SECONDS) * FLOW_SOURCE_FPS + EPSILON));
    } else {
      sourceFrame = Math.min(FLOW_CLIPS[asset].frames - 1, Math.floor(seconds * FLOW_SOURCE_FPS + EPSILON));
    }
  }

  const heartCycleStart = SUPPORT_CONTACT_SECONDS + Math.floor(Math.max(0, seconds - SUPPORT_CONTACT_SECONDS) / HEART_CYCLE_SECONDS) * HEART_CYCLE_SECONDS;
  const heartElapsed = heartCycleStart + 1.55 <= durationSeconds - 1 / fps + EPSILON && asset === 'support' && !reducedMotion && seconds >= SUPPORT_CONTACT_SECONDS
    ? (seconds - SUPPORT_CONTACT_SECONDS) % HEART_CYCLE_SECONDS : -1;
  const heartState: FlowHeartState = heartElapsed < 0 ? 'hidden'
    : heartElapsed < .22 ? 'pop'
    : heartElapsed < 1.18 ? 'float'
    : heartElapsed < 1.55 ? 'fade' : 'pause';
  const heartProgress = heartElapsed < 0 ? 0 : heartElapsed;
  return {sourceFrame, completedCycles, heartState, heartProgress};
}

/** Freeze expects composition frames. Seek a quarter frame into each source
 * frame: clear of its preceding boundary and still before the nearest-frame
 * midpoint if the decoder rounds timestamps. */
export function sourceFrameToCompositionFrame(sourceFrame: number, compositionFps: number) {
  return (sourceFrame + .25) * compositionFps / FLOW_SOURCE_FPS;
}
