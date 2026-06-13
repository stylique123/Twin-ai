#!/usr/bin/env python3
"""faster-whisper transcription wrapper.

Reads an audio file, transcribes it with word-level timestamps, and writes a
compact JSON transcript the Node worker persists. Invoked as a subprocess so
the heavy ML stays isolated from the orchestrator.
"""
import argparse
import json
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="small")
    ap.add_argument("--device", default="cpu")  # cpu | cuda
    ap.add_argument("--max-seconds", type=int, default=900)
    args = ap.parse_args()

    # Imported here so --help works without the (heavy) dependency installed.
    from faster_whisper import WhisperModel

    compute_type = "float16" if args.device == "cuda" else "int8"
    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)

    segments_iter, info = model.transcribe(
        args.audio,
        word_timestamps=True,
        # IMPORTANT: no VAD here. We jump-cut silence in ffmpeg BEFORE transcribing,
        # so VAD is redundant and its silence-removal shifts word timestamps off the
        # video timeline, drifting the burned-in captions. Transcribe the cut audio
        # straight so caption timings line up to the frame.
        vad_filter=False,
    )

    if info.duration and info.duration > args.max_seconds:
        # Refuse over-long media rather than burn unbounded compute.
        print(f"media too long: {info.duration:.0f}s > {args.max_seconds}s", file=sys.stderr)
        return 2

    words = []
    segments = []
    text_parts = []
    for seg in segments_iter:
        segments.append({"start": round(seg.start, 3), "end": round(seg.end, 3), "text": seg.text.strip()})
        text_parts.append(seg.text)
        for w in (seg.words or []):
            words.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})

    out = {
        "language": info.language,
        "duration_sec": round(info.duration or 0, 2),
        "text": "".join(text_parts).strip(),
        "words": words,
        "segments": segments,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
