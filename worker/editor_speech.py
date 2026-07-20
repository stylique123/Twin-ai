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
import hashlib
import json
import os
import sys


def manifest_identity(manifest_path):
    """Read the pinned-model manifest and return the identity to persist in the
    speech provenance: repository, exact revision, the model.bin artifact digest,
    and a stable manifest_sha256 (semantic core only). Kept byte-for-byte in sync
    with worker/scripts/fetch_model.py.manifest_sha256()."""
    with open(manifest_path, encoding="utf-8") as f:
        man = json.load(f)
    core = {"repository": man["repository"], "revision": man["revision"], "files": man["files"]}
    canon = json.dumps(core, sort_keys=True, separators=(",", ":"))
    return {
        "repository": man["repository"],
        "revision": man["revision"],
        "artifact_sha256": man["files"].get("model.bin"),
        "manifest_sha256": hashlib.sha256(canon.encode("utf-8")).hexdigest(),
    }


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
    ap.add_argument("--model", default="base",
                    help="model label recorded in provenance (e.g. small); the ACTUAL "
                         "weights come from --model-path when set")
    # Determinism: the immutable `speech` component must be byte-reproducible, so
    # production loads a PINNED local snapshot (exact Systran/faster-whisper-small
    # revision, digest-verified at build) with the network DISABLED — never the
    # moving `small` alias. --model-manifest records repository+revision+digest in
    # provenance so the persisted analysis names exactly which weights produced it.
    ap.add_argument("--model-path", default="",
                    help="local faster-whisper snapshot dir; loaded offline (local_files_only)")
    ap.add_argument("--model-manifest", default="",
                    help="pinned-model manifest json (persisted into provenance)")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--language", default="en")  # ISO code, or "auto" to detect
    ap.add_argument("--beam-size", type=int, default=1)
    ap.add_argument("--max-seconds", type=int, default=1800)
    # Emit disfluencies: by default Whisper suppresses the non-speech token set
    # (suppress_tokens=[-1]), which drops most "um"/"uh" from the transcript and
    # caps the editor's filler-detection recall. We disable that suppression so
    # disfluencies survive into the word stream for the filler candidates. Still
    # deterministic (greedy, temp 0). Pinned by EDITOR_SPEECH_VERSION.
    ap.add_argument("--suppress-non-speech", action="store_true",
                    help="keep Whisper's default non-speech suppression (drops um/uh)")
    ap.add_argument("--no-disfluency-prompt", action="store_true",
                    help="A/B evaluation: disable the disfluency-context initial_prompt")
    ap.add_argument("--energy-window-ms", type=int, default=200)
    # Matrix-only deterministic holds so cooperative cancellation can be proven
    # to land in the model-load and mid-transcription windows (the worker kills
    # this process group on abort). Never set in production.
    ap.add_argument("--hold-at", default="")   # after_model_load | after_transcribe
    ap.add_argument("--hold-ms", type=int, default=0)
    args = ap.parse_args()

    import time

    # Pinned-model path forces OFFLINE loading: no network call can silently
    # substitute a moving snapshot. Set before importing faster_whisper so the
    # huggingface_hub client picks it up.
    model_identity = None
    if args.model_path:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        if not os.path.isdir(args.model_path):
            print(f"pinned model path not found: {args.model_path}", file=sys.stderr)
            return 1
        if args.model_manifest:
            model_identity = manifest_identity(args.model_manifest)

    from faster_whisper import WhisperModel
    from faster_whisper.audio import decode_audio
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    compute_type = "float16" if args.device == "cuda" else "int8"
    lang = None if args.language.lower() in ("auto", "", "detect") else args.language

    # Load the PINNED local snapshot (offline) when given; otherwise the alias
    # (dev/back-compat only — never the production path for the immutable component).
    if args.model_path:
        model = WhisperModel(args.model_path, device=args.device,
                             compute_type=compute_type, local_files_only=True)
    else:
        model = WhisperModel(args.model, device=args.device, compute_type=compute_type)
    if args.hold_at == "after_model_load" and args.hold_ms > 0:
        time.sleep(args.hold_ms / 1000.0)
    # Default: suppress NOTHING so disfluencies (um/uh) survive; pass -1 only if
    # the caller explicitly opts back into Whisper's non-speech suppression.
    suppress_tokens = [-1] if args.suppress_non_speech else []
    # Fixed disfluency-bearing context prompt: Whisper's decoder is biased by
    # preceding text, and its training transcripts mostly OMIT fillers — token
    # de-suppression alone measured recall 0/6 on real disfluent speech. A
    # constant prompt that itself contains fillers makes verbatim um/uh
    # emission likely. Deterministic (constant string + greedy decoding); any
    # prompt leakage into output would trip the invented-word gate in the eval.
    initial_prompt = None if args.no_disfluency_prompt else \
        "Um, uh, er, hmm... okay, so, um, I was, I was thinking, uh, you know, right."
    segments_iter, info = model.transcribe(
        args.audio,
        word_timestamps=True,
        beam_size=args.beam_size,
        temperature=0,
        language=lang,
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
        suppress_tokens=suppress_tokens,
        initial_prompt=initial_prompt,
        vad_filter=False,  # timestamps must stay on the source timeline
    )
    if info.duration and info.duration > args.max_seconds:
        print(f"media too long: > {args.max_seconds}s", file=sys.stderr)
        return 2

    words, segments, text_parts = [], [], []
    if args.hold_at == "after_transcribe" and args.hold_ms > 0:
        # segments_iter is lazy — force the first segment so transcription has
        # genuinely begun, then hold (mid-transcription window).
        first = next(segments_iter, None)
        time.sleep(args.hold_ms / 1000.0)
        if first is not None:
            segments.append({"start": round(first.start, 3), "end": round(first.end, 3), "text": first.text.strip()})
            text_parts.append(first.text)
            for w in (first.words or []):
                t = (w.word or "").strip()
                if t and w.end >= w.start:
                    words.append({"w": t, "start": round(w.start, 3), "end": round(w.end, 3),
                                  "p": round(float(getattr(w, "probability", 0.0) or 0.0), 3)})
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
        # Exact weights that produced this analysis — persisted into the immutable
        # component's provenance. `label` is the alias (small); repository/revision/
        # digests come from the pinned manifest when loaded offline.
        "model": {
            "label": args.model,
            "loadedFromPath": bool(args.model_path),
            "repository": (model_identity or {}).get("repository"),
            "revision": (model_identity or {}).get("revision"),
            "artifactSha256": (model_identity or {}).get("artifact_sha256"),
            "manifestSha256": (model_identity or {}).get("manifest_sha256"),
        },
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
