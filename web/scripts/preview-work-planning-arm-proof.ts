import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import sharp from 'sharp';
import type {ArmProofProps} from '../video-composition/work-planning-arm-proof-index';

// Isolated, reproducible verification of the active arm proof. No narration,
// production routing, static asset generation or human approval is mutated here.
async function main() {
  const run = process.argv.find(a => a.startsWith('--run='))?.slice(6) ?? 'arm-proof-1';
  assert.match(run, /^[a-zA-Z0-9_-]+$/);
  const stillsOnly = process.argv.includes('--stills-only');
  const output = path.resolve('out/work-planning-review', run);
  assert.ok(!existsSync(output) || readdirSync(output).length === 0, 'Use a fresh --run name; do not mix current evidence with stale previews');
  mkdirSync(output, {recursive: true});
  const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
  const approvalFile = '../docs/design/approved-animations.json';
  const sourceFile = 'public/studies/work-planning/source.json';
  const approvalDocument = JSON.parse(readFileSync(approvalFile, 'utf8'));
  const source = JSON.parse(readFileSync(sourceFile, 'utf8'));
  const records = approvalDocument.records as {approval?: {asset?: string; runtimeSha256?: string; humanSceneSha256?: string}}[];
  assert.ok(Array.isArray(records), 'Malformed canonical approval records');
  const approval = records.find(record => record.approval?.asset === 'care-work-plan-static-human')?.approval;
  assert.ok(approval, 'Missing canonical static-human approval');
  assert.equal(source.review.humanApproval, 'approved-static-human');
  assert.equal(hash('public/studies/work-planning/working-typing.svg'), approval.runtimeSha256);
  assert.equal(hash('public/studies/work-planning/working-typing-no-desk.svg'), approval.humanSceneSha256);
  assert.equal(source.review.approval.runtimeSha256, approval.runtimeSha256);
  assert.equal(source.review.approval.humanSceneSha256, approval.humanSceneSha256);
  const files = ['public/studies/work-planning/working-typing.svg', 'public/studies/work-planning/working-typing-no-desk.svg',
    'video-composition/work-planning-arm-proof-index.tsx', 'video-composition/directed/WorkPlanningArmProof.ts',
    'video-composition/directed/LibrarySvgArtwork.tsx', 'video-composition/directed/namespace-svg.ts',
    'scripts/preview-work-planning-arm-proof.ts', 'package.json', 'package-lock.json', 'tsconfig.json', approvalFile, sourceFile];
  const fingerprint = Object.fromEntries(files.map(p => [p, hash(p)]));
  const frames = [0, 20, 21, 22, 23, 30, 45, 60, 67, 68, 69, 70, 89, 90, 91, 92, 105, 120, 136, 137, 138, 139, 179];
  const views: ArmProofProps['view'][] = ['human', 'scene', 'closeup'];
  const requested = process.argv.find(a => a.startsWith('--view='))?.slice(7);
  if (requested) assert.ok(views.includes(requested as ArmProofProps['view']));
  const activeViews = requested ? [requested as ArmProofProps['view']] : views;
  const audits: Record<string, unknown>[] = [];
  const reducedAudits: Record<string, unknown>[] = [];
  const checks: string[] = [];
  const videoHashes: Record<string, string> = {};
  const compositionMetadata: Record<string, unknown> = {};
  const tools = {node: process.version, ffmpeg: execFileSync('ffmpeg', ['-version'], {encoding: 'utf8'}).split('\n')[0], sharp: sharp.versions};
  const finiteTree = (value: unknown): boolean => typeof value === 'number' ? Number.isFinite(value)
    : value !== null && typeof value === 'object' ? Object.values(value).every(finiteTree) : true;
  const pixels = (p: string) => sharp(p).removeAlpha().raw().toBuffer();
  const serveUrl = await bundle({entryPoint: path.resolve('video-composition/work-planning-arm-proof-index.tsx')});
  const browser = await openBrowser('chrome');
  try {
    for (const view of activeViews) {
      const dir = path.join(output, view); mkdirSync(dir, {recursive: true});
      const props: ArmProofProps = {view, baseline: false, reducedMotion: false, qa: true};
      const composition = await selectComposition({serveUrl, id: 'WorkPlanningArmProof', inputProps: props, puppeteerInstance: browser});
      compositionMetadata[view] = {width: composition.width, height: composition.height, fps: composition.fps, durationInFrames: composition.durationInFrames};
      const sourceBox = view === 'human' ? [135, 175, 205, 280] : view === 'closeup' ? [155, 230, 170, 94] : [-80, 17.96875, 660, 464.0625];
      const scale = Math.min(composition.width / sourceBox[2]!, composition.height / sourceBox[3]!);
      const region = (x: number, y: number, width: number, height: number) => ({
        left: Math.max(0, Math.round((composition.width - sourceBox[2]! * scale) / 2 + (x - sourceBox[0]!) * scale)),
        top: Math.max(0, Math.round((composition.height - sourceBox[3]! * scale) / 2 + (y - sourceBox[1]!) * scale)),
        width: Math.round(width * scale), height: Math.round(height * scale),
      });
      const armRegion = region(158, 240, 151, 67);
      for (const frame of frames) {
        const logs: Record<string, unknown>[] = [];
        await renderStill({serveUrl, composition, inputProps: props, puppeteerInstance: browser, frame,
          output: path.join(dir, `frame-${frame}.png`), logLevel: 'error',
          onBrowserLog: log => {const index = log.text.indexOf('ARM_PROOF_QA:');
            if (index >= 0) logs.push(JSON.parse(log.text.slice(index + 'ARM_PROOF_QA:'.length)));}});
        const actual = logs.filter(a => typeof a.seconds === 'number' && Math.abs(a.seconds - frame / 30) < 1e-7 && a.reducedMotion === false).at(-1);
        assert.ok(actual, `Missing active-scene measurements for ${view} frame ${frame}`);
        assert.ok(finiteTree(actual), `Nonfinite active-scene measurements for ${view} frame ${frame}`);
        assert.ok(actual.measurements && Object.keys(actual.measurements as object).length > 0, 'Empty motion measurement payload');
        const measurements = actual.measurements as {surfaceCount: number; clipCount: number; stationaryMatrixDrift: number;
          originalDCount: number; pathProbes: {label: string; rest: {x: number; y: number}; actual: {x: number; y: number};
            displacement: number; lift: number; registrationResidual: number}[];
          jointAngles: {side: string; shoulderChange: number; elbowChange: number}[];
          clipRegistrations: {side: string; restEdgeDistance: number; actualEdgeDistance: number; residual: number}[]};
        assert.equal(measurements.surfaceCount, 42); assert.equal(measurements.clipCount, 5);
        assert.ok(measurements.stationaryMatrixDrift < 1e-8, 'Source transforms drift');
        assert.ok(Array.isArray(measurements.pathProbes) && measurements.pathProbes.length === 16, 'Missing DOM probe coverage');
        for (const label of ['near-skin-0', 'far-skin-0', 'near-cuff', 'far-cuff', 'shirt']) {
          const probe = measurements.pathProbes.find(p => p.label === label);
          assert.ok(probe, `Missing ${label} probe`);
          for (const value of [probe.actual.x, probe.actual.y, probe.rest.x, probe.rest.y, probe.lift, probe.displacement, probe.registrationResidual]) {
            assert.equal(typeof value, 'number'); assert.ok(Number.isFinite(value));
          }
          assert.ok(probe.registrationResidual < .03, `${label} DOM contour differs from registered motion`);
          if ([0, 20, 21, 138, 139, 179].includes(frame)) assert.ok(probe.displacement < 1e-6, `${label} rest geometry drifts`);
        }
        for (const probe of measurements.pathProbes) assert.ok(probe.registrationResidual < .03, 'Actual DOM probe differs from registered surface');
        assert.equal(measurements.jointAngles.length, 2); assert.equal(measurements.clipRegistrations.length, 2);
        for (const side of ['near', 'far']) {
          const joint = measurements.jointAngles.find(joint => joint.side === side);
          const clip = measurements.clipRegistrations.find(clip => clip.side === side);
          assert.ok(joint && clip, `Missing ${side} joint/clip coverage`);
          assert.ok(clip.residual < .03 && Math.abs(clip.actualEdgeDistance - clip.restEdgeDistance) < .015,
            `${side} mirrored wrist clip registration changed`);
          if ([69, 70, 89, 90].includes(frame)) {
            assert.ok(joint.elbowChange > 2 && joint.elbowChange < 4, `${side} elbow does not bend independently`);
            const wrist = measurements.pathProbes[side === 'near' ? 3 : 7]!;
            assert.equal(wrist.label, `${side}-skin-0`);
            assert.ok(wrist.lift > 2 && wrist.lift < 12, `${side} wrist peak lift outside bounded visible proof`);
          }
        }
        audits.push({view, frame, ...actual});
      }
      for (const mode of ['baseline', 'reduced'] as const) {
        const inputProps = {...props, qa: mode === 'reduced', baseline: mode === 'baseline', reducedMotion: mode === 'reduced'};
        const selected = await selectComposition({serveUrl, id: 'WorkPlanningArmProof', inputProps, puppeteerInstance: browser});
        for (const frame of mode === 'baseline' ? [69] : [0, 22, 69, 90, 137, 138, 179]) {
          const logs: Record<string, unknown>[] = [];
          await renderStill({serveUrl, composition: selected, inputProps, puppeteerInstance: browser, frame,
            output: path.join(dir, mode === 'baseline' ? 'baseline.png' : `reduced-${frame}.png`), logLevel: 'error',
            onBrowserLog: log => {const index = log.text.indexOf('ARM_PROOF_QA:');
              if (index >= 0) logs.push(JSON.parse(log.text.slice(index + 'ARM_PROOF_QA:'.length)));}});
          if (mode === 'reduced') {
            const actual = logs.find(log => log.reducedMotion === true && typeof log.seconds === 'number' && Math.abs(log.seconds - frame / 30) < 1e-7);
            assert.ok(actual && finiteTree(actual), `Missing actual reduced-motion render at ${view}/${frame}`);
            assert.equal((actual.state as {progress: number}).progress, 0);
            reducedAudits.push({view, frame, ...actual});
          }
        }
      }
      const rest = await pixels(path.join(dir, 'baseline.png'));
      for (const name of ['frame-0.png', 'frame-21.png', 'frame-138.png', 'frame-179.png',
        ...[0, 22, 69, 90, 137, 138, 179].map(frame => `reduced-${frame}.png`)]) {
        assert.ok((await pixels(path.join(dir, name))).equals(rest), `${view} ${name} differs from source baseline render`);
      }
      for (const frame of [30, 45, 60, 69, 105, 120]) {
        const moved = await pixels(path.join(dir, `frame-${frame}.png`));
        const changedChannels = moved.reduce((sum, value, i) => sum + (Math.abs(value - rest[i]!) > 8 ? 1 : 0), 0);
        assert.ok(changedChannels > 100, `${view} frame ${frame} has no meaningful visible motion (${changedChannels} channels)`);
      }
      for (const frame of [70, 89, 90]) assert.ok((await pixels(path.join(dir, `frame-${frame}.png`)))
        .equals(await pixels(path.join(dir, 'frame-69.png'))), `${view} peak hold changes at frame ${frame}`);
      checks.push(`${view}: expected finite audit coverage; source-baseline/return/reduced pixels exact; sustained motion and stable peak hold`);
      // Include event neighbors at the first representation change and full lift.
      const contactFrames = [0, 21, 22, 23, 30, 45, 60, 68, 69, 70, 90, 91, 105, 136, 137, 138];
      const cellWidth = view === 'human' ? 180 : 384;
      const cellHeight = Math.round(composition.height * cellWidth / composition.width);
      const tiles = await Promise.all(contactFrames.map(async (frame, i) => ({
        input: await sharp(path.join(dir, `frame-${frame}.png`)).resize(cellWidth, cellHeight).png().toBuffer(),
        left: (i % 4) * cellWidth, top: Math.floor(i / 4) * cellHeight,
      })));
      await sharp({create: {width: cellWidth * 4, height: cellHeight * 4, channels: 3, background: 'white'}})
        .composite(tiles).png().toFile(path.join(dir, 'events.png'));
      if (!stillsOnly) {
        const inputProps = {...props, qa: false};
        const selected = await selectComposition({serveUrl, id: 'WorkPlanningArmProof', inputProps, puppeteerInstance: browser});
        const video = path.join(dir, 'arm-lift-return.mp4');
        await renderMedia({serveUrl, composition: selected, inputProps, puppeteerInstance: browser,
          codec: 'h264', crf: 16, imageFormat: 'png', concurrency: 2, outputLocation: video, logLevel: 'error'});
        execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', video, '-f', 'null', '-']);
        const encoded = path.join(dir, 'encoded'); mkdirSync(encoded, {recursive: true});
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-start_number', '0', path.join(encoded, '%03d.png')]);
        const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
          'stream=nb_frames,width,height,duration,r_frame_rate', '-of', 'json', video], {encoding: 'utf8'}));
        assert.equal(Number(metadata.streams[0].nb_frames), 180);
        assert.equal(metadata.streams[0].width, composition.width); assert.equal(metadata.streams[0].height, composition.height);
        assert.equal(metadata.streams[0].r_frame_rate, '30/1'); assert.equal(Number(metadata.streams[0].duration), 6);
        for (const frame of frames) {
          const a = await pixels(path.join(dir, `frame-${frame}.png`));
          const b = await pixels(path.join(encoded, `${String(frame).padStart(3, '0')}.png`));
          assert.equal(a.length, b.length);
          const meanDifference = a.reduce((sum, value, i) => sum + Math.abs(value - b[i]!), 0) / a.length;
          assert.ok(meanDifference < 2.5, `${view} encoded frame ${frame} differs from audited still: MAE=${meanDifference}`);
          const localA = await sharp(path.join(dir, `frame-${frame}.png`)).extract(armRegion).removeAlpha().raw().toBuffer();
          const localB = await sharp(path.join(encoded, `${String(frame).padStart(3, '0')}.png`)).extract(armRegion).removeAlpha().raw().toBuffer();
          const localDifference = localA.reduce((sum, value, i) => sum + Math.abs(value - localB[i]!), 0) / localA.length;
          assert.ok(localDifference < 3, `${view} encoded arms differ from audited still at ${frame}: MAE=${localDifference}`);
        }
        const encodedTiles = await Promise.all(contactFrames.map(async (frame, i) => ({
          input: await sharp(path.join(encoded, `${String(frame).padStart(3, '0')}.png`)).resize(cellWidth, cellHeight).png().toBuffer(),
          left: (i % 4) * cellWidth, top: Math.floor(i / 4) * cellHeight,
        })));
        await sharp({create: {width: cellWidth * 4, height: cellHeight * 4, channels: 3, background: 'white'}})
          .composite(encodedTiles).png().toFile(path.join(dir, 'encoded-events.png'));
        if (view === 'scene') {
          const phone = path.join(dir, 'phone-landscape.mp4');
          execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf',
            'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:white', '-c:v', 'libx264', '-crf', '17', phone]);
          execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', phone, '-f', 'null', '-']);
          execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', phone, '-vf', 'select=eq(n\\,69)', '-frames:v', '1', path.join(dir, 'phone-peak.png')]);
          videoHashes['scene/phone-landscape.mp4'] = hash(phone);
        }
        videoHashes[`${view}/arm-lift-return.mp4`] = hash(video);
        checks.push(`${view}: 180-frame export, full decode, event still/encoded correspondence`);
      }
      console.log(`Verified ${view}`);
    }
  } finally {
    await browser.close({silent: true});
    writeFileSync(path.join(output, 'measurements.json'), JSON.stringify({active: audits, reduced: reducedAudits}, null, 2) + '\n');
  }
  assert.equal(audits.length, activeViews.length * frames.length, 'Incomplete audit frame coverage');
  assert.equal(reducedAudits.length, activeViews.length * 7, 'Incomplete actual reduced-motion coverage');
  assert.deepEqual(Object.fromEntries(files.map(p => [p, hash(p)])), fingerprint, 'Implementation changed during render');
  const artifacts = Object.fromEntries(readdirSync(output, {recursive: true, withFileTypes: true}).filter(entry => entry.isFile())
    .map(entry => {const file = path.join(entry.parentPath, entry.name); return [path.relative(output, file), hash(file)];}));
  writeFileSync(path.join(output, 'evidence.json'), JSON.stringify({scope: 'Small source-based arm proof; human motion approval pending',
    fps: 30, durationSeconds: 6, frames, views: activeViews, fingerprint, checks, videoHashes, tools, compositionMetadata, artifacts,
    playback: 'No watched/listened-to normal-speed playback claimed; encoded frame inspection is separate.', humanApproval: 'pending'}, null, 2) + '\n');
  console.log(output);
}

main().catch(error => {console.error(error); process.exitCode = 1;});
