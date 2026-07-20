#!/usr/bin/env python3
"""Regression + unit guard for the Phase 5 corpus builder.

Primary purpose: prove the teardown-crash fix holds. The finalization segfault
(PyGILState_Release, exit 134) came from numba, imported by librosa, imported by
`datasets`' audio-decode path. We switched to Audio(decode=False) + soundfile.
This test FAILS if importing/using the builder pulls in librosa or numba again —
that would reintroduce the crash. It also unit-tests the pure selection helpers
and the artifact validator. No network access required.

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

# 2) All 12 required categories are declared and accounted for.
check("CATEGORY_SPEC declares exactly 12 categories", len(bc.CATEGORY_SPEC) == 12)
check("category ids are 1..12", sorted(c[0] for c in bc.CATEGORY_SPEC) == list(range(1, 13)))
core = {"clean_natural_speech", "filler_um_uh", "repetition_accidental"}
names = {c[1] for c in bc.CATEGORY_SPEC}
check("core threshold categories are declared", core.issubset(names))

# 3) Pure selection helpers behave.
check("toks lowercases + strips punctuation", bc.toks("Um, well... I I think!") == ["um", "well", "i", "i", "think"])
check("has_repeat detects adjacent repeat", bc.has_repeat(["the", "the", "cat"]) is True)
check("has_repeat ignores single-char + fillers", bc.has_repeat(["um", "um", "hi"]) is False)
check("has_repeat detects repeated bigram", bc.has_repeat(["i", "was", "i", "was", "there"]) is True)
check("has_partial_word detects cut-off word", bc.has_partial_word("I wan- I wanted to") is True)
check("has_partial_word false on clean text", bc.has_partial_word("a clean sentence here") is False)
check("speed_bin fast/normal/slow", (bc.speed_bin(4.0), bc.speed_bin(2.5), bc.speed_bin(1.0)) == ("fast", "normal", "slow"))

# 4) Validator: rejects a corrupt/empty corpus, accepts a real one. Uses a tiny
#    soundfile-written wav (libsndfile, no numba) to mirror the real decode path.
with tempfile.TemporaryDirectory() as d:
    # decode path uses soundfile; prove it works and stays numba-free.
    import numpy as np
    import soundfile as sf
    sr = 16000
    arr = (np.zeros(sr, dtype="float32"))
    path, sha, secs = bc.write_wav(d, "clip-a", arr, sr)
    check("write_wav produced a non-empty file", os.path.exists(path) and os.path.getsize(path) > 0)
    check("using soundfile did not import numba", "numba" not in sys.modules)

    good_clip = {"id": "clip-a", "category": "clean_natural_speech", "audio": path,
                 "referenceTranscript": "hello", "expected": {"clean": True}}
    manifest = {
        "provenance": {"artifacts": [{"id": "clip-a", "sha256": sha}]},
        "categories": [{"id": i, "name": n, "coverage": c, "source": s, "count": (3 if n in core else 0)}
                       for i, n, c, s in bc.CATEGORY_SPEC],
        "diversity": {}, "clips": [good_clip],
    }
    bc.write_json(os.path.join(d, "manifest.json"), manifest)
    bc.write_json(os.path.join(d, "provenance.json"), manifest["provenance"])
    check("validate accepts a well-formed corpus", bc.validate(d, manifest) == [])

    # tamper: sha mismatch must be caught
    bad = json.loads(json.dumps(manifest))
    bad["provenance"]["artifacts"][0]["sha256"] = "deadbeef"
    bc.write_json(os.path.join(d, "provenance.json"), bad["provenance"])
    check("validate catches sha256 mismatch", any("sha256 mismatch" in e for e in bc.validate(d, bad)))

    # missing core category must be caught
    empty_core = json.loads(json.dumps(manifest))
    for c in empty_core["categories"]:
        c["count"] = 0
    bc.write_json(os.path.join(d, "provenance.json"), empty_core["provenance"])
    check("validate catches empty core category", any("core category" in e for e in bc.validate(d, empty_core)))

    # zero clips must be caught
    noclips = json.loads(json.dumps(manifest))
    noclips["clips"] = []
    bc.write_json(os.path.join(d, "provenance.json"), noclips["provenance"])
    check("validate catches zero clips", any("zero clips" in e for e in bc.validate(d, noclips)))

if failures:
    print(f"\n{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("\nall build_corpus guards passed")
