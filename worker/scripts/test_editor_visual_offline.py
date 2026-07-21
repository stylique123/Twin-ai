#!/usr/bin/env python3
"""Offline tests for editor_visual.py — everything that does NOT need cv2.

Runs in CI/sandbox where opencv is not installed: model-pin verification
(fail-closed), canonical-json parity with the worker's TS canonicalJson, and
manifest identity. The cv2-dependent sampling/detection paths are exercised by
the staging fixture gates (scripts/staging-integration/phase6.mjs), where the
pinned opencv-python-headless wheel is installed.

Usage: python3 scripts/test_editor_visual_offline.py
Exit 0 = all pass; non-zero = failure (prints the failing check).
"""
import hashlib
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import editor_visual  # noqa: E402

FAILURES = []


def check(name: str, fn):
    try:
        fn()
        print(f"ok   {name}")
    except Exception as e:  # noqa: BLE001
        FAILURES.append(name)
        print(f"FAIL {name}: {e}")


MANIFEST = os.path.join(ROOT, "models", "vision.manifest.json")
MODEL = os.path.join(ROOT, "models", "face_detection_yunet_2023mar.onnx")


def test_verify_ok():
    ident = editor_visual.verify_model(MANIFEST, MODEL)
    assert ident["verified"] is True
    assert ident["repository"] == "opencv/opencv_zoo"
    assert ident["ref"] == "47534e27c9851bb1128ccc0102f1145e27f23f98"
    assert ident["artifactSha256"] == "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
    # The committed artifact's real bytes hash to the pinned digest.
    assert editor_visual.sha256_file(MODEL) == ident["artifactSha256"]


def test_verify_tampered_digest_fails():
    with open(MANIFEST, encoding="utf-8") as f:
        m = json.load(f)
    m["files"] = {"face_detection_yunet_2023mar.onnx": "0" * 64}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as tf:
        json.dump(m, tf)
        bad = tf.name
    try:
        try:
            editor_visual.verify_model(bad, MODEL)
        except editor_visual.PinFailed:
            return
        raise AssertionError("tampered digest was accepted")
    finally:
        os.unlink(bad)


def test_verify_multi_artifact_fails():
    with open(MANIFEST, encoding="utf-8") as f:
        m = json.load(f)
    m["files"]["extra.onnx"] = "1" * 64
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as tf:
        json.dump(m, tf)
        bad = tf.name
    try:
        try:
            editor_visual.verify_model(bad, MODEL)
        except editor_visual.PinFailed:
            return
        raise AssertionError("multi-artifact manifest was accepted")
    finally:
        os.unlink(bad)


def test_canonical_json_matches_ts_rules():
    # Cross-language parity: python canonical_json of the manifest (comment
    # excluded) must hash to the same manifestSha256 the TS side computes.
    with open(MANIFEST, encoding="utf-8") as f:
        m = json.load(f)
    m.pop("_comment", None)
    py_sha = hashlib.sha256(editor_visual.canonical_json(m).encode("utf-8")).hexdigest()
    ident = editor_visual.verify_model(MANIFEST, MODEL)
    assert ident["manifestSha256"] == py_sha
    # Shape parity of the serializer itself on a mixed nested value.
    fixture = {"b": [1, {"z": 0.3, "y": "café"}], "a": None, "c": True}
    assert editor_visual.canonical_json(fixture) == '{"a":null,"b":[1,{"y":"café","z":0.3}],"c":true}'


def test_rules_document_loads():
    with open(os.path.join(ROOT, "analysis_rules_v1.json"), encoding="utf-8") as f:
        rules = json.load(f)
    assert rules["visual"]["sceneCutThreshold"] == 0.3
    assert rules["visual"]["face"]["scoreThreshold"] == 0.6
    assert rules["audio"]["windowSamples"] == 4800


check("verify_model accepts the committed pinned artifact", test_verify_ok)
check("verify_model fails closed on a tampered digest", test_verify_tampered_digest_fails)
check("verify_model fails closed on a multi-artifact manifest", test_verify_multi_artifact_fails)
check("canonical_json parity + manifest identity", test_canonical_json_matches_ts_rules)
check("frozen rules document is readable and intact", test_rules_document_loads)

if FAILURES:
    print(f"{len(FAILURES)} failure(s): {FAILURES}", file=sys.stderr)
    sys.exit(1)
print("all offline visual checks passed")
