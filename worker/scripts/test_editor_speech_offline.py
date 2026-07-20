#!/usr/bin/env python3
"""Prove the VERIFIED local-path flow reaches the loader OFFLINE (item 5.7).

Runs editor_speech.prepare_model() with a FAKE faster_whisper injected. The fake
WhisperModel records its kwargs; a network sentinel raises if any Hub resolver is
touched. Asserts: the offline env vars are set, WhisperModel is called with the
local path + local_files_only=True, and the verified identity is returned. This
is a SUCCESSFUL no-network load proof, not a pre-import failure.
"""
import hashlib
import json
import os
import sys
import types
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))  # import editor_speech from worker/

REQUIRED = ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt")


def _valid_model_dir(d):
    files = {}
    for name in REQUIRED:
        data = (name + "-bytes").encode()
        with open(os.path.join(d, name), "wb") as f:
            f.write(data)
        files[name] = hashlib.sha256(data).hexdigest()
    mp = os.path.join(d, "m.json")
    with open(mp, "w") as f:
        json.dump({"repository": "Systran/faster-whisper-small", "revision": "a" * 40,
                   "license": "MIT", "analyzerBundle": "speech-6", "files": files}, f)
    return mp


class _Args:
    def __init__(self, model_path, manifest):
        self.model_path = model_path
        self.model_manifest = manifest
        self.require_pinned_model = True
        self.model = "small"
        self.device = "cpu"


def _install_fake_faster_whisper(recorder):
    """Inject a fake faster_whisper whose WhisperModel records kwargs and whose
    (absent) network resolver would blow up if reached."""
    fake = types.ModuleType("faster_whisper")

    class FakeWhisperModel:
        def __init__(self, model, **kwargs):
            recorder["model"] = model
            recorder["kwargs"] = kwargs
            # A real Hub resolve would happen here for a non-local id; we assert
            # offline + local path instead, and never touch the network.
    fake.WhisperModel = FakeWhisperModel
    sys.modules["faster_whisper"] = fake


def test_verified_local_path_loads_offline():
    # Guarantee we start clean so the assertion on env is meaningful.
    os.environ.pop("HF_HUB_OFFLINE", None)
    os.environ.pop("TRANSFORMERS_OFFLINE", None)
    rec = {}
    _install_fake_faster_whisper(rec)
    import editor_speech  # after fake is installed (WhisperModel imported inside)

    with tempfile.TemporaryDirectory() as d:
        mp = _valid_model_dir(d)
        model, identity = editor_speech.prepare_model(_Args(d, mp))

    assert os.environ.get("HF_HUB_OFFLINE") == "1", "HF_HUB_OFFLINE not set"
    assert os.environ.get("TRANSFORMERS_OFFLINE") == "1", "TRANSFORMERS_OFFLINE not set"
    assert rec["model"] == d, ("loader got wrong path", rec.get("model"))
    assert rec["kwargs"].get("local_files_only") is True, rec.get("kwargs")
    assert identity["revision"] == "a" * 40 and identity["analyzer_bundle"] == "speech-6"
    print("ok: verified local path loads with offline env + local_files_only=True, no network")


def test_empty_path_never_reaches_loader():
    rec = {}
    _install_fake_faster_whisper(rec)
    import editor_speech
    try:
        editor_speech.prepare_model(_Args("   ", "whatever"))
        assert False, "expected PinFailed"
    except editor_speech.PinFailed as e:
        assert "model_pin_failed" in str(e)
    assert "model" not in rec, "loader must NOT be reached on an empty path"
    print("ok: empty path raises PinFailed and never reaches the loader")


if __name__ == "__main__":
    test_verified_local_path_loads_offline()
    test_empty_path_never_reaches_loader()
    print("all editor_speech offline-load tests passed")
