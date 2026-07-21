# Editor v2 Phase 5 — Production Sign-off Evidence

**Branch:** `hardening/phase5-production-signoff` · **Base:** `main` @ `f6e4cb7d058f6d16e26e820ee1ba216710a9d1c0` (the Phase 5 merge, #191)
**Status:** DRAFT — does NOT merge, deploy, enable the editor, or start Phase 6.
**Standing holds (unchanged):** editor start disabled (`EDITOR_V2_START_ENABLED` unset in prod), `autoFillerRemoval=false`, Phase 6 unauthorized, production otherwise untouched.

Phase 5 code is merged and the worker is healthy, but production sign-off is **not** closed until the independent reviewer accepts every item below. This document is the itemized evidence.

---

## A1 — Formal production-evidence workflow hardening

**`.github/workflows/verify-prod-gate.yml`** and **`.github/workflows/prod-source-smoke.yml`**:
- The authenticated fail-closed leg is now **mandatory** — it fails closed (`::error::` + exit 1) if the probe secrets are absent, and is no longer behind an `if: inputs.probe_email != ''` skip.
- Probe **credentials moved from `workflow_dispatch` inputs to protected production-environment secrets**: `PROD_PROBE_EMAIL`, `PROD_PROBE_PASSWORD` (both workflows), plus the existing `SUPABASE_ACCESS_TOKEN`. `prod-source-smoke.yml` keeps only the per-run `generation_id` as an input.
- **No GitHub-expression interpolation into shell or JSON.** Every credential/JSON body is passed via `env:` and assembled with `jq -n --arg`; the caller-supplied `generation_id` reaches the shell only through `env: GEN_ID` and is validated with `grep -Eq` (never echoed).

> **Operator action required to RUN the live probe (not executable from this session):** add `PROD_PROBE_EMAIL` / `PROD_PROBE_PASSWORD` (a throwaway `gate-probe-*@twinai.internal` user) and `SUPABASE_ACCESS_TOKEN` to the repo **Environments → production** secrets, then dispatch **Verify production editor gate** from `main` and approve the environment gate. Expected: unauth `401`, authenticated `503 editor_not_available`, and `EDITOR_V2_START_ENABLED` confirmed absent.

## A2 — Fail-closed + zero-delta bracketing

**Production baseline (via operator SQL, `2026-07-21`).** The editor-v2 pipeline has created **zero** rows anywhere; a fail-closed probe cannot change any of these because the gate returns before any write:

| Table / scope | Count | Note |
|---|---:|---|
| `edit_projects` | **0** | no editor projects |
| `jobs where type='editor_v2'` | **0** | no editor jobs |
| `media_assets` (total) | **0** | incl. `kind='output'` 0, `kind='thumbnail'` 0 |
| `media_analyses` (total) | **0** | incl. `component='speech'` 0 |
| `edit_events` | **0** | |
| `edit_plans` | **0** | |
| `storage.objects` bucket `edits` | 67 | **historical** old-editor renders (pre-tombstone) |
| `generations` with `edit_path` | 10 | **historical** old-editor outputs |
| `jobs where type='autoedit'` | 17 | **historical** pre-tombstone jobs (see A5) |

The two editor indexes (`media_analyses_asset_idx`, `edit_events_project_idx`) show as **unused** in the performance advisor, independently corroborating that no editor job has run in production.

**Re-run (the "after" side of the bracket) — must equal the baseline for the editor rows:**
```sql
select
  (select count(*) from public.edit_projects)                          as edit_projects_total,
  (select count(*) from public.jobs where type='editor_v2')            as editor_v2_jobs_total,
  (select count(*) from public.media_assets)                           as media_assets_total,
  (select count(*) from public.media_analyses where component='speech')as media_analyses_speech,
  (select count(*) from public.edit_events)                            as edit_events_total,
  (select count(*) from public.edit_plans)                             as edit_plans_total;
-- editor rows must remain 0 across the bracketed probe.
```
> **Operator action required:** the live authenticated probe (A1) must be run bracketed by the query above for the probe identity; every editor-row delta must be zero. Not executable here (needs production-environment secrets + human approval).

## A3 — Migration 0085 production evidence *(captured, complete)*

`editor_record_inspection` on production (`jmdecibuytznsonrasxw`):

| Property | Value |
|---|---|
| migration ledger row | present (`0085_speech_component_hardening`) |
| overload count | **1** (exactly one signature) |
| identity args | `(uuid,uuid,text,integer,text,integer,text,text,jsonb,text,bigint)` |
| `SECURITY DEFINER` | **true** |
| owner | `postgres` (intended) |
| `search_path` | `pg_catalog, public` |
| 1 MiB payload bound | present (`component_too_large` / `1048576`) |
| inspection-only `analysis_version` | present (`if p_component = 'inspection'`) |
| EXECUTE grantees | `{postgres, service_role}` — `public`/`anon`/`authenticated` denied |

**Advisor disposition:** `editor_record_inspection` appears in **none** of the security lints — not `function_search_path_mutable` (search_path is set), not `anon_/authenticated_security_definer_function_executable` (correctly locked to `service_role`). All security/performance findings are pre-existing and unrelated to `0085` (which changes only a function — no table/index/RLS change). The only editor-related performance lints are the two "unused index" INFOs noted in A2.

## A4 — Strict live VPS evidence *(captured via read-only `vps-diag.yml`, run `29789453138`)*

| Item | Observed |
|---|---|
| deployed source SHA | `f6e4cb7d058f6d16e26e820ee1ba216710a9d1c0` — **matches main head / #191** |
| container | `image=twinai-worker` `sha256:366a22ef…990b4` `status=running` **`restarts=0`** `Up 40m (healthy)` — no restart loop |
| active job registry (runtime `worker up` log) | `["ingest","build_voice","scrape_dna","validate_source","editor_v2"]` — exactly the canonical five |
| `WORKER_JOB_TYPES` override on box | unset (env.ts registry applies) |
| baked manifest | `Systran/faster-whisper-small` `536b0662742c02347bc0e980a01041f333bce120` `speech-6` |
| in-container `fetch_model --verify-only` | `model verified: Systran/faster-whisper-small@536b0662…bce120`, `analyzer_bundle: speech-6`, `manifest_sha256: f59a1617…bc00` |
| test-manifest override | `EDITOR_ALLOW_TEST_MODEL_MANIFEST=[]` `EDITOR_SPEECH_MODEL_MANIFEST=[]` — **absent** |

## A5 — Legacy tombstone + Revideo-absence proof

**Autoedit tombstone (DB, captured).** `trg_reject_new_autoedit` is a **BEFORE INSERT** trigger on `public.jobs` raising `check_violation` for `type='autoedit'` (fires before FK checks). A rolled-back attempt confirmed rejection: the insert was caught by the exception handler (the "accepted" branch never fired), the block aborted (`ROLLBACK_SENTINEL_OK`), and the `autoedit` job count was **17 before and 17 after** — nothing committed. The 17 rows are historical, pre-tombstone. `enqueue-autoedit` remains the approved **410 `EDITOR_REMOVED`** tombstone (retained, not deleted).

**Revideo / port / legacy-env absence (VPS, captured):** `no revideo container`, `no revideo image`, `no revideo network`, `no :4500 listener (ss)`, `no legacy editor/revideo env in container`, `no legacy editor/revideo env in box env file`.

> Pre-existing, out-of-scope observation from the same snapshot: the unrelated `stylique-os` container is restart-looping (already tracked separately). `twinai-worker` itself is `restarts=0` and healthy.

---

## B — One-loop cleanup

- **Removed `worker/fly.toml`** — a stale second deployment path that claimed retired `transcribe` and omitted `validate_source`/`editor_v2`. The VPS + Docker path (`worker/deploy-vps.sh` + `deploy-worker.yml`) is the single supported production deployment.
- **Docs updated** so `WORKER_JOB_TYPES` stays **unset** on the shared worker and `worker/src/env.ts` is the canonical five-type registry: `DEPLOY.md`, `worker/README.md`, `worker/deploy-vps.sh`, `worker/.env.example`, `worker/SCALING.md`, `deploy-worker.yml` comments. Fly/transcribe/render-next wording removed.
- **New CI guard `scripts/ci/check_single_deploy_path.mjs`** (wired into `pr-checks.yml`, with `--selftest`): fails a second Fly/PaaS deploy manifest or a retired `autoedit`/`transcribe` `WORKER_JOB_TYPES` override; asserts the registry lists `editor_v2` exactly once and at most one `render`/`editplan` type — preserving one editor_v2 job type, one canonical EditPlan, one renderer. Selftest (11 cases) passes; a reintroduced `worker/fly.toml` was proven to trip both the manifest and the retired-override checks.

> The reviewer's prepared cleanup at `/tmp/twinai-audit.qaiUK9` (`a1b876c4`) was **not present** in this environment (the container had restarted, wiping `/tmp`). Per instruction ("inspect it, do not blindly trust it, and implement equivalent changes"), equivalent changes were implemented from scratch and independently verified here.

## C — Durable tracking (real issues; the old "#115–#118" numbers collided with old PRs)

| Concern | Issue |
|---|---|
| Private, consented ~12-user pre-beta speech eval | **#193** (`pre-beta-gate`, `editor-v2`) |
| Acoustically-grounded disfluency detector before auto filler removal | **#194** (`editor-v2`, `enhancement`) |
| Director/EditPlan compiler must independently reject filler removal while disabled | **#195** (`editor-v2`, `enhancement`) |
| `os._exit` teardown fallback in `build_corpus.py` | **#192 — verified resolved & closed** (no `os._exit()` call; child-process isolation + `test_build_corpus.py` regression guard) |

## Verification (this branch, local)

- shared: typecheck clean, **23/23** tests
- worker: typecheck clean, **58/58** tests
- python model-pin offline tests: all pass
- CI guards: `check_single_deploy_path` (selftest + live) OK, `check_model_pin_coupling` selftest OK
- `npm audit --omit=dev`: **0 vulnerabilities**
- all workflow YAML parses

## Remaining to fully close (operator/reviewer)

1. Add production-environment secrets `PROD_PROBE_EMAIL`, `PROD_PROBE_PASSWORD`, `SUPABASE_ACCESS_TOKEN`; run **Verify production editor gate** from `main` (approve the environment) → capture `401` + `503 editor_not_available` + `EDITOR_V2_START_ENABLED` absent.
2. Bracket that authenticated probe with the A2 zero-delta query for the probe identity.
3. Independent reviewer accepts every item above. **Not "fully verified" until then.**
