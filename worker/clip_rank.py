#!/usr/bin/env python3
"""Rank candidate b-roll thumbnails against a text query with CLIP, print the best
index. Read by worker/src/broll.ts so a cutaway actually MATCHES the spoken line
instead of being keyword-roulette. CPU, fail-open: any failure prints -1 and the
caller falls back to its existing keyword pick.

Usage: argv[1] = the text query; stdin = one candidate image URL per line.
Output: a single integer line — the 0-based index of the best-matching URL, or -1.
"""
import sys, io, urllib.request


def main() -> None:
    try:
        query = (sys.argv[1] if len(sys.argv) > 1 else '').strip()
        urls = [l.strip() for l in sys.stdin.read().splitlines() if l.strip()]
        if not query or not urls:
            print(-1)
            return
        # Imported lazily so a missing dep can't break the worker at import time.
        from sentence_transformers import SentenceTransformer, util  # type: ignore
        from PIL import Image  # type: ignore

        model = SentenceTransformer('clip-ViT-B-32')
        imgs, keep = [], []
        for i, u in enumerate(urls):
            try:
                req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as r:
                    imgs.append(Image.open(io.BytesIO(r.read())).convert('RGB'))
                    keep.append(i)
            except Exception:
                continue
        if not imgs:
            print(-1)
            return
        tvec = model.encode([query])
        ivec = model.encode(imgs)
        sims = util.cos_sim(tvec, ivec)[0]
        best = int(sims.argmax())
        print(keep[best])
    except Exception:
        print(-1)


main()
