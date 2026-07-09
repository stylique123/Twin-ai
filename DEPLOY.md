# TwinAI — Deploy runbook

How to take what's built from "in the repo" to "live and provable". This is a
**you-side action**: it needs the Supabase CLI authenticated to your account, SSH
access to the VPS, and real secrets. Nothing here runs from the Claude sandbox.
For the system shape behind these steps, see **`ARCHITECTURE.md`**.

**Prereqs (once):** `npm i -g supabase` · `supabase login` · SSH into your VPS with
Docker installed (`curl -fsSL https://get.docker.com | sh`). Have ready: Supabase
**project ref**, **service-role key**, **anon key**, **Gemini key**, **Apify token**.

## 1. Database — apply all migrations (0001–0005)
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push   # RLS, credits, brand voices, admin+rate-limit, job queue, transcripts
```

## 2. Edge functions — deploy all four + secrets
SUPABASE_URL / SERVICE_ROLE / ANON are injected by the platform; set the rest:
```bash
supabase secrets set GEMINI_API_KEY=xxx APIFY_TOKEN=xxx
# optional: GEMINI_MODEL=gemini-3.1-pro  RECREATION_COST=10

supabase functions deploy generate-blueprint
supabase functions deploy start-dna
supabase functions deploy dna-poll
supabase functions deploy ingest-reference
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
#   WORKER_JOB_TYPES=ingest,transcribe,build_voice,autoedit,scrape_dna
#   WHISPER_MODEL=small        # drop to base/tiny on a small box
#   WORKER_MAX_MEDIA_SECS=900

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
Optional feature flag — **`VITE_STUDIO_V2=true`** routes `/app` into the new
5-screen V2 Creative Studio flow (`/v2`). Leave it unset (default) and `/app` serves
the current V1 Studio unchanged. To QA V2 without touching production, set it as a
**Preview-scoped** env var in Vercel (Project → Settings → Environment Variables →
Preview only) so only branch/preview deploys expose it.

`apps/web/vercel.json` rewrites all routes → `index.html` for the SPA (only applies
once Root Directory = `apps/web`). Manual alternative: `npm run web:build` from the
repo root and upload `apps/web/dist/` to any static host.

> The **mobile** app (`apps/mobile`) does **not** deploy to Vercel — it ships to the
> App Store / Play Store via Expo EAS (see `apps/mobile/README.md`).

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

Do these in the dashboards (nothing here runs from the Claude sandbox):
1. **Vercel → Project → Settings → Domains:** add `twinai.studio` (and `www.` if
   you want it), set `twinai.studio` as the **Primary** domain, and follow the DNS
   records Vercel shows (A/ALIAS at the apex + CNAME for `www`). HTTPS is automatic.
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
