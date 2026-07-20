#!/usr/bin/env bash
# ==========================================================================
# TwinAI Phase 5 — AUTHORITATIVE `small` benchmark on the production VPS (task
# #116), against a THROWAWAY image built from an EXACT candidate commit.
#
# Why this shape: the old bench reused the live `twinai-worker` image, which was
# built from `main` and predates the pinned-model correction — it could run the
# old alias/cache and record only `small`. This instead:
#   1. requires an exact 40-hex commit SHA (no moving branch),
#   2. checks that commit out and proves `git rev-parse HEAD` == the SHA,
#   3. builds a THROWAWAY image from it, so the Docker build itself runs
#      fetch_model.py (verifies the pinned revision + digests) and bakes
#      /opt/models + the offline ENV,
#   4. runs bench_speech.py --gate --require-identity INSIDE that image, which
#      records + gates the candidate SHA and the RUNTIME-OBSERVED model identity
#      (repository, revision, model.bin sha, manifest sha, loadedFromPath,
#      verified, analyzerBundle=speech-6),
#   5. NEVER touches the live twinai-worker container/image, and cleans up only
#      the throwaway image + checkout.
#
# USAGE (on the VPS, as a docker-capable user):
#   bash vps_bench.sh --sha <40-hex-commit> --audio clip.wav
#   (no clip? make one: ffmpeg -i any.mp4 -ac 1 -ar 16000 -t 60 clip.wav)
# ==========================================================================
set -euo pipefail

SHA=""
AUDIO=""
RUNS=3
CONC=2
REPO="https://github.com/stylique123/Twin-ai.git"

while [ $# -gt 0 ]; do
  case "$1" in
    --sha) SHA="$2"; shift 2;;
    --audio) AUDIO="$2"; shift 2;;
    --runs) RUNS="$2"; shift 2;;
    --concurrency) CONC="$2"; shift 2;;
    -h|--help) sed -n '2,30p' "$0"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

command -v docker >/dev/null || { echo "ERROR: docker not found." >&2; exit 2; }
command -v git >/dev/null || { echo "ERROR: git not found." >&2; exit 2; }
echo "$SHA" | grep -Eq '^[0-9a-f]{40}$' || { echo "ERROR: --sha must be an exact 40-hex commit SHA." >&2; exit 2; }
[ -n "$AUDIO" ] && [ -f "$AUDIO" ] || { echo "ERROR: --audio must be an existing mono 16k WAV." >&2; exit 2; }
AUDIO_ABS="$(cd "$(dirname "$AUDIO")" && pwd)/$(basename "$AUDIO")"

SHORT="${SHA:0:12}"
IMAGE="twinai-bench-$SHORT"           # throwaway; NEVER 'twinai-worker'
WORK="$(mktemp -d)"
OUTDIR="$(pwd)/vps-bench-out"
mkdir -p "$OUTDIR"
cleanup() {
  docker rmi -f "$IMAGE" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "==> fetching exact commit $SHA"
git clone --no-checkout --filter=blob:none "$REPO" "$WORK/src" >/dev/null 2>&1 || {
  echo "ERROR: clone failed" >&2; exit 2; }
git -C "$WORK/src" fetch --depth 1 origin "$SHA" >/dev/null 2>&1 || {
  echo "ERROR: could not fetch commit $SHA" >&2; exit 2; }
git -C "$WORK/src" checkout -q "$SHA"
HEAD="$(git -C "$WORK/src" rev-parse HEAD)"
[ "$HEAD" = "$SHA" ] || { echo "ERROR: checked-out HEAD $HEAD != requested $SHA" >&2; exit 2; }
echo "    HEAD verified == $SHA"

echo "==> building THROWAWAY image $IMAGE (build runs fetch_model.py + bakes /opt/models)"
# The Docker build fails here if the pinned revision/digests don't verify.
docker build -t "$IMAGE" "$WORK/src/worker" || {
  echo "ERROR: candidate image build failed (pinned-model verification or build error)." >&2; exit 1; }

echo "==> running --gate --require-identity inside the candidate image"
# Mount the candidate worker/ (bench + bridge + manifest) read-only and the clip;
# the image supplies faster-whisper + the baked, digest-verified /opt/models and
# the offline ENV. bench_speech.py records + gates the candidate SHA and the
# runtime-observed identity, and exits non-zero on any capacity OR identity fail.
set +e
docker run --rm \
  --cpus "${TWINAI_WORKER_CPUS:-1.5}" --memory 4g \
  -v "$WORK/src/worker":/bench:ro \
  -v "$AUDIO_ABS":/clip.wav:ro \
  -v "$OUTDIR":/out \
  -w /out \
  "$IMAGE" \
  python3 /bench/scripts/bench_speech.py \
    --audio /clip.wav --model small --runs "$RUNS" --concurrency "$CONC" \
    --gate --require-identity --candidate-sha "$SHA" --label vps
RC=$?
set -e

echo
if [ "$RC" -eq 0 ]; then
  echo "==> RESULT: CAPACITY + MODEL IDENTITY GATE PASSED (rc=0) for candidate $SHA."
  echo "    Report: $OUTDIR/speech-bench-report.json (includes candidateSha + runtime-observed identity)."
else
  echo "==> RESULT: GATE FAILED (rc=$RC) for candidate $SHA. Do NOT approve Phase 5."
fi
exit "$RC"
