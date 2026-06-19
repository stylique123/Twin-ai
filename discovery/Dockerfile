# TwinAI niche-discovery scraper — Scrapling + a stealth Chromium, isolated from
# the main worker so the ~3GB browser layer never bloats or risks production.
# Debian bookworm: Playwright/patchright ship prebuilt Chromium for it (the VPS
# host is Ubuntu 26.04, which Playwright has no prebuilt browser for — proven).
FROM python:3.12-bookworm

# Scrapling's StealthyFetcher (patchright-patched Chromium) beats the datacenter-IP
# bot-blocking that forces yt-dlp onto Apify for YouTube. Verified live from the
# VPS IP: TikTok + YouTube return real items (views/likes/creator/thumbnail) for $0.
RUN pip install --no-cache-dir "scrapling[fetchers]"
RUN python -m playwright install-deps chromium \
 && python -m playwright install chromium

WORKDIR /app
COPY discover.py ./discover.py

# Default entrypoint runs the scraper; args: <platform> <query> <limit>
ENTRYPOINT ["python", "/app/discover.py"]
