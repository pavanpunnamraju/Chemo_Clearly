import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";
import sharp from "sharp";
import { DRINKING_LIP, DRINKING_RIM } from "../lib/video/drinking-study-motion";

const output = path.resolve("out/directed-integration-preview/regression");
const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const references = [
  { kind: "calling", id: "CallingRegression", contactFrame: 140 },
  { kind: "drinking", id: "DrinkingRegression", contactFrame: 130 },
];
type DomReport = {
  frame: number; error?: string; ids: string[]; uniqueIds: boolean;
  instances: { clipId: string; ownsClip: boolean; references: string[]; allReferencesOwned: boolean;
    waterFill: string; rim: { x: number; y: number }; transform: string }[];
};

async function main() {
  mkdirSync(output, { recursive: true });
  const currentRenderChecks: { kind: string; restHash: string; contactHash: string; contactDiffersFromRest: boolean; reducedMatchesRest: boolean }[] = [];
  const serveUrl = await bundle({ entryPoint: path.resolve("video-composition/approved-artwork-regression-index.tsx") });
  const browser = await openBrowser("chrome");
  try {
    for (const ref of references) {
      const composition = await selectComposition({ serveUrl, id: ref.id, puppeteerInstance: browser });
      for (const frame of [0, ref.contactFrame]) {
        const actual = path.join(output, `${ref.kind}-${frame}.png`);
        await renderStill({ serveUrl, composition, puppeteerInstance: browser, frame, output: actual });
      }
      const inputProps = { reducedMotion: true, camera: false };
      const reduced = await selectComposition({ serveUrl, id: ref.id, puppeteerInstance: browser, inputProps });
      const actual = path.join(output, `${ref.kind}-reduced.png`);
      await renderStill({ serveUrl, composition: reduced, puppeteerInstance: browser, inputProps, frame: ref.contactFrame, output: actual });
      const rest = await sharp(path.join(output, `${ref.kind}-0.png`)).ensureAlpha().raw().toBuffer();
      const contact = await sharp(path.join(output, `${ref.kind}-${ref.contactFrame}.png`)).ensureAlpha().raw().toBuffer();
      const reducedPixels = await sharp(actual).ensureAlpha().raw().toBuffer();
      assert.ok(!contact.equals(rest), `${ref.kind} contact frame has no visible motion`);
      assert.ok(reducedPixels.equals(rest), `${ref.kind} reduced motion differs from the current rest frame`);
      currentRenderChecks.push({kind: ref.kind, restHash: sha256(path.join(output, `${ref.kind}-0.png`)),
        contactHash: sha256(path.join(output, `${ref.kind}-${ref.contactFrame}.png`)), contactDiffersFromRest: true, reducedMatchesRest: true});
    }
    const reports: DomReport[] = [];
    const composition = await selectComposition({ serveUrl, id: "SimultaneousDrinking", puppeteerInstance: browser });
    await renderStill({ serveUrl, composition, puppeteerInstance: browser, frame: 130,
      output: path.join(output, "simultaneous-drinking.png"), onBrowserLog: (log) => {
        const prefix = "APPROVED_ARTWORK_QA ";
        if (log.text.startsWith(prefix)) reports.push(JSON.parse(log.text.slice(prefix.length)) as DomReport);
      } });
    const report = [...reports].reverse().find((value) => value.frame === 130);
    assert.ok(report, "Missing browser artwork QA evidence");
    assert.equal(report.error, undefined);
    assert.equal(report.uniqueIds, true, "Simultaneous SVG IDs collide");
    assert.equal(report.instances.length, 2);
    assert.notEqual(report.instances[0]!.clipId, report.instances[1]!.clipId);
    for (const [index, instance] of report.instances.entries()) {
      assert.ok(instance.ownsClip && instance.allReferencesOwned, "SVG reference escaped its own artwork");
      assert.ok(instance.references.length > 0, "Expected the water clipping reference");
      assert.equal(instance.waterFill, "rgb(138, 204, 232)");
      const target = index === 0 ? DRINKING_LIP : DRINKING_RIM;
      assert.ok(Math.hypot(instance.rim.x - target.x, instance.rim.y - target.y) < .002, "Rendered rim misses its contact/rest target");
    }
    writeFileSync(path.join(output, "evidence.json"), JSON.stringify({ currentRenderChecks,
      simultaneousInstances: report, scope: "Technical current-render regression only; recorded human approvals remain separate and no clinical approval is established." }, null, 2) + "\n");
    console.log(`Approved artwork current-render checks passed: visible contact motion, reduced-motion rest, unique SVG IDs, local clips, rendered sip contact. ${output}`);
  } finally { await browser.close({ silent: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
