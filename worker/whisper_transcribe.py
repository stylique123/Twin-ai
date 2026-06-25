#!/usr/bin/env python3
"""Transcription wrapper with word-level timestamps.

Tries a ladder of refiners, tightest first, and falls back on ANY failure:
  1. wav2vec2 FORCED ALIGNMENT (WhisperX-style) — faster-whisper transcript +
     torchaudio CTC forced_align for frame-accurate word boundaries (English).
  2. stable-ts — DTW-refined word timings.
  3. plain faster-whisper — the proven, guaranteed path.
Because faster-whisper is the guaranteed fallback, every refiner can only IMPROVE
timing or no-op — none can ever break captions. The forced-align tier reuses
torchaudio (already in the image for Silero-VAD), so it adds NO heavy new deps
(no whisperx/pyannote dependency tree). Invoked as a subprocess so the heavy ML
stays isolated.
"""
import argparse
import json
import sys


def transcribe_forced_align(args, compute_type, lang):
    """WhisperX-style word timings: take the faster-whisper transcript, then align
    every word to the audio with torchaudio's wav2vec2 CTC forced alignment for
    frame-accurate boundaries. English-only (the BASE wav2vec2 acoustic model);
    raises on ANY problem so the caller falls back to stable-ts then faster-whisper."""
    if (lang or "en") != "en":
        raise ValueError("forced-align supports English only")
    import torch
    import torchaudio

    # 1. Transcript (text + rough word list) from the proven faster-whisper path.
    base = transcribe_faster(args, compute_type, lang)
    if base is None:
        raise ValueError("media too long for forced-align")
    src_words = base["words"]
    if not src_words:
        raise ValueError("no words to align")

    # 2. wav2vec2 emission probabilities over the audio (model pre-cached at build).
    bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
    model = bundle.get_model()
    labels = bundle.get_labels()
    dictionary = {c: i for i, c in enumerate(labels)}
    wav, sr = torchaudio.load(args.audio)
    if wav.size(0) > 1:
        wav = wav.mean(0, keepdim=True)  # mono
    if sr != bundle.sample_rate:
        wav = torchaudio.functional.resample(wav, sr, bundle.sample_rate)
    with torch.inference_mode():
        emission, _ = model(wav)
        emission = torch.log_softmax(emission, dim=-1)
    num_frames = emission.size(1)
    # seconds per emission frame, derived from the actual decimation ratio.
    sec_per_frame = (wav.size(1) / num_frames) / bundle.sample_rate

    # 3. Build the CTC target sequence (A-Z + apostrophe) and remember which source
    # word each token belongs to. Punctuation/emoji-only words have no tokens.
    targets, tok_to_word = [], []
    for wi, w in enumerate(src_words):
        cw = "".join(ch for ch in w["w"].upper() if ch in dictionary and ch not in ("-", "|"))
        for ch in cw:
            targets.append(dictionary[ch])
            tok_to_word.append(wi)
    if not targets:
        raise ValueError("no alignable characters")

    targets_t = torch.tensor([targets], dtype=torch.int32)
    aligned, scores = torchaudio.functional.forced_align(emission, targets_t, blank=0)
    spans = torchaudio.functional.merge_tokens(aligned[0], scores[0])
    if len(spans) != len(targets):
        raise ValueError("alignment span mismatch")

    # 4. Aggregate token spans into per-word frame ranges, then to seconds.
    word_frames = {}
    for si, span in enumerate(spans):
        wi = tok_to_word[si]
        if wi not in word_frames:
            word_frames[wi] = [span.start, span.end]
        else:
            word_frames[wi][1] = span.end

    out_words = []
    for wi, w in enumerate(src_words):
        if wi in word_frames:
            st, en = word_frames[wi]
            s, e = round(st * sec_per_frame, 3), round(en * sec_per_frame, 3)
            out_words.append({"w": w["w"], "start": s, "end": max(e, s)})
        else:
            out_words.append(w)  # keep faster-whisper timing for punctuation-only words

    # Sanity guard: alignment must be monotonic and inside the clip. A silent
    # mis-alignment wouldn't raise on its own, so reject implausible output here
    # and fall back rather than burn in subtly-wrong caption timings.
    dur = base.get("duration_sec") or (src_words[-1]["end"] if src_words else 0)
    last = -1.0
    for wi in word_frames:
        s, e = out_words[wi]["start"], out_words[wi]["end"]
        if s < -0.05 or e < s or (dur and e > dur + 1.0) or s < last - 0.10:
            raise ValueError("forced-align produced implausible timings")
        last = s

    base["words"] = out_words
    return base


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

    # Refiner ladder, tightest first: wav2vec2 forced alignment → stable-ts. Each
    # falls back on ANY failure so captions never break.
    out = None
    for refine in (transcribe_forced_align, transcribe_stable):
        try:
            out = refine(args, compute_type, lang)
            break
        except Exception as e:  # noqa: BLE001 — any failure must fall back, never crash captions
            print(f"{refine.__name__} unavailable: {e}", file=sys.stderr)

    if out is None:
        # The proven path is the guaranteed fallback.
        out = transcribe_faster(args, compute_type, lang)
        if out is None:
            print(f"media too long: > {args.max_seconds}s", file=sys.stderr)
            return 2

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
