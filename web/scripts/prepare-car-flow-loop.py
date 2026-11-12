#!/usr/bin/env python3
"""Prepare a repeatable car clip from Pavan's approved Flow source.

The 24 final source frames settle back to the exact first source frame. The
cloud/sky region reverses after its midpoint so its existing oscillation
returns to its first pose without doubled cloud outlines. Character motion
always plays forward at its approved speed.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / "public/studies/patient-car"
SOURCE = ASSET / "car-flow-approved.mp4"
OUTPUT = ASSET / "car-flow-loop.mp4"
RECIPE = ASSET / "car-loop-edit.json"
SOURCE_SHA256 = "1207ede13934c4b51e0980f6300cb2fa05dc03ad18ff09fe98bc9c42eb9e5e5a"
WIDTH, HEIGHT, FPS, FRAMES = 1920, 1080, 24, 240
BLEND_START = 216
SKY_SOLID_BOTTOM = 360
SKY_FEATHER_BOTTOM = 400
FRAME_BYTES = WIDTH * HEIGHT * 3


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run() -> None:
    actual_source_hash = sha256(SOURCE)
    if actual_source_hash != SOURCE_SHA256:
        raise RuntimeError(f"Approved source hash changed: {actual_source_hash}")

    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,nb_frames",
        "-of", "json", str(SOURCE),
    ]))
    stream = probe["streams"][0]
    if (stream["width"], stream["height"], stream["r_frame_rate"], int(stream["nb_frames"])) != (
        WIDTH, HEIGHT, f"{FPS}/1", FRAMES,
    ):
        raise RuntimeError(f"Unexpected source video format: {stream}")

    decoder = subprocess.Popen([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(SOURCE),
        "-map", "0:v:0", "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ], stdout=subprocess.PIPE)
    encoder = subprocess.Popen([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo",
        "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS),
        "-i", "-", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "16",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUTPUT),
    ], stdin=subprocess.PIPE)
    assert decoder.stdout is not None and encoder.stdin is not None
    try:
        first: np.ndarray | None = None
        sky_cache: list[np.ndarray] = []
        sky_weights = np.linspace(0, 1, SKY_FEATHER_BOTTOM - SKY_SOLID_BOTTOM,
                                  dtype=np.float32).reshape(-1, 1, 1)
        for frame in range(FRAMES):
            data = decoder.stdout.read(FRAME_BYTES)
            if len(data) != FRAME_BYTES:
                raise RuntimeError(f"Source ended at frame {frame}")
            current = np.frombuffer(data, dtype=np.uint8).reshape(HEIGHT, WIDTH, 3).copy()
            if first is None:
                first = current.copy()
            if frame < FRAMES // 2:
                sky_cache.append(current[:SKY_FEATHER_BOTTOM].copy())
            else:
                sky = sky_cache[FRAMES - 1 - frame]
                current[:SKY_SOLID_BOTTOM] = sky[:SKY_SOLID_BOTTOM]
                transition = current[SKY_SOLID_BOTTOM:SKY_FEATHER_BOTTOM]
                current[SKY_SOLID_BOTTOM:SKY_FEATHER_BOTTOM] = np.rint(
                    sky[SKY_SOLID_BOTTOM:SKY_FEATHER_BOTTOM] * (1 - sky_weights)
                    + transition * sky_weights
                ).astype(np.uint8)
            if frame >= BLEND_START:
                # Blend only below sky to avoid double cloud outlines.
                t = (frame - BLEND_START) / (FRAMES - 1 - BLEND_START)
                weight = t * t * (3 - 2 * t)
                current[SKY_FEATHER_BOTTOM:] = np.rint(
                    current[SKY_FEATHER_BOTTOM:] * (1 - weight)
                    + first[SKY_FEATHER_BOTTOM:] * weight
                ).astype(np.uint8)
            encoder.stdin.write(current.tobytes())
        if decoder.stdout.read(1):
            raise RuntimeError("Source has more video frames than expected")
    finally:
        decoder.stdout.close()
        encoder.stdin.close()
    if decoder.wait() or encoder.wait():
        raise RuntimeError("Video decode or encode failed")

    recipe = {
        "source": SOURCE.name,
        "sourceSha256": actual_source_hash,
        "runtime": OUTPUT.name,
        "runtimeSha256": sha256(OUTPUT),
        "width": WIDTH,
        "height": HEIGHT,
        "fps": FPS,
        "frames": FRAMES,
        "durationSeconds": FRAMES / FPS,
        "audio": "removed; use synchronized project narration",
        "edit": {
            "unalteredBelowSkyFrames": [0, BLEND_START - 1],
            "blendFrames": [BLEND_START, FRAMES - 1],
            "blendTarget": "source frame 0 held still below y=400",
            "weight": "smoothstep((frame - 216) / 23)",
            "sky": "frames 0–119 use approved source sky; frames 120–239 use source sky 119–0 in reverse above y=360, with a 40-pixel vertical feather to the forward source. This returns drifting clouds without crossfade double edges; characters/car remain forward.",
            "reason": "Source end is near rest but clouds do not return to their first positions; a whole-frame crossfade produced doubled cloud outlines and a hard restart jumps.",
            "repeatRule": "Play all 240 frames in order and repeat from frame 0. No reversal or skip.",
        },
        "approval": "Pending Pavan review of the derived loop. The source motion is approved.",
    }
    RECIPE.write_text(json.dumps(recipe, indent=2) + "\n")
    print(json.dumps(recipe, indent=2))


if __name__ == "__main__":
    run()
