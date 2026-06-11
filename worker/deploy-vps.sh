#!/usr/bin/env bash
# TwinAI worker — deploy/update on a Hetzner (or any Ubuntu) VPS via Docker.
#
# Runs the background worker (yt-dlp + faster-whisper + job-queue poller) as an
# isolated, auto-restarting container. Safe to run alongside other services on
# the box — it's CPU-capped and only talks out to Supabase/Gemini/social sites.
#
# USAGE (on the server):
#   1) Install Docker once if needed:   curl -fsSL https://get.docker.com | sh
#   2) Create the secrets file:         sudo nano /opt/twinai-worker.env   (template below)
#   3) Run this script:                 curl -fsSL https://raw.githubusercontent.com/stylique123/Twin-ai/claude/nice-mccarthy-83efee/worker/deploy-vps.sh | sudo bash
#      (or: sudo bash worker/deploy-vps.sh from a checkout)
#
# /opt/twinai-worker.env template (chmod 600):
#   SUPABASE_URL=https://jmdecibuytznsonrasxw.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=<service-role key from Supabase → Settings → API>
#   GEMINI_API_KEY=<your Gemini key>
#   WORKER_JOB_TYPES=ingest,transcribe,build_voice
#   WHISPER_MODEL=small        # tiny|base|small — drop to base/tiny on a small box
#   WORKER_MAX_MEDIA_SECS=900
set -euo pipefail

REPO="https://github.com/stylique123/Twin-ai.git"
BRANCH="claude/nice-mccarthy-83efee"
SRC="/opt/twinai-worker-src"
ENV_FILE="/opt/twinai-worker.env"
NAME="twinai-worker"
CPUS="${TWINAI_WORKER_CPUS:-1.5}"   # cap CPU so it never starves other services

command -v docker >/dev/null || { echo "Docker not found. Install: curl -fsSL https://get.docker.com | sh"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE — create it first (see header of this script)."; exit 1; }

echo "==> Fetching source ($BRANCH)"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch --depth 1 origin "$BRANCH"
  git -C "$SRC" reset --hard "origin/$BRANCH"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$SRC"
fi

echo "==> Building image (bakes ffmpeg + yt-dlp + faster-whisper model)"
docker build -t "$NAME" "$SRC/worker"

echo "==> (Re)starting container"
docker rm -f "$NAME" 2>/dev/null || true
docker run -d --name "$NAME" \
  --restart unless-stopped \
  --cpus "$CPUS" \
  --memory 4g \
  --env-file "$ENV_FILE" \
  "$NAME"

echo "==> Up. Follow logs with:  docker logs -f $NAME"
docker logs --tail 20 "$NAME" || true
