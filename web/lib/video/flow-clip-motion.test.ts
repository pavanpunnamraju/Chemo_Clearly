import assert from 'node:assert/strict';
import {FLOW_CLIPS, flowClipState, sourceFrameToCompositionFrame, STRETCH_CYCLE_SECONDS} from './flow-clip-motion';

for (const fps of [24, 30]) {
  const state = (asset: 'support' | 'car' | 'stretch', seconds: number, durationSeconds = 22, reducedMotion = false) =>
    flowClipState({asset, frame: Math.round(seconds * fps), fps, durationSeconds, reducedMotion});

  assert.equal(state('support', 0).sourceFrame, 0);
  assert.equal(state('support', 4).sourceFrame, 96);
  assert.equal(state('support', 4).heartState, 'pop');
  assert.equal(state('support', 3.9).heartState, 'hidden');
  assert.equal(state('support', 10.1).sourceFrame, 239);
  assert.equal(state('car', 15).sourceFrame, 239);
  assert.equal(state('support', 8, 22, true).sourceFrame, 0);
  assert.equal(state('support', 8, 22, true).heartState, 'hidden');

  assert.equal(STRETCH_CYCLE_SECONDS, 9.75);
  assert.equal(state('stretch', 0, 19.5).sourceFrame, 0);
  assert.equal(state('stretch', 10, 19.5).sourceFrame, 6);
  assert.equal(state('stretch', 19.5, 20).sourceFrame, 233);
  assert.equal(state('stretch', 10, 10).sourceFrame, 233);
  assert.equal(state('stretch', 1, 9).sourceFrame, 0);
  assert.equal(state('stretch', 10, 20, true).sourceFrame, 0);

  for (const sourceFrame of [0, 1, 95, 233, 239]) {
    const compositionFrame = sourceFrameToCompositionFrame(sourceFrame, fps);
    assert.equal(Math.floor(compositionFrame / fps * 24), sourceFrame);
  }
}
assert.equal(FLOW_CLIPS.stretch.frames, 234);
console.log('Flow clip frame and overlay timing checks passed');

assert.equal(flowClipState({asset:'support',frame:390,fps:30,durationSeconds:392/30}).heartState,'hidden');
