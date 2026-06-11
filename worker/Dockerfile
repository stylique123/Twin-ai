# TwinAI worker — Node orchestrator + Python ML, with ffmpeg & yt-dlp baked in.
FROM node:20-bookworm-slim

# System deps: ffmpeg (audio extract), python3 + pip (faster-whisper), ca-certs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp + faster-whisper. (PEP 668: allow pip into the system env in-container.)
RUN pip3 install --no-cache-dir --break-system-packages \
      "yt-dlp>=2024.8.6" "faster-whisper>=1.0.3"

WORKDIR /app

# Install node deps first for layer caching.
COPY package.json ./
RUN npm install --omit=dev=false

# App source.
COPY tsconfig.json ./
COPY src ./src
COPY whisper_transcribe.py ./whisper_transcribe.py
RUN npm run build

# Pre-download the ASR model at build time so the first job isn't slow.
ARG WHISPER_MODEL=small
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "dist/index.js"]
