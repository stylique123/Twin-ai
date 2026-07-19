#!/usr/bin/env python3
"""Editor v2 Phase 5 — speech analysis bridge (faster-whisper + Silero VAD).

Produces the RAW evidence for the immutable `speech` component:
  * word-level transcription WITH per-word probabilities (the actual
    recording — never a script), language + language probability
  * Silero VAD speech regions over the SOURCE timeline
  * a coarse RMS energy curve

Determinism: greedy decoding (beam_size=1) at temperature 0 with
condition_on_previous_text=False is deterministic for fixed
(model, audio bytes) — the analyzer bundle version (EDITOR_SPEECH_VERSION)
pins this script + model combination, so one version always reproduces the
same output for the same bytes. No refiner ladder here on purpose: the
caption-oriented ladder in whisper_transcribe.py falls back depending on
what is installed, which would make component content environment-dependent.

vad_filter stays OFF for transcription so word timestamps remain on the
source timeline; VAD runs separately as evidence.

Exit codes: 0 ok, 2 media too long, 1 any other failure.
"""
import argparse
import json
import sys


def rms_energy(audio, sample_rate, window_ms):
    """Coarse RMS curve over fixed windows (bounded by audio length)."""
    import numpy as np

    win = max(1, int(sample_rate * window_ms / 1000))
    n = len(audio) // win
    out = []
    for i in range(n):
        chunk = audio[i * win:(i + 1) * win]
        out.append(round(float(np.sqrt(np.mean(np.square(chunk, dtype=np.float64)))), 4))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)   # mono 16k wav (worker-extracted)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="base")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--language", default="en")  # ISO code, or "auto" to detect
    ap.add_argument("--beam-size", type=int, default=1)
    ap.add_argument("--max-seconds", type=int, default=1800)
    ap.add_argument("--energy-window-ms", type=int, default=200)
    args = ap.parse_args()

    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    compute_type = "float16" if args.device == "cuda" else "int8"
    lang = None if args.language.lower() in ("auto", "", "detect") else args.language

    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)
    segments_iter, info = model.transcribe(
        args.audio,
        word_timestamps=True,
        beam_size=args.beam_size,
        temperature=0,
        language=lang,
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
        vad_filter=False,  # timestamps must stay on the source timeline
    )
    if info.duration and info.duration > args.max_seconds:
        print(f"media too long: > {args.max_seconds}s", file=sys.stderr)
        return 2

    words, segments, text_parts = [], [], []
    for seg in segments_iter:
        segments.append({"start": round(seg.start, 3), "end": round(seg.end, 3), "text": seg.text.strip()})
        text_parts.append(seg.text)
        for w in (seg.words or []):
            t = (w.word or "").strip()
            if not t or w.end < w.start:
                continue
            words.append({
                "w": t,
                "start": round(w.start, 3),
                "end": round(w.end, 3),
                "p": round(float(getattr(w, "probability", 0.0) or 0.0), 3),
            })

    # Silero VAD evidence + RMS energy over the same decoded samples.
    sample_rate = 16000
    audio = decode_audio(args.audio, sampling_rate=sample_rate)
    # Explicit, pinned VAD options: the library default min_silence of 2000ms
    # swallows exactly the pauses the editor cares about. 300ms resolution
    # with a 100ms pad keeps region edges close to the true speech onsets.
    vad_options = VadOptions(min_silence_duration_ms=300, speech_pad_ms=100, min_speech_duration_ms=250)
    vad = [
        {"start": round(ts["start"] / sample_rate, 3), "end": round(ts["end"] / sample_rate, 3)}
        for ts in get_speech_timestamps(audio, vad_options)
    ]
    energy = rms_energy(audio, sample_rate, args.energy_window_ms)

    out = {
        "language": info.language or (lang or "en"),
        "language_probability": round(float(getattr(info, "language_probability", 0.0) or 0.0), 3),
        "duration_sec": round(float(info.duration or (len(audio) / sample_rate)), 3),
        "text": "".join(text_parts).strip(),
        "words": words,
        "segments": segments,
        "vad_segments": vad,
        "energy": {"window_ms": args.energy_window_ms, "rms": energy},
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
