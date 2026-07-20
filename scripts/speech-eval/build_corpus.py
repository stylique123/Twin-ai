#!/usr/bin/env python3
"""Build the Phase 5 human-speech evaluation corpus IN CI (runners have open
internet; the build sandbox does not). Verifies each corpus license BEFORE
downloading anything, streams a small, category-labelled slice from two
permissively-licensed public corpora, writes wavs into an ephemeral private
runner directory (never committed to Git), and emits:

  <out>/manifest.json    — clips for evaluate.mjs (audio, referenceTranscript,
                           category, clip-level `expected` presence labels),
                           a `categories` accounting of all 12 required
                           categories, and a `diversity` summary.
  <out>/provenance.json  — dataset versions, licenses, source URLs, per-file
                           SHA-256, attribution, speaker/gender/speed metadata.

Selection is ANNOTATION-DRIVEN: category membership is decided from each
corpus's own manual transcript (e.g. a segment whose transcript contains "um"
is a filler-present clip), never guessed from listening. Metrics downstream are
clip-level presence (does a filler-present clip yield a filler candidate; does a
clean clip yield NONE), which is robust without word-level timings.

Audio decoding uses `datasets` with `Audio(decode=False)` (raw encoded bytes,
NO decoder invoked) + `soundfile` (libsndfile — a stable C library). We do NOT
install or import `librosa`, because `datasets`' librosa-backed decode path
pulls in `numba`, whose native threading-layer teardown segfaults at interpreter
finalization (PyGILState_Release, exit 134) AFTER the corpus is written. Removing
that dependency is the fix; see docs/editor-v2-phase5-speech-eval.md and the
"controlled exit" note at the bottom of this file.

Requires: datasets, soundfile, numpy, requests (installed by the CI workflow).
NOT librosa / numba.
"""
import argparse
import hashlib
import io
import json
import os
import re
import sys
import traceback

import requests

# license slugs we accept, verified from each dataset's HF card before download.
CORPORA = {
    "librispeech": {
        "hf_id": "openslr/librispeech_asr",
        "readme": "https://huggingface.co/datasets/openslr/librispeech_asr/raw/main/README.md",
        "license": "cc-by-4.0",
        "attribution": "Panayotov et al., LibriSpeech, ICASSP 2015",
        "source": "https://www.openslr.org/12",
        "speakers_txt": "https://www.openslr.org/resources/12/SPEAKERS.TXT",
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
LIKE = {"like"}
WELLSO = {"well", "so", "actually", "basically", "right", "you know"}

# The 12 required categories. `auto` = reliably selectable from public-corpus
# annotations in this pipeline; `deferred` = not reliably isolatable from these
# corpora's streamed annotations (intent, precise pause timing, or config not
# available) and therefore covered by unit tests + the mandatory private
# pre-beta gate, NOT silently claimed here.
CATEGORY_SPEC = [
    (1, "clean_natural_speech", "auto", "LibriSpeech dev-clean"),
    (2, "filler_um_uh", "auto", "AMI ihm — transcript contains um/uh"),
    (3, "discourse_like", "auto", "AMI ihm — transcript contains meaningful 'like'"),
    (4, "discourse_well_so", "auto", "AMI ihm — transcript contains well/so/etc."),
    (5, "false_start_correction", "auto", "AMI ihm — partial-word marker (word-)"),
    (6, "repetition_rhetorical", "deferred", "intent not annotated; merged into repetition, split covered by private gate"),
    (7, "repetition_accidental", "auto", "AMI ihm — adjacent repeated token/bigram"),
    (8, "long_dead_air", "deferred", "inter-utterance pause timing not in ihm token stream; covered by VAD unit tests + private gate"),
    (9, "short_emphasis_pause", "deferred", "sub-second pause timing not annotated; covered by VAD unit tests + private gate"),
    (10, "off_script_spontaneous", "auto", "AMI ihm — spontaneous meeting speech, no script"),
    (11, "background_noise", "auto", "AMI sdm (single distant mic, far-field/noisy)"),
    (12, "accent_gender_speed", "auto", "LibriSpeech speaker/gender/speed diversity (see manifest.diversity)"),
]


def verify_license(name, meta):
    """Fetch the dataset card and assert the recorded license BEFORE download."""
    r = requests.get(meta["readme"], timeout=60)
    r.raise_for_status()
    head = r.text[:4000].lower()
    if meta["license"] not in head:
        raise SystemExit(f"license verification FAILED for {name}: expected {meta['license']} in card")
    print(f"  verified {name}: license {meta['license']} ({meta['hf_id']})")
    return {"name": name, **{k: meta[k] for k in ("hf_id", "license", "attribution", "source")}}


def load_librispeech_genders():
    """Best-effort: map LibriSpeech speaker_id -> gender from the public
    SPEAKERS.TXT metadata file (CC BY 4.0, same corpus). Never fatal."""
    try:
        r = requests.get(CORPORA["librispeech"]["speakers_txt"], timeout=60)
        r.raise_for_status()
        genders = {}
        for line in r.text.splitlines():
            if line.startswith(";") or not line.strip():
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 2 and parts[0].isdigit():
                genders[parts[0]] = parts[1]  # 'M' / 'F'
        print(f"  loaded gender metadata for {len(genders)} LibriSpeech speakers")
        return genders
    except Exception as e:  # noqa: BLE001 — diversity metadata is best-effort
        print(f"  ::warning::could not load LibriSpeech SPEAKERS.TXT ({e}); gender reported as unknown")
        return {}


def decode_audio(raw):
    """Decode the raw encoded bytes from Audio(decode=False) with soundfile
    (libsndfile). Returns (float32 mono ndarray, sample_rate). No librosa/numba."""
    import numpy as np
    import soundfile as sf
    data = raw.get("bytes")
    if data is None and raw.get("path") and os.path.exists(raw["path"]):
        with open(raw["path"], "rb") as fh:
            data = fh.read()
    if data is None:
        raise ValueError("no audio bytes in Audio(decode=False) payload")
    arr, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=False)
    if getattr(arr, "ndim", 1) > 1:
        arr = arr.mean(axis=1).astype("float32")
    return np.asarray(arr, dtype="float32"), int(sr)


def write_wav(out_dir, cid, arr, sr):
    import soundfile as sf
    path = os.path.join(out_dir, f"{cid}.wav")
    sf.write(path, arr, sr)
    with open(path, "rb") as fh:
        sha = hashlib.sha256(fh.read()).hexdigest()
    return path, sha, round(len(arr) / sr, 2)


def toks(text):
    return re.sub(r"[^a-z0-9' ]+", " ", (text or "").lower()).split()


def has_partial_word(text):
    # AMI marks cut-off / false-start words with a trailing hyphen, e.g. "th-".
    return bool(re.search(r"[A-Za-z]{1,}-(?:\s|$)", text or ""))


def has_repeat(ts):
    for i in range(len(ts) - 1):
        if ts[i] == ts[i + 1] and len(ts[i]) >= 2 and ts[i] not in DISFLUENCY:
            return True
    for i in range(len(ts) - 3):  # repeated bigram A B A B
        if ts[i] == ts[i + 2] and ts[i + 1] == ts[i + 3]:
            return True
    return False


def speed_bin(wps):
    if wps >= 3.2:
        return "fast"
    if wps <= 2.0:
        return "slow"
    return "normal"


def build(args):
    print("verifying licenses before any download...")
    provenance = {"corpora": [verify_license(n, m) for n, m in CORPORA.items()], "artifacts": []}
    genders = load_librispeech_genders()

    from datasets import load_dataset, Audio

    clips = []
    counts = {name: 0 for _, name, _, _ in CATEGORY_SPEC}
    diversity = {"librispeech_speakers": set(), "gender": {"M": 0, "F": 0, "unknown": 0},
                 "speed": {"fast": 0, "normal": 0, "slow": 0}}

    # ---- LibriSpeech dev-clean: clean natural speech across distinct speakers
    # (also supplies accent/gender/speed diversity = category 12).
    print("streaming LibriSpeech clean/validation (decode=False + soundfile)...")
    ls = load_dataset(CORPORA["librispeech"]["hf_id"], "clean", split="validation",
                      streaming=True).cast_column("audio", Audio(decode=False))
    seen_speakers = set()
    n = 0
    for ex in ls:
        spk = str(ex.get("speaker_id"))
        if spk in seen_speakers:
            continue
        arr, sr = decode_audio(ex["audio"])
        dur = len(arr) / sr
        if dur > args.max_seconds or dur < 2:
            continue
        seen_speakers.add(spk)
        cid = f"librispeech-clean-{n}"
        path, sha, secs = write_wav(args.out, cid, arr, sr)
        wps = round(len(toks(ex["text"])) / secs, 2) if secs else 0
        gender = genders.get(spk, "unknown")
        diversity["librispeech_speakers"].add(spk)
        diversity["gender"][gender if gender in ("M", "F") else "unknown"] += 1
        diversity["speed"][speed_bin(wps)] += 1
        provenance["artifacts"].append({"id": cid, "corpus": "librispeech", "speaker_id": spk,
                                        "gender": gender, "words_per_sec": wps, "sha256": sha, "seconds": secs})
        clips.append({
            "id": cid, "category": "clean_natural_speech", "audio": path,
            "referenceTranscript": ex["text"],
            "expected": {"clean": True, "hasFiller": False, "hasFalseStartOrRepetition": False, "offScriptWords": []},
        })
        counts["clean_natural_speech"] += 1
        counts["accent_gender_speed"] += 1
        n += 1
        if n >= args.clean:
            break

    # ---- AMI ihm: spontaneous close-talking speech → disfluencies, chosen by
    # transcript annotation. Covers categories 2,3,4,5,7,10.
    print("streaming AMI ihm/validation (transcript-driven category selection)...")
    ami = load_dataset(CORPORA["ami"]["hf_id"], "ihm", split="validation",
                       streaming=True).cast_column("audio", Audio(decode=False))
    want = {"filler_um_uh": args.ami_per_category, "discourse_like": args.ami_per_category,
            "discourse_well_so": args.ami_per_category, "false_start_correction": args.ami_per_category,
            "repetition_accidental": args.ami_per_category, "off_script_spontaneous": args.ami_per_category}
    n = 0
    for ex in ami:
        text = ex.get("text") or ex.get("transcript") or ""
        ts = toks(text)
        if len(ts) < 4:
            continue
        cat = None
        if counts["filler_um_uh"] < want["filler_um_uh"] and any(t in DISFLUENCY for t in ts):
            cat = ("filler_um_uh", {"hasFiller": True})
        elif counts["discourse_like"] < want["discourse_like"] and any(t in LIKE for t in ts):
            cat = ("discourse_like", {"hasFiller": True})  # discourse markers are filler-family (low conf)
        elif counts["discourse_well_so"] < want["discourse_well_so"] and any(t in WELLSO for t in ts):
            cat = ("discourse_well_so", {"hasFiller": True})
        elif counts["false_start_correction"] < want["false_start_correction"] and has_partial_word(text):
            cat = ("false_start_correction", {"hasFalseStartOrRepetition": True})
        elif counts["repetition_accidental"] < want["repetition_accidental"] and has_repeat(ts):
            cat = ("repetition_accidental", {"hasFalseStartOrRepetition": True})
        elif counts["off_script_spontaneous"] < want["off_script_spontaneous"]:
            cat = ("off_script_spontaneous", {})
        if not cat:
            if all(counts[k] >= want[k] for k in want):
                break
            continue
        arr, sr = decode_audio(ex["audio"])
        dur = len(arr) / sr
        if dur > args.max_seconds or dur < 1.5:
            continue
        key, exp = cat
        cid = f"ami-{key}-{n}"
        path, sha, secs = write_wav(args.out, cid, arr, sr)
        provenance["artifacts"].append({"id": cid, "corpus": "ami", "config": "ihm", "category": key, "sha256": sha, "seconds": secs})
        base = {"clean": False, "hasFiller": False, "hasFalseStartOrRepetition": False, "offScriptWords": []}
        base.update(exp)
        clips.append({"id": cid, "category": f"ami_{key}", "audio": path, "referenceTranscript": text, "expected": base})
        counts[key] += 1
        n += 1
        if all(counts[k] >= want[k] for k in want):
            break

    # ---- AMI sdm: single distant mic = far-field / background noise (category
    # 11). Fail-soft: if the config doesn't stream, category 11 reports 0
    # (deferred) rather than crashing the build.
    print("streaming AMI sdm/validation for background-noise coverage...")
    try:
        sdm = load_dataset(CORPORA["ami"]["hf_id"], "sdm", split="validation",
                           streaming=True).cast_column("audio", Audio(decode=False))
        m = 0
        for ex in sdm:
            text = ex.get("text") or ex.get("transcript") or ""
            if len(toks(text)) < 4:
                continue
            arr, sr = decode_audio(ex["audio"])
            dur = len(arr) / sr
            if dur > args.max_seconds or dur < 1.5:
                continue
            cid = f"ami-background_noise-{m}"
            path, sha, secs = write_wav(args.out, cid, arr, sr)
            provenance["artifacts"].append({"id": cid, "corpus": "ami", "config": "sdm", "category": "background_noise", "sha256": sha, "seconds": secs})
            clips.append({"id": cid, "category": "ami_background_noise", "audio": path, "referenceTranscript": text,
                          "expected": {"clean": False, "hasFiller": False, "hasFalseStartOrRepetition": False, "offScriptWords": []}})
            counts["background_noise"] += 1
            m += 1
            if m >= args.ami_per_category:
                break
    except Exception as e:  # noqa: BLE001 — noise coverage is best-effort
        print(f"  ::warning::AMI sdm not available for background-noise coverage ({e}); category 11 reports 0 (deferred)")

    diversity["librispeech_speakers"] = len(diversity["librispeech_speakers"])
    categories = [{"id": cid, "name": name, "coverage": cov, "source": src, "count": counts[name]}
                  for cid, name, cov, src in CATEGORY_SPEC]
    manifest = {"provenance": provenance, "categories": categories, "diversity": diversity, "clips": clips}
    return manifest, provenance


def write_json(path, obj):
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=2)
        fh.flush()
        os.fsync(fh.fileno())


def validate(out_dir, manifest):
    """Re-open every emitted artifact and prove it is real before we trust it.
    Returns a list of error strings (empty == valid)."""
    errs = []
    mpath = os.path.join(out_dir, "manifest.json")
    ppath = os.path.join(out_dir, "provenance.json")
    for p in (mpath, ppath):
        if not os.path.exists(p) or os.path.getsize(p) == 0:
            errs.append(f"missing/empty artifact: {p}")
    if errs:
        return errs
    reopened = json.load(open(mpath))
    prov = json.load(open(ppath))
    clips = reopened.get("clips") or []
    if not clips:
        errs.append("manifest has zero clips")
    # Core categories that carry predefined thresholds MUST be present.
    core = {"clean_natural_speech", "filler_um_uh", "repetition_accidental"}
    present = {c["name"] for c in reopened.get("categories", []) if c["count"] > 0}
    for c in core:
        if c not in present:
            errs.append(f"core category '{c}' has zero clips")
    # Every clip: required fields + audio file exists with matching sha256.
    shas = {a["id"]: a.get("sha256") for a in prov.get("artifacts", [])}
    for cl in clips:
        for f in ("id", "category", "audio", "referenceTranscript", "expected"):
            if f not in cl:
                errs.append(f"clip {cl.get('id','?')} missing field {f}")
        ap = cl.get("audio", "")
        if not ap or not os.path.exists(ap) or os.path.getsize(ap) == 0:
            errs.append(f"clip {cl.get('id')} audio missing/empty: {ap}")
            continue
        with open(ap, "rb") as fh:
            actual = hashlib.sha256(fh.read()).hexdigest()
        if shas.get(cl["id"]) != actual:
            errs.append(f"clip {cl['id']} sha256 mismatch (provenance {shas.get(cl['id'])} != file {actual})")
    return errs


def run():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--clean", type=int, default=5)
    ap.add_argument("--ami-per-category", type=int, default=3)
    ap.add_argument("--max-seconds", type=float, default=20.0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    manifest, provenance = build(args)
    write_json(os.path.join(args.out, "manifest.json"), manifest)
    write_json(os.path.join(args.out, "provenance.json"), provenance)

    errs = validate(args.out, manifest)
    print("\ncategory accounting (all 12 required):")
    for c in manifest["categories"]:
        print(f"  [{c['id']:>2}] {c['name']:<24} count={c['count']:<2} ({c['coverage']}) — {c['source']}")
    print(f"diversity: {json.dumps(manifest['diversity'])}")
    print(f"built {len(manifest['clips'])} clips → {os.path.join(args.out, 'manifest.json')}")
    if errs:
        print("\nCORPUS VALIDATION FAILED:")
        for e in errs:
            print(f"  - {e}")
        return 1
    print("corpus validation OK (artifacts reopened, schema + sha256 verified, core categories present)")
    return 0


if __name__ == "__main__":
    # Fail-CLOSED: any unexpected exception forces a NON-ZERO exit so an earlier
    # failure can never be masked by a clean process exit.
    try:
        code = run()
    except SystemExit as e:  # argparse / explicit — preserve its code
        code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
    except BaseException:  # noqa: BLE001
        traceback.print_exc()
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)
    sys.stdout.flush()
    sys.stderr.flush()
    # Controlled exit (documented defense-in-depth): the primary fix is removing
    # librosa/numba (see module docstring) so normal teardown is clean. We STILL
    # os._exit here so that if any transitively-installed native lib regresses
    # the finalization teardown, a fully-built+validated corpus (code==0) cannot
    # be turned red by a teardown segfault — and a failed/invalid build (code!=0)
    # still exits non-zero. This runs ONLY after: files flushed/fsynced/closed,
    # reopened + schema-validated + non-empty, all 12 categories accounted, core
    # categories present, and every exception path forced non-zero above.
    # Removal tracked in issue #192 once CI confirms clean teardown without it
    # (guarded by scripts/speech-eval/test_build_corpus.py).
    os._exit(code)
