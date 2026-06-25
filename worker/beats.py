#!/usr/bin/env python3
"""librosa beat tracking on the music bed so visual cutaways/transitions can land
ON the beat — the classic "edit drops on the beat" feel.

CPU, fail-open: on ANY problem this prints {"beats": [], "tempo": 0} and edit.ts
keeps its existing speech-synced cutaway timing (unchanged behavior). So this can
only make cutaways feel more musical or no-op — it never moves speech, cuts, or
captions, and never breaks a render.

Usage: argv[1] = audio path (the music bed). Output: one JSON line
{"beats": [secs...], "tempo": bpm}.
"""
import sys
import json


def main() -> None:
    try:
        path = sys.argv[1]
        import librosa  # type: ignore
        # Analyze up to 2 min, mono @ 22.05k — plenty for tempo/beat grid, keeps it fast.
        y, sr = librosa.load(path, sr=22050, mono=True, duration=120)
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
        bt = [round(float(t), 3) for t in beats if float(t) >= 0]
        # librosa >=0.10 returns tempo as a 1-element array; older returns a scalar.
        tp = float(tempo[0]) if hasattr(tempo, "__len__") else float(tempo)
        print(json.dumps({"beats": bt, "tempo": round(tp, 1)}))
    except Exception:
        print(json.dumps({"beats": [], "tempo": 0}))


main()
