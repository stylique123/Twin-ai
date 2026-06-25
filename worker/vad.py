#!/usr/bin/env python3
"""Silero-VAD speech detection for speech-aware jump cuts.

silencedetect cuts on LOUDNESS (an amplitude threshold), so it clips soft speech
as if it were silence and keeps loud non-speech (breaths, room tone, music).
Silero-VAD is a neural speech/non-speech classifier, so the kept windows are the
actual SPOKEN parts. CPU, fail-open: on ANY problem this prints {"speech": [],
"dur": 0} and edit.ts falls back to the proven ffmpeg silencedetect path — so
this can only sharpen the cuts or no-op, never break the edit.

Usage: argv[1] = 16kHz mono WAV path. Output: one JSON line
{"speech": [[start,end], ...], "dur": seconds}.

NOTE: boundaries are deliberately UNPADDED (speech_pad_ms=0). edit.ts applies its
own 0.15s safety margin downstream exactly as it does for silencedetect output,
so padding here would double-shrink the silence and clip speech onsets.
"""
import sys
import json

SR = 16000


def main() -> None:
    try:
        path = sys.argv[1]
        from silero_vad import load_silero_vad, read_audio, get_speech_timestamps  # type: ignore
        model = load_silero_vad()
        wav = read_audio(path, sampling_rate=SR)
        ts = get_speech_timestamps(
            wav, model, sampling_rate=SR,
            min_speech_duration_ms=200,   # ignore sub-200ms blips
            min_silence_duration_ms=350,  # match silencedetect d=0.35 — don't split on micro-pauses
            speech_pad_ms=0,              # edit.ts adds the 0.15s margin itself
            return_seconds=True,
        )
        dur = round(len(wav) / float(SR), 3)
        speech = [
            [round(float(t["start"]), 3), round(float(t["end"]), 3)]
            for t in ts
            if float(t["end"]) > float(t["start"])
        ]
        print(json.dumps({"speech": speech, "dur": dur}))
    except Exception:
        print(json.dumps({"speech": [], "dur": 0}))


main()
