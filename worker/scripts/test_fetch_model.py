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
    assert fetch_model.valid_revision(man["revision"]), man["revision"]
    assert man["license"] == "MIT"
    assert man["analyzerBundle"] == "speech-6", man.get("analyzerBundle")
    for req in ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt"):
        assert req in man["files"], f"missing {req}"
        assert len(man["files"][req]) == 64, req
    # manifest_sha256 is stable + non-empty (echoed into speech provenance)
    assert len(fetch_model.manifest_sha256(man)) == 64
    print("ok: pinned manifest well-formed")


def test_valid_revision_regex():
    assert fetch_model.valid_revision("0" * 40)
    assert fetch_model.valid_revision("536b0662742c02347bc0e980a01041f333bce120")
    assert not fetch_model.valid_revision("0" * 39)      # too short
    assert not fetch_model.valid_revision("0" * 41)      # too long
    assert not fetch_model.valid_revision("X" * 40)      # non-hex
    assert not fetch_model.valid_revision("main")
    assert not fetch_model.valid_revision("")
    print("ok: revision regex is exactly [0-9a-f]{40}")


def _fake_manifest(dirpath, files_bytes, revision="a" * 40, bundle="speech-6"):
    files = {name: _write(os.path.join(dirpath, name), data) for name, data in files_bytes.items()}
    man = {"repository": "Systran/faster-whisper-small", "revision": revision,
           "license": "MIT", "analyzerBundle": bundle, "files": files}
    mp = os.path.join(dirpath, "m.json")
    with open(mp, "w") as f:
        json.dump(man, f)
    return mp


def test_verified_identity_valid_dir_returns_identity():
    with tempfile.TemporaryDirectory() as d:
        mp = _fake_manifest(d, {"model.bin": b"weights", "config.json": b"{}"})
        ident = fetch_model.verified_identity(mp, d)
        assert ident["repository"] == "Systran/faster-whisper-small"
        assert ident["revision"] == "a" * 40
        assert ident["analyzer_bundle"] == "speech-6"
        assert len(ident["manifest_sha256"]) == 64
    print("ok: verified_identity returns identity for a verified dir")


def test_verified_identity_rejects_tampered_bytes():
    with tempfile.TemporaryDirectory() as d:
        mp = _fake_manifest(d, {"model.bin": b"weights", "config.json": b"{}"})
        _write(os.path.join(d, "model.bin"), b"TAMPERED")   # change bytes after manifest
        try:
            fetch_model.verified_identity(mp, d)
            assert False, "expected ValueError on tampered model.bin"
        except ValueError as e:
            assert "model_pin_failed" in str(e)
    print("ok: verified_identity rejects tampered bytes")


def test_verified_identity_rejects_missing_and_bad_revision():
    with tempfile.TemporaryDirectory() as d:
        mp = _fake_manifest(d, {"model.bin": b"w", "config.json": b"{}"})
        os.remove(os.path.join(d, "config.json"))
        try:
            fetch_model.verified_identity(mp, d); assert False
        except ValueError as e:
            assert "model_pin_failed" in str(e)
    with tempfile.TemporaryDirectory() as d:
        mp = _fake_manifest(d, {"model.bin": b"w", "config.json": b"{}"}, revision="main")
        try:
            fetch_model.verified_identity(mp, d); assert False
        except ValueError as e:
            assert "model_pin_failed" in str(e)
    print("ok: verified_identity rejects missing file + non-sha revision")


if __name__ == "__main__":
    test_verify_clean_pass()
    test_verify_detects_digest_mismatch()
    test_verify_detects_missing_file()
    test_manifest_well_formed()
    test_valid_revision_regex()
    test_verified_identity_valid_dir_returns_identity()
    test_verified_identity_rejects_tampered_bytes()
    test_verified_identity_rejects_missing_and_bad_revision()
    print("all fetch_model verifier tests passed")
