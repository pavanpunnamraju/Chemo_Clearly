import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

async function commandDigest(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const hash = createHash("sha256");
    let errorText = "";
    child.stdout.on("data", (data: Buffer) => hash.update(data));
    child.stderr.on("data", (data: Buffer) => { errorText = (errorText + data.toString()).slice(-6000); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(hash.digest("hex")) : reject(new Error(`${command} exited ${code}: ${errorText}`)));
  });
}

/** Bind every encoded H.264 byte and every packet's presentation/decode time.
 * Container metadata may change during muxing; the visual track may not. */
export async function videoTrackIdentity(filename: string) {
  const [bitstreamDigest, packetTimingDigest] = await Promise.all([
    commandDigest("ffmpeg", ["-v", "error", "-i", filename, "-map", "0:v:0", "-c:v", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "h264", "-"]),
    commandDigest("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,dts_time,duration_time,size,flags", "-of", "csv=p=0", filename]),
  ]);
  return { bitstreamDigest, packetTimingDigest };
}

/** Encode verified PCM once. Remotion's intermediate AAC concatenation can add
 * two AAC frames of leading delay. The final mux must use the original WAV,
 * never that intermediate audio, and must preserve all rendered video packets. */
export async function muxNarrationAudio(videoPath: string, audioBuffer: Buffer, outputPath = videoPath) {
  if (!audioBuffer.length) throw new Error("Narration mux requires the verified source WAV");
  const before = await videoTrackIdentity(videoPath);
  const temporary = mkdtempSync(path.join(path.dirname(outputPath), ".narration-mux-"));
  const narration = path.join(temporary, "narration.wav");
  const candidate = path.join(temporary, "candidate.mp4");
  try {
    writeFileSync(narration, audioBuffer);
    await commandDigest("ffmpeg", ["-v", "error", "-xerror", "-i", videoPath, "-i", narration,
      "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "320k",
      "-movflags", "+faststart", "-y", candidate]);
    const after = await videoTrackIdentity(candidate);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Narration mux changed the rendered video track or its timing");
    renameSync(candidate, outputPath);
    return { videoTrack: after, sampleRate: 48000, channels: 2, audioBitrate: "320k", source: "verified-original-WAV", singleAacEncode: true };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
