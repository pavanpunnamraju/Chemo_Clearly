import assert from "node:assert/strict";
import test from "node:test";
import {PerspectiveCamera, Vector3} from "three";
import {CUTAWAY_INNER_RADIUS} from "../../video-composition/directed/curved-vessel-geometry";
import type {BloodCellCue} from "./blood-cell-motion";
import {curvedVesselState} from "./curved-vessel-motion";

const CUE: BloodCellCue = {
  sourceRef: "source-window",
  windowLabel: "blood-counts",
  entrySeconds: 3.2,
  focusSeconds: 4.66,
  lowSeconds: 7.36,
  precautionSeconds: 8.6,
  endSeconds: 13.4,
};

function activeWhite(seconds: number, cue = CUE) {
  const state = curvedVesselState(seconds, cue);
  return state.cells.filter((cell) => cell.kind === "white" && cell.opacity * state.fieldOpacity > 0.001);
}

test("cue clock drives eleven visible white cells to three persistent survivors", () => {
  assert.equal(activeWhite(CUE.entrySeconds!).length, 11);
  assert.equal(activeWhite(CUE.focusSeconds).length, 11);
  assert.equal(activeWhite(CUE.lowSeconds).length, 3);
  assert.equal(activeWhite(CUE.endSeconds).length, 3);
  assert.deepEqual(activeWhite(CUE.lowSeconds).map(({id}) => id), activeWhite(CUE.endSeconds).map(({id}) => id));
});

test("white cells travel with the red-cell stream while they dissolve", () => {
  for (const [start, end] of [[CUE.entrySeconds!, CUE.entrySeconds! + 1], [5, 6]] as const) {
    const before = curvedVesselState(start, CUE);
    const after = curvedVesselState(end, CUE);
    const speeds = (kind: "red" | "white") => before.cells
      .filter((cell) => cell.kind === kind && cell.opacity > 0.001)
      .map((cell) => new Vector3(...cell.position).distanceTo(new Vector3(...after.cells.find(({id}) => id === cell.id)!.position)) / (end - start));
    const red = speeds("red");
    const white = speeds("white");
    assert.ok(white.every((speed) => speed > 0.2), "A visible white cell is pinned while the stream moves");
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const ratio = mean(white) / mean(red);
    assert.ok(ratio >= 0.8 && ratio <= 1.25, `White/red stream-speed ratio ${ratio} is not comparable`);
  }
});

test("fixed trajectories stay continuous, separated, and inside the lumen while active", () => {
  let previous = curvedVesselState(0, CUE);
  for (let frame = 1; frame <= 402; frame++) {
    const seconds = CUE.endSeconds * frame / 402;
    const state = curvedVesselState(seconds, CUE);
    assert.deepEqual(state.cells.map(({id}) => id), previous.cells.map(({id}) => id));
    for (let index = 0; index < state.cells.length; index++) {
      const cell = state.cells[index]!;
      const prior = previous.cells[index]!;
      assert.ok(new Vector3(...cell.position).distanceTo(new Vector3(...prior.position)) < 0.04, `${cell.id} teleported at ${seconds}`);
      if (cell.opacity > 0.001) assert.ok(Math.hypot(cell.normal, cell.binormal) + cell.radius * 1.04 < CUTAWAY_INNER_RADIUS, `${cell.id} penetrated the lumen wall`);
    }
    const active = state.cells.filter((cell) => cell.opacity > 0.001);
    for (let a = 0; a < active.length; a++) for (let b = a + 1; b < active.length; b++) {
      const first = active[a]!;
      const second = active[b]!;
      const distance = new Vector3(...first.position).distanceTo(new Vector3(...second.position));
      assert.ok(distance > 1.04 * (first.radius + second.radius), `${first.id}/${second.id} intersected at ${seconds}`);
    }
    previous = state;
  }
});

test("survivors move gently and remain fully inside the camera through the final frame", () => {
  const camera = new PerspectiveCamera(36, 1280 / 650, 0.1, 40);
  camera.position.set(6, 3.2, 10.4);
  camera.lookAt(0, 0.2, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  for (let frame = 0; frame <= 402; frame++) {
    const seconds = CUE.endSeconds * frame / 402;
    for (const cell of activeWhite(seconds)) {
      const view = new Vector3(...cell.position).applyMatrix4(camera.matrixWorldInverse);
      const verticalRadius = cell.radius * camera.projectionMatrix.elements[5] / -view.z;
      const horizontalRadius = cell.radius * camera.projectionMatrix.elements[0] / -view.z;
      const ndc = new Vector3(...cell.position).project(camera);
      assert.ok(Math.abs(ndc.x) + horizontalRadius < 0.98, `${cell.id} clips horizontally while visible at ${seconds}`);
      assert.ok(Math.abs(ndc.y) + verticalRadius < 0.98, `${cell.id} clips vertically while visible at ${seconds}`);
    }
  }
  const low = activeWhite(CUE.lowSeconds);
  const end = activeWhite(CUE.endSeconds);
  for (const survivor of end) {
    const earlier = low.find(({id}) => id === survivor.id)!;
    assert.ok(new Vector3(...survivor.position).distanceTo(new Vector3(...earlier.position)) > 0.12, `${survivor.id} is pinned`);
    const view = new Vector3(...survivor.position).applyMatrix4(camera.matrixWorldInverse);
    const verticalRadius = survivor.radius * camera.projectionMatrix.elements[5] / -view.z;
    const horizontalRadius = survivor.radius * camera.projectionMatrix.elements[0] / -view.z;
    const ndc = new Vector3(...survivor.position).project(camera);
    assert.ok(Math.abs(ndc.x) + horizontalRadius < 0.98, `${survivor.id} clips horizontally`);
    assert.ok(Math.abs(ndc.y) + verticalRadius < 0.98, `${survivor.id} clips vertically`);
  }
});

test("reduced motion is deeply static at the low-count state and alternate cues remain source-bound", () => {
  const alternate = {...CUE, sourceRef: "alternate-source", windowLabel: "alternate-window", entrySeconds: 2.4, focusSeconds: 4, lowSeconds: 6.5, precautionSeconds: 8, endSeconds: 16};
  const early = curvedVesselState(0.5, alternate, true);
  const late = curvedVesselState(15, alternate, true);
  assert.deepEqual(early, late);
  assert.equal(early.phase, "reduced-low-count");
  assert.equal(early.cells.filter((cell) => cell.kind === "white" && cell.opacity > 0.001).length, 3);
  assert.equal(early.sourceBinding.sourceRef, "alternate-source");
  assert.equal(curvedVesselState(alternate.lowSeconds, alternate).cells.filter((cell) => cell.kind === "white" && cell.opacity > 0.001).length, 3);
});
