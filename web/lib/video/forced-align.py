"""Local acoustic alignment of supplied text. This does NOT verify speech fidelity.

Pinned runtime: Python 3.11, torch/torchaudio 2.8.0, numpy 2.2.6. Uses the
official Wav2Vec2 960h CTC model and TorchAudio's forced_align/merge_tokens APIs.
The model and every input stay local after a one-time official model download.
"""
import argparse
import hashlib
import json
import math
import os
import re
import sys
import unicodedata
import wave
from pathlib import Path


SMALL = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "zero ten twenty thirty forty fifty sixty seventy eighty ninety".split()
MODEL_FILE = "wav2vec2_fairseq_base_ls960_asr_ls960.pth"
MODEL_SHA256 = "488fd4f16de84438ffc945334278c1b9fb9b7159a806c1080b16111a958c945d"


def verify_model(model_directory):
    checkpoint = Path(model_directory).resolve() / "hub" / "checkpoints" / MODEL_FILE
    digest = hashlib.sha256()
    with checkpoint.open("rb") as model_file:
        for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != MODEL_SHA256:
        raise ValueError("Acoustic model checksum mismatch. Re-run the reviewed model setup.")


def integer_words(value):
    if value < 20:
        return SMALL[value]
    if value < 100:
        return TENS[value // 10] + (" " + SMALL[value % 10] if value % 10 else "")
    if value < 1000:
        return SMALL[value // 100] + " hundred" + (" " + integer_words(value % 100) if value % 100 else "")
    if value < 1_000_000:
        return integer_words(value // 1000) + " thousand" + (" " + integer_words(value % 1000) if value % 1000 else "")
    raise ValueError("Expand numbers of one million or greater explicitly in narration.")


def numeric_words(match):
    raw = match.group(0).replace(",", "")
    if raw == "911":
        return "nine one one"
    whole, *decimal = raw.split(".")
    result = integer_words(int(whole))
    if decimal:
        result += " point " + " ".join(SMALL[int(digit)] for digit in decimal[0])
    return result


def spoken_form(text):
    text = unicodedata.normalize("NFKD", text).replace("’", "'")
    text = re.sub(r">=|≥", " greater than or equal to ", text)
    text = re.sub(r"<=|≤", " less than or equal to ", text)
    text = text.replace(">", " greater than ").replace("<", " less than ")
    text = text.replace("=", " equals ").replace("+", " plus ")
    text = re.sub(r"^-(?=\d)", "minus ", text)
    text = re.sub(r"(\d)[–—-](?=\d)", r"\1 to ", text)
    text = re.sub(r"°\s*[fF]\b", " degrees fahrenheit", text)
    text = re.sub(r"°\s*[cC]\b", " degrees celsius", text)
    text = text.replace("%", " percent").replace("°", " degrees")
    text = re.sub(r"\d+(?:,\d{3})*(?:\.\d+)?", numeric_words, text)
    text = re.sub(r"\bAC-T\b", "A C T", text, flags=re.IGNORECASE)
    text = re.sub(r"\bIV\b", "I V", text)
    # Plain punctuation is not spoken; preserve all source spellings separately.
    return " ".join(re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text)).upper()


def align(audio_file, script, model_directory):
    import numpy as np
    import torch
    import torchaudio

    if torch.__version__.split("+")[0] != "2.8.0" or torchaudio.__version__.split("+")[0] != "2.8.0":
        raise ValueError("Acoustic alignment requires pinned torch and torchaudio 2.8.0.")
    verify_model(model_directory)
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    torch.hub.set_dir(str(Path(model_directory).resolve() / "hub"))
    bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
    model = bundle.get_model(dl_kwargs={"progress": False}).eval()
    labels = bundle.get_labels()
    dictionary = {label: index for index, label in enumerate(labels)}
    with wave.open(str(audio_file), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError("Forced alignment requires 16-bit mono WAV.")
        rate = wav.getframerate()
        raw = wav.readframes(wav.getnframes())
    samples = torch.from_numpy(np.frombuffer(raw, dtype="<i2").copy()).float() / 32768
    if not samples.numel() or torch.count_nonzero(samples) == 0:
        raise ValueError("Audio is empty or digital silence; no speech can be aligned.")
    duration = samples.numel() / rate
    if rate != bundle.sample_rate:
        samples = torchaudio.functional.resample(samples, rate, bundle.sample_rate)
    # Inference has 20ms stride and a 400-sample receptive field. Use 20s cores
    # with 1s context, keeping the original global frame lattice at each seam.
    stride, core, context = 320, 320_000, 16_000
    emission_parts = []
    with torch.inference_mode():
        for core_start in range(0, samples.numel(), core):
            core_end = min(core_start + core, samples.numel())
            audio_start = max(0, core_start - context)
            audio_end = min(samples.numel(), core_end + context)
            emission, _ = model(samples[audio_start:audio_end].unsqueeze(0))
            emission = emission[0].log_softmax(-1).cpu()
            first_frame = (core_start - audio_start) // stride
            end_frame = math.ceil((core_end - audio_start) / stride)
            emission_parts.append(emission[first_frame:end_frame])
    emission = torch.cat(emission_parts).contiguous()

    original = script.split()
    normalized = [spoken_form(word) for word in original]
    character_owners = []
    target_text = ""
    for index, text in enumerate(normalized):
        if not text:
            continue
        if target_text:
            target_text += "|"
            character_owners.append(None)
        for character in text.replace(" ", "|"):
            target_text += character
            character_owners.append(index if character != "|" else None)
    if not target_text:
        raise ValueError("No alignable text.")
    target = torch.tensor([[dictionary[character] for character in target_text]], dtype=torch.int64)
    paths, scores = torchaudio.functional.forced_align(emission.unsqueeze(0), target, blank=0)
    spans = torchaudio.functional.merge_tokens(paths[0], scores[0].exp(), blank=0)
    if len(spans) != len(character_owners) or any(span.token != dictionary[char] for span, char in zip(spans, target_text)):
        raise ValueError("Acoustic alignment did not preserve every target character.")
    by_word = [[] for _ in original]
    for span, owner in zip(spans, character_owners):
        if owner is not None:
            by_word[owner].append(span)
    words = []
    flagged = []
    for index, (text, word_spans) in enumerate(zip(original, by_word)):
        if not word_spans:
            # Nonspoken punctuation is attached to adjacent speech, never estimated.
            neighbor = next((by_word[i] for i in range(index - 1, -1, -1) if by_word[i]), None)
            neighbor = neighbor or next((spans for spans in by_word[index + 1:] if spans), None)
            if not neighbor:
                raise ValueError(f"Unaligned source token {index}: {text}")
            word_spans = neighbor
        start = word_spans[0].start * stride / bundle.sample_rate
        end = word_spans[-1].end * stride / bundle.sample_rate
        acoustic_score = sum(span.score for span in word_spans) / len(word_spans)
        minimum_character_score = min(span.score for span in word_spans)
        word = {"word": text, "startSeconds": start, "endSeconds": end,
                "confidence": None, "acousticScore": acoustic_score,
                "minimumCharacterScore": minimum_character_score,
                "spokenForm": normalized[index], "timingMethod": "ctc-forced"}
        words.append(word)
        # Scores are acoustic path probabilities, NOT ASR correctness confidence.
        # Low values identify spans for independent audio review; they cannot be
        # converted to a recognition confidence or used to approve narration.
        if acoustic_score < 0.65 or minimum_character_score < 0.01:
            flagged.append({"index": index, **word})
    greedy = torch.unique_consecutive(emission.argmax(-1)).tolist()
    greedy_text = "".join(labels[index] for index in greedy if index != 0).replace("|", " ").strip()
    return {"method": "wav2vec2-960h-ctc-v1", "durationSeconds": duration, "words": words,
            "diagnostics": {"sourceTokenCount": len(original), "alignedTokenCount": len(words),
                            "timingResolutionMs": 20, "flaggedSpans": flagged,
                            "independentSpeechVerificationRequired": True,
                            "greedyTranscript": greedy_text,
                            "spokenForms": normalized}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio")
    parser.add_argument("--script-json", help="JSON containing script or value.script.")
    parser.add_argument("--model-directory", required=True)
    parser.add_argument("--output")
    parser.add_argument("--download-model", action="store_true")
    args = parser.parse_args()
    if args.download_model:
        import torch
        import torchaudio
        torch.hub.set_dir(str(Path(args.model_directory).resolve() / "hub"))
        torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H.get_model(dl_kwargs={"progress": False})
        verify_model(args.model_directory)
        print("Official Wav2Vec2 960h acoustic model is ready.")
        sys.exit(0)
    if not args.audio or not args.script_json or not args.output:
        parser.error("--audio, --script-json and --output are required for alignment")
    data = json.loads(Path(args.script_json).read_text())
    data = data.get("value", data)
    result = align(args.audio, data["script"], args.model_directory)
    Path(args.output).write_text(json.dumps(result, indent=2))
    print(json.dumps({"output": args.output, "words": len(result["words"]), "flaggedSpans": len(result["diagnostics"]["flaggedSpans"])}))
