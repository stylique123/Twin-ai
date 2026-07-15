# TwinAI — Deploy runbook

How to take what's built from "in the repo" to "live and provable". This is a
**you-side action**: it needs the Supabase CLI authenticated to your account, SSH
access to the VPS, and real secrets. Nothing here runs from the Claude sandbox.
For the system shape behind these steps, see **`ARCHITECTURE.md`**.

**Prereqs (once):** `npm i -g supabase` · `supabase login` · SSH into your VPS with
Docker installed (`curl -fsSL https://get.docker.com | sh`). Have ready: Supabase
**project ref**, **service-role key**, **anon key**, **Gemini key**, **Apify token**.

## 1. Database — apply all migrations
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push   # applies every file in supabase/migrations/ in order:
                   # RLS, credits, brand voices, admin+rate-limit, job queue,
                   # transcripts, workspaces/seats, brand kits, column grants, …
```
> Migrations are the one deploy step that is **not** automated — run `supabase db
> push` yourself whenever new files land in `supabase/migrations/`. (Edge functions
> and the worker auto-deploy via GitHub Actions on push to `main`; see §2/§3.)

## 2. Edge functions — deploy + secrets
On push to `main`, `.github/workflows/deploy-edge.yml` deploys **every** function
in `supabase/functions/` automatically — you normally don't run these by hand. Set
the secrets once (SUPABASE_URL / SERVICE_ROLE / ANON are injected by the platform):
```bash
supabase secrets set GEMINI_API_KEY=xxx APIFY_TOKEN=xxx
# optional: GEMINI_MODEL=gemini-3.1-pro-preview  RECREATION_COST=10

# Manual fallback (CI does this for all functions): deploy one by name, e.g.
supabase functions deploy generate-blueprint
```

## 3. Worker → VPS / Hetzner (makes "Read the actual video" + voice-from-audio actually run)
The worker runs as a Docker container on a plain Ubuntu box (Hetzner or any VPS).
This is the production path (the stack runs on a VPS, not Fly).
```bash
# On the server (once): install Docker
curl -fsSL https://get.docker.com | sh

# Create the secrets file (chmod 600) — see the header of worker/deploy-vps.sh:
sudo nano /opt/twinai-worker.env
#   SUPABASE_URL=https://YOUR_REF.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=xxx
#   GEMINI_API_KEY=xxx
#   APIFY_TOKEN=xxx            # YouTube + Instagram transcripts (yt-dlp is bot-blocked there)
#   WORKER_JOB_TYPES=ingest,build_voice,autoedit,scrape_dna
#   WHISPER_MODEL=base         # drop to tiny on a small box
#   WORKER_MAX_MEDIA_SECS=900
#
# Editor value-add toggles (ALL optional; unset = that enrichment is OFF and the
# Refine panel hides its switch). This is where "the editor just cuts + captions"
# becomes "cuts + captions + b-roll + music + emoji + premium captions":
#   PEXELS_API_KEY=xxx         # b-roll cutaways (free key: pexels.com/api)
#   MUSIC_BED_URL=https://…    # music bed MP3 → ducked bed + beat-synced b-roll
#   EDIT_EMOJI=true            # Twemoji overlays on caption moments
#   EDIT_WINDOW_WHISPER=true   # real per-scene caption timing (extra whisper cost)
#   REVIDEO_TRUSTED=true       # let the premium (Revideo) pass replace the render
#                              # (REVIDEO_URL is auto-set by deploy-worker.yml)

# Deploy / update (pulls main, builds, restarts):
sudo bash worker/deploy-vps.sh
docker logs -f twinai-worker     # expect {"msg":"worker up",...} then claimed → done

# More throughput later: run additional containers with distinct HOSTNAME,
# or the same image on another box — they share one queue (SKIP LOCKED). See worker/SCALING.md.
```

### 3b. Satellite services (same VPS, Docker)
```bash
# Discovery — daily cron that finds fresh viral references per niche
#   (reuses the worker container's secrets at run time)
cd discovery && sudo bash deploy-vps.sh

# Renderer — timeline-driven video render service
docker build -t twinai-revideo revideo/ && \
  docker run -d --name twinai-revideo --restart unless-stopped twinai-revideo

# Publishing + analytics — self-hosted Postiz (docker-compose + Caddy)
cd postiz && docker compose up -d
```

> **Alt host (optional): Fly.io.** A `worker/fly.toml` is kept for convenience.
> `cd worker && fly launch --no-deploy && fly secrets set SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… GEMINI_API_KEY=… && fly deploy`.
> The VPS path above is the supported production deployment.

## 4. Seed the first super-admin (SQL console / service role only)
```sql
insert into public.platform_admins (user_id, role) values ('YOUR_AUTH_UID', 'superadmin');
```

## 5. Frontend → Vercel (monorepo)
The web app now lives in **`apps/web`** (npm workspace) and depends on the
`@twinai/shared` workspace package, so the Vercel project must be pointed at it:

- **Root Directory: `apps/web`** (Project → Settings → Build & Deployment → Root
  Directory). Enable **"Include source files outside the root directory"** so the
  workspace install at the repo root creates the `@twinai/shared` symlink the build needs.
- Framework: **Vite**. Build: `npm run build`. Output: `dist`. Install runs at the
  workspace root (Vercel detects the root `package.json` `workspaces`).
- It auto-deploys on every push to `main`. Set the two public env vars in the project:
```
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```
(There is no `VITE_STUDIO_V2` flag anymore — the V2 studio IS the only flow;
`/app` always redirects to `/v2`.)

> ⚠️ **DO NOT DELETE the root `vercel.json`.** Despite the "Root Directory =
> `apps/web`" note above, the live Vercel project builds from the **repo root** and
> relies on the root `vercel.json` (`buildCommand` / `outputDirectory` /
> `rewrites`). Removing it takes production down — it was already restored once in
> #91 ("restore production — root vercel.json for the monorepo SPA") and taken down
> again by deleting it in #149. It is load-bearing; leave it in place.

`apps/web/vercel.json` also carries the SPA rewrite. Manual alternative: `npm run
web:build` from the repo root and upload `apps/web/dist/` to any static host.

> The web app is the single client surface — it is fully responsive (phone +
> desktop). There is no separate native app; a former Expo/iOS app was removed to
> keep one codebase and eliminate cross-surface drift.

## 6. (Optional) Kill the DNA frontend-poll stall — server-side advance
Enable `pg_cron` + `pg_net` in Supabase, then schedule a periodic POST to
`dna-poll` for still-`building` voices. Fill in your ref + a service key at run
time (do NOT commit secrets):
```sql
-- one-time
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- every minute, nudge dna-poll for each voice still building
select cron.schedule('dna-advance', '* * * * *', $$
  select net.http_post(
    url     := 'https://YOUR_REF.functions.supabase.co/dna-poll',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer YOUR_SERVICE_ROLE_KEY'),
    body    := jsonb_build_object('brand_voice_id', bv.id)
  )
  from public.brand_voices bv
  where bv.status = 'building'
    and bv.created_at > now() - interval '1 hour';
$$);
```
> Note: `dna-poll` verifies the caller's JWT today. To drive it from cron you'll
> either relax it to accept the service-role bearer for an internal call, or move
> the advance into a dedicated service-role-only function. Tell me which and I'll wire it.

## Smoke test (proves end-to-end)
1. Sign up → DNA scan → voice `ready` (captions), then sharpens within ~2 min
   (`voiced_from_audio: true`) → worker + `build_voice` confirmed.
2. Studio → paste a TikTok → tick **"Read the actual video"** → ~1–2 min →
   retention map from the real transcript → ingest + structure confirmed.
3. `docker logs twinai-worker` shows `claimed` → `done` for `ingest` / `build_voice`.

## 7. Custom domain cut-over (→ https://twinai.studio)
The app follows whatever origin serves it (auth redirects, share/review links all
derive from `window.location.origin`), so the cut-over is mostly config. The one
code change — the hardcoded SEO/OG URLs in `apps/web/index.html` and the
`robots.txt`/`sitemap.xml` — already points at `https://twinai.studio`.

**WHEN:** do the domain connection *after* the audit-fix PRs are merged to `main`
and `supabase db push` has run — so the first thing `twinai.studio` ever serves is
the fixed, production-ready build, never the pre-audit one. DNS can take anywhere
from a few minutes to a few hours to propagate, so you can start step 1 in parallel
with the merge; just don't announce the domain until the verify step passes.

Do these in the dashboards (nothing here runs from the Claude sandbox):
1. **Connect the domain in Vercel — Project → Settings → Domains:**
   1. Click **Add**, type `twinai.studio`, Add. (Add `www.twinai.studio` too if you
      want it; Vercel will offer to redirect `www` → apex — accept.)
   2. Set `twinai.studio` as the **Primary** domain (the "⋯" menu → Set as Primary).
   3. Vercel then shows the exact **DNS records** to create at your registrar (where
      you bought the domain). It's one of two setups — do whichever Vercel tells you:
      - **A / apex** — add an `A` record for `@` (the root) pointing at the IP Vercel
        shows (currently `76.76.21.21`), plus a `CNAME` for `www` → `cname.vercel-dns.com`.
      - **Nameservers** — or point the domain's nameservers at the two `ns1/ns2.
        vercel-dns.com` values Vercel lists (simplest; Vercel then manages DNS).
   4. Back on the Domains page, the status flips from **"Invalid Configuration"** to
      **"Valid"** once DNS propagates; Vercel auto-issues the HTTPS certificate. No
      redeploy needed — the current `main` deployment is served on the new domain
      the moment it goes Valid.
2. **Supabase → Authentication → URL Configuration:**
   - **Site URL** → `https://twinai.studio`
   - **Redirect URLs** → add `https://twinai.studio/**` (keep the Vercel preview
     URL too if you still QA on previews). Email-confirm + Google OAuth redirects
     (`/auth`, `/app`) go through this allowlist.
3. **Supabase → Edge Functions → Secrets:** set `APP_URL=https://twinai.studio`
   (`social` + `billing` build their success/callback redirects from it).
4. **OAuth providers** (only the ones you enable): add the new redirect URIs —
   Google (Supabase auth), and for posting: YouTube/TikTok/Meta developer consoles
   → `https://<REF>.functions.supabase.co/social?action=callback` stays the same
   (it's the function URL, not the app domain), but any "authorized origins"
   fields should include `https://twinai.studio`.
5. **Verify:** load `https://twinai.studio`, sign up (confirm the email link lands
   back on the domain), run one full create→record→edit loop, and check
   `https://twinai.studio/robots.txt` + `/sitemap.xml` resolve.
