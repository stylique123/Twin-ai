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
import re
import sys

# A pinned revision must be an EXACT immutable commit sha — 40 lowercase hex.
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
# The load-required file set for a CTranslate2 Faster-Whisper snapshot. EVERY one
# must be present in the manifest and digest-verified — the single source of truth
# reused by download, --verify-only, the runtime bridge, CI, and the benchmark.
REQUIRED_FILES = ("model.bin", "config.json", "tokenizer.json", "vocabulary.txt")


def valid_revision(rev):
    return bool(REVISION_RE.fullmatch(rev or ""))


def valid_digest(d):
    return bool(DIGEST_RE.fullmatch(d or ""))


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


def manifest_core(man):
    """The SEMANTIC core that identifies the model bytes: repository, revision,
    and the required-file digests. Comments/formatting/analyzerBundle are NOT
    part of it (analyzerBundle is version-coupling metadata, not model identity)."""
    return {"repository": man["repository"], "revision": man["revision"], "files": man["files"]}


def manifest_sha256(man):
    """Stable digest of the semantic core, echoed into speech provenance.

    Canonical (sorted keys, no spaces) so comments/formatting never change it.
    Computed here (Python) as the single source of truth; other consumers that
    assert it recompute the SAME canonicalization over the same core."""
    canon = json.dumps(manifest_core(man), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def validate_manifest(man):
    """Structural manifest validation, shared by every entry point. Raises
    ValueError (stable, path-free) on any defect. Enforces: valid 40-hex revision;
    ALL REQUIRED_FILES present with 64-hex digests; a nonempty analyzer bundle."""
    if not valid_revision(man.get("revision")):
        raise ValueError("model_pin_failed: manifest revision is not a 40-char commit sha")
    if not isinstance(man.get("repository"), str) or not man["repository"]:
        raise ValueError("model_pin_failed: manifest repository missing")
    bundle = man.get("analyzerBundle")
    if not isinstance(bundle, str) or not bundle.strip():
        raise ValueError("model_pin_failed: manifest analyzerBundle missing/empty")
    files = man.get("files") or {}
    for name in REQUIRED_FILES:
        if name not in files:
            raise ValueError(f"model_pin_failed: manifest missing required file {name}")
        if not valid_digest(files[name]):
            raise ValueError(f"model_pin_failed: manifest digest for {name} is not 64-hex")


def verified_identity(manifest_path, model_dir):
    """SINGLE shared verifier: validate the manifest, re-hash every load-required
    file in `model_dir` against it, and derive the pinned identity ONLY from the
    manifest whose files verified. Raises ValueError (stable, path-free message)
    on any failure — never returns identity for unverified bytes. Reused by
    download, --verify-only, the runtime bridge, CI, and the benchmark so the
    digest logic cannot drift."""
    with open(manifest_path, encoding="utf-8") as f:
        man = json.load(f)
    validate_manifest(man)
    # Verify ALL required files (not just whatever the manifest happens to list).
    errors = verify_dir({k: man["files"][k] for k in REQUIRED_FILES}, model_dir)
    if errors:
        raise ValueError("model_pin_failed: " + "; ".join(errors))   # basenames + codes only
    return {
        "repository": man["repository"],
        "revision": man["revision"],
        "artifact_sha256": man["files"]["model.bin"],
        "manifest_sha256": manifest_sha256(man),
        "analyzer_bundle": man["analyzerBundle"],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--dest", required=True)
    ap.add_argument("--verify-only", action="store_true",
                    help="skip download; only re-hash an already-populated --dest")
    args = ap.parse_args()

    with open(args.manifest) as f:
        man = json.load(f)

    if not args.verify_only:
        # Validate structure (revision/required-files/digests/bundle) BEFORE the
        # network call; then pin to the EXACT commit sha (a moving branch would
        # defeat the purpose).
        try:
            validate_manifest(man)
        except ValueError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(2)
        from huggingface_hub import snapshot_download
        snapshot_download(repo_id=man["repository"], revision=man["revision"], local_dir=args.dest)

    # Download, --verify-only, runtime, CI and the benchmark ALL finish through
    # this one validator — no weaker duplicate success path.
    try:
        ident = verified_identity(args.manifest, args.dest)
    except ValueError as e:
        print(f"MODEL VERIFY FAILED (build must not proceed): {e}", file=sys.stderr)
        sys.exit(1)

    print(f"model verified: {ident['repository']}@{ident['revision']}")
    print(f"  files: {', '.join(sorted(REQUIRED_FILES))}")
    print(f"  analyzer_bundle: {ident['analyzer_bundle']}")
    print(f"  manifest_sha256: {ident['manifest_sha256']}")
    print(f"  path: {args.dest}")


if __name__ == "__main__":
    main()
