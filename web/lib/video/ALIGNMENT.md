# Acoustic timing and speech verification

The directed pipeline uses two distinct checks. Independent speech review compares
the actual audio with the approved narration. Local CTC forced alignment then locates
the provided text in acoustic frames. A forced aligner can assign timestamps to an
incorrect medicine name: complete timing coverage does **not** prove speech fidelity.
Keep speech review, timing diagnostics, and pending human listening review separate.

## Setup

From `web/`, with Node, `uv`, and Python 3.11 available:

```sh
node --import tsx lib/video/setup-alignment.ts
```

Setup installs the versions in `alignment-requirements.txt` into
`.video-cache/alignment-venv` and downloads the official Wav2Vec2 960h acoustic model
(approximately 360 MB) into `.video-cache/torch`. The model SHA-256 is pinned in
`forced-align.py` and verified before inference. Install the environment and model in
the deployment image; do not run downloads on a patient request. Runtime overrides
`CHEMO_ALIGNMENT_PYTHON` and `CHEMO_ALIGNMENT_MODELS` support an externally provisioned
environment/model directory. Inference itself sends no audio or text over the network.

TorchAudio 2.8 is deliberately pinned: the forced-alignment API was removed in 2.9.
Upgrades require explicit migration and regression checks. For Linux CPU deployment,
select the official PyTorch CPU wheels to avoid downloading unused CUDA packages.

## Contract

`forceAlignNarration(audioBuffer, chunks, sampleRate)` returns `{timing, alignment}`.
`timing` has the exact source words, measured starts/ends, entry ranges, and mechanical
coverage diagnostics. `alignment` retains 20 ms resolution, acoustic path scores,
low-score spans, the unconstrained acoustic transcript, and the spoken-form expansion
of every source token. Number normalization preserves thresholds and decimal zeros.
No drug-name fuzzy matching or proportional timestamp interpolation is used.

Acoustic scores are **not calibrated recognition confidence**; `confidence` stays
`null`. Spans below the documented acoustic-score thresholds are flagged for review,
not relabeled as correct or silently removed. All candidate review artifacts must
retain these flags and a human-listening status. The existing strict recognizer-based
path remains available for legacy workflows.

## Verification

```sh
node --import tsx lib/video/timing.test.ts
python3 lib/video/forced-align.test.py
```

The normalization tests use no model/network. Real alignment and speech-fidelity
benchmarks are separate artifacts because fabricated word offsets cannot establish
acoustic correctness. The initial overview benchmark aligned 118 source words, with
five flagged acoustic spans; the independent review correctly rejected an actual
prednisone/prednisolone substitution despite complete forced-alignment coverage.

Primary references:

- [TorchAudio forced alignment](https://docs.pytorch.org/audio/2.8.0/tutorials/forced_alignment_tutorial.html)
- [CTC forced-alignment API](https://docs.pytorch.org/audio/2.8.0/generated/torchaudio.functional.forced_align.html)
- [WhisperX's use of forced alignment](https://github.com/m-bain/whisperX)
