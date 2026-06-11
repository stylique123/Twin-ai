#!/usr/bin/env bash
# TwinAI — deploy self-hosted Postiz (publishing + analytics) on the Hetzner box.
#
# Postiz is open-source and posts to TikTok / Instagram / YouTube / X / LinkedIn /
# Threads / Facebook / Pinterest, and exposes an API + analytics TwinAI calls.
#
# PREREQUISITES (one-time):
#   1) A subdomain A-record pointing at THIS server's IP, e.g.
#        postiz.yourdomain.com  ->  <hetzner-ip>
#   2) Docker + the compose plugin (the worker box already has Docker):
#        docker compose version   # should print a version
#
# USAGE (on the server):
#   1) Create the env file:   sudo nano /opt/twinai-postiz.env   (template below)
#   2) Run:                   sudo bash postiz/deploy-postiz.sh
#      (or pipe the raw URL like the worker script)
#
# /opt/twinai-postiz.env template (chmod 600):
#   POSTIZ_DOMAIN=postiz.yourdomain.com
#   POSTIZ_DISABLE_REGISTRATION=false   # set true AFTER you create your account
#   # secrets below are auto-generated on first run if left blank:
#   POSTIZ_JWT_SECRET=
#   POSTIZ_DB_PASSWORD=
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="/opt/twinai-postiz.env"

command -v docker >/dev/null || { echo "Docker not found. Install: curl -fsSL https://get.docker.com | sh"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose plugin missing. Install docker-compose-plugin."; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE — create it first (see header)."; exit 1; }

# Auto-generate strong secrets on first run if the operator left them blank.
gen() { openssl rand -hex 32; }
ensure() {
  local key="$1"
  if ! grep -q "^${key}=..*" "$ENV_FILE"; then
    local val; val="$(gen)"
    # replace an empty assignment or append
    if grep -q "^${key}=" "$ENV_FILE"; then
      sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
    else
      echo "${key}=${val}" >> "$ENV_FILE"
    fi
    echo "==> generated ${key}"
  fi
}
ensure POSTIZ_JWT_SECRET
ensure POSTIZ_DB_PASSWORD

echo "==> Starting Postiz (Caddy will fetch HTTPS certs for your domain)"
docker compose --env-file "$ENV_FILE" -f "$SRC/docker-compose.yml" pull
docker compose --env-file "$ENV_FILE" -f "$SRC/docker-compose.yml" up -d

echo "==> Up. Open https://$(grep '^POSTIZ_DOMAIN=' "$ENV_FILE" | cut -d= -f2) once DNS + certs settle (~1 min)."
echo "    Then: create your account, connect your social channels, and grab an API key"
echo "    from Settings → Public API. Send me that API key + the domain and I'll wire publishing into TwinAI."
docker compose --env-file "$ENV_FILE" -f "$SRC/docker-compose.yml" ps
