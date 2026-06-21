# twinai-revideo — the premium visual render engine (headless Chromium via Revideo).
# Runs as a sidecar the worker calls: input = a cut+graded base.mp4 + the EDL,
# output = a designed-caption MP4. Node 20 (Revideo's pinned version).
FROM node:20-bookworm-slim

# Shared libs Chromium needs even headless (puppeteer downloads Chromium on npm i).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 \
      libpango-1.0-0 libcairo2 libatspi2.0-0 fonts-liberation fontconfig ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (puppeteer postinstall fetches Chromium) for layer caching.
COPY package.json ./
RUN npm install

# Bundle the same caption fonts as the ffmpeg path so captions match across engines.
COPY fonts/*.ttf /usr/share/fonts/truetype/twinai/
RUN fc-cache -f || true

COPY . ./

# CLI: docker run twinai-revideo <edl.json> <base.mp4> <out.mp4>  (paths under /work)
ENTRYPOINT ["npx", "tsx", "render.ts"]
