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
#   3) Run this script:                 curl -fsSL https://raw.githubusercontent.com/stylique123/Twin-ai/main/worker/deploy-vps.sh | sudo bash
#      (or: sudo bash worker/deploy-vps.sh from a checkout)
#
# /opt/twinai-worker.env template (chmod 600):
#   SUPABASE_URL=https://jmdecibuytznsonrasxw.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=<service-role key from Supabase → Settings → API>
#   GEMINI_API_KEY=<your Gemini key>
#   APIFY_TOKEN=<Apify API token — YouTube + Instagram transcripts (yt-dlp is
#               bot-blocked on both from datacenter IPs). TikTok uses yt-dlp.>
#   APIFY_PROXY_PASSWORD=<Apify console → Settings → Proxy → Password. A DIFFERENT
#               string from the token, and not derivable from it. Meta signs its
#               thumbnails to the requesting IP, so without this Instagram scans
#               SUCCEED and return empty brand palettes — which reads as a colour
#               bug rather than a missing setting. Omitted from this template
#               until now, so any box built from it never had one.>
#   # Leave WORKER_JOB_TYPES UNSET on the shared worker — src/env.ts is the
#   # canonical registry (ingest,build_voice,scrape_dna,validate_source,validate_clip,editor_v2,purge_media,extract_product).
#   # Set it only to split types across dedicated pools (see worker/SCALING.md).
#   WHISPER_MODEL=base         # tiny|base|small — drop to tiny on a small box
#   WORKER_MAX_MEDIA_SECS=900
set -euo pipefail

REPO="https://github.com/stylique123/Twin-ai.git"
# main is the single source of truth (Vercel and the VPS both track it).
BRANCH="main"
SRC="/opt/twinai-worker-src"
ENV_FILE="/opt/twinai-worker.env"
NAME="twinai-worker"
CPUS="${TWINAI_WORKER_CPUS:-1.5}"   # cap CPU so it never starves other services

command -v docker >/dev/null || { echo "Docker not found. Install: curl -fsSL https://get.docker.com | sh"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE — create it first (see header of this script)."; exit 1; }

echo "==> Fetching source ($BRANCH)"
# ⚠️ THE DEPLOY THAT FAILS AND LEAVES THE OLD IMAGE RUNNING. Git refuses to touch
# a repository owned by another user — "detected dubious ownership" — and this
# checkout is created by root while the deploy may be invoked as another user (or
# vice versa). The script then exits under `set -e` BEFORE `docker build`, so the
# container keeps serving the previous image and nothing looks broken: the worker
# is up, healthy, polling, and running code from whenever the last deploy
# succeeded.
#
# ⚖️ MEASURED, ON THE REAL BOX. It hid TWO DAYS and ~30 merged PRs, including the
# fix for `model_routing_v1.json` — so every Gemini call in every scan kept
# failing with an error that had already been fixed in main. The deploy log said
# so plainly and nobody was reading the deploy log; the worker log said nothing at
# all, because from the worker's point of view nothing was wrong.
#
# This directory is ours and is recreated by this script, so trusting it is not a
# weakening of the check — it is telling git what it already needs to know.
git config --global --add safe.directory "$SRC" 2>/dev/null || true
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch --depth 1 origin "$BRANCH"
  # Reset to FETCH_HEAD, not origin/$BRANCH: the checkout is a single-branch
  # shallow clone, so it has no origin/<other-branch> ref to reset to.
  git -C "$SRC" reset --hard FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$SRC"
fi

echo "==> Building image (bakes ffmpeg + yt-dlp + faster-whisper model)"
docker build -t "$NAME" "$SRC/worker"

# Idempotent legacy scrub of the box env file — identical to the one
# .github/workflows/deploy-worker.yml applies, so the manual deploy path can
# never drift from the CI path. Drops old-editor/Revideo wiring and any stale
# WORKER_JOB_TYPES override (worker/src/env.ts is the single canonical registry:
# ingest,build_voice,scrape_dna,validate_source,validate_clip,editor_v2,purge_media,extract_product). A stale override
# would make the worker claim retired types it can't run AND silently exclude
# newly-registered types. Then remove any leftover Revideo container + image.
if [ -f "$ENV_FILE" ]; then
  # ⚠️ `REVIDEO[-_]`, NOT `REVIDEO_`. A real box carried `REVIDEO-TRUSTED=true`
  # with a HYPHEN, which this scrub has never matched — so it survived every
  # deploy since the old editor was removed. A hyphen is not legal in a shell
  # variable name, so `set -a; . /opt/twinai-worker.env` aborts on that line with
  # "REVIDEO-TRUSTED=true: command not found" and every command chained after it
  # silently never runs. Docker's --env-file is more permissive and passes it
  # through, which is why the worker itself never complained.
  sed -i '/^REVIDEO[-_]/d;/^PEXELS_API_KEY/d;/^MUSIC_BED_URL/d;/^EDIT_/d;/^WORKER_JOB_TYPES=/d' "$ENV_FILE" || true
fi
docker rm -f twinai-revideo 2>/dev/null || true
docker rmi -f twinai-revideo 2>/dev/null || true

echo "==> (Re)starting container"
# ⚠️ `docker restart` DOES NOT RE-READ --env-file, AND THIS IS WHERE THAT BITES.
# Docker resolves the env file ONCE, at `docker run`, and bakes the result into
# the container; restarting replays the same container with the same values. So
# editing /opt/twinai-worker.env and running `docker restart twinai-worker`
# changes nothing, reports success, and the boot line keeps saying the key is
# missing — which reads as "the edit didn't save".
#
# ⚖️ RECREATION IS THEREFORE THE ONLY WAY TO APPLY AN ENV CHANGE, and it is what
# this script does. Anyone who edits the env file by hand must run this script
# (or the CI deploy) afterwards; a restart is not enough.
docker rm -f "$NAME" 2>/dev/null || true
docker run -d --name "$NAME" \
  --restart unless-stopped \
  --cpus "$CPUS" \
  --memory 4g \
  --env-file "$ENV_FILE" \
  "$NAME"

# ⚠️ SAY WHICH COMMIT IS NOW RUNNING. The failure this script just learned to
# avoid was invisible because a stale container looks exactly like a fresh one —
# up, healthy, polling. Printing the deployed SHA makes "did my fix land?"
# answerable from the deploy output instead of by reading behaviour for two days.
DEPLOYED="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "==> Up, running $DEPLOYED. Compare against the head of main."
echo "==> Follow logs with:  docker logs -f $NAME"
# The boot line reports which credentials are present; a WARN here names the
# variable to set rather than the symptom to debug.
docker logs --tail 20 "$NAME" || true
