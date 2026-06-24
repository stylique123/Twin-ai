#!/usr/bin/env python3
"""Transcription wrapper with word-level timestamps.

Tries stable-ts FIRST (DTW-refined word timings → tighter karaoke captions) and
falls back to plain faster-whisper on ANY failure. Because faster-whisper is the
guaranteed fallback, stable-ts can only IMPROVE timing or no-op — it can never
break captions. Invoked as a subprocess so the heavy ML stays isolated.
"""
import argparse
import json
import sys


def transcribe_stable(args, compute_type, lang):
    """DTW-refined word timings via stable-ts (faster-whisper backend). Raises on any
    problem so the caller falls back to plain faster-whisper."""
    import stable_whisper  # raises ImportError if not installed → fallback
    model = stable_whisper.load_faster_whisper(args.model, device=args.device, compute_type=compute_type)
    result = model.transcribe(
        args.audio,
        language=lang,
        beam_size=args.beam_size,
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
        vad_filter=False,
    )
    words = []
    for w in result.all_words():
        t = (getattr(w, "word", "") or "").strip()
        s, e = getattr(w, "start", None), getattr(w, "end", None)
        if t and isinstance(s, (int, float)) and isinstance(e, (int, float)) and e >= s:
            words.append({"w": t, "start": round(s, 3), "end": round(e, 3)})
    if not words:
        raise ValueError("stable-ts produced no usable words")
    segments = [
        {"start": round(sg.start, 3), "end": round(sg.end, 3), "text": (sg.text or "").strip()}
        for sg in result.segments
    ]
    dur = segments[-1]["end"] if segments else words[-1]["end"]
    return {
        "language": getattr(result, "language", None) or (lang or "en"),
        "duration_sec": round(dur, 2),
        "text": (result.text or "").strip(),
        "words": words,
        "segments": segments,
    }


def transcribe_faster(args, compute_type, lang):
    """The proven faster-whisper path. Returns None if the media is over-length."""
    from faster_whisper import WhisperModel

    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)
    segments_iter, info = model.transcribe(
        args.audio,
        word_timestamps=True,
        # Greedy decoding (beam_size=1) is ~2x faster than the default beam search
        # with negligible quality loss on clean short-form speech.
        beam_size=args.beam_size,
        # Pin the language unless explicitly auto: faster-whisper otherwise
        # mis-detects accented/noisy English takes as Arabic/Urdu/Welsh and burns
        # in unreadable captions. This is the #1 caption-quality bug.
        language=lang,
        # Don't carry context across segments: on pauses/music it otherwise loops
        # and hallucinates repeated phrases. Drop near-silent segments too.
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
        # IMPORTANT: no VAD here. We jump-cut silence in ffmpeg BEFORE transcribing,
        # so VAD is redundant and its silence-removal shifts word timestamps off the
        # video timeline, drifting the burned-in captions. Transcribe the cut audio
        # straight so caption timings line up to the frame.
        vad_filter=False,
    )
    if info.duration and info.duration > args.max_seconds:
        return None

    words, segments, text_parts = [], [], []
    for seg in segments_iter:
        segments.append({"start": round(seg.start, 3), "end": round(seg.end, 3), "text": seg.text.strip()})
        text_parts.append(seg.text)
        for w in (seg.words or []):
            words.append({"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)})
    return {
        "language": info.language,
        "duration_sec": round(info.duration or 0, 2),
        "text": "".join(text_parts).strip(),
        "words": words,
        "segments": segments,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="small")
    ap.add_argument("--device", default="cpu")  # cpu | cuda
    ap.add_argument("--language", default="en")  # ISO code, or "auto" to detect
    ap.add_argument("--beam-size", type=int, default=1)  # 1 = greedy (much faster)
    ap.add_argument("--max-seconds", type=int, default=900)
    args = ap.parse_args()

    compute_type = "float16" if args.device == "cuda" else "int8"
    lang = None if args.language.lower() in ("auto", "", "detect") else args.language

    # stable-ts first (tighter timings); fall back to the proven faster-whisper path
    # on ANY failure so captions never break.
    out = None
    try:
        out = transcribe_stable(args, compute_type, lang)
    except Exception as e:  # noqa: BLE001 — any failure must fall back, never crash captions
        print(f"stable-ts unavailable, using faster-whisper: {e}", file=sys.stderr)

    if out is None:
        out = transcribe_faster(args, compute_type, lang)
        if out is None:
            print(f"media too long: > {args.max_seconds}s", file=sys.stderr)
            return 2

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
