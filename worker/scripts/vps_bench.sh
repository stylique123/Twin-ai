#!/usr/bin/env bash
# ==========================================================================
# TwinAI Phase 5 — AUTHORITATIVE `small` runtime benchmark on the production VPS
# (task #116). Run THIS on the VPS to produce the pass/fail the reviewer requires
# before Phase 5 can merge. One command; no Python/Docker knowledge needed.
#
# What it does:
#   1. Fetches the exact about-to-merge branch (rebuild/editor-v2-phase5) into a
#      throwaway dir — so you benchmark the code that will ship, not `main`.
#   2. Runs worker/scripts/bench_speech.py INSIDE the production worker image
#      (twinai-worker) so it uses the SAME faster-whisper + baked `small` model
#      the real jobs use. Nothing touches the DB, storage, or the live worker.
#   3. Evaluates the measured numbers against the PREDEFINED capacity limits in
#      worker/scripts/bench_thresholds.json with --gate, and exits non-zero on
#      any fail. It prints "CAPACITY GATE: PASS" or "... FAIL".
#
# USAGE (on the VPS, as a user who can run docker):
#   bash vps_bench.sh --audio /path/to/a-real-speech-clip.wav
#
#   No clip handy? Make one from ANY video or audio you already have:
#     ffmpeg -i your-recording.mp4 -ac 1 -ar 16000 -t 60 clip.wav
#     bash vps_bench.sh --audio clip.wav
#   (mono, 16 kHz, ~30–60 s of real speech is ideal.)
#
# Options:
#   --audio PATH     required — a mono 16 kHz WAV of real speech
#   --image NAME     worker image to run inside (default: twinai-worker)
#   --branch NAME    branch to benchmark (default: rebuild/editor-v2-phase5)
#   --runs N         serial timing runs (default 3)
#   --concurrency N  parallel bridges for the concurrency check (default 2)
# ==========================================================================
set -euo pipefail

AUDIO=""
IMAGE="twinai-worker"
BRANCH="rebuild/editor-v2-phase5"
RUNS=3
CONC=2
REPO="https://github.com/stylique123/Twin-ai.git"

while [ $# -gt 0 ]; do
  case "$1" in
    --audio) AUDIO="$2"; shift 2;;
    --image) IMAGE="$2"; shift 2;;
    --branch) BRANCH="$2"; shift 2;;
    --runs) RUNS="$2"; shift 2;;
    --concurrency) CONC="$2"; shift 2;;
    -h|--help) sed -n '2,40p' "$0"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

command -v docker >/dev/null || { echo "ERROR: docker not found on this box." >&2; exit 2; }
[ -n "$AUDIO" ] || { echo "ERROR: --audio is required (a mono 16k WAV). See --help." >&2; exit 2; }
[ -f "$AUDIO" ] || { echo "ERROR: audio file not found: $AUDIO" >&2; exit 2; }

# The production runtime image must exist (deploy-vps.sh builds it as
# 'twinai-worker'). If it's missing, tell the operator rather than guessing.
docker image inspect "$IMAGE" >/dev/null 2>&1 || {
  echo "ERROR: docker image '$IMAGE' not found." >&2
  echo "       Deploy the worker first (sudo bash worker/deploy-vps.sh) or pass --image <name>." >&2
  exit 2
}

# Fetch the about-to-merge worker/ tree into a throwaway dir (faithful to the
# code under review; the image only supplies the Python runtime + model cache).
WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
echo "==> fetching $BRANCH (shallow) for the exact bench + bridge code"
git clone --depth 1 --branch "$BRANCH" "$REPO" "$WORK/src" >/dev/null 2>&1 || {
  echo "ERROR: could not clone $BRANCH from $REPO" >&2; exit 2; }

AUDIO_ABS="$(cd "$(dirname "$AUDIO")" && pwd)/$(basename "$AUDIO")"
OUTDIR="$(pwd)/vps-bench-out"
mkdir -p "$OUTDIR"

echo "==> running the authoritative capacity gate inside '$IMAGE' (small)"
echo "    audio=$AUDIO_ABS  runs=$RUNS  concurrency=$CONC"
# Mount the phase5 worker/ over /bench (read-only) and the clip in read-only.
# bench_speech.py shells out to ../editor_speech.py (the phase5 one) and imports
# faster-whisper from the image; the baked `small` model resolves from cache.
set +e
docker run --rm \
  --cpus "${TWINAI_WORKER_CPUS:-1.5}" --memory 4g \
  -e EDITOR_SPEECH_MODEL=small \
  -v "$WORK/src/worker":/bench:ro \
  -v "$AUDIO_ABS":/clip.wav:ro \
  -v "$OUTDIR":/out \
  -w /out \
  "$IMAGE" \
  python3 /bench/scripts/bench_speech.py \
    --audio /clip.wav --model small --runs "$RUNS" --concurrency "$CONC" \
    --gate --label vps
RC=$?
set -e

echo
if [ "$RC" -eq 0 ]; then
  echo "==> RESULT: CAPACITY GATE PASSED (rc=0)."
  echo "    Report saved to: $OUTDIR/speech-bench-report.json — attach it to the Phase 5 PASS record."
else
  echo "==> RESULT: CAPACITY GATE FAILED (rc=$RC)."
  echo "    Do NOT approve Phase 5. Report the failing check(s) above; the box may be undersized or oversubscribed."
fi
exit "$RC"
