import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DirectedVideoProps } from "../lib/video/direction-types";
import { renderDirectedVideo } from "../lib/video/render-directed";
import { videoTrackIdentity } from "../lib/video/render-narration-audio";

const DURATION = 4;
const SAMPLE_RATE = 48000;
const ANALYSIS_RATE = 8000;
const sha = (filename: string) => createHash("sha256").update(readFileSync(filename)).digest("hex");
const writeJson = (filename: string, value: unknown) => writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");

/** Deterministic voiced harmonics, changing pitch and syllabic energy, with
 * genuine PCM silence between phrases. This fixture contains no spoken words. */
function syntheticNarration() {
  const samples = SAMPLE_RATE * DURATION;
  const pcm = Buffer.alloc(samples * 2);
  const phrases = [[.3, 1.2], [1.5, 2.4], [2.7, 3.7]] as const;
  let phase = 0;
  for (let i = 0; i < samples; i++) {
    const t = i / SAMPLE_RATE;
    phase += 2 * Math.PI * (133 + 24 * Math.sin(t * 3.71) + 12 * Math.sin(t * 11.3)) / SAMPLE_RATE;
    const phrase = phrases.find(([start, end]) => t >= start && t < end);
    if (!phrase) continue;
    const [start, end] = phrase;
    const edge = Math.min(1, (t - start) / .025, (end - t) / .035);
    const ramp = .5 - .5 * Math.cos(Math.PI * Math.max(0, edge));
    const syllable = .43 + .57 * (.5 + .5 * Math.sin(t * 2 * Math.PI * (4.1 + .23 * t))) ** 2;
    const voice = Math.sin(phase) + .43 * Math.sin(phase * 2 + .3) + .22 * Math.sin(phase * 3 + .7) + .13 * Math.sin(phase * 5 + 1.1);
    pcm.writeInt16LE(Math.round(voice * ramp * syllable * .24 * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function decode(filename: string) {
  const bytes = execFileSync("ffmpeg", ["-v", "error", "-i", filename, "-vn", "-ac", "1", "-ar", String(ANALYSIS_RATE), "-f", "f32le", "-"], { maxBuffer: 8 * 1024 * 1024 });
  return Float32Array.from({ length: bytes.length / 4 }, (_, i) => bytes.readFloatLE(i * 4));
}

function correlation(source: Float32Array, encoded: Float32Array, lag: number) {
  let x = 0, y = 0, xx = 0, yy = 0, xy = 0, count = 0;
  for (let i = Math.max(0, -lag); i < Math.min(source.length, encoded.length - lag); i++) {
    const a = source[i]!, b = encoded[i + lag]!;
    x += a; y += b; xx += a * a; yy += b * b; xy += a * b; count++;
  }
  return (count * xy - x * y) / Math.sqrt((count * xx - x * x) * (count * yy - y * y));
}

async function main() {
  const output = path.resolve("out/audio-export-regression");
  mkdirSync(output, { recursive: true });
  const inspector = path.resolve("scripts/inspect-directed-bundle.ts");
  const inspectorDigest = sha(inspector);
  const implementationFiles = ["lib/video/render-directed.ts", "lib/video/render-narration-audio.ts", "scripts/check-directed-audio-export.ts"];
  const implementationDigests = Object.fromEntries(implementationFiles.map((file) => [file, sha(path.resolve(file))]));
  const props: DirectedVideoProps = {
    audioSrc: "narration.wav", captionsEnabled: true, reducedMotion: true,
    captions: [{ text: "Technical audio test. No spoken words.", startSeconds: 0, endSeconds: DURATION }],
    direction: {
      version: "audio-export-regression-1", regimenId: "technical-preview", regimenTitle: "Technical audio export preview", method: "authored", totalSeconds: DURATION,
      shots: [{ id: "audio-fixture", entryId: "audio-fixture", sectionId: "big_picture", startSeconds: 0, endSeconds: DURATION, cueSeconds: .4,
        scene: "outlook", assetId: "patient-observe", action: "observe", camera: "establish", staging: "left", transition: "settle",
        headline: "Technical audio export preview", message: "A four-second synthetic fixture.", sourceRefs: ["synthetic-audio-fixture"],
        rationale: "Technical export regression only; no medical narration or clinical claim.", focus: { x: .5, y: .5 }, labels: [],
        artworkBeats: [{ artworkId: "care-journal", startSeconds: 0, endSeconds: DURATION, sourceRef: "synthetic-audio-fixture:preview", rationale: "Stationary object for a technical audio fixture." }],
      }],
    },
  };
  const wav = syntheticNarration();
  const narration = path.join(output, "narration.wav");
  const video = path.join(output, "video.mp4");
  writeFileSync(narration, wav);
  writeJson(path.join(output, "props.json"), props);
  console.log("Rendering the synthetic fixture through renderDirectedVideo.");
  await renderDirectedVideo(props, wav, video);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", video], { encoding: "utf8" }));
  writeJson(path.join(output, "ffprobe.json"), probe);
  assert.equal(probe.streams.length, 2);
  const image = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
  const audio = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "audio");
  assert.equal(image.codec_name, "h264"); assert.equal(audio.codec_name, "aac");
  assert.equal(image.width, 1280); assert.equal(image.height, 720); assert.equal(image.avg_frame_rate, "30/1");
  assert.equal(Number(image.nb_frames), 120); assert.equal(Number(image.duration), DURATION);
  assert.equal(Number(audio.duration), DURATION); assert.equal(Number(audio.start_time), 0);
  assert.equal(Number(audio.sample_rate), SAMPLE_RATE); assert.equal(audio.channels, 2);
  execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", video, "-f", "null", "-"], { stdio: "pipe" });
  const calibrationFile = path.join(output, "audio-calibration.json");
  const calibrationOutput = execFileSync(process.execPath, ["--import", "tsx", inspector, "--calibrate-audio", narration, video, calibrationFile], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  console.log(calibrationOutput.trim());
  assert.equal(sha(inspector), inspectorDigest, "Frozen inspector changed during regression");
  const calibration = JSON.parse(readFileSync(calibrationFile, "utf8"));
  assert.ok(calibration.baseline.passed && !calibration.syntheticOneSecondOmission.passed && !calibration.synthetic100msPolarityCorruption.passed);
  const original = decode(narration), encoded = decode(video);
  assert.equal(original.length, DURATION * ANALYSIS_RATE);
  assert.ok(encoded.length >= original.length && encoded.length <= original.length + ANALYSIS_RATE * .025, "Only AAC trailing padding may extend the decoded PCM");
  // Search every decoded sample in ±80 ms, including the previously observed
  // 42.6 ms export delay; unlike an envelope-only check, this resolves 0.125 ms.
  const offsets = Array.from({ length: 1281 }, (_, index) => ({ offsetSamples: index - 640, correlation: correlation(original, encoded, index - 640) }));
  const best = [...offsets].sort((a, b) => b.correlation - a.correlation)[0]!;
  assert.equal(best.offsetSamples, 0, "Exported narration moved away from the original audio clock");
  assert.ok(best.correlation > .98);
  const silentGaps = [[.05, .25], [1.25, 1.45], [2.45, 2.65], [3.75, 3.95]].map(([start, end]) => {
    const rms = (values: Float32Array) => {
      const from = Math.round(start! * ANALYSIS_RATE), to = Math.round(end! * ANALYSIS_RATE);
      let energy = 0;
      for (let i = from; i < to; i++) energy += values[i]! ** 2;
      return Math.sqrt(energy / (to - from));
    };
    const originalRms = rms(original), encodedRms = rms(encoded);
    assert.ok(originalRms < 1e-8 && encodedRms < .0001, "Silence gap was filled or shifted");
    return { startSeconds: start, endSeconds: end, originalRms, encodedRms, passed: true };
  });
  const finalVideoTrack = await videoTrackIdentity(video);
  execFileSync("ffmpeg", ["-v", "error", "-i", video, "-frames:v", "1", "-y", path.join(output, "preview.png")], { stdio: "pipe" });
  for (const [filename, digest] of Object.entries(implementationDigests)) assert.equal(sha(path.resolve(filename)), digest, "Export implementation changed during regression");
  const evidence = {
    version: 1, verifiedAt: new Date().toISOString(), technicalRegressionOnly: true, clinicalApproval: "not-applicable", candidateVideo: false,
    fixture: { seconds: DURATION, sampleRate: SAMPLE_RATE, format: "mono PCM16 WAV", speechLikeHarmonics: true, spokenWords: false, silentGaps },
    actualRenderDirectedVideoCompleted: true, exportPath: "muted Remotion video followed by one encode of the original WAV through muxNarrationAudio",
    internalVideoTrackAndPacketTimingGuardCompleted: true, finalVideoTrack,
    encoded: { frames: 120, seconds: DURATION, dimensions: [1280, 720], audioSampleRate: SAMPLE_RATE, audioChannels: 2, audioStartSeconds: Number(audio.start_time), completeVideoAndAudioDecodePassed: true, decodedPcmSamples: encoded.length },
    localAudio: { ...calibration.baseline, syntheticOneSecondOmissionRejected: !calibration.syntheticOneSecondOmission.passed, synthetic100msCorruptionRejected: !calibration.synthetic100msPolarityCorruption.passed },
    alignment: { bestOffsetSamples: best.offsetSamples, bestOffsetSeconds: best.offsetSamples / ANALYSIS_RATE, zeroOffsetCorrelation: best.correlation, searchedOffsetSeconds: [-.08, .08], resolutionSeconds: 1 / ANALYSIS_RATE, testedOffsets: offsets },
    inspectorDigest, implementationFiles: implementationDigests,
    files: Object.fromEntries(["narration.wav", "props.json", "video.mp4", "audio-calibration.json", "ffprobe.json", "preview.png"].map((file) => [file, sha(path.join(output, file))])),
    note: "Lossy AAC waveform similarity is measured, not asserted as byte identity. Silent gaps exclude codec boundary ringing. The source fixture is synthetic and is not a patient candidate.",
  };
  writeJson(path.join(output, "evidence.json"), evidence);
  console.log(JSON.stringify({ output, frames: 120, seconds: DURATION, localWindows: calibration.baseline.windows, minimumLocalCorrelation: calibration.baseline.minimumCorrelation, bestOffsetSeconds: 0, silentGapChecks: silentGaps.length, corruptionAndOmissionRejected: true }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
