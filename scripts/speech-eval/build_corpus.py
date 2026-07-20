#!/usr/bin/env python3
"""Build the Phase 5 human-speech evaluation corpus IN CI (runners have open
internet; the build sandbox does not). Verifies each corpus license BEFORE
downloading anything, streams a small, category-labelled slice from two
permissively-licensed public corpora, writes wavs into an ephemeral private
runner directory (never committed to Git), and emits:

  <out>/manifest.json    — clips for evaluate.mjs (audio, referenceTranscript,
                           category, clip-level `expected` presence labels)
  <out>/provenance.json  — dataset versions, licenses, source URLs, per-file
                           SHA-256, attribution

Selection is ANNOTATION-DRIVEN: category membership is decided from each
corpus's own manual transcript (e.g. a segment whose transcript contains "um"
is a filler-present clip), never guessed from listening. Metrics downstream are
clip-level presence (does a filler-present clip yield a filler candidate; does a
clean clip yield NONE), which is robust without word-level timings.

Requires: datasets, soundfile, numpy, requests (installed by the CI workflow).
"""
import argparse
import hashlib
import json
import os
import re
import sys

import requests

# license SlugS we accept, verified from each dataset's HF card before download.
CORPORA = {
    "librispeech": {
        "hf_id": "openslr/librispeech_asr",
        "readme": "https://huggingface.co/datasets/openslr/librispeech_asr/raw/main/README.md",
        "license": "cc-by-4.0",
        "attribution": "Panayotov et al., LibriSpeech, ICASSP 2015",
        "source": "https://www.openslr.org/12",
    },
    "ami": {
        "hf_id": "edinburghcstr/ami",
        "readme": "https://huggingface.co/datasets/edinburghcstr/ami/raw/main/README.md",
        "license": "cc-by-4.0",
        "attribution": "Carletta et al., The AMI Meeting Corpus, MLMI 2005",
        "source": "https://groups.inf.ed.ac.uk/ami/corpus/",
    },
}

DISFLUENCY = {"um", "uh", "uhm", "umm", "erm", "er", "mm", "hmm", "mmhmm", "mm-hmm"}
DISCOURSE = {"like", "well", "so", "actually", "basically", "right", "you know"}


def verify_license(name, meta):
    """Fetch the dataset card and assert the recorded license BEFORE download."""
    r = requests.get(meta["readme"], timeout=60)
    r.raise_for_status()
    head = r.text[:4000].lower()
    if meta["license"] not in head:
        raise SystemExit(f"license verification FAILED for {name}: expected {meta['license']} in card")
    print(f"  verified {name}: license {meta['license']} ({meta['hf_id']})")
    return {"name": name, **{k: meta[k] for k in ("hf_id", "license", "attribution", "source")}}


def write_wav(out_dir, cid, audio):
    import numpy as np
    import soundfile as sf
    arr = np.asarray(audio["array"], dtype="float32")
    sr = int(audio["sampling_rate"])
    path = os.path.join(out_dir, f"{cid}.wav")
    sf.write(path, arr, sr)
    with open(path, "rb") as fh:
        sha = hashlib.sha256(fh.read()).hexdigest()
    return path, sha, round(len(arr) / sr, 2)


def toks(text):
    return re.sub(r"[^a-z0-9' ]+", " ", (text or "").lower()).split()


def has_repeat(ts):
    for i in range(len(ts) - 1):
        if ts[i] == ts[i + 1] and len(ts[i]) >= 2 and ts[i] not in DISFLUENCY:
            return True
    for i in range(len(ts) - 3):  # repeated bigram A B A B
        if ts[i] == ts[i + 2] and ts[i + 1] == ts[i + 3]:
            return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--clean", type=int, default=5)
    ap.add_argument("--ami-per-category", type=int, default=3)
    ap.add_argument("--max-seconds", type=float, default=20.0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    print("verifying licenses before any download...")
    provenance = {"corpora": [verify_license(n, m) for n, m in CORPORA.items()], "artifacts": []}

    from datasets import load_dataset

    clips = []

    # ---- LibriSpeech dev-clean: clean natural speech across distinct speakers.
    print("streaming LibriSpeech clean/validation...")
    ls = load_dataset(CORPORA["librispeech"]["hf_id"], "clean", split="validation", streaming=True)
    seen_speakers = set()
    n = 0
    for ex in ls:
        spk = ex.get("speaker_id")
        if spk in seen_speakers:
            continue
        audio = ex["audio"]
        dur = len(audio["array"]) / audio["sampling_rate"]
        if dur > args.max_seconds or dur < 2:
            continue
        seen_speakers.add(spk)
        cid = f"librispeech-clean-{n}"
        path, sha, secs = write_wav(args.out, cid, audio)
        provenance["artifacts"].append({"id": cid, "corpus": "librispeech", "speaker_id": spk, "sha256": sha, "seconds": secs})
        clips.append({
            "id": cid, "category": "clean_natural_speech", "audio": path,
            "referenceTranscript": ex["text"],
            "expected": {"clean": True, "hasFiller": False, "hasFalseStartOrRepetition": False, "offScriptWords": []},
        })
        n += 1
        if n >= args.clean:
            break

    # ---- AMI ihm: spontaneous speech → disfluencies, chosen by transcript.
    print("streaming AMI ihm/validation (transcript-driven category selection)...")
    ami = load_dataset(CORPORA["ami"]["hf_id"], "ihm", split="validation", streaming=True)
    want = {"filler": args.ami_per_category, "discourse": args.ami_per_category,
            "repetition": args.ami_per_category, "spontaneous": args.ami_per_category}
    got = {k: 0 for k in want}
    n = 0
    for ex in ami:
        text = ex.get("text") or ex.get("transcript") or ""
        ts = toks(text)
        if len(ts) < 4:
            continue
        audio = ex["audio"]
        dur = len(audio["array"]) / audio["sampling_rate"]
        if dur > args.max_seconds or dur < 1.5:
            continue
        cat = None
        if got["filler"] < want["filler"] and any(t in DISFLUENCY for t in ts):
            cat = ("filler", {"hasFiller": True})
        elif got["discourse"] < want["discourse"] and any(t in DISCOURSE for t in ts):
            cat = ("discourse", {"hasFiller": True})  # discourse markers are filler-family (low conf)
        elif got["repetition"] < want["repetition"] and has_repeat(ts):
            cat = ("repetition", {"hasFalseStartOrRepetition": True})
        elif got["spontaneous"] < want["spontaneous"]:
            cat = ("spontaneous", {})
        if not cat:
            if all(got[k] >= want[k] for k in want):
                break
            continue
        key, exp = cat
        got[key] += 1
        cid = f"ami-{key}-{n}"
        path, sha, secs = write_wav(args.out, cid, audio)
        provenance["artifacts"].append({"id": cid, "corpus": "ami", "sha256": sha, "seconds": secs})
        base = {"clean": False, "hasFiller": False, "hasFalseStartOrRepetition": False, "offScriptWords": []}
        base.update(exp)
        clips.append({"id": cid, "category": f"ami_{key}", "audio": path, "referenceTranscript": text, "expected": base})
        n += 1
        if all(got[k] >= want[k] for k in want):
            break

    manifest = {"provenance": provenance, "clips": clips}
    with open(os.path.join(args.out, "manifest.json"), "w") as fh:
        json.dump(manifest, fh, indent=2)
    with open(os.path.join(args.out, "provenance.json"), "w") as fh:
        json.dump(provenance, fh, indent=2)
    print(f"built {len(clips)} clips: "
          + ", ".join(f"{c['category']}" for c in clips))
    print(f"manifest → {os.path.join(args.out, 'manifest.json')}")
    if len(clips) < 6:
        print("::warning::fewer clips than expected — check dataset availability/schema")


if __name__ == "__main__":
    main()
    # The corpus is fully written by the time main() returns. numba/librosa/
    # datasets load ~180 native extension modules whose interpreter-finalization
    # teardown intermittently segfaults (PyGILState_Release core dump, exit 134)
    # AFTER all work is done — which would fail the CI step under `set -e` even
    # though the build succeeded. Flush our output and hard-exit 0 to bypass the
    # crashing atexit/GC teardown entirely.
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)
