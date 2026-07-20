#!/usr/bin/env python3
"""Regression + unit guard for the Phase 5 corpus builder.

Primary purpose: prove the teardown-crash fix holds. The finalization segfault
(PyGILState_Release, exit 134) came from numba, imported by librosa, imported by
`datasets`' audio-decode path. We switched to Audio(decode=False) + soundfile.
This test FAILS if importing/using the builder pulls in librosa or numba again.
It also unit-tests the pure helpers and the artifact validator. No network.

Run: python scripts/speech-eval/test_build_corpus.py
"""
import importlib
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
failures = []


def check(name, cond):
    print(f"  {'ok  ' if cond else 'FAIL'} {name}")
    if not cond:
        failures.append(name)


# 1) Importing the builder must NOT pull in librosa/numba (the crash source).
bc = importlib.import_module("build_corpus")
check("import build_corpus does not import librosa", "librosa" not in sys.modules)
check("import build_corpus does not import numba", "numba" not in sys.modules)

# 2) All 12 required categories declared + accounted for.
check("CATEGORY_SPEC declares exactly 12 categories", len(bc.CATEGORY_SPEC) == 12)
check("category ids are 1..12", sorted(c[0] for c in bc.CATEGORY_SPEC) == list(range(1, 13)))

# 3) Pure helpers.
check("toks lowercases + strips punctuation", bc.toks("Um, well... I I think!") == ["um", "well", "i", "i", "think"])
check("has_repeat detects adjacent repeat", bc.has_repeat(["the", "the", "cat"]) is True)
check("has_repeat ignores single-char + fillers", bc.has_repeat(["um", "um", "hi"]) is False)
check("has_repeat detects repeated bigram", bc.has_repeat(["i", "was", "i", "was", "there"]) is True)
check("speed_bin fast/normal/slow", (bc.speed_bin(4.0), bc.speed_bin(2.5), bc.speed_bin(1.0)) == ("fast", "normal", "slow"))
script, off = bc.pick_offscript("the quick brown fox jumps over lazy dogs", n=2)
check("pick_offscript picks content words", len(off) == 2 and all(len(w) >= 4 for w in off))
check("pick_offscript removes them from the script reference", all(w not in bc.toks(script) for w in off))
check("pick_offscript never picks stopwords/fillers", not any(w in bc.STOPWORDS or w in bc.DISFLUENCY for w in off))

# 4) Validator: rejects corrupt/incomplete corpora, accepts a complete one. Uses
#    a real soundfile-written wav (libsndfile, no numba) mirroring decode.
with tempfile.TemporaryDirectory() as d:
    import numpy as np
    sr = 16000
    path, sha, secs = bc.write_wav(d, "clip-a", np.zeros(sr, dtype="float32"), sr)
    check("write_wav produced a non-empty file", os.path.exists(path) and os.path.getsize(path) > 0)
    check("using soundfile did not import numba", "numba" not in sys.modules)

    good_clip = {"id": "clip-a", "category": "clean_natural_speech", "audio": path,
                 "referenceTranscript": "hello", "scriptReference": "hello", "expected": {"clean": True}}
    manifest = {
        "provenance": {"artifacts": [{"id": "clip-a", "sha256": sha}]},
        # every one of the 12 categories populated (validator now requires 12/12)
        "categories": [{"id": i, "name": n, "coverage": c, "source": s, "count": 3} for i, n, c, s in bc.CATEGORY_SPEC],
        "diversity": {}, "clips": [good_clip],
    }
    bc.write_json(os.path.join(d, "manifest.json"), manifest)
    bc.write_json(os.path.join(d, "provenance.json"), manifest["provenance"])
    check("validate accepts a well-formed 12/12 corpus", bc.validate(d) == [])

    def rewrite(mut):
        m = json.loads(json.dumps(manifest)); mut(m)
        bc.write_json(os.path.join(d, "manifest.json"), m)
        bc.write_json(os.path.join(d, "provenance.json"), m["provenance"])
        return bc.validate(d)

    check("validate catches sha256 mismatch",
          any("sha256 mismatch" in e for e in rewrite(lambda m: m["provenance"]["artifacts"][0].update({"sha256": "deadbeef"}))))
    check("validate catches an unpopulated category (not 12/12)",
          any("has zero clips" in e for e in rewrite(lambda m: m["categories"][4].update({"count": 0}))))
    check("validate catches zero clips",
          any("zero clips" in e for e in rewrite(lambda m: m.update({"clips": []}))))

if failures:
    print(f"\n{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("\nall build_corpus guards passed")
