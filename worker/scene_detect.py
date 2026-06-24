#!/usr/bin/env python3
"""Detect scene cuts in an uploaded clip so the editor can cut + caption per scene,
extending the record path's per-shot script-captions to manual uploads. CPU,
fail-open: any failure prints {"bounds": [], "total": 0} and the caller skips it.

Usage: argv[1] = video path. Output: one JSON line {"bounds": [secs...], "total": secs}.
"""
import sys, json


def main() -> None:
    try:
        path = sys.argv[1]
        from scenedetect import detect, ContentDetector, open_video  # type: ignore
        scenes = detect(path, ContentDetector(threshold=27.0))
        total = 0.0
        try:
            v = open_video(path)
            total = float(v.duration.get_seconds()) if v.duration else 0.0
        except Exception:
            total = float(scenes[-1][1].get_seconds()) if scenes else 0.0
        # Interior cut points (the end of each scene except the last) = segment boundaries.
        bounds = [round(float(s[1].get_seconds()), 2) for s in scenes[:-1]] if len(scenes) > 1 else []
        print(json.dumps({"bounds": bounds, "total": round(total, 2)}))
    except Exception:
        print(json.dumps({"bounds": [], "total": 0}))


main()
