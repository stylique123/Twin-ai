#!/usr/bin/env python3
"""Build the Phase 5 human-speech evaluation corpus IN CI (runners have open
internet; the build sandbox does not). Verifies each corpus license BEFORE
downloading anything, streams category-labelled slices from two permissively-
licensed public corpora, and emits a corpus that populates ALL 12 required
categories with REAL human audio. Writes wavs into an ephemeral private runner
directory (never committed to Git), plus:

  <out>/manifest.json    — clips (audio, referenceTranscript, scriptReference,
                           category, `expected` presence labels, offScriptWords),
                           a `categories` accounting of all 12 categories, and a
                           `diversity` summary.
  <out>/provenance.json  — dataset versions, licenses, source URLs, per-file
                           SHA-256, attribution, speaker/gender/speed metadata,
                           and full disclosure of every CONSTRUCTED clip.

Audio decode: `datasets` Audio(decode=False) (raw bytes, no decoder invoked) +
soundfile (libsndfile). We do NOT install/import librosa (it pulls numba, whose
native teardown segfaults at interpreter finalization). This process therefore
exits NORMALLY (no os._exit) — proving the crash is fixed at the source.

Construction disclosure: categories 5 (false-start), 6 (rhetorical repetition),
8 (long dead air) and 9 (short emphasis pause) are hard to isolate reliably from
streamed public annotations, so they are CONSTRUCTED on REAL human audio — a
real speaker's own voice, with the phenomenon introduced by duplicating a short
leading segment (5/6) or inserting a measured silence (8/9). Every constructed
clip is flagged `constructed: true` in provenance with its method + parameters.

Requires: datasets, soundfile, numpy, requests. NOT librosa / numba.
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

CORPORA = {
    "librispeech": {
        "hf_id": "openslr/librispeech_asr",
        "readme": "https://huggingface.co/datasets/openslr/librispeech_asr/raw/main/README.md",
        "license": "cc-by-4.0",
        "attribution": "Panayotov et al., LibriSpeech, ICASSP 2015",
        "source": "https://www.openslr.org/12",
        # Official OpenSLR mirror hosts for the standalone speaker-metadata file.
        # If none serves it, gender is HONESTLY reported unknown (never guessed)
        # and gender/accent diversity falls to the private pre-beta gate, where
        # consent metadata is collected directly from participants.
        "speakers_txt": ["https://www.openslr.org/resources/12/SPEAKERS.TXT",
                          "https://us.openslr.org/resources/12/SPEAKERS.TXT",
                          "https://openslr.elda.org/resources/12/SPEAKERS.TXT",
                          "https://openslr.magicdatatech.com/resources/12/SPEAKERS.TXT"],
    },
    "ami": {
        "hf_id": "edinburghcstr/ami",
        "readme": "https://huggingface.co/datasets/edinburghcstr/ami/raw/main/README.md",
        "license": "cc-by-4.0",
        "attribution": "Carletta et al., The AMI Meeting Corpus, MLMI 2005",
        "source": "https://groups.inf.ed.ac.uk/ami/corpus/",
    },
}

DISFLUENCY = {"um", "uh", "uhm", "umm", "uhh", "erm", "er", "ah", "mm", "hmm", "mmm", "mmhmm", "mm-hmm"}
LIKE = {"like"}
WELLSO = {"well", "so", "actually", "basically", "right"}
STOPWORDS = {"the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with",
             "is", "are", "was", "were", "be", "been", "it", "its", "this", "that", "these",
             "those", "i", "you", "he", "she", "we", "they", "as", "by", "from", "not", "no"}

# The 12 required categories. Every one is populated with real evaluated clips.
CATEGORY_SPEC = [
    (1, "clean_natural_speech", "corpus", "LibriSpeech dev-clean"),
    (2, "filler_um_uh", "corpus", "AMI ihm — transcript contains um/uh"),
    (3, "discourse_like", "corpus", "AMI ihm — transcript contains 'like'"),
    (4, "discourse_well_so", "corpus", "AMI ihm — transcript contains well/so/etc."),
    (5, "false_start_correction", "constructed", "real LibriSpeech voice, leading segment duplicated with a >=150ms pause"),
    (6, "repetition_rhetorical", "constructed", "real LibriSpeech voice, leading segment duplicated with ~no pause"),
    (7, "repetition_accidental", "corpus", "AMI ihm — adjacent repeated token/bigram"),
    (8, "long_dead_air", "constructed", "real LibriSpeech voice, 2500ms silence inserted (>= DEAD_AIR_MS)"),
    (9, "short_emphasis_pause", "constructed", "real LibriSpeech voice, 400ms silence inserted (< silenceMinMs)"),
    (10, "off_script_spontaneous", "corpus", "AMI ihm — spontaneous meeting speech, no script"),
    (11, "background_noise", "corpus", "AMI sdm — single distant mic, far-field/noisy"),
    (12, "accent_gender_speed", "corpus", "LibriSpeech speaker/gender/speed diversity (see manifest.diversity)"),
]


def verify_license(name, meta):
    r = requests.get(meta["readme"], timeout=60)
    r.raise_for_status()
    if meta["license"] not in r.text[:4000].lower():
        raise SystemExit(f"license verification FAILED for {name}: expected {meta['license']} in card")
    print(f"  verified {name}: license {meta['license']} ({meta['hf_id']})")
    return {"name": name, **{k: meta[k] for k in ("hf_id", "license", "attribution", "source")}}


def load_librispeech_genders():
    """speaker_id -> 'M'/'F' from the public SPEAKERS metadata (same corpus,
    CC BY 4.0). Tries multiple mirrors; diagnostics printed; never fatal."""
    for url in CORPORA["librispeech"]["speakers_txt"]:
        try:
            r = requests.get(url, timeout=60)
            r.raise_for_status()
            genders = {}
            for line in r.text.splitlines():
                if line.startswith(";") or "|" not in line:
                    continue
                parts = [p.strip() for p in line.split("|")]
                if len(parts) >= 2 and parts[0].isdigit() and parts[1] in ("M", "F"):
                    genders[parts[0]] = parts[1]
            if genders:
                sample = list(genders.items())[:3]
                print(f"  loaded gender for {len(genders)} LibriSpeech speakers from {url} (sample {sample})")
                return genders
        except Exception as e:  # noqa: BLE001
            print(f"  ::warning::gender source failed ({url}): {e}")
    print("  ::warning::no LibriSpeech gender metadata available; gender reported unknown")
    return {}


def decode_audio(raw):
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


def has_repeat(ts):
    for i in range(len(ts) - 1):
        if ts[i] == ts[i + 1] and len(ts[i]) >= 2 and ts[i] not in DISFLUENCY:
            return True
    for i in range(len(ts) - 3):
        if ts[i] == ts[i + 2] and ts[i + 1] == ts[i + 3]:
            return True
    return False


def speed_bin(wps):
    return "fast" if wps >= 3.2 else "slow" if wps <= 2.0 else "normal"


def pick_offscript(text, n=2):
    """Designate up to n real content words as 'off-script additions' the speaker
    made beyond an intended script. Returns (scriptReference, offScriptWords).
    Content words only (never a filler/discourse/stopword), so the editor should
    RETAIN them (they must never become removal candidates)."""
    ts = toks(text)
    cand = [t for t in ts if len(t) >= 4 and t not in DISFLUENCY and t not in LIKE
            and t not in WELLSO and t not in STOPWORDS]
    seen, chosen = set(), []
    for t in cand:
        if t in seen:
            continue
        seen.add(t)
        chosen.append(t)
    # spread picks across the utterance
    picks = chosen[:: max(1, len(chosen) // max(1, n))][:n] if chosen else []
    remove = set(picks)
    script = " ".join(t for t in ts if t not in remove)
    return script, picks


def main():
    import numpy as np

    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--clean", type=int, default=5)
    ap.add_argument("--ami-per-category", type=int, default=3)
    ap.add_argument("--filler-clips", type=int, default=6)
    ap.add_argument("--constructed-per-category", type=int, default=4)
    ap.add_argument("--max-seconds", type=float, default=20.0)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    print("verifying licenses before any download...")
    provenance = {"corpora": [verify_license(n, m) for n, m in CORPORA.items()], "artifacts": []}
    genders = load_librispeech_genders()

    from datasets import load_dataset, Audio

    clips = []
    counts = {name: 0 for _, name, _, _ in CATEGORY_SPEC}
    diversity = {"librispeech_speakers": set(), "gender": {"M": 0, "F": 0, "unknown": 0},
                 "speed": {"fast": 0, "normal": 0, "slow": 0},
                 "accent": "unlabelled_in_source (LibriSpeech has no accent labels; real accent diversity is a private pre-beta gate item)"}

    # ---- LibriSpeech clean + a pool of construction bases -------------------
    print("streaming LibriSpeech clean/validation (decode=False + soundfile)...")
    ls = load_dataset(CORPORA["librispeech"]["hf_id"], "clean", split="validation",
                      streaming=True).cast_column("audio", Audio(decode=False))
    seen_speakers = set()
    bases = []  # (arr, sr, text) real single-speaker clips reused for construction
    n = 0
    for ex in ls:
        spk = str(ex.get("speaker_id"))
        arr, sr = decode_audio(ex["audio"])
        dur = len(arr) / sr
        if dur > args.max_seconds or dur < 2:
            continue
        if spk not in seen_speakers and n < args.clean:
            seen_speakers.add(spk)
            cid = f"librispeech-clean-{n}"
            path, sha, secs = write_wav(args.out, cid, arr, sr)
            wps = round(len(toks(ex["text"])) / secs, 2) if secs else 0
            gender = genders.get(spk, "unknown")
            diversity["librispeech_speakers"].add(spk)
            diversity["gender"][gender if gender in ("M", "F") else "unknown"] += 1
            diversity["speed"][speed_bin(wps)] += 1
            script, off = pick_offscript(ex["text"])
            clips.append({"id": cid, "category": "clean_natural_speech", "audio": path,
                          "referenceTranscript": ex["text"], "scriptReference": script,
                          "expected": {"clean": True, "hasFiller": False, "hasFalseStartOrRepetition": False,
                                       "hasLongDeadAir": False, "hasShortPauseOnly": False, "offScriptWords": off}})
            provenance["artifacts"].append({"id": cid, "corpus": "librispeech", "speaker_id": spk,
                                            "gender": gender, "words_per_sec": wps, "sha256": sha, "seconds": secs})
            counts["clean_natural_speech"] += 1
            counts["accent_gender_speed"] += 1
            n += 1
        elif len(bases) < args.constructed_per_category * 2 + 6 and 2 <= dur <= 12:
            bases.append((arr, sr, ex["text"]))
        if n >= args.clean and len(bases) >= args.constructed_per_category * 2 + 6:
            break

    # ---- Constructed on REAL audio: cats 5,6 (repeat) and 8,9 (silence) -----
    def constructed(cid, category, arr, sr, transcript, expected, method, params):
        path, sha, secs = write_wav(args.out, cid, arr, sr)
        script, off = pick_offscript(transcript) if transcript else ("", [])
        exp = {"clean": False, "hasFiller": False, "hasFalseStartOrRepetition": False,
               "hasLongDeadAir": False, "hasShortPauseOnly": False, "offScriptWords": off, **expected}
        clips.append({"id": cid, "category": category, "audio": path,
                      "referenceTranscript": transcript, "scriptReference": script, "expected": exp})
        provenance["artifacts"].append({"id": cid, "category": category, "corpus": "librispeech",
                                        "constructed": True, "method": method, "params": params,
                                        "sha256": sha, "seconds": secs})
        counts[category] += 1

    print("constructing cats 5/6/8/9 on real human audio (disclosed in provenance)...")
    bi = 0
    trims = [0.55, 0.65, 0.75, 0.85, 0.95, 0.5]
    for k in range(args.constructed_per_category):
        if bi >= len(bases):
            break
        arr, sr, text = bases[bi]; bi += 1
        lead = arr[: int(sr * trims[k % len(trims)])]
        # cat 5 false_start: lead + pause + lead (A B <pause> A B). 600ms, not
        # 300: Silero's 100ms speech pads shrink the DETECTED gap on both sides,
        # and ASR word timestamps may bridge it entirely — the rule's VAD-pause
        # evidence needs a comfortably-detectable real silence (>=150 after pads).
        gap = np.zeros(int(sr * 0.60), dtype="float32")
        fa = np.concatenate([lead, gap, lead])
        constructed(f"fs-{k}", "false_start_correction", fa, sr, "",
                    {"hasFalseStartOrRepetition": True}, "duplicate_leading_segment_with_pause",
                    {"lead_ms": int(trims[k % len(trims)] * 1000), "pause_ms": 600})
    for k in range(args.constructed_per_category):
        if bi >= len(bases):
            break
        arr, sr, text = bases[bi]; bi += 1
        lead = arr[: int(sr * trims[k % len(trims)])]
        # cat 6 rhetorical repetition: lead + ~no pause + lead (A B A B, no gap)
        gap = np.zeros(int(sr * 0.02), dtype="float32")
        ra = np.concatenate([lead, gap, lead])
        constructed(f"rr-{k}", "repetition_rhetorical", ra, sr, "",
                    {"hasFalseStartOrRepetition": True}, "duplicate_leading_segment_no_pause",
                    {"lead_ms": int(trims[k % len(trims)] * 1000), "pause_ms": 20})
    for k in range(args.ami_per_category):
        if bi >= len(bases):
            break
        arr, sr, text = bases[bi]; bi += 1
        mid = len(arr) // 2
        # cat 8 long dead air: >= DEAD_AIR_MS (2000ms) -> dead_air candidate
        da = np.concatenate([arr[:mid], np.zeros(int(sr * 2.5), dtype="float32"), arr[mid:]])
        constructed(f"da-{k}", "long_dead_air", da, sr, text,
                    {"hasLongDeadAir": True}, "insert_silence", {"silence_ms": 2500})
    for k in range(args.ami_per_category):
        if bi >= len(bases):
            break
        arr, sr, text = bases[bi]; bi += 1
        mid = len(arr) // 2
        # cat 9 short emphasis pause: < silenceMinMs (700ms) -> NO candidate
        ep = np.concatenate([arr[:mid], np.zeros(int(sr * 0.4), dtype="float32"), arr[mid:]])
        constructed(f"ep-{k}", "short_emphasis_pause", ep, sr, text,
                    {"hasShortPauseOnly": True}, "insert_silence", {"silence_ms": 400})

    # ---- AMI ihm: cats 2,3,4,7,10 by transcript annotation -----------------
    print("streaming AMI ihm/validation (transcript-driven selection)...")
    ami = load_dataset(CORPORA["ami"]["hf_id"], "ihm", split="validation",
                       streaming=True).cast_column("audio", Audio(decode=False))
    want = {"filler_um_uh": args.filler_clips, "discourse_like": args.ami_per_category,
            "discourse_well_so": args.ami_per_category, "repetition_accidental": args.ami_per_category,
            "off_script_spontaneous": args.ami_per_category}
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
            cat = ("discourse_like", {"hasFiller": True})
        elif counts["discourse_well_so"] < want["discourse_well_so"] and any(t in WELLSO for t in ts):
            cat = ("discourse_well_so", {"hasFiller": True})
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
        script, off = pick_offscript(text)
        base = {"clean": False, "hasFiller": False, "hasFalseStartOrRepetition": False,
                "hasLongDeadAir": False, "hasShortPauseOnly": False, "offScriptWords": off}
        base.update(exp)
        clips.append({"id": cid, "category": f"ami_{key}", "audio": path,
                      "referenceTranscript": text, "scriptReference": script, "expected": base})
        provenance["artifacts"].append({"id": cid, "corpus": "ami", "config": "ihm", "category": key,
                                        "sha256": sha, "seconds": secs})
        counts[key] += 1
        n += 1
        if all(counts[k] >= want[k] for k in want):
            break

    # ---- AMI sdm: cat 11 background noise ----------------------------------
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
            script, off = pick_offscript(text)
            clips.append({"id": cid, "category": "ami_background_noise", "audio": path,
                          "referenceTranscript": text, "scriptReference": script,
                          "expected": {"clean": False, "hasFiller": False, "hasFalseStartOrRepetition": False,
                                       "hasLongDeadAir": False, "hasShortPauseOnly": False, "offScriptWords": off}})
            provenance["artifacts"].append({"id": cid, "corpus": "ami", "config": "sdm",
                                            "category": "background_noise", "sha256": sha, "seconds": secs})
            counts["background_noise"] += 1
            m += 1
            if m >= args.ami_per_category:
                break
    except Exception as e:  # noqa: BLE001
        print(f"  ::warning::AMI sdm unavailable ({e}); category 11 will report 0")

    diversity["librispeech_speakers"] = len(diversity["librispeech_speakers"])
    categories = [{"id": cid, "name": name, "coverage": cov, "source": src, "count": counts.get(name, 0)}
                  for cid, name, cov, src in CATEGORY_SPEC]
    manifest = {"provenance": provenance, "categories": categories, "diversity": diversity, "clips": clips}
    return manifest


def write_json(path, obj):
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=2)
        fh.flush()
        os.fsync(fh.fileno())


def validate(out_dir):
    """Re-open every emitted artifact FROM DISK and prove it is real."""
    errs = []
    mpath = os.path.join(out_dir, "manifest.json")
    ppath = os.path.join(out_dir, "provenance.json")
    for p in (mpath, ppath):
        if not os.path.exists(p) or os.path.getsize(p) == 0:
            errs.append(f"missing/empty artifact: {p}")
    if errs:
        return errs
    manifest = json.load(open(mpath))
    prov = json.load(open(ppath))
    clips = manifest.get("clips") or []
    if not clips:
        errs.append("manifest has zero clips")
    # EVERY category must be populated with real evaluated clips (12/12).
    for c in manifest.get("categories", []):
        if c["count"] <= 0:
            errs.append(f"category '{c['name']}' (#{c['id']}) has zero clips")
    shas = {a["id"]: a.get("sha256") for a in prov.get("artifacts", [])}
    for cl in clips:
        for f in ("id", "category", "audio", "expected", "scriptReference"):
            if f not in cl:
                errs.append(f"clip {cl.get('id', '?')} missing field {f}")
        ap = cl.get("audio", "")
        if not ap or not os.path.exists(ap) or os.path.getsize(ap) == 0:
            errs.append(f"clip {cl.get('id')} audio missing/empty: {ap}")
            continue
        with open(ap, "rb") as fh:
            actual = hashlib.sha256(fh.read()).hexdigest()
        if shas.get(cl["id"]) != actual:
            errs.append(f"clip {cl['id']} sha256 mismatch")
    return errs


SENTINEL = "build.done"


def worker():
    """Runs in the CHILD process. Imports datasets -> pyarrow, whose native
    thread-pool teardown is broken at interpreter finalization AFTER all work
    completes — nondeterministically either SIGABRT (exit 134) or a DEADLOCK
    (hang forever) — and cannot be removed while streaming HF corpora. Does the
    whole build, writes+fsyncs artifacts, validates, then writes a fsync'd
    completion sentinel BEFORE returning, so the parent can distinguish
    'finished, stuck in teardown' from 'hung mid-build'."""
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--out", required=True)
    known, _ = ap.parse_known_args()
    manifest = main()
    write_json(os.path.join(known.out, "manifest.json"), manifest)
    write_json(os.path.join(known.out, "provenance.json"), manifest["provenance"])
    errs = validate(known.out)
    print("\ncategory accounting (all 12 required):")
    for c in manifest["categories"]:
        print(f"  [{c['id']:>2}] {c['name']:<24} count={c['count']:<2} ({c['coverage']}) — {c['source']}")
    print(f"diversity: {json.dumps(manifest['diversity'])}")
    print(f"built {len(manifest['clips'])} clips → {os.path.join(known.out, 'manifest.json')}")
    if errs:
        print("\nCORPUS VALIDATION FAILED:")
        for e in errs:
            print(f"  - {e}")
        return 1
    print("corpus validation OK (12/12 categories populated; artifacts reopened, schema + sha256 verified)")
    sys.stdout.flush()
    sys.stderr.flush()
    write_json(os.path.join(known.out, SENTINEL), {"ok": True})  # all work done; only teardown remains
    return 0


def parent():
    """THIS process (invoked by CI). Imports NO datasets/pyarrow — everything
    heavy runs in an isolated child — so this process TEARS DOWN AND EXITS
    NORMALLY. No os._exit anywhere. It must survive BOTH broken child-teardown
    modes (SIGABRT and deadlock): it polls the child; once the completion
    sentinel exists (written only after every artifact is fsync'd and validated
    in-child) it grants a short grace for a clean exit, then kills the child —
    at that point the child's ONLY remaining work is interpreter finalization.
    The gate is the ARTIFACT, not the child's exit: reopen + schema + sha256 +
    12/12 re-checked here with pure stdlib. A build that failed or hung BEFORE
    finishing has no sentinel/invalid artifact and FAILS. Nothing is masked."""
    import subprocess
    import time
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--out", required=True)
    ap.add_argument("--build-deadline-sec", type=int, default=1500)  # hard cap for the BUILD itself
    known, _ = ap.parse_known_args()
    sentinel = os.path.join(known.out, SENTINEL)
    # Never trust stale outputs from a previous run: without this, a child that
    # hangs mid-build could "pass" validation on leftovers.
    os.makedirs(known.out, exist_ok=True)
    for stale in (sentinel, os.path.join(known.out, "manifest.json"), os.path.join(known.out, "provenance.json")):
        if os.path.exists(stale):
            os.remove(stale)
    proc = subprocess.Popen([sys.executable, os.path.abspath(__file__), "--worker", *sys.argv[1:]])
    deadline = time.time() + known.build_deadline_sec
    rc = None
    while True:
        try:
            rc = proc.wait(timeout=5)
            break  # child exited on its own (clean teardown or SIGABRT)
        except subprocess.TimeoutExpired:
            pass
        if os.path.exists(sentinel):
            try:
                rc = proc.wait(timeout=20)  # grace for a clean exit
            except subprocess.TimeoutExpired:
                print("::warning::corpus worker finished ALL work (sentinel present, artifacts "
                      "fsync'd + validated) but its pyarrow teardown deadlocked at interpreter "
                      "finalization; killing the finalizing child. See docs/editor-v2-phase5-speech-eval.md")
                proc.kill()
                rc = proc.wait()
            break
        if time.time() > deadline:
            print(f"corpus worker exceeded the {known.build_deadline_sec}s build deadline "
                  "WITHOUT completing (no sentinel) — killing; the artifact gate below will fail")
            proc.kill()
            rc = proc.wait()
            break
    errs = validate(known.out)
    if errs:
        print("\nCORPUS VALIDATION FAILED (parent gate — artifact invalid/incomplete):")
        for e in errs:
            print(f"  - {e}")
        print(f"(corpus worker exit code was {rc})")
        return 1
    if rc != 0:
        print(f"::warning::corpus worker exit code {rc} came from its broken pyarrow teardown "
              f"AFTER the corpus was complete; artifact re-validated OK, parent exits 0 cleanly")
    print("build_corpus: artifact validated by the parent; exiting 0 normally (no os._exit)")
    return 0


if __name__ == "__main__":
    # Fail-CLOSED: any exception -> non-zero. The parent process exits NORMALLY
    # (no os._exit); the unremovable pyarrow finalization crash is confined to
    # the child and the artifact is independently re-validated. See issue #192.
    if "--worker" in sys.argv:
        sys.argv.remove("--worker")
        try:
            sys.exit(worker())
        except SystemExit:
            raise
        except BaseException:  # noqa: BLE001
            traceback.print_exc()
            sys.exit(1)
    else:
        try:
            sys.exit(parent())
        except SystemExit:
            raise
        except BaseException:  # noqa: BLE001
            traceback.print_exc()
            sys.exit(1)
