#!/usr/bin/env python3
"""Offline unit tests for fetch_model.py's verifier (no network, no model).

Runs in CI as a fail-closed guard: proves that a digest mismatch or a missing
file is DETECTED (returns errors), that a correct dir passes clean, and that the
pinned manifest is well-formed with a full commit sha. Mirrors the style of
scripts/speech-eval/test_build_corpus.py.
"""
import hashlib
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_model  # noqa: E402

MANIFEST = os.path.join(HERE, "..", "models", "faster-whisper-small.manifest.json")


def _write(path, data: bytes):
    with open(path, "wb") as f:
        f.write(data)
    return hashlib.sha256(data).hexdigest()


def test_verify_clean_pass():
    with tempfile.TemporaryDirectory() as d:
        s1 = _write(os.path.join(d, "model.bin"), b"the-model-bytes")
        s2 = _write(os.path.join(d, "config.json"), b'{"k":1}')
        errs = fetch_model.verify_dir({"model.bin": s1, "config.json": s2}, d)
        assert errs == [], errs
    print("ok: clean dir verifies")


def test_verify_detects_digest_mismatch():
    with tempfile.TemporaryDirectory() as d:
        _write(os.path.join(d, "model.bin"), b"tampered")
        errs = fetch_model.verify_dir({"model.bin": "0" * 64}, d)
        assert len(errs) == 1 and "DIGEST MISMATCH" in errs[0], errs
    print("ok: digest mismatch detected")


def test_verify_detects_missing_file():
    with tempfile.TemporaryDirectory() as d:
        errs = fetch_model.verify_dir({"model.bin": "0" * 64}, d)
        assert len(errs) == 1 and "MISSING" in errs[0], errs
    print("ok: missing file detected")


def test_manifest_well_formed():
    with open(MANIFEST) as f:
        man = json.load(f)
    assert man["repository"] == "Systran/faster-whisper-small", man["repository"]
    assert len(man["revision"]) == 40, man["revision"]
    assert man["license"] == "MIT"
    for req in ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt"):
        assert req in man["files"], f"missing {req}"
        assert len(man["files"][req]) == 64, req
    # manifest_sha256 is stable + non-empty (echoed into speech provenance)
    assert len(fetch_model.manifest_sha256(man)) == 64
    print("ok: pinned manifest well-formed")


if __name__ == "__main__":
    test_verify_clean_pass()
    test_verify_detects_digest_mismatch()
    test_verify_detects_missing_file()
    test_manifest_well_formed()
    print("all fetch_model verifier tests passed")
