import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import type {ArmatureAudit} from '../video-composition/directed/WorkPlanningArmature';
import type {WorkPlanningArmatureRevisionAudit} from '../video-composition/directed/WorkPlanningArmatureRevision';

async function main() {
  const run = process.argv.find(a => a.startsWith('--run='))?.slice(6) ?? 'annotations-1';
  assert.match(run, /^[a-zA-Z0-9_-]+$/);
  const output = path.resolve('out/work-planning-review', run);
  assert.ok(!existsSync(output), 'Use a fresh run directory'); mkdirSync(output, {recursive: true});
  const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
  const records = JSON.parse(readFileSync('../docs/design/approved-animations.json', 'utf8')).records;
  const approved: Record<string, string> = {};
  for (const asset of ['care-work-plan-small-arm-proof', 'care-work-plan-armature-map']) {
    const record = records.find((r: {approval?: {asset: string}}) => r.approval?.asset === asset);
    assert.ok(record, `Missing ${asset} approval`);
    Object.assign(approved, record.approval.implementationFingerprint);
  }
  const verifyApproved = () => {for (const [file, expected] of Object.entries(approved)) assert.equal(hash(file), expected, `Approved file changed: ${file}`);};
  verifyApproved();
  const files = [...Object.keys(approved), 'video-composition/work-planning-annotations-index.tsx', 'scripts/preview-work-planning-annotations.ts',
    'video-composition/directed/WorkPlanningArmatureRevision.ts', 'video-composition/work-planning-sleeve-revision-index.tsx',
    'scripts/prepare-work-planning-sleeve-revision.py', 'public/studies/work-planning/straight-sleeve-candidate.json',
    'public/studies/work-planning/working-typing-straight-sleeve.svg', 'public/studies/work-planning/working-typing-straight-sleeve-no-desk.svg'];
  const fingerprint = Object.fromEntries(files.map(file => [file, hash(file)]));
  const audits: Record<string, unknown>[] = [];
  const pixels = (p: string) => sharp(p).ensureAlpha().raw().toBuffer();
  const serveUrl = await bundle({entryPoint: path.resolve('video-composition/work-planning-annotations-index.tsx')});
  const browser = await openBrowser('chrome');
  try {
    for (const panel of ['regions', 'boundaries', 'coverage']) {
      for (const mode of ['baseline', 'hidden', 'annotated', 'later']) {
        const props = {panel, baseline: mode === 'baseline', showAnnotations: ['annotated', 'later'].includes(mode), qa: mode !== 'baseline'};
        const frame = mode === 'later' ? 90 : 0;
        const logs: Record<string, unknown>[] = [];
        const composition = await selectComposition({serveUrl, id: 'WorkPlanningAnnotations', inputProps: props, puppeteerInstance: browser, logLevel: 'error'});
        await renderStill({serveUrl, composition, inputProps: props, frame, puppeteerInstance: browser,
          output: path.join(output, `${panel}-${mode}.png`), logLevel: 'error', onBrowserLog: log => {
            const prefix = 'ANNOTATIONS_QA:', i = log.text.indexOf(prefix);
            if (i >= 0) logs.push(JSON.parse(log.text.slice(i + prefix.length)));
          }});
        if (mode !== 'baseline') {
          const audit = logs.filter(a => typeof a.seconds === 'number' && Math.abs(a.seconds - frame / 30) < 1e-7).at(-1);
          assert.ok(audit, `${panel}/${mode} missing final DOM audit`);
          assert.equal(audit.panel, panel); assert.equal(audit.showAnnotations, props.showAnnotations);
          const armature = audit.armature as ArmatureAudit;
          assert.ok(armature && Object.values(armature.sourcePreserved).every(v => v === true));
          assert.equal(armature.counts.joints, 6); assert.equal(armature.counts.parts, 8);
          assert.equal(armature.counts.paintSurfaces, 37); assert.equal(armature.counts.clipConsumers, 5);
          const expectedJoints = {'near:shoulder': [291,245], 'near:elbow': [296,293], 'near:wrist': [244,294],
            'far:shoulder': [243.61,243.46], 'far:elbow': [237.25,284.7], 'far:wrist': [190.45,285.6]};
          for (const [id, [x,y]] of Object.entries(expectedJoints)) {
            const joint = armature.joints.find(j => j.id === id); assert.ok(joint);
            assert.ok(Math.abs(joint.actual.x - x!) < 1e-6 && Math.abs(joint.actual.y - y!) < 1e-6, `${id} moved`);
          }
          assert.equal(armature.exposureRequirements.length, 6);
          assert.ok(armature.exposureRequirements.every(e => e.status === 'unresolved-for-larger-poses'));
          assert.equal(armature.capabilities.poseEvaluationAvailable, false);
          const ownership = (armature as WorkPlanningArmatureRevisionAudit).ownershipChecks;
          assert.ok(ownership && ownership.torsoSampleCount > 0 && ownership.changedSampleCount > 0);
          assert.equal(ownership.technique, 'source-contour-arc-ownership');
          assert.equal(ownership.torsoMaxSleeveWeight, 0); assert.equal(ownership.torsoMinTorsoWeight, 1);
          assert.equal(ownership.sourceDUnchanged, true); assert.equal(ownership.jointRegistrationsUnchanged, true);
          assert.equal(ownership.probes.length, 4);
          assert.ok(ownership.probes.every(p => p.torso === 1 && p.nearSleeve === 0 && p.farSleeve === 0));
          const probeTargets = {'far-underarm-torso':[245.45,277], 'far-lower-torso':[247.95,279.67],
            'near-inner-torso':[292.7,278], 'near-lower-torso':[292.5,283]};
          for(const [name,[x,y]] of Object.entries(probeTargets)) {
            const probe=ownership.probes.find(p=>p.name===name); assert.ok(probe);
            assert.ok(Number.isFinite(probe.sourceDistance) && Math.hypot(probe.canonical.x-x!,probe.canonical.y-y!)<1);
            assert.ok(probe.priorFarSleeve>0 || probe.priorNearSleeve>0);
          }
          assert.ok(audit.annotationCounts && Object.values(audit.annotationCounts as object).every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0));
          const counts = audit.annotationCounts as Record<string, number>;
          if (panel === 'regions') {
            assert.equal(counts.distinctRegionsShown, 9);
            assert.ok(counts.fabricDetailSurfacesShown! > 0 && counts.regionTraces! > 0 && counts.contourPoints! > 0);
          } else if (panel === 'boundaries') {
            assert.equal(counts.clipConsumersShown, 5); assert.equal(counts.cuffSurfacesShown, 2);
            assert.ok(counts.boundaryTraces! >= 7 && counts.clipEdgePoints! > 0 && counts.cuffPoints! > 0);
          } else assert.equal(counts.coverageCallouts, 6);
          audits.push({panel, mode, frame, ...audit});
        }
      }
      assert.ok((await pixels(path.join(output, `${panel}-baseline.png`))).equals(await pixels(path.join(output, `${panel}-hidden.png`))), `${panel}: source appearance changed`);
      assert.ok((await pixels(path.join(output, `${panel}-annotated.png`))).equals(await pixels(path.join(output, `${panel}-later.png`))), `${panel}: static annotation changed with time`);
      assert.ok(!(await pixels(path.join(output, `${panel}-annotated.png`))).equals(await pixels(path.join(output, `${panel}-hidden.png`))), `${panel}: annotations absent`);
      console.log(`Verified ${panel}: preserved source, static annotations`);
    }
    const sleeveUrl = await bundle({entryPoint: path.resolve('video-composition/work-planning-sleeve-revision-index.tsx')});
    for (const view of ['human','closeup']) for (const original of [true,false]) {
      const props = {view,original};
      const composition = await selectComposition({serveUrl:sleeveUrl,id:'WorkPlanningSleeveRevision',inputProps:props,puppeteerInstance:browser,logLevel:'error'});
      await renderStill({serveUrl:sleeveUrl,composition,inputProps:props,frame:0,puppeteerInstance:browser,
        output:path.join(output,`${view}-${original?'original':'revised'}.png`),logLevel:'error'});
    }
    // Full-figure source viewport is 135,175,205,280 at 720x980.
    // Confine changed pixels to the far sleeve/cuff; includes AA padding.
    const originalPixels = await pixels(path.join(output,'human-original.png'));
    const revisedPixels = await pixels(path.join(output,'human-revised.png'));
    const scale = 980/280, leftPad = (720-205*scale)/2;
    let changedPixels=0;
    for(let i=0;i<originalPixels.length;i+=4) {
      if(originalPixels.subarray(i,i+4).equals(revisedPixels.subarray(i,i+4)))continue;
      changedPixels++;
      const px=(i/4)%720,py=Math.floor(i/4/720);
      const x=(px-leftPad)/scale+135,y=py/scale+175;
      assert.ok(x>=224 && x<=248 && y>=242 && y<=279, `Change outside far sleeve: ${x},${y}`);
    }
    assert.ok(changedPixels>0,'Sleeve candidate has no visible change');
  } finally {await browser.close({silent: true});}
  verifyApproved();
  assert.deepEqual(Object.fromEntries(files.map(file => [file, hash(file)])), fingerprint);
  assert.equal(audits.length, 9);
  writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({scope: 'Static straight far-sleeve candidate and corrected shared-shirt torso ownership; review pending',
    fingerprint, historicalApprovedImplementationUnchanged: true, candidatePreparationPixelEquality: true,
    candidateChangesConfinedToFarSleeve: true, stationaryTorsoSleeveWeight: 0, staticFrames: [0,90], humanApproval: 'pending', audits}, null, 2) + '\n');
  writeFileSync(path.join(output, 'review.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Woman — construction annotations</title>
<style>body{margin:0;background:#eef2f4;color:#23343c;font:17px system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:24px}h1{font-size:26px}nav{display:flex;gap:20px;flex-wrap:wrap}a{color:#006b86}section{margin:32px 0}img{display:block;width:100%;height:auto;background:white;border-radius:12px}p{max-width:850px;line-height:1.5}</style>
<main><h1>Woman — sleeve and ownership correction</h1><p>The new far sleeve has a straight bottom and sharper corners. The shared shirt's chest/torso edge is now assigned to the torso. The other arm and approved joint positions are retained. This is a static candidate for review.</p>
<section><h2>Revised figure, without annotations</h2><a href="human-revised.png"><img style="max-width:540px" src="human-revised.png" alt="Full revised woman"></a></section>
<section><h2>Sleeve closeup: previous and revised</h2><div style="display:flex;gap:16px"><a style="width:50%" href="closeup-original.png"><img src="closeup-original.png" alt="Previous rounded sleeve"></a><a style="width:50%" href="closeup-revised.png"><img src="closeup-revised.png" alt="Revised straight sleeve"></a></div></section>
<nav><a href="#regions">1. Regions</a><a href="#boundaries">2. Boundaries and clips</a><a href="#coverage">3. Pending coverage</a></nav>
${['regions','boundaries','coverage'].map((panel,i) => `<section id="${panel}"><a href="${panel}-annotated.png"><img src="${panel}-annotated.png" alt="${i+1}. ${panel} annotations on the working woman"></a></section>`).join('\n')}
</main></html>`);
  console.log(output);
}
main().catch(error => {console.error(error); process.exitCode = 1;});
