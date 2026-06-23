# Worker scaling (horizontalization)

The queue is **already safe for N concurrent workers across hosts** — nothing about
the code assumes a single container.

## Why it's safe

- **Atomic claims:** `claim_job` uses `SELECT … FOR UPDATE SKIP LOCKED`, so two
  workers never grab the same job.
- **Lease (visibility timeout):** a claimed job is leased for `WORKER_VISIBILITY_SECS`
  (default 2400s). If a worker crashes mid-job, the lease expires and another worker
  reclaims it automatically — no orphaned jobs.
- **Lease-guarded writes:** `complete_job` / `fail_job` / progress writes only act if
  the writer still owns the lease (they pass `p_worker`), so a reclaimed job is never
  clobbered by the original (now-late) worker.
- **Hard per-job timeout:** `WORKER_MAX_JOB_MS` (default 2,100,000 ms = 35 min, kept
  *under* the lease) means a hung `ffmpeg`/`yt-dlp` fails fast and frees the worker,
  instead of pinning it forever. This is what makes adding workers actually remove the
  bottleneck rather than just adding more things to wedge.
- **Dead-letter alerts:** terminal failures write an `ops_events` `job_dead_letter`
  row (visible on the admin /metrics System-health panel).

## How to run more workers

Run more containers — each with a **unique** `WORKER_ID` (auto-derived from
`HOSTNAME`/`FLY_MACHINE_ID`/PID, so just give each container a distinct hostname):

```bash
# On the same host, N containers:
for i in 1 2 3; do
  docker run -d --name twinai-worker-$i \
    -e SUPABASE_URL="$SUP_URL" -e SUPABASE_SERVICE_ROLE_KEY="$SUP_KEY" \
    -e GEMINI_API_KEY="$GEM" -e APIFY_TOKEN="$APIFY" \
    -e HOSTNAME="worker-$i" \
    twinai-worker:latest
done
```

For more throughput, run the same image on additional hosts (Hetzner boxes, Fly
machines, etc.). They all poll the same Postgres queue; SKIP-LOCKED keeps them from
colliding. CPU-bound work (Whisper + ffmpeg) scales roughly linearly with cores —
prefer a few well-provisioned hosts over many tiny ones.

## Tuning

| Env | Default | Note |
|---|---|---|
| `WORKER_VISIBILITY_SECS` | 2400 | Lease; must exceed your longest job. |
| `WORKER_MAX_JOB_MS` | 2100000 | Hard per-job timeout; keep < lease. |
| `WORKER_POLL_MS` | 3000 | Idle poll cadence. |
| `WORKER_JOB_TYPES` | ingest,build_voice,autoedit,scrape_dna | Split types across pools if you want dedicated render vs scrape workers. |

**Tip:** dedicate a pool to `autoedit` (CPU-heavy renders) and another to
`ingest,scrape_dna,build_voice` (network-bound) by setting `WORKER_JOB_TYPES` per
pool — so a burst of renders never starves quick scrape jobs.
