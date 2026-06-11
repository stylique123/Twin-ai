# TwinAI publishing — self-hosted Postiz

Free, open-source publishing + analytics for TwinAI. Runs on the same Hetzner box
as the worker. TwinAI calls Postiz's public API to publish a finished blueprint to
your connected channels and to read back real metrics — no per-post SaaS fees.

## Why this (vs. Ayrshare)
- **$0/mo** — you host it; Ayrshare is $149/mo just to post video.
- You own the data and the OAuth apps.
- Trade-off: you create a developer app per platform (TikTok / Meta / Google).
  This is unavoidable for *any* real posting — paid APIs simply hide it behind
  their own app credentials (that's what you'd be paying for).

## Setup (one time, ~15 min)
1. **DNS** — point a subdomain at the server:
   `postiz.yourdomain.com  A  <hetzner-ip>`
2. **Env** — `sudo nano /opt/twinai-postiz.env`:
   ```
   POSTIZ_DOMAIN=postiz.yourdomain.com
   POSTIZ_DISABLE_REGISTRATION=false
   POSTIZ_JWT_SECRET=
   POSTIZ_DB_PASSWORD=
   ```
   (leave the secrets blank — the deploy script generates them)
3. **Deploy** — `sudo bash postiz/deploy-postiz.sh`
   Caddy auto-issues HTTPS. Open `https://postiz.yourdomain.com`, create your
   account, then set `POSTIZ_DISABLE_REGISTRATION=true` and re-run to lock signups.
4. **Connect channels** — in Postiz, add each platform. Each asks for a developer
   app key/secret (TikTok Content Posting API, Meta Graph, YouTube Data API).
   Postiz's docs link the exact steps per platform.
5. **API key** — Postiz → Settings → **Public API** → create a key.

## Hand it back to TwinAI
Send me **`POSTIZ_DOMAIN`** + the **API key**. I'll wire the TwinAI dashboard's
"Publish" button to Postiz's API for real one-click posting + pull real analytics
into your stats — then verify it live.

## Ops
- Logs: `docker compose -f postiz/docker-compose.yml --env-file /opt/twinai-postiz.env logs -f postiz`
- Update: re-run `deploy-postiz.sh` (it pulls the latest image).
- It's isolated from the worker container; both share the box safely.
