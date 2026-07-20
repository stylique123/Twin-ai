#!/usr/bin/env python3
"""Offline fail-closed tests for editor_speech.py --require-pinned-model.

Every failure path exits 3 (the stable permanent code the worker maps to
`model_pin_failed`) BEFORE faster-whisper is imported or any audio is read, so
these run with no model and no real audio. Proves: empty path, nonexistent path,
missing manifest, and tampered bytes each fail closed and write NO output.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
BRIDGE = os.path.join(HERE, "..", "editor_speech.py")


def run(model_path, manifest="", extra=None):
    """Run the bridge require-pinned; return (rc, out_exists)."""
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "out.json")
        cmd = [sys.executable, BRIDGE, "--audio", os.path.join(d, "nope.wav"),
               "--out", out, "--require-pinned-model", "--model-path", model_path]
        if manifest:
            cmd += ["--model-manifest", manifest]
        p = subprocess.run(cmd, capture_output=True, text=True)
        return p.returncode, os.path.exists(out), p.stderr


REQUIRED = ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt")


def _manifest(d, revision="a" * 40):
    """Write all 4 required files + a matching manifest (so a later tamper is the
    ONLY reason verification fails, not a missing file)."""
    files = {}
    for name in REQUIRED:
        data = (name + "-bytes").encode()
        with open(os.path.join(d, name), "wb") as f:
            f.write(data)
        files[name] = hashlib.sha256(data).hexdigest()
    mp = os.path.join(d, "m.json")
    with open(mp, "w") as f:
        json.dump({"repository": "r", "revision": revision, "license": "MIT",
                   "analyzerBundle": "speech-6", "files": files}, f)
    return mp


def test_empty_path_fails_closed():
    rc, out, err = run("")
    assert rc == 3 and not out, (rc, out)
    assert "model_pin_failed" in err
    print("ok: empty EDITOR_SPEECH_MODEL_PATH fails closed (exit 3, no output)")


def test_whitespace_path_fails_closed():
    rc, out, _ = run("   ")
    assert rc == 3 and not out, (rc, out)
    print("ok: whitespace path fails closed")


def test_nonexistent_path_fails_closed():
    rc, out, _ = run("/no/such/pinned/model")
    assert rc == 3 and not out, (rc, out)
    print("ok: nonexistent path fails closed")


def test_missing_manifest_fails_closed():
    with tempfile.TemporaryDirectory() as d:
        rc, out, _ = run(d)   # dir exists but no --model-manifest
        assert rc == 3 and not out, (rc, out)
    print("ok: missing manifest fails closed")


def test_tampered_bytes_fail_closed():
    with tempfile.TemporaryDirectory() as d:
        mp = _manifest(d)   # all 4 files present + matching
        with open(os.path.join(d, "model.bin"), "wb") as f:
            f.write(b"TAMPERED")   # digest no longer matches the manifest
        rc, out, err = run(d, manifest=mp)
        assert rc == 3 and not out, (rc, out)
        assert "model_pin_failed" in err
    print("ok: tampered model.bin fails closed before any load")


if __name__ == "__main__":
    test_empty_path_fails_closed()
    test_whitespace_path_fails_closed()
    test_nonexistent_path_fails_closed()
    test_missing_manifest_fails_closed()
    test_tampered_bytes_fail_closed()
    print("all editor_speech pin fail-closed tests passed")
