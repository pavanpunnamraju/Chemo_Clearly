import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import { PATIENT_ARTWORK_RECIPES } from "../lib/video/library-patient-motion";

const output = path.resolve("out/patient-library-preview");
type Report = { frame: number; error?: string; uniqueIds: boolean; instances: { id: string; viewBox: string; layers: unknown[]; unsafeGroups: string[] }[] };
async function main() {
  mkdirSync(output, { recursive: true });
  const serveUrl = await bundle({ entryPoint: path.resolve("video-composition/patient-library-check-index.tsx") });
  const browser = await openBrowser("chrome");
  const reports: Report[] = [];
  try {
    for (const fixture of [{ frame: 0, reducedMotion: false }, { frame: 115, reducedMotion: false }, { frame: 360, reducedMotion: false }, { frame: 115, reducedMotion: true }]) {
      const inputProps = { reducedMotion: fixture.reducedMotion };
      const composition = await selectComposition({ serveUrl, id: "PatientLibraryCheck", puppeteerInstance: browser, inputProps });
      await renderStill({ serveUrl, composition, puppeteerInstance: browser, frame: fixture.frame, inputProps,
        output: path.join(output, fixture.reducedMotion ? "reduced.png" : `frame-${fixture.frame}.png`), onBrowserLog: (log) => {
          const prefix = "PATIENT_LIBRARY_QA ";
          if (log.text.startsWith(prefix)) reports.push(JSON.parse(log.text.slice(prefix.length)) as Report);
        } });
    }
    const first = await sharp(path.join(output, "frame-0.png")).raw().toBuffer();
    assert.ok(first.equals(await sharp(path.join(output, "frame-360.png")).raw().toBuffer()), "Loop seam changed pixels");
    assert.ok(first.equals(await sharp(path.join(output, "reduced.png")).raw().toBuffer()), "Reduced motion differs from rest");
    const recipes = Object.values(PATIENT_ARTWORK_RECIPES);
    const changed = [];
    for (let index = 0; index < recipes.length; index++) {
      const region = { left: index % 3 * 640, top: Math.floor(index / 3) * 480, width: 640, height: 480 };
      const start = await sharp(path.join(output, "frame-0.png")).extract(region).raw().toBuffer();
      const active = await sharp(path.join(output, "frame-115.png")).extract(region).raw().toBuffer();
      assert.ok(!start.equals(active), `${recipes[index]!.id} has no visible layered motion`);
      changed.push(recipes[index]!.id);
    }
    assert.ok(reports.length >= 4, "Missing browser evidence");
    for (const report of reports) {
      assert.equal(report.error, undefined);
      assert.equal(report.uniqueIds, true);
      assert.equal(report.instances.length, recipes.length);
      for (const instance of report.instances) {
        assert.ok(instance.layers.length > 0);
        assert.deepEqual(instance.unsafeGroups, [], `${instance.id} retains unrelated/score/background layers`);
        assert.equal(instance.viewBox, PATIENT_ARTWORK_RECIPES[instance.id]!.viewBox);
      }
    }
    writeFileSync(path.join(output, "evidence.json"), JSON.stringify({ changed, exactLoopReturn: true, exactReducedMotionRest: true, reports,
      review: "Technical preparation checks passed. New visual adaptations pending human review; no clinical approval implied." }, null, 2) + "\n");
    console.log(`Patient artwork library: 9 animated assets, removed unsafe layers, unique IDs, exact rest/reduced/loop images. ${output}`);
  } finally { await browser.close({ silent: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
