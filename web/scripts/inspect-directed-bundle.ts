import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { loadVerifiedBundle, reusableRender, directedRendererDigest } from "../lib/video/review-bundle";
import { digest, objectDigest, writeJson } from "../lib/video/stage-cache";
import { libraryDiversity } from "../lib/video/library-direction";
import { libraryArtworkClock } from "../lib/video/library-artwork-clock";

const AUDIO_CHECK = { sampleRate: 8000, windowSeconds: .2, hopSeconds: .1, speechRmsFloor: .001, minimumCorrelation: .98, maximumRmsRelativeError: .1, maximumUnexpectedSilenceRms: .004 };

function decodedAudio(filename: string): Float32Array {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", filename, "-vn", "-ac", "1", "-ar", String(AUDIO_CHECK.sampleRate), "-f", "f32le", "-"], { maxBuffer: 128 * 1024 * 1024 });
  const values = new Float32Array(pcm.length / 4);
  for (let i = 0; i < values.length; i++) values[i] = pcm.readFloatLE(i * 4);
  return values;
}

function localWaveformChecks(original: Float32Array, encoded: Float32Array) {
  const size = Math.round(AUDIO_CHECK.windowSeconds * AUDIO_CHECK.sampleRate);
  const hop = Math.round(AUDIO_CHECK.hopSeconds * AUDIO_CHECK.sampleRate);
  const starts: number[] = [];
  for (let start = 0; start + size <= original.length; start += hop) starts.push(start);
  if (original.length >= size && starts.at(-1) !== original.length - size) starts.push(original.length - size);
  const failures: { startSeconds: number; correlation: number; originalRms: number; encodedRms: number; rmsRelativeError: number | null; reason: string }[] = [];
  let activeWindows = 0, minimumCorrelation = 1, maximumRmsRelativeError = 0, strongestWindowStart = 0, strongestRms = 0;
  for (const start of starts) {
    let x = 0, y = 0, xx = 0, yy = 0, xy = 0;
    for (let i = start; i < start + size; i++) {
      const a = original[i]!, b = encoded[i] ?? 0;
      x += a; y += b; xx += a * a; yy += b * b; xy += a * b;
    }
    const originalRms = Math.sqrt(xx / size), encodedRms = Math.sqrt(yy / size);
    const denominator = Math.sqrt(Math.max(0, (size * xx - x * x) * (size * yy - y * y)));
    const correlation = denominator > 0 ? (size * xy - x * y) / denominator : 0;
    const rmsRelativeError = originalRms > 0 ? Math.abs(encodedRms / originalRms - 1) : null;
    if (originalRms > strongestRms) { strongestRms = originalRms; strongestWindowStart = start; }
    let reason = "";
    if (originalRms >= AUDIO_CHECK.speechRmsFloor) {
      activeWindows++;
      minimumCorrelation = Math.min(minimumCorrelation, correlation);
      maximumRmsRelativeError = Math.max(maximumRmsRelativeError, rmsRelativeError ?? Infinity);
      if (!Number.isFinite(correlation) || correlation < AUDIO_CHECK.minimumCorrelation || rmsRelativeError === null || !Number.isFinite(rmsRelativeError) || rmsRelativeError > AUDIO_CHECK.maximumRmsRelativeError) reason = "local speech waveform or energy differs";
    } else if (!Number.isFinite(encodedRms) || encodedRms > AUDIO_CHECK.maximumUnexpectedSilenceRms) reason = "unexpected audio in a source-silence window";
    if (reason) failures.push({ startSeconds: start / AUDIO_CHECK.sampleRate, correlation, originalRms, encodedRms, rmsRelativeError, reason });
  }
  return { passed: activeWindows > 0 && failures.length === 0, parameters: AUDIO_CHECK, windows: starts.length, activeWindows,
    minimumCorrelation, maximumRmsRelativeError, strongestWindowStart, failureCount: failures.length, failures };
}

const calibrationIndex = process.argv.indexOf("--calibrate-audio");
if (calibrationIndex >= 0) {
  const [reference, candidate, reportFile] = process.argv.slice(calibrationIndex + 1);
  assert.ok(reference && candidate && reportFile, "--calibrate-audio <reference.wav> <AAC file or MP4> <report.json>");
  const original = decodedAudio(reference), encoded = decodedAudio(candidate);
  const baseline = localWaveformChecks(original, encoded);
  const start = Math.min(baseline.strongestWindowStart, encoded.length - AUDIO_CHECK.sampleRate);
  const omitted = encoded.slice(); omitted.fill(0, start, start + AUDIO_CHECK.sampleRate);
  const omission = localWaveformChecks(original, omitted);
  const corrupted = encoded.slice();
  for (let i = start; i < start + AUDIO_CHECK.sampleRate * .1; i++) corrupted[i] = -corrupted[i]!;
  const corruption = localWaveformChecks(original, corrupted);
  const report = { verifiedAt: new Date().toISOString(), inspectorDigest: digest(readFileSync(new URL(import.meta.url))), reference, candidate, referenceDigest: digest(readFileSync(reference)), candidateDigest: digest(readFileSync(candidate)),
    baseline, syntheticOneSecondOmission: { startSeconds: start / AUDIO_CHECK.sampleRate, ...omission }, synthetic100msPolarityCorruption: { startSeconds: start / AUDIO_CHECK.sampleRate, ...corruption },
    note: "Local comparison of decoded waveforms after the same downsampling; not cryptographic identity of lossy audio. Synthetic corruptions exist in memory only." };
  writeJson(reportFile, report);
  console.log(JSON.stringify({ baselinePassed: baseline.passed, minimumCorrelation: baseline.minimumCorrelation, maximumRmsRelativeError: baseline.maximumRmsRelativeError,
    activeWindows: baseline.activeWindows, omissionRejected: !omission.passed, corruptionRejected: !corruption.passed, reportFile }));
  assert.ok(baseline.passed, "Reference AAC calibration must pass local waveform checks");
  assert.ok(!omission.passed && !corruption.passed, "Local omission and short waveform corruption must be rejected");
  process.exit(0);
}

const directory = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: inspect-directed-bundle.ts <rendered bundle directory>");
const { props, manifest } = loadVerifiedBundle(directory);
assert.ok(reusableRender(directory, manifest), "Rendered MP4 must match current renderer and manifest");
const rendererDigest = directedRendererDigest();
const inspectorDigest = digest(readFileSync(new URL(import.meta.url)));
const manifestAtStart = objectDigest(manifest);
const video = path.join(directory, "video.mp4");
const inspectionRoot = path.join(directory, "encoded-inspection");
mkdirSync(inspectionRoot, { recursive: true });
const output = mkdtempSync(path.join(inspectionRoot, "run-"));
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", video], { encoding: "utf8" }));
const videoStream = probe.streams.find((stream: any) => stream.codec_type === "video");
const audioStream = probe.streams.find((stream: any) => stream.codec_type === "audio");
const frameCount = Math.ceil(props.direction.totalSeconds * 30);
assert.equal(probe.streams.length, 2);
assert.ok(videoStream, "Complete candidate must contain video");
assert.ok(audioStream, "Complete candidate must contain narration");
assert.equal(videoStream.codec_name, "h264");
assert.equal(audioStream.codec_name, "aac");
assert.equal(videoStream.width, 1280);
assert.equal(videoStream.height, 720);
assert.equal(videoStream.avg_frame_rate, "30/1");
assert.equal(Number(videoStream.nb_frames), frameCount);
assert.ok(Math.abs(Number(audioStream.duration) - props.direction.totalSeconds) < .1, "Encoded speech duration must preserve narration clock");
console.log("Decoding every video and audio frame");
execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", video, "-f", "null", "-"], { stdio: "pipe" });

// Global RMS checks coarse timing; overlapping local decoded-waveform checks
// additionally reject brief speech omissions/corruption and gain changes.
function envelope(pcm: Float32Array) {
  const values: number[] = [];
  for (let offset = 0; offset + 160 <= pcm.length; offset += 160) {
    let energy = 0;
    for (let i = 0; i < 160; i++) energy += pcm[offset + i]! ** 2;
    values.push(Math.sqrt(energy / 160));
  }
  return values;
}
const sourcePcm = decodedAudio(path.join(directory, "narration.wav"));
const encodedPcm = decodedAudio(video);
const localAudio = localWaveformChecks(sourcePcm, encodedPcm);
writeJson(path.join(output, "local-audio-check.json"), localAudio);
assert.ok(localAudio.passed, `Encoded narration failed ${localAudio.failureCount} local waveform/energy windows; see ${path.join(output, "local-audio-check.json")}`);
const original = envelope(sourcePcm);
const encoded = envelope(encodedPcm);
function correlation(lag: number) {
  let n = 0, x = 0, y = 0, xx = 0, yy = 0, xy = 0;
  for (let i = Math.max(0, -lag); i < Math.min(original.length, encoded.length - lag); i++) {
    const a = original[i]!, b = encoded[i + lag]!;
    n++; x += a; y += b; xx += a * a; yy += b * b; xy += a * b;
  }
  return (n * xy - x * y) / Math.sqrt((n * xx - x * x) * (n * yy - y * y));
}
const correlations = Array.from({ length: 21 }, (_, i) => ({ offsetSeconds: (i - 10) * .02, correlation: correlation(i - 10) }));
const best = [...correlations].sort((a, b) => b.correlation - a.correlation)[0]!;
assert.ok(correlation(0) > .98, "Encoded narration must match verified speech at the original timing");
assert.ok(Math.abs(best.offsetSeconds) <= .02, "Encoded narration cannot shift away from caption clock");
console.log(`Narration envelope correlation ${correlation(0).toFixed(6)}; best offset ${best.offsetSeconds}s`);

type Sample = { frame: number; label: string; sectionId: string; entryId: string; kind: string };
const samples: Sample[] = [];
function sample(seconds: number, label: string, sectionId: string, entryId: string, kind: string) {
  samples.push({ frame: Math.max(0, Math.min(frameCount - 1, Math.round(seconds * 30))), label, sectionId, entryId, kind });
}
sample(0, "First encoded frame", props.direction.shots[0]!.sectionId, props.direction.shots[0]!.entryId, "boundary");
sample((frameCount - 1) / 30, "Last encoded frame", props.direction.shots.at(-1)!.sectionId, props.direction.shots.at(-1)!.entryId, "boundary");
for (const [index, shot] of props.direction.shots.entries()) {
  const duration = shot.endSeconds - shot.startSeconds;
  sample(shot.startSeconds + Math.min(3.5, duration * .4), shot.headline, shot.sectionId, shot.entryId, "overview");
  for (const beat of shot.artworkBeats ?? []) {
    const period = beat.artworkId === "approved-calling" ? 10.65 : beat.artworkId === "approved-drinking" ? 8 / 1.15 + 2.5 : libraryArtworkClock(beat.artworkId, 0, beat.endSeconds - beat.startSeconds).period;
    for (const t of [.7, 3.5, 6, 9, period + .7, period + 3.5, period + 6]) {
      if (t < beat.endSeconds - beat.startSeconds - .6) sample(beat.startSeconds + t, `${beat.artworkId} +${t.toFixed(2)}s`, shot.sectionId, shot.entryId, "motion");
    }
  }
  if (index > 0) for (const t of [-.5, -.2, 0, .15, .4, .7]) sample(shot.startSeconds + t, `${shot.headline} ${t >= 0 ? "+" : ""}${t}s`, shot.sectionId, shot.entryId, "transition");
}
const frames = [...new Set(samples.map((sample) => sample.frame))].sort((a, b) => a - b);
console.log(`Extracting ${frames.length} encoded frames for all entries, repeated motions and transitions`);
// ffmpeg's expression parser exhausts its nesting budget on a long flat sum.
// A balanced tree preserves the exact selected frame set with logarithmic depth.
function selectionExpression(selected: number[]): string {
  if (selected.length === 1) return `eq(n\\,${selected[0]})`;
  const middle = Math.floor(selected.length / 2);
  return `(${selectionExpression(selected.slice(0, middle))}+${selectionExpression(selected.slice(middle))})`;
}
execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `select=${selectionExpression(frames)}`,
  "-fps_mode", "vfr", "-y", path.join(output, "frame-%04d.png")], { stdio: "pipe" });
const filenames = new Map(frames.map((frame, index) => [frame, `frame-${String(index + 1).padStart(4, "0")}.png`]));
assert.deepEqual(readdirSync(output).filter((name) => /^frame-\d+\.png$/.test(name)).sort(), [...filenames.values()].sort(), "Exactly the requested encoded frames must be newly extracted");
const frameDigests = Object.fromEntries([...filenames.values()].map((filename) => [filename, digest(readFileSync(path.join(output, filename)))]));
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
async function sheet(selected: Sample[], filename: string) {
  const width = 320, height = 204, columns = 4;
  const overlays: sharp.OverlayOptions[] = [];
  for (const [i, item] of selected.entries()) {
    const left = i % columns * width, top = Math.floor(i / columns) * height;
    overlays.push({ input: await sharp(path.join(output, filenames.get(item.frame)!)).resize(width, 180).png().toBuffer(), left, top });
    overlays.push({ input: Buffer.from(`<svg width="320" height="24"><rect width="320" height="24" fill="#f4f7f6"/><text x="6" y="16" font-family="Arial" font-size="11" fill="#1c2b45">${escape(`${(item.frame / 30).toFixed(2)}s · ${item.label}`.slice(0, 170))}</text></svg>`), left, top: top + 180 });
  }
  await sharp({ create: { width: width * columns, height: height * Math.ceil(selected.length / columns), channels: 4, background: "#f4f7f6" } }).composite(overlays).png().toFile(path.join(output, filename));
}
await sheet(samples.filter((sample) => sample.kind === "overview"), "contact-sheet.png");
for (const section of manifest.sections as string[]) {
  await sheet(samples.filter((sample) => sample.sectionId === section && sample.kind !== "overview"), `${section}-motion-transitions.png`);
}
for (const item of samples.filter((sample) => sample.kind === "overview")) {
  await sharp(path.join(output, filenames.get(item.frame)!)).resize(640, 360).png().toFile(path.join(output, `${item.entryId}-phone.png`));
}
assert.equal(directedRendererDigest(), rendererDigest, "Renderer changed during encoded inspection");
assert.equal(digest(readFileSync(new URL(import.meta.url))), inspectorDigest, "Inspector changed during inspection");
const current = loadVerifiedBundle(directory);
assert.equal(objectDigest(current.manifest), manifestAtStart, "Source, prepared files, video identity or manifest changed during inspection");
assert.ok(reusableRender(directory, current.manifest), "Video changed during inspection");
const diversity = libraryDiversity(props.direction.shots);
assert.deepEqual(diversity.repeatedArtwork, [], "Candidate cannot recycle artwork between source beats");
const evidence = { version: 2, verifiedAt: new Date().toISOString(), artifactsDirectory: output, inspectorDigest, manifestDigest: manifestAtStart,
  sourceDigest: manifest.sourceDigest, bundleFiles: manifest.files, videoDigest: digest(readFileSync(video)), rendererDigest,
  propsDigest: manifest.files["props.json"], completeVideoAndAudioDecodePassed: true, durationSeconds: props.direction.totalSeconds,
  frameCount, encodedSamples: frames.length, dimensions: [1280, 720], phoneDimensions: [640, 360],
  narrationEnvelope: { windowSeconds: .02, zeroOffsetCorrelation: correlation(0), best, testedOffsets: correlations },
  narrationLocalWaveform: localAudio,
  speechVerification: "All nine source/speech/timing reports validated by loadVerifiedBundle; global envelope timing and overlapping local decoded-waveform/energy checks additionally compare encoded audio. Lossy audio is not cryptographically identical to PCM.",
  diversity, samples: samples.map((sample) => ({ ...sample, file: filenames.get(sample.frame), sha256: frameDigests[filenames.get(sample.frame)!] })),
  motionReview: "Encoded samples prepared for inspection; sample extraction does not automatically establish human visual approval.",
  humanVisualApproval: "pending", clinicalApproval: "not-established" };
writeJson(path.join(output, "evidence.json"), evidence);
writeJson(path.join(inspectionRoot, "evidence.json"), evidence);
console.log(`Complete encoded inspection evidence: ${path.join(output, "evidence.json")}`);
