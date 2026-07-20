#!/usr/bin/env python3
"""Fetch + VERIFY the pinned Faster-Whisper snapshot for the Phase 5 speech component.

Reads a checked-in manifest (repository, revision, per-file SHA-256), downloads
EXACTLY that revision from the Hub into a deterministic local path, then
re-hashes every listed file and compares to the manifest. ANY missing file or
digest mismatch is a NON-ZERO exit — the immutable `speech` component must be
byte-reproducible, so the Docker/CI build fails rather than bake a drifted
model.

Independent verification: SHA-256 is content-addressed, so re-hashing the freshly
downloaded bytes and comparing to the manifest proves the revision's content
regardless of whether the manifest's claimed digests are trustworthy. If someone
seeds a wrong digest, this fails; if the Hub silently moves bytes, this fails.

Used by worker/Dockerfile (build time) and by CI (speech-eval + staging) so the
runtime, CI and VPS all load the identical bytes. Stdlib + huggingface_hub only.

  python3 fetch_model.py --manifest models/faster-whisper-small.manifest.json \
      --dest /opt/models/faster-whisper-small
"""
import argparse
import hashlib
import json
import os
import sys


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_dir(files, dest):
    """Pure, offline-testable: compare each manifest file's SHA-256 to disk.

    files: {name -> expected_sha256}. Returns a list of human-readable errors
    (empty == all good).
    """
    errors = []
    for name, want in files.items():
        p = os.path.join(dest, name)
        if not os.path.isfile(p):
            errors.append(f"MISSING {name}")
            continue
        got = sha256_file(p)
        if got != want:
            errors.append(f"DIGEST MISMATCH {name}: got {got} want {want}")
    return errors


def manifest_sha256(man):
    """Stable identity of the pinned model, echoed into speech provenance.

    Canonical over the SEMANTIC core only (repository, revision, files) so
    comments/formatting never change it. Computed here (Python) as the single
    source of truth; TS/JS consumers echo this value, never recompute it.
    """
    core = {"repository": man["repository"], "revision": man["revision"], "files": man["files"]}
    canon = json.dumps(core, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--dest", required=True)
    ap.add_argument("--verify-only", action="store_true",
                    help="skip download; only re-hash an already-populated --dest")
    args = ap.parse_args()

    with open(args.manifest) as f:
        man = json.load(f)
    repo, rev, files = man["repository"], man["revision"], man["files"]

    if not args.verify_only:
        # Pin to the EXACT commit sha. huggingface_hub resolves a full 40-char sha
        # to that immutable commit; a moving branch name would defeat the purpose.
        if len(rev) != 40:
            print(f"ERROR: revision must be a full 40-char commit sha, got {rev!r}", file=sys.stderr)
            sys.exit(2)
        from huggingface_hub import snapshot_download
        snapshot_download(repo_id=repo, revision=rev, local_dir=args.dest)

    errors = verify_dir(files, args.dest)
    if errors:
        print("MODEL VERIFY FAILED (build must not proceed):", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        sys.exit(1)

    print(f"model verified: {repo}@{rev}")
    print(f"  files: {', '.join(sorted(files))}")
    print(f"  manifest_sha256: {manifest_sha256(man)}")
    print(f"  path: {args.dest}")


if __name__ == "__main__":
    main()
