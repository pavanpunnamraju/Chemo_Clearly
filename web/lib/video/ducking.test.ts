// Regression test for the auto-ducking envelope (Phase 2a #7). No
// framework; run directly with tsx. Run: npm run test:ducking

import assert from "node:assert/strict";
import { computeDuckingEnvelope } from "./ducking";

const SAMPLE_RATE = 24000;

function makeWav(pcm: Buffer, sampleRateHertz = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRateHertz, 24);
  header.writeUInt32LE(sampleRateHertz * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function silencePcm(seconds: number): Buffer {
  return Buffer.alloc(Math.round(seconds * SAMPLE_RATE) * 2, 0);
}

function loudTonePcm(seconds: number): Buffer {
  const numSamples = Math.round(seconds * SAMPLE_RATE);
  const pcm = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const value = Math.round(20000 * Math.sin((i / SAMPLE_RATE) * 440 * 2 * Math.PI));
    pcm.writeInt16LE(value, i * 2);
  }
  return pcm;
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const silenceEnvelope = computeDuckingEnvelope(makeWav(silencePcm(1)));
assert.ok(average(silenceEnvelope.values) > 0.9, "all-silence should stay near the open multiplier");

const loudEnvelope = computeDuckingEnvelope(makeWav(loudTonePcm(1)));
assert.ok(average(loudEnvelope.values) < 0.4, "all-loud-tone should duck near the ducked multiplier");

console.log("ducking.test: ok");
