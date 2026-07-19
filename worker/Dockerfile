# TwinAI worker — Node orchestrator + Python ML, with ffmpeg & yt-dlp baked in.
# Node 22 (not 20): @supabase/supabase-js needs a native WebSocket, which only
# exists from Node 22 onward.
FROM node:22-bookworm-slim

# yt-dlp now requires a JS runtime to extract YouTube; it auto-enables Deno when
# it's on PATH. Pull the static Deno binary from the official image.
COPY --from=denoland/deno:bin-2.1.4 /deno /usr/local/bin/deno

# System deps: ffmpeg (audio extract/convert — reused by the rebuilt editor),
# python3 + pip (faster-whisper), ca-certs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python deps from the SINGLE pinned source shared with CI (worker/
# requirements.txt): the editor's speech component must be reproducible for a
# given EDITOR_SPEECH_VERSION, so the exact ASR/VAD stack that ran in the
# staging gate is the one baked here. (PEP 668: allow system pip.)
COPY requirements.txt ./requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

WORKDIR /app

# Install node deps first for layer caching.
COPY package.json ./
RUN npm install --omit=dev=false

# App source.
COPY tsconfig.json ./
COPY src ./src
COPY whisper_transcribe.py ./whisper_transcribe.py
COPY editor_speech.py ./editor_speech.py
COPY youtube_transcript.py ./youtube_transcript.py
RUN npm run build

# Pre-download the ASR models at build time so no job ever pays a download.
# base = reference transcription (the speed/quality sweet spot); tiny/small kept
# for boxes that override WHISPER_MODEL.
RUN python3 -c "from faster_whisper import WhisperModel; [WhisperModel(m, device='cpu', compute_type='int8') for m in ('tiny','base','small')]"

ENV NODE_ENV=production

# Liveness: the worker touches /tmp/worker-alive every loop. Mark the container
# unhealthy if that file is missing or older than 90s (a wedged, not-crashed worker
# — which `--restart unless-stopped` alone can't catch). Visible via `docker ps` /
# vps-diag; pair with an autoheal watcher to auto-restart on unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD test "$(( $(date +%s) - $(stat -c %Y /tmp/worker-alive 2>/dev/null || echo 0) ))" -lt 90 || exit 1

CMD ["node", "--enable-source-maps", "dist/index.js"]
