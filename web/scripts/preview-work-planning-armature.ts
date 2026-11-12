import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import type {ArmatureStudyProps} from '../video-composition/work-planning-armature-index';
import type {ArmatureAudit} from '../video-composition/directed/WorkPlanningArmature';

async function main() {
  const run = process.argv.find(a => a.startsWith('--run='))?.slice(6) ?? 'armature-prep-1';
  assert.match(run, /^[a-zA-Z0-9_-]+$/);
  const output = path.resolve('out/work-planning-review', run);
  assert.ok(!existsSync(output), 'Use a fresh run directory');
  mkdirSync(output, {recursive: true});
  const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
  const records = JSON.parse(readFileSync('../docs/design/approved-animations.json', 'utf8')).records;
  const approved = records.find((r: {approval?: {asset: string}}) => r.approval?.asset === 'care-work-plan-small-arm-proof').approval.implementationFingerprint as Record<string, string>;
  const verifyApproved = () => {for (const [file, expected] of Object.entries(approved)) assert.equal(hash(file), expected, `Approved file changed: ${file}`);};
  verifyApproved();
  const files = [...Object.keys(approved), 'video-composition/directed/WorkPlanningArmature.ts',
    'video-composition/work-planning-armature-index.tsx', 'scripts/preview-work-planning-armature.ts'];
  const fingerprint = Object.fromEntries(files.map(file => [file, hash(file)]));
  const audits: (ArmatureAudit & {seconds: number; view: string; frame: number})[] = [];
  const pixels = (p: string) => sharp(p).ensureAlpha().raw().toBuffer();
  const finite = (v: unknown): boolean => typeof v === 'number' ? Number.isFinite(v)
    : v !== null && typeof v === 'object' ? Object.values(v).every(finite) : true;
  const serveUrl = await bundle({entryPoint: path.resolve('video-composition/work-planning-armature-index.tsx')});
  const browser = await openBrowser('chrome');
  try {
    for (const view of ['human', 'scene', 'closeup', 'phone'] as const) {
      const dir = path.join(output, view); mkdirSync(dir);
      for (const mode of ['baseline', 'prepared', 'later'] as const) {
        const props: ArmatureStudyProps = {view, baseline: mode === 'baseline', diagram: false, qa: mode !== 'baseline'};
        const frame = mode === 'later' ? 90 : 0;
        const logs: (ArmatureAudit & {seconds: number})[] = [];
        const composition = await selectComposition({serveUrl, id: 'WorkPlanningArmature', inputProps: props, puppeteerInstance: browser, onBrowserLog: () => {}});
        await renderStill({serveUrl, composition, inputProps: props, frame, puppeteerInstance: browser,
          output: path.join(dir, `${mode}.png`), logLevel: 'error', onBrowserLog: log => {
            const i = log.text.indexOf('ARMATURE_QA:'); if (i >= 0) logs.push(JSON.parse(log.text.slice(i + 12)));
          }});
        if (mode !== 'baseline') {
          const audit = logs.filter(a => Math.abs(a.seconds - frame / 30) < 1e-7).at(-1);
          assert.ok(audit && finite(audit), `${view}/${mode}: missing finite DOM audit`);
          assert.equal(audit.kind, 'logical-source-regions');
          assert.deepEqual(audit.capabilities, {staticRestBound: true, visibleSegmentsSeparated: false, largeAngleCoverageValidated: false, poseEvaluationAvailable: false});
          assert.equal(audit.counts.joints, 6); assert.equal(audit.counts.parts, 8);
          assert.equal(audit.counts.paintSurfaces, 37); assert.equal(audit.counts.clipConsumers, 5);
          assert.ok(audit.counts.contourSamples > 1000 && audit.counts.stationaryPaths > 0);
          assert.ok(Object.values(audit.sourcePreserved).every(v => v === true));
          assert.equal(audit.regionWeights.length, 9); assert.ok(audit.membershipMaxResidual < 1e-9);
          for (const weights of audit.regionWeights) assert.ok(weights.min >= -1e-9 && weights.max <= 1 + 1e-9 && weights.nonzeroSampleCount > 0);
          for (const joint of audit.joints) {
            assert.ok(joint.mappingResidual < 1e-6);
            const parent = audit.joints.find(j => j.id === joint.parentId);
            assert.ok(parent || joint.kind === 'shoulder');
            assert.ok(Math.abs(joint.canonical.x - (parent?.canonical.x ?? 0) - joint.parentLocalOffset.x) < 1e-6);
            assert.ok(Math.abs(joint.canonical.y - (parent?.canonical.y ?? 0) - joint.parentLocalOffset.y) < 1e-6);
          }
          assert.equal(audit.exposureRequirements.length, 6);
          assert.ok(audit.exposureRequirements.every(e => e.status === 'unresolved-for-larger-poses' && e.owner && e.receiver && e.trigger));
          audits.push({...audit, view, frame});
        }
      }
      const baseline = await pixels(path.join(dir, 'baseline.png'));
      for (const name of ['prepared', 'later']) assert.ok(baseline.equals(await pixels(path.join(dir, `${name}.png`))), `${view}/${name} differs from source`);
      console.log(`Verified ${view}: exact source pixels and static frame 0/90`);
    }
    const props: ArmatureStudyProps = {view: 'closeup', baseline: false, diagram: true, qa: false};
    const composition = await selectComposition({serveUrl, id: 'WorkPlanningArmature', inputProps: props, puppeteerInstance: browser});
    await renderStill({serveUrl, composition, inputProps: props, frame: 0, puppeteerInstance: browser,
      output: path.join(output, 'construction-map.png'), logLevel: 'error'});
  } finally {await browser.close({silent: true});}
  verifyApproved();
  assert.deepEqual(Object.fromEntries(files.map(file => [file, hash(file)])), fingerprint);
  assert.equal(audits.length, 8);
  writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({scope: 'Static source-region preparation; intermediate poses and large-angle coverage pending',
    fingerprint, approvedImplementationUnchanged: true, exactBaselinePixelsInAllViews: true, staticFrames: [0, 90],
    diagramLegend: 'N=near, F=far; S=shoulder, E=elbow, W=wrist. Inferred illustration controls.',
    humanApproval: 'not inferred', audits}, null, 2) + '\n');
  console.log(output);
}
main().catch(error => {console.error(error); process.exitCode = 1;});
