# TwinAI Worker (the keystone)

Background service that drains the Supabase `jobs` queue and runs the heavy work
that can't live in an edge function. **Phase 3 capability: real reference
ingestion + transcription** — the fix for the premortem's #1 finding (we now
*actually read* the audio instead of hallucinating the analysis).

## What it does today
- Atomically claims jobs (`claim_job` → `FOR UPDATE SKIP LOCKED`; safe to run N replicas).
- `ingest` / `transcribe`: `yt-dlp` pulls **audio only** from an **allow-listed**
  social URL → `faster-whisper` produces a word-timestamped transcript → persisted
  to `public.transcripts`. Raw media is **discarded** after analysis.
- Retries with backoff + dead-letter; crashed jobs reclaimed via visibility timeout;
  graceful shutdown; structured JSON logs.

## Security (panel-gated — see /SECURITY.md)
- **SSRF allow-list**: only `tiktok.com` / `instagram.com` / `youtube.com` hosts,
  https only. No `file://`, no internal IPs.
- Subprocesses are spawned with an **args array (no shell)** — no command injection.
- Holds the **service-role key server-side only**; never exposed to any client.
- Media duration cap + filesize cap + per-step timeouts bound runaway cost.

## Run locally
```bash
cd worker
cp .env.example .env        # fill in SUPABASE_URL + SERVICE_ROLE_KEY
npm install
# needs ffmpeg, yt-dlp, and faster-whisper on PATH (or just use Docker below)
npm run dev
```

## Docker / deploy
```bash
docker build -t twinai-worker worker/
# Fly.io:
fly launch --no-deploy
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GEMINI_API_KEY=...
fly deploy
fly scale count 2     # more replicas = more throughput, no collisions
```

## Enqueue a job (from an edge function / service role)
```sql
insert into public.jobs (owner_id, type, payload)
values ('<user-uuid>', 'transcribe', '{"url":"https://www.tiktok.com/@user/video/123","platform":"tiktok"}');
```

## Next on this worker
- Wire reference ingestion into `generate-blueprint` (use the real transcript
  instead of the URL string) and a **voice-from-audio** upgrade for Brand-DNA.
- Add `render` (P6 one-click editor) and `publish` (P7) handlers to the registry.
- Server-side cron to advance `build_dna` jobs (removes the frontend-poll stall).
