# TwinAI worker — Node orchestrator + Python ML, with ffmpeg & yt-dlp baked in.
# Node 22 (not 20): @supabase/supabase-js needs a native WebSocket, which only
# exists from Node 22 onward.
#
# Two stages so the RUNTIME image carries NO dev dependencies (typescript/tsx/
# vitest live only in the builder). `npm audit --omit=dev` on the runtime deps
# must stay clean, and provenance is real: WORKER_GIT_SHA is injected at build
# and the boot manifest requires an exact commit + Dockerfile + dependency-lock
# digest (see editorManifest.ts / editor_pin_manifest).

# ---- builder: install ALL deps (incl. dev) and compile TS -> dist ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
# npm ci (NOT npm install): install exactly the locked closure, fail if
# package.json and package-lock.json disagree.
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime: prod node deps only + python ML + models ---------------------
FROM node:22-bookworm-slim

# yt-dlp needs a JS runtime to extract YouTube; pull the static Deno binary.
COPY --from=denoland/deno:bin-2.1.4 /deno /usr/local/bin/deno

# System deps: ffmpeg (audio extract/convert + PCM/ebur128), python3 + pip
# (faster-whisper + OpenCV), ca-certs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps from the SINGLE pinned source shared with CI (worker/
# requirements.txt): the editor's speech component must be reproducible for a
# given EDITOR_SPEECH_VERSION. Then the OpenCV runtime is installed with
# --require-hashes so the exact wheel SHA-256 is ENFORCED at install (a
# substituted wheel fails the build). (PEP 668: allow system pip.)
COPY requirements.txt requirements-opencv.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt \
    && pip3 install --no-cache-dir --break-system-packages --require-hashes -r requirements-opencv.txt

# Runtime node deps ONLY (no dev deps in the shipped image).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compiled app from the builder + the Python bridges and frozen assets.
COPY --from=builder /app/dist ./dist
COPY whisper_transcribe.py ./whisper_transcribe.py
COPY editor_speech.py ./editor_speech.py
COPY editor_visual.py ./editor_visual.py
COPY youtube_transcript.py ./youtube_transcript.py
# Frozen Phase-6 analysis rules — the single numeric authority; its canonical
# digest is an input to every component digest.
COPY analysis_rules_v1.json ./analysis_rules_v1.json
RUN mkdir -p ./models ./scripts
COPY models/faster-whisper-small.manifest.json ./models/faster-whisper-small.manifest.json
# Pinned YuNet face detector: the .onnx is COMMITTED in-repo (232 KB) and its
# identity manifest travels with it; editor_visual.py digest-verifies the
# bytes before every load (fail closed, exit 3).
COPY models/vision.manifest.json ./models/vision.manifest.json
COPY models/face_detection_yunet_2023mar.onnx ./models/face_detection_yunet_2023mar.onnx
COPY scripts/fetch_model.py ./scripts/fetch_model.py
# Boot-manifest build provenance inputs, hashed at runtime (editorManifest.ts):
# the Dockerfile + the dependency locks. WORKER_GIT_SHA is injected below.
COPY Dockerfile ./Dockerfile

# Pre-download the CAPTION/VOICE pipeline models (whisper_transcribe.py, keyed by
# WHISPER_MODEL) so those jobs never pay a per-run download. NOT `small` — the
# editor's immutable speech component pins that separately below.
RUN python3 -c "from faster_whisper import WhisperModel; [WhisperModel(m, device='cpu', compute_type='int8') for m in ('tiny','base')]"

# PIN the editor's `small` snapshot: fetch the EXACT Systran/faster-whisper-small
# revision named in the manifest and digest-verify every file. Build FAILS on any
# mismatch — the immutable `speech` component must be byte-reproducible, so a
# drifted model can never bake in. The bridge loads only /opt/models/... offline.
RUN python3 scripts/fetch_model.py \
      --manifest models/faster-whisper-small.manifest.json \
      --dest /opt/models/faster-whisper-small
ENV EDITOR_SPEECH_MODEL_PATH=/opt/models/faster-whisper-small

# Exact deployed commit, injected at build/deploy (deploy-worker.yml passes
# --build-arg WORKER_GIT_SHA=$(git rev-parse HEAD)). The boot manifest requires
# a non-null 40-hex commit, so a build without this fails closed at pin time.
ARG WORKER_GIT_SHA=""
ENV WORKER_GIT_SHA=$WORKER_GIT_SHA

ENV NODE_ENV=production

# Liveness: the worker touches /tmp/worker-alive every loop. Mark the container
# unhealthy if that file is missing or older than 90s (a wedged, not-crashed worker
# — which `--restart unless-stopped` alone can't catch). Visible via `docker ps` /
# vps-diag; pair with an autoheal watcher to auto-restart on unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD test "$(( $(date +%s) - $(stat -c %Y /tmp/worker-alive 2>/dev/null || echo 0) ))" -lt 90 || exit 1

CMD ["node", "--enable-source-maps", "dist/index.js"]
