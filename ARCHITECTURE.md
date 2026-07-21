# TwinAI — Architecture

> The single source of truth for how the **whole app** is built and how it runs in
> production. If a doc and this file disagree about *system shape*, this file wins.
> (For *visual* system rules see `DESIGN.md`; for *product/UX* rules see
> `docs/PRODUCT_VISION.md`; for the *deploy runbook* see `DEPLOY.md`.)

---

## 1. What TwinAI is

TwinAI turns any proven viral video (Reel / TikTok / Short / YouTube) into a
personalized, **shootable** blueprint in the creator's own voice — hook,
scene-by-scene script, captions, a recorded take, and a publish schedule. It
copies **structure, never content**.

> **AI editor status:** the original auto-edit pipeline has been **removed** and a
> new one-click editor is being rebuilt — see `docs/ai-editor-rebuild-status.md`.
> Recording, upload and finished-video playback still work; nothing edits a take yet.

The product is one loop:

```
learn your voice → find a reference → blueprint → record → (AI edit: being rebuilt) → publish → analytics
```

---

## 2. The architecture in one line

> **Thin React SPA on Vercel → Supabase as the DB + Auth + RLS data plane → Edge
> Functions as the secure synchronous API & secret-holder → a Postgres-backed `jobs`
> queue → stateless VPS workers for heavy async work → optional satellite services
> (renderer, discovery, publishing). GitHub `main` is the single source of truth that
> both Vercel and the VPS track.**

Two execution planes, split by job duration:

- **Synchronous, milliseconds–seconds** → Edge Functions (Deno, at Supabase). Auth
  checks, AI text calls, credit spend, enqueueing work.
- **Asynchronous, seconds–minutes** → VPS worker (Docker, Node + Python). Anything
  with ffmpeg / yt-dlp / whisper / scraping that can't fit an edge function's limits.

The `jobs` table is the seam between them.

---

## 3. System diagram

```
                         ┌───────────────────────────────────────────────┐
                         │                  GitHub (main)                 │
                         │            single source of truth              │
                         └───────┬───────────────────────────┬───────────┘
                  auto-deploy ▼  push                         ▼  pull + docker build
        ┌──────────────────────────────┐          ┌──────────────────────────────────┐
        │          VERCEL              │           │            VPS (Hetzner)          │
        │  Vite + React 18 SPA         │           │  Docker host                      │
        │  (anon key, RLS-guarded)     │           │  ┌──────────────────────────────┐ │
        └───────┬──────────────┬───────┘           │  │ worker  (job-queue drainer)  │ │
                │ direct        │ privileged        │  │  ingest/build_voice/scrape_  │ │
                │ reads/writes  │ calls             │  │  dna/validate_source/editor_v2│ │
                ▼               ▼                   │  │  Node/TS + Python + ffmpeg   │ │
   ┌───────────────────────────────────────────┐  │  └──────────────────────────────┘ │
   │                 SUPABASE                   │  │  ┌──────────┐ ┌──────────┐         │
   │  Postgres + Auth + Row-Level Security      │◀─┼──│discovery │                     │
   │  ┌──────────────┐   ┌────────────────────┐ │  │  │(daily cron)                     │
   │  │ tables + RLS │   │  Edge Functions    │ │  │  └──────────┘                      │
   │  │ profiles     │   │  generate-blueprint│ │  │  ┌──────────────────────────────┐ │
   │  │ brand_voices │   │  ingest-reference  │ │  │  │ postiz (publish + analytics) │ │
   │  │ generations  │◀──│  start-dna/dna-poll│ │  │  └──────────────────────────────┘ │
   │  │ jobs (queue) │   │  billing/-webhook  │ │  └────────────────┬──────────────────┘
   │  │ transcripts  │   │  review/social/... │ │     service-role   │ claim_job /
   │  │ credit_events│   │  ...               │ │     key (poll)     │ complete/fail
   │  │ gallery_items│   └─────────┬──────────┘ │◀───────────────────┘
   │  └──────────────┘             │ secrets    │
   └───────────────────────────────┼────────────┘
                                    ▼
                    AI + 3rd-party: Gemini · Apify · Stripe · Pexels/Pixabay
```

---

## 4. Layers in detail

### 4.1 Frontend — Vercel
- **Stack:** Vite + React 18 + TypeScript + Tailwind + React Router (SPA).
  `vercel.json` rewrites every route → `index.html`.
- **How it talks to the backend:** the Supabase client (`src/lib/supabase.ts`) for
  normal RLS-guarded reads/writes; the API layer (`src/lib/api.ts`,
  `src/lib/timelineApi.ts`, `src/lib/timelineAdapter.ts`) wraps edge-function calls
  for anything privileged.
- **Auth:** `src/context/AuthContext.tsx` (Supabase email/password sessions).
- **Surfaces:** `src/pages/*` (Landing, Auth, Onboarding, Studio, Gallery, History,
  Dashboard, Billing, Settings, Metrics, …) and the redesigned 5-screen Creative
  Studio in `src/pages/v2/*` + `src/components/v2/*`.
- **Design system:** locked in `DESIGN.md` + `tailwind.config.js` + `src/index.css`
  (ink canvas, one Aurora glow per page, the `.glass` / `.btn-gradient` / `.chip` /
  `.field` primitives, single teal `#65E5D8`). New screens follow it, no exceptions.
- **Env (public by design — protected by RLS, not secrecy):**
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. See `.env.production`.

### 4.2 Data plane — Supabase (Postgres + Auth + RLS)
- **Schema:** migrations in `supabase/migrations/` (`0001_init.sql` → `0065_create_storage_buckets.sql`).
  Core objects:
  - `profiles` — creator identity, `plan`, `credits`, `dna`, `onboarded`. Column
    lockdown: clients may only update `dna`/`display_name`/`onboarded`; `credits`/
    `plan` are service-role-only. A trigger (`handle_new_user`) auto-creates a
    profile on signup with starter credits.
  - `brand_voices` — the creator-DNA voice models (`status: building → ready`).
  - `generations` — blueprints + takes + approval status + thumbnails. (Old-editor
    columns `edit_style`/`edl_path` remain in the schema as deprecated no-ops.)
  - `jobs` — the async work queue (see §5).
  - `transcripts` — worker output (text + word timings; **raw media discarded**).
  - `credit_events` — append-only audit of every spend/refund.
  - `gallery_items`, analytics/funnel/`ops_events`, notifications, brand kit,
    templates, billing.
- **RLS on every table.** Owner-only by default; public gallery readable by all;
  admin reads gated by `is_platform_admin()`. Credit/queue mutation never reaches the
  browser — those RPCs are `service_role`-only.
- **Keystone RPCs:** `spend_credits` / `refund_credits` (atomic, audited),
  `claim_job` / `complete_job` / `fail_job` (the queue contract).

### 4.3 Secure synchronous API — Edge Functions (Deno)
The privileged API surface. Each function validates the caller's JWT, enforces
limits, holds the secrets the browser must never see, calls AI/3rd-party providers,
and **enqueues jobs** for heavy work. In `supabase/functions/`:

| Function | Role |
|---|---|
| `generate-blueprint` | Calls Gemini with DNA + transcript → Scene Timeline; spends a credit |
| `ingest-reference` | Validates a reference URL, enqueues `ingest` (the only top-level ingest job; `transcribe` was retired) |
| `start-dna` / `dna-poll` | Kick off + advance a creator-DNA scan |
| `billing` / `billing-webhook` | Stripe checkout + webhook |
| `review` / `social` / `brand-logo` / `referral` | Approval flow, publishing glue, assets, referrals |
| `admin` / `admin-metrics` | Ops + system-health panels |
| `_shared` | Common auth/CORS/util helpers |

### 4.4 Heavy worker — VPS / Hetzner (Docker)
- **Entry:** `worker/src/index.ts` — poll → `claim_job` → run handler → `complete_job`
  / `fail_job` (exponential backoff) → idle backoff. Graceful shutdown; structured
  JSON logs; **hard per-job timeout** kept under the lease so a hung child frees the
  worker instead of wedging it.
- **Handlers (`worker/src/jobs/index.ts`) — the canonical five job types
  (`worker/src/env.ts` `jobTypes`):**
  `ingest` → `transcribe.ts` (yt-dlp audio-only + faster-whisper reference
  transcript); `build_voice` → `voice.ts` (voice-from-audio DNA);
  `scrape_dna` → `scrapeDna.ts`; `validate_source` → `validateSource.ts`
  (validates an uploaded recording); `editor_v2` → `editorV2.ts` (the rebuilt
  editor's orchestration loop — one loop with internal stages, gated OFF in
  production; see `docs/editor-v2-speech-analysis.md`). The old AI editor's
  auto-edit job type and premium renderer were removed and must not return
  (CI guard `scripts/ci/check_single_deploy_path.mjs`). Historical removal
  detail lives in `docs/ai-editor-removal-inventory.md`.
- **Python helpers:** `whisper_transcribe.py`, `youtube_transcript.py`. ffmpeg and
  faster-whisper stay in the image — the rebuilt editor reuses them.
- **Stateless & horizontally scalable:** run N containers with distinct
  `WORKER_ID` (auto-derived from hostname). They share one Postgres queue;
  `SKIP LOCKED` prevents collisions. See `worker/SCALING.md`.
- **Security:** SSRF allow-list (tiktok/instagram/youtube hosts, https only, no
  `file://`/internal IPs), subprocesses spawned with arg arrays (no shell),
  service-role key server-side only, media duration/filesize caps + per-step timeouts.
- **Deploy:** `worker/deploy-vps.sh` (Docker on Ubuntu/Hetzner, `--restart
  unless-stopped`, CPU/mem capped, pulls `main`). Secrets in `/opt/twinai-worker.env`.

### 4.5 Satellite services (VPS / Docker)
- **`discovery/`** — daily cron finding fresh viral references per niche
  (`discovery/deploy-vps.sh` installs it; reuses the worker container's secrets).
- **`postiz/`** — self-hosted publishing + analytics (docker-compose + Caddy).

### 4.6 Source of truth & CI/CD — GitHub
- `main` is canonical.
- **Vercel** auto-deploys the frontend on push to `main`.
- **VPS** worker + satellites track `main` via their `deploy-vps.sh` (git pull +
  docker build + restart).
- **Edge functions** ship via `supabase functions deploy <name>`.

---

## 5. The `jobs` queue contract (the keystone)

The seam between the synchronous and asynchronous planes. Defined in
`supabase/migrations/0004_job_claim.sql`; consumed by `worker/src/db.ts`.

- **Enqueue** (edge function, service role):
  `insert into public.jobs (owner_id, type, payload) values (…)`.
- **`claim_job(p_worker, p_types[], p_visibility_secs)`** — atomically grabs the next
  eligible job (`queued` & due, **or** `running` past its visibility timeout) using
  `... for update skip locked limit 1`, flips it to `running`, bumps `attempts`, sets
  the lease. Two workers can never grab the same row.
- **`complete_job(id, result)`** — marks `done`, clears the lease.
- **`fail_job(id, error, backoff)`** — retries with backoff until `max_attempts`
  (default 5), then dead-letters to `failed` (worker also writes an `ops_events`
  `job_dead_letter` row for the health panel).
- **Reliability properties:** atomic claims · lease/visibility reclaim of crashed
  jobs · backoff retries · dead-letter alerts · hard per-job timeout under the lease.
- **All three RPCs are `service_role`-only** — never callable from the browser.

---

## 6. End-to-end data flows

1. **Creator-DNA onboarding** — Onboarding → `start-dna` → enqueue `scrape_dna` →
   worker scrapes the handle (Apify / yt-dlp) and runs `build_voice` → `brand_voices`
   goes `building → ready`; `dna-poll` advances it.
2. **Blueprint generation** — Studio pastes a reference → `ingest-reference` enqueues
   `ingest` (real audio → `transcripts`) → `generate-blueprint` calls Gemini with
   DNA + transcript → one master **Scene Timeline** persisted to `generations`;
   `spend_credits` debits atomically and auto-refunds on failure.
3. **Record → take saved** — the V2 flow records scene-by-scene against the timeline;
   the finished take autosaves to the private `takes` bucket. **AI editing is being
   rebuilt** (`docs/ai-editor-rebuild-status.md`); the new one-click editor will pick
   the take up from this seam and write `generations.edit_path`/`thumb_path`.
4. **Publish + analytics** — hand off to Postiz → publish + pull metrics → dashboard.

**The Scene Timeline is the single in-app source of truth** (`docs/PRODUCT_VISION.md`
§8): script, teleprompter and publish copy all read from one scene object, so scene
counts / hooks / captions can never disagree.

---

## 7. Security model

- **RLS is the perimeter.** The anon key is public by design; every table is
  owner-scoped (or explicitly public) so the browser can only ever touch its own rows.
- **Secret isolation by tier:**
  - *Frontend (public):* `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
  - *Edge functions (Supabase secrets):* `GEMINI_API_KEY`, `APIFY_TOKEN`, Stripe keys,
    plus platform-injected `SUPABASE_*` incl. the service-role key.
  - *Worker (`/opt/twinai-worker.env`, chmod 600):* `SUPABASE_SERVICE_ROLE_KEY`,
    `GEMINI_API_KEY`, `APIFY_TOKEN`.
  The **service-role key never reaches a browser** — only edge functions and the
  worker hold it.
- **Privilege-sensitive mutations** (credits, queue claims) are `security definer`
  RPCs granted to `service_role` only.
- **Worker hardening:** SSRF allow-list, no-shell subprocess args, resource caps —
  see `SECURITY.md`.

---

## 8. Environment / secret matrix

| Secret | Frontend (Vercel) | Edge functions | Worker (VPS) |
|---|:--:|:--:|:--:|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | ✅ public | — | — |
| `SUPABASE_URL` | — | ✅ (injected) | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ never | ✅ (injected) | ✅ |
| `GEMINI_API_KEY` (`GEMINI_MODEL`) | ❌ | ✅ | ✅ |
| `APIFY_TOKEN` (+ actor overrides) | ❌ | ✅ | ✅ |
| Stripe keys | ❌ | ✅ | — |
| `WORKER_JOB_TYPES` / `WHISPER_MODEL` / caps | — | — | ✅ |

See `.env.example` (frontend), `worker/.env.example` (worker), and `DEPLOY.md` for
the authoritative lists.

---

## 9. Deployment topology

| Component | Host | Deploy command |
|---|---|---|
| Frontend SPA | Vercel | auto on push to `main` (or `npm run build` → upload `dist/`) |
| Database + RLS + RPCs | Supabase | `supabase db push` |
| Edge functions | Supabase | `supabase functions deploy <name>` + `supabase secrets set …` |
| Worker | VPS / Hetzner | `worker/deploy-vps.sh` (Docker) |
| Discovery / postiz | VPS / Hetzner | `discovery/deploy-vps.sh`, `postiz/` |

Full step-by-step runbook + smoke test: **`DEPLOY.md`**.

---

## 10. Where to look (file map)

```
src/            frontend (Vercel)  — pages/, components/, lib/, context/
supabase/
  migrations/   schema, RLS, RPCs, buckets (0001 → 0065)
  functions/    edge functions (the secure synchronous API)
worker/         VPS job-queue worker (Node/TS + Python + ffmpeg)
discovery/      daily viral-reference discovery cron
postiz/         self-hosted publishing + analytics
DESIGN.md             visual system
docs/PRODUCT_VISION.md  product / UX system (Scene Timeline)
ROADMAP.md            what's next
DEPLOY.md             deploy runbook
ARCHITECTURE.md       ← you are here (system shape)
```
