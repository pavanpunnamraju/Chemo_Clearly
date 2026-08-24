// Auto-ducking envelope for the background music bed (Phase 2a #7) — reacts
// to the real narration audio's loudness, not a manual section-boundary
// guess. `wav` is the same WAV container render.ts already builds
// (tts.ts's pcmToWav: 16-bit LINEAR16 PCM, mono, sample rate at header
// bytes 24-27, PCM data starting at byte 44).

export interface DuckingEnvelope {
  stepSeconds: number;
  values: number[];
}

const WINDOW_SECONDS = 0.1;
const SMOOTH_RADIUS_STEPS = 3; // ~300ms ramp at a 100ms step
const DUCKED_VOLUME = 0.3;
const OPEN_VOLUME = 1.0;
// Fraction of this narration's own loudest window — relative, not an
// absolute PCM cutoff, since loudness varies by voice/take.
const THRESHOLD_FRACTION = 0.2;

export function computeDuckingEnvelope(wav: Buffer): DuckingEnvelope {
  const sampleRateHertz = wav.readUInt32LE(24);
  const pcm = wav.subarray(44);
  const samplesPerWindow = Math.max(1, Math.round(WINDOW_SECONDS * sampleRateHertz));
  const totalSamples = pcm.length / 2; // 16-bit mono

  const rmsPerWindow: number[] = [];
  for (let start = 0; start < totalSamples; start += samplesPerWindow) {
    const end = Math.min(start + samplesPerWindow, totalSamples);
    let sumSquares = 0;
    for (let i = start; i < end; i++) {
      const sample = pcm.readInt16LE(i * 2);
      sumSquares += sample * sample;
    }
    rmsPerWindow.push(Math.sqrt(sumSquares / (end - start)));
  }

  const peak = Math.max(0, ...rmsPerWindow);
  const threshold = peak * THRESHOLD_FRACTION;

  const raw = rmsPerWindow.map((rms) => (rms > threshold ? DUCKED_VOLUME : OPEN_VOLUME));

  const smoothed = raw.map((_, i) => {
    const lo = Math.max(0, i - SMOOTH_RADIUS_STEPS);
    const hi = Math.min(raw.length - 1, i + SMOOTH_RADIUS_STEPS);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += raw[j]!;
    return sum / (hi - lo + 1);
  });

  return { stepSeconds: WINDOW_SECONDS, values: smoothed };
}
