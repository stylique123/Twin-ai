# TwinAI worker — Node orchestrator + Python ML, with ffmpeg & yt-dlp baked in.
# Node 22 (not 20): @supabase/supabase-js needs a native WebSocket, which only
# exists from Node 22 onward.
FROM node:22-bookworm-slim

# yt-dlp now requires a JS runtime to extract YouTube; it auto-enables Deno when
# it's on PATH. Pull the static Deno binary from the official image.
COPY --from=denoland/deno:bin-2.1.4 /deno /usr/local/bin/deno

# System deps: ffmpeg (audio extract + caption burn), python3 + pip
# (faster-whisper), ca-certs, and color-emoji + a clean bold font for captions.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip ca-certificates \
      fonts-noto-color-emoji fonts-dejavu-core fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Bundle bold caption fonts so captions look DESIGNED, not default:
#   Anton           — heavy impact face for the punchy/viral styles
#   Poppins ExtraBold — clean modern face for the calm/boxed styles
# Installed system-wide + cached so libass (ffmpeg subtitles filter) finds them by name.
COPY fonts/*.ttf /usr/share/fonts/truetype/twinai/
RUN fc-cache -f

# yt-dlp + faster-whisper. Jump-cuts are done with ffmpeg's own silencedetect
# (no heavy auto-editor dep / glibc requirements). (PEP 668: allow system pip.)
RUN pip3 install --no-cache-dir --break-system-packages \
      "yt-dlp>=2025.1.15" "faster-whisper>=1.0.3" "youtube-transcript-api>=0.6.2"

# CLIP semantic b-roll matching: rank stock-clip thumbnails against the spoken line so
# the cutaway is RELEVANT, not keyword-roulette. CPU-only torch keeps the image lean;
# the model is pre-downloaded so no render pays for it. Entirely fail-open in code —
# if any of this is missing at runtime, broll.ts falls back to its keyword pick.
RUN pip3 install --no-cache-dir --break-system-packages \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      "torch>=2.2,<2.6" "sentence-transformers>=3.0,<4" "pillow>=10.0" \
      "scenedetect>=0.6.4" "opencv-python-headless>=4.9" "stable-ts>=2.17" \
      "silero-vad>=5.1" "soundfile>=0.12" \
 && python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('clip-ViT-B-32')" \
 && python3 -c "from silero_vad import load_silero_vad; load_silero_vad()"

WORKDIR /app

# Install node deps first for layer caching.
COPY package.json ./
RUN npm install --omit=dev=false

# App source.
COPY tsconfig.json ./
COPY src ./src
COPY whisper_transcribe.py ./whisper_transcribe.py
COPY youtube_transcript.py ./youtube_transcript.py
COPY clip_rank.py ./clip_rank.py
COPY scene_detect.py ./scene_detect.py
COPY vad.py ./vad.py
RUN npm run build

# Pre-download the ASR models at build time so no job ever pays a download.
# tiny = filler pre-pass, base = captions/reference (the speed/quality sweet spot),
# small kept for opt-in higher accuracy.
RUN python3 -c "from faster_whisper import WhisperModel; [WhisperModel(m, device='cpu', compute_type='int8') for m in ('tiny','base','small')]"

ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "dist/index.js"]
