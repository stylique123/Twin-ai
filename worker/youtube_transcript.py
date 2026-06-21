#!/usr/bin/env python3
"""Fetch a YouTube transcript for FREE (youtube-transcript-api) and print it as the
worker's Transcript JSON on stdout. Used instead of a paid Apify transcript Actor:
YouTube does not block our datacenter IP (verified), unlike Instagram. media.ts
calls this first and falls back to Apify on any non-zero exit (no captions, a
transient block, etc.), so reliability is never worse than before.

Usage: python3 youtube_transcript.py <youtube url or id>
"""
import sys
import json
import re


def video_id(url: str) -> str:
    for pat in (r'[?&]v=([\w-]{11})', r'youtu\.be/([\w-]{11})',
                r'/shorts/([\w-]{11})', r'/embed/([\w-]{11})', r'/live/([\w-]{11})'):
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return url.strip()


def main() -> None:
    if len(sys.argv) < 2:
        print('usage: youtube_transcript.py <url>', file=sys.stderr)
        sys.exit(64)
    vid = video_id(sys.argv[1])

    from youtube_transcript_api import YouTubeTranscriptApi
    api = YouTubeTranscriptApi()
    fetched = api.fetch(vid)
    rows = fetched.to_raw_data() if hasattr(fetched, 'to_raw_data') else list(fetched)

    segments = []
    for r in rows:
        start = float(r.get('start', 0) or 0)
        dur = float(r.get('duration', 0) or 0)
        text = (r.get('text') or '').replace('\n', ' ').strip()
        if text:
            segments.append({'start': round(start, 3), 'end': round(start + dur, 3), 'text': text})

    if not segments:
        print('NO_CAPTIONS', file=sys.stderr)
        sys.exit(2)

    full = ' '.join(s['text'] for s in segments)
    # Word-level timing by spreading each segment evenly across its words, mirroring
    # the wordsFromSegments() shape so downstream structure analysis is identical.
    words = []
    for s in segments:
        toks = s['text'].split()
        span = max(0.0, s['end'] - s['start'])
        per = span / len(toks) if toks else 0
        for i, w in enumerate(toks):
            words.append({'w': w, 'start': round(s['start'] + i * per, 3),
                          'end': round(s['start'] + (i + 1) * per, 3)})

    out = {
        'language': 'en',
        'duration_sec': int(segments[-1]['end']) + 1,
        'text': full,
        'words': words,
        'segments': segments,
    }
    sys.stdout.write(json.dumps(out))


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # any library/network error -> non-zero so media.ts falls back to Apify
        print('%s: %s' % (type(e).__name__, str(e)[:200]), file=sys.stderr)
        sys.exit(1)
