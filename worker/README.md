# TwinAI Worker (the keystone)

Background service that drains the Supabase `jobs` queue and runs the heavy work
that can't live in an edge function. It *actually reads* the audio/video instead
of hallucinating the analysis.

## Job types (the canonical registry)
`worker/src/env.ts` is the single source of truth. The shared worker leaves
`WORKER_JOB_TYPES` **unset** and drains all five (add the env var only to carve
out dedicated pools — see `worker/SCALING.md`):

- **`ingest`** — `yt-dlp` pulls **audio only** from an **allow-listed** social URL
  → `faster-whisper` produces a word-timestamped transcript → persisted to
  `public.transcripts`. Raw media is **discarded** after analysis.
- **`build_voice`** — builds the Brand-DNA voice profile from ingested references.
- **`scrape_dna`** — scrapes brand/style signals used by Brand-DNA.
- **`validate_source`** — validates a durable source recording (probe facts,
  metadata merge, ready-state) for the recording pipeline.
- **`editor_v2`** — the rebuilt editor. **One** long-running orchestration loop
  per project that advances through **internal stages** (inspecting → transcribing
  → analyzing → …, with future Director/EditPlan/render stages living *inside*
  this loop). These are stages of `editor_v2`, **not** separate top-level job
  types — there is exactly one editor loop, one canonical EditPlan, one renderer.

Common to all: atomic claim (`claim_job` → `FOR UPDATE SKIP LOCKED`; safe to run
N replicas), retries with backoff + dead-letter, crashed-job reclaim via
visibility timeout, graceful shutdown, structured JSON logs.

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
The **VPS + Docker** path is the single supported production deployment —
`sudo bash worker/deploy-vps.sh` (driven by `.github/workflows/deploy-worker.yml`).
See `DEPLOY.md` and `worker/SCALING.md`. Do **not** add a second deployment
manifest (Fly/Railway/Render); a CI guard rejects one.
```bash
docker build -t twinai-worker worker/
# more throughput later: run additional containers with distinct HOSTNAME, or
# the same image on another box — they share one queue (SKIP LOCKED).
```

Leave `WORKER_JOB_TYPES` **unset** on the shared worker: `worker/src/env.ts` is
the canonical registry — `ingest, build_voice, scrape_dna, validate_source,
editor_v2`. Only set it to carve out dedicated pools (see `worker/SCALING.md`).

## Enqueue a job (from an edge function / service role)
```sql
insert into public.jobs (owner_id, type, payload)
values ('<user-uuid>', 'ingest', '{"url":"https://www.tiktok.com/@user/video/123","platform":"tiktok"}');
```

## Next on this worker
- Wire reference ingestion into `generate-blueprint` (use the real transcript
  instead of the URL string) and a **voice-from-audio** upgrade for Brand-DNA.
- Continue the `editor_v2` rebuild by adding **internal stages** to that one
  loop (Director/EditPlan compiler, renderer) — not new top-level job types.
  These land gated OFF until their own pre-beta gates pass (see the
  `editor-v2` / `pre-beta-gate` issues).
- Server-side cron to advance `build_dna` jobs (removes the frontend-poll stall).
