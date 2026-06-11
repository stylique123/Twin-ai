# TwinAI — Deploy runbook

How to take what's built from "in the repo" to "live and provable". This is a
**you-side action**: it needs the Supabase + Fly CLIs authenticated to your
accounts and real secrets. Nothing here runs from the Claude sandbox.

**Prereqs (once):** `npm i -g supabase` · install Fly CLI (`flyctl`) ·
`supabase login` · `fly auth login`. Have ready: Supabase **project ref**,
**service-role key**, **anon key**, **Gemini key**, **Apify token**.

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

## 3. Worker → Fly (makes "Read the actual video" + voice-from-audio actually run)
```bash
cd worker
fly launch --no-deploy           # creates the app from fly.toml
fly secrets set \
  SUPABASE_URL=https://YOUR_REF.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=xxx \
  GEMINI_API_KEY=xxx
fly deploy
fly logs                         # expect {"msg":"worker up",...}
# more throughput later: fly scale count 2
```

## 4. Seed the first super-admin (SQL console / service role only)
```sql
insert into public.platform_admins (user_id, role) values ('YOUR_AUTH_UID', 'superadmin');
```

## 5. Frontend
```bash
# host env: VITE_SUPABASE_URL=...  VITE_SUPABASE_ANON_KEY=...
npm run build                    # deploy dist/ to Vercel/Netlify/etc.
```

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
3. `fly logs` shows `claimed` → `done` for `ingest` / `build_voice`.
