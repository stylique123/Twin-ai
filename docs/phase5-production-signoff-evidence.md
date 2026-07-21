# Editor v2 Phase 5 — Production Sign-off Evidence

**Branch:** `hardening/phase5-production-signoff` · **Integrated base:** `main` @ `79e0362c5afeea5a42a3853d676587347de12add` (the audited PR #197 bootstrap merge; merged into this branch). Historical original base was the Phase 5 merge `f6e4cb7…` (#191). **Current candidate head:** the latest commit on this branch (see PR #196 head).
**Status:** DRAFT — does NOT merge, deploy, enable the editor, or start Phase 6.
**Standing holds (unchanged):** editor start disabled (`EDITOR_V2_START_ENABLED` unset in prod), `autoFillerRemoval=false`, Phase 6 unauthorized, production otherwise untouched.

Phase 5 code is merged and the worker is healthy, but production sign-off is **not** closed until the independent reviewer accepts every item below. This document is the itemized evidence.

### Round-2 reviewer fixes applied (re-audit)
1. **`vps-diag.yml` is now fail-closed** (`set -euo pipefail` + `worker/scripts/vps_signoff_assert.sh` explicit assertions + `--selftest`) — no echo-fallback can read a bad state as green (A4).
2. **`worker/deploy-vps.sh`** performs the same idempotent `WORKER_JOB_TYPES` / `REVIDEO_`/`EDIT_`/`PEXELS_API_KEY`/`MUSIC_BED_URL` scrub as `deploy-worker.yml` (B).
3. **`worker/README.md`** documents all five job types and frames future editor stages as internal to the one `editor_v2` loop (B).
4. **`check_single_deploy_path.mjs`**: manifests scoped to worker-deploy paths; **strict set-equality** registry check (kills `render_v2`/`edit_plan` bypass); bypass + unrelated-manifest selftests (B).
5. **Both workflows** read credentials via `jq … env.PROBE_*` (no secrets in argv) and never echo token-bearing bodies (A1).
6. **This report** corrected (A1/A2 not called complete; explicit A2 operator before/after sequence; `prod-source-smoke` flagged as separately-authorized-only; inaccurate "wording removed" / "command line" claims fixed).

### Round-3 reviewer fixes applied (re-audit)
1. **vps-diag authority**: removed the `expected_sha` workflow input; expected SHA derives ONLY from `origin/main`, validated 40-hex. New CI guard `scripts/ci/check_vps_diag_authority.mjs` (+ selftest) proves inputs/host-key trust cannot weaken the authority.
2. **Full model identity** now asserted: repository + revision + bundle + load path `/opt/models/faster-whisper-small` + committed manifest SHA-256 + verify-only rc=0, captured as OBS_REPOSITORY/OBS_MODEL_PATH/OBS_MANIFEST_SHA vs branch-derived EXP — one failing selftest per field (asserter now covers 19 bad states).
3. **A2 SQL** replaced with one exact copy-paste query on the real schema (`generations.user_id`, `profiles.credits`, `credit_events`, `media_assets.owner_id`, `storage.objects.owner_id/path_tokens`), **proven to parse + run read-only in production**. No "adjust names" note.
4. **One-loop guard** now rejects ANY committed `WORKER_JOB_TYPES` runtime override outside allowlisted docs/tests (not just retired values), and detects worker-named deploy manifests ANYWHERE (`infra/worker/…`, `deploy/worker/…`) while allowing known unrelated services — both with selftests.
5. **Stale `jq --arg` comments** corrected in both workflows (code reads `env.PROBE_*`).
6. **VPS host key pinned** (strict verification, fail-closed, never printed) in `vps-diag` and `deploy-worker` via the `VPS_KNOWN_HOSTS` secret — owner setup step in `DEPLOY.md → Pinning the VPS host key`.

### Round-4 reviewer fixes applied (re-audit)
1. **Release order corrected**: the operator sequence (above) and `DEPLOY.md` now require `VPS_KNOWN_HOSTS` to be configured + verified **before** merge, and state explicitly that merging this PR triggers `deploy-worker` (the worker deployment).
2. **Stale-docs sweep**: `ARCHITECTURE.md` (worker box + handler list) corrected to the five current job types with `editor_v2` registered; `worker/README.md` de-enumerated; `BUILD_PLAN.md`, `docs/ai-editor-rebuild-status.md`, `docs/manual-editor-remnant-inventory.md` carry unmistakable **HISTORICAL/OBSOLETE banners** linking to canonical current docs, and their specific stale claims (old three-type registry, `take_path` future-seam) are corrected. New CI guard `scripts/ci/check_docs_no_stale_claims.mjs` (+ selftest) blocks Fly/Railway/Render, Revideo, `autoedit`, top-level `transcribe`, and the three-type registry from returning to the canonical docs.
3. **Deploy-guard bypass fixed**: `check_single_deploy_path.mjs` no longer exempts broad top-level dirs — `apps/worker/fly.toml` and `packages/worker/render.yaml` now fail (negative selftests added); true unrelated services (`apps/web`, `postiz`) still pass.
4. **`deploy-worker.yml` setup header** corrected to require BOTH `VPS_SSH_KEY` and `VPS_KNOWN_HOSTS` (fail-closed strict host verification).
5. **`prod-source-smoke` honest cleanup**: the false "no orphan left" claim is removed. The final step deletes the Storage object best-effort, then **enumerates every residual artifact** (object, `media_assets` row, generation pointer, service-side validation job/events) and **fails closed with a recoverable-artifact report** requiring sanctioned operator retention. Classifier `scripts/prod-smoke/probe_residue_report.mjs` (+ selftest) proves partial and complete states cannot silently pass with unreported residue.

---

## A1 — Formal production-evidence workflow hardening

**`.github/workflows/verify-prod-gate.yml`** and **`.github/workflows/prod-source-smoke.yml`**:
- The authenticated fail-closed leg is now **mandatory** — it fails closed (`::error::` + exit 1) if the probe secrets are absent, and is no longer behind an `if: inputs.probe_email != ''` skip.
- Probe **credentials moved from `workflow_dispatch` inputs to protected production-environment secrets**: `PROD_PROBE_EMAIL`, `PROD_PROBE_PASSWORD` (both workflows), plus the existing `SUPABASE_ACCESS_TOKEN`. `prod-source-smoke.yml` keeps only the per-run `generation_id` as an input.
- **No GitHub-expression interpolation into shell or JSON**, and **no secrets on any command line (argv).** Credentials reach the shell only via `env:` and are read into the JSON body by **jq from the environment** (`jq -n '{email: env.PROBE_EMAIL, password: env.PROBE_PASSWORD}'`) — never passed as `jq --arg` (which would place them in world-readable `/proc/<pid>/cmdline`). Auth-failure paths print a fixed string only and **never echo the token-bearing response body** (`jq -r '.access_token // empty'`). The caller-supplied `generation_id` reaches the shell only through `env: GEN_ID`, validated with `grep -Eq` (never echoed).

> **DONE.** The operator configured `PROD_PROBE_EMAIL` / `PROD_PROBE_PASSWORD` (`gate-probe-editor-v2@twinai.internal`) and `SUPABASE_ACCESS_TOKEN` as production-environment secrets with required-reviewer protection, and live run **`29829091202`** (dispatched from `main@79e0362`, human-approved) captured exact `401`, login `200`, exact `503` with top-level `code === "editor_not_available"`, and `EDITOR_V2_START_ENABLED` absent. See the **"A1/A2 CLOSED"** chapter below.

## A2 — Fail-closed + zero-delta bracketing — **CLOSED (runs 29827536668 + 29829091202; see the "A1/A2 CLOSED" chapter)**

`verify-prod-gate` proves the HTTP fail-closed walls but has **no built-in before/after DB counters** — the bracketing was executed as external snapshot queries around the live run (zero delta on every editor/storage/billing surface, watermarks included; the expected Auth login side effect reported separately). Historical context below is preserved as originally written.

**Production baseline captured for reference (operator SQL, `2026-07-21`).** The editor-v2 pipeline has created **zero** rows anywhere; a fail-closed probe cannot change these because the gate returns before any write:

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

**Exact bracket query — verified to parse and run READ-ONLY against production TwinAI (`jmdecibuytznsonrasxw`) on `2026-07-21`** (returned all zeros for the placeholder uid). Edit only the one uuid in the `probe` CTE to the probe user's real `auth.users.id`; change nothing else. Run it for BEFORE and AFTER counts around the probe:
```sql
with probe as (select '00000000-0000-0000-0000-000000000000'::uuid as uid)
select
  (select count(*) from public.edit_projects)                                             as edit_projects_total,
  (select count(*) from public.jobs where type = 'editor_v2')                             as editor_v2_jobs_total,
  (select count(*) from public.media_analyses where component = 'speech')                 as media_analyses_speech,
  (select count(*) from public.edit_events)                                               as edit_events_total,
  (select count(*) from public.edit_plans)                                                as edit_plans_total,
  (select count(*) from public.media_assets  where owner_id = (select uid from probe)
                                                and kind in ('output','thumbnail'))        as probe_output_thumb_assets,
  (select count(*) from public.generations   where user_id = (select uid from probe)
                                                and edit_path is not null)                 as probe_generation_edit_ptrs,
  (select count(*) from storage.objects      where bucket_id = 'edits'
                                                and (owner_id = (select uid from probe)::text
                                                     or path_tokens[1] = (select uid from probe)::text)) as probe_edits_objects,
  (select coalesce((select credits from public.profiles where id = (select uid from probe)), 0)) as probe_credit_balance,
  (select count(*) from public.credit_events where user_id = (select uid from probe))      as probe_credit_events;
```
Every column must be **identical** before and after the bracketed probe (global editor rows stay 0; the probe identity's assets, generation pointers, edits-bucket objects, credit balance, and credit-event count unchanged). Columns are the verified live schema: `generations.user_id`, `profiles.credits`, `credit_events(user_id)`, `media_assets.owner_id`, `storage.objects(owner_id text, path_tokens)`.

> **HISTORICAL — COMPLETED (record of the executed closure, past tense).** The
> A1/A2 closure was performed on 2026-07-21, in a variant of the originally
> planned order: the hardened `verify-prod-gate` reached `main` first through
> the audited **PR #197 bootstrap split** (merged as `main@79e0362`, without
> merging this PR), the operator then configured `VPS_KNOWN_HOSTS`, the
> production-environment secrets (`PROD_PROBE_EMAIL`, `PROD_PROBE_PASSWORD`,
> `SUPABASE_ACCESS_TOKEN`), the `gate-probe-editor-v2@twinai.internal` identity,
> and required-reviewer environment protection. BEFORE counts were captured
> (2026-07-21T12:11:19Z), `Verify production editor gate` was dispatched from
> `main` and human-approved (run **`29829091202`**: exact `401`, login `200`,
> exact `503` + top-level `code === "editor_not_available"`,
> `EDITOR_V2_START_ENABLED` absent), AFTER counts were captured (12:30:25Z),
> and every delta was proven zero (with the expected Auth login side effect
> reported separately). A prior dispatch without secrets (run
> **`29827536668`**) failed closed, proving the mandatory leg cannot be
> skipped. Full record: the **"A1/A2 CLOSED"** chapter below.

**Current cautions (still in force):**

- ⚠️ **`prod-source-smoke` is a separate, mutating workflow** — it creates a probe `media_assets` row + generation pointer + Storage object and its in-workflow cleanup does NOT fully remove them (it reports residue and fails closed for sanctioned operator retention). It must NOT be run as part of any fail-closed check — only under its own separate authorization (see `docs/prod-source-smoke-protocol.md`).
- ⚠️ **Merging this PR to `main` still TRIGGERS `deploy-worker`** (it touches `worker/**`) and a production Vercel deploy of the changed web copy — both must be explicitly owned by the merge decision.

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

## A4 — Strict live VPS evidence *(read-only, now FAIL-CLOSED)*

`vps-diag.yml` is **no longer observational**: it captures the facts over SSH (with a **pinned, strictly-verified host key** — `VPS_KNOWN_HOSTS` secret, `StrictHostKeyChecking=yes`, no `ssh-keyscan`/`=no`; fails closed if the secret is absent) then hands them to `worker/scripts/vps_signoff_assert.sh`, which asserts each against its expectation and **exits non-zero on any mismatch**: expected SHA; worker running + healthy + `restarts=0`; registry = the exact five; `WORKER_JOB_TYPES` absent; **full model identity** — repository, revision, analyzer bundle, load path (`/opt/models/faster-whisper-small`), and committed manifest SHA-256; `verify-only` rc=0; any test-manifest override; Revideo present; `:4500` listener; legacy env. The assertion logic ships with a `--selftest` (19 bad states, each proven to fail — run in CI). **Authority:** the expected SHA derives ONLY from `origin/main` and is validated 40-hex — there is no `workflow_dispatch` input a caller could use to pin a stale commit (enforced by `scripts/ci/check_vps_diag_authority.mjs`, also in CI). Expected model identity is read from the committed manifest/Dockerfile — self-updating and un-spoofable.

Snapshot observed on the fail-closed run (dispatch again on the new head to re-capture):

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
- **`worker/deploy-vps.sh` now performs the same idempotent env scrub as `deploy-worker.yml`** — strips `WORKER_JOB_TYPES` and any `REVIDEO_`/`EDIT_`/`PEXELS_API_KEY`/`MUSIC_BED_URL` lines from `/opt/twinai-worker.env` and removes any leftover Revideo container/image before `docker run`, so the manual deploy path cannot drift from the CI path.
- **Docs updated** so `WORKER_JOB_TYPES` stays **unset** on the shared worker and `worker/src/env.ts` is the canonical five-type registry: `DEPLOY.md`, `worker/README.md`, `worker/deploy-vps.sh`, `worker/.env.example`, `worker/SCALING.md`, `deploy-worker.yml` comments. Fly wording and the retired-`transcribe` job type removed; `worker/README.md` now documents **all five** current job types and frames future editor stages (Director/EditPlan/renderer) as **internal stages of the one `editor_v2` loop**, not competing top-level job types.
- **New CI guard `scripts/ci/check_single_deploy_path.mjs`** (wired into `pr-checks.yml`, with `--selftest`): (1) fails a second **worker** deploy manifest (Fly/Railway/Render/Heroku) at the repo root OR **any path containing a `worker` segment** — `worker/`, `infra/worker/`, `deploy/worker/`, `apps/worker/`, `packages/worker/` — with **no broad top-level exemption** (a prior version exempted whole dirs like `apps`/`packages`, which let `apps/worker/fly.toml` slip through); true unrelated services with no `worker` segment (`postiz/`, `discovery/`, `apps/web/…`) are allowed; (2) fails **any** committed `WORKER_JOB_TYPES` runtime override outside allowlisted docs/tests/examples (the shared worker must be unset); (3) asserts the registry equals **exactly** `{ingest,build_voice,scrape_dna,validate_source,editor_v2}` by **strict set-equality** (order-insensitive, no extras/dupes) — a bypass name like `render_v2`/`edit_plan` is caught as an extra. Selftest covers the `apps/worker`/`packages/worker` bypass, unrelated-manifest, override, and bypass-name cases.

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
- CI guards: `check_single_deploy_path` (selftest incl. apps/worker+packages/worker bypass + override cases + live) OK, `vps_signoff_assert --selftest` (good + 19 bad states) OK, `check_vps_diag_authority --selftest` + live OK, `check_docs_no_stale_claims --selftest` + live OK, `probe_residue_report --selftest` OK, `check_model_pin_coupling` selftest OK
- A2 bracket query proven to parse + run READ-ONLY in production (all zeros)
- `npm audit --omit=dev`: **0 vulnerabilities**
- all workflow YAML parses; `deploy-vps.sh` + `vps_signoff_assert.sh` pass `bash -n`

## Closure status (updated — see the "A1/A2 CLOSED" chapter for full evidence)

1. ~~Production-environment secrets + live gate run~~ **DONE** — run **`29829091202`** from `main@79e0362` (human-approved environment gate): exact `401`, login `200`, exact `503` + top-level `code === "editor_not_available"`, `EDITOR_V2_START_ENABLED` absent. Fail-closed proof: run **`29827536668`** (missing secrets ⇒ mandatory leg failed closed, zero delta, zero auth activity).
2. ~~Zero-delta bracket around the authenticated probe~~ **DONE** — BEFORE 2026-07-21T12:11:19Z / AFTER 12:30:25Z, every editor/storage/billing surface unchanged (counts + max-created watermarks); expected Auth side effect reported separately.
3. Independent reviewer acceptance of the full evidence set — the only remaining item.

---

# Round 5 — independent-audit correction (8 blockers)

All eight round-5 blockers were closed in ONE correction round on branch
`hardening/phase5-production-signoff`. PR #196 remains **DRAFT**; nothing was
merged, deployed, enabled (`EDITOR_V2_START_ENABLED` still unset,
`autoFillerRemoval=false`), and `prod-source-smoke` was **not** run against
production. The `enqueue-autoedit` 410 tombstone is untouched.

## Changed files (round 5)

| File | Blocker | Change |
|---|---|---|
| `ARCHITECTURE.md` | R5-1 | Ingest row + prose say `ingest` only; note `transcribe` retired. No retired job named as a top-level job anywhere. |
| `scripts/ci/check_docs_no_stale_claims.mjs` | R5-2, R5-8 | Fail-closed: 5 REQUIRED canonical docs (missing/empty ⇒ fail). Added `transcribe/ingest` ordering + `enqueues…transcribe` semantic + quoted/`transcribe job` + 3-type registry + Scene-Timeline-drives-editor patterns. 16-case selftest incl. missing-file. |
| `scripts/prod-smoke/probe_residue_report.mjs` | R5-4 | `present ∈ {true,false,"unknown"}`; residue = anything not proven `false`; clean only if ALL false. Distinguishes PRESENT vs UNKNOWN. ESM main-guard fixed so import doesn't self-run. |
| `scripts/prod-smoke/residue_harness.mjs` (new) | R5-5 | Workflow-level failure-injection over 7 branches; asserts no attempted-create branch is clean while residue present/unknown; storage object never falsely "deleted"; `migrationsHaveNoTakesDelete()` verifies policy from migrations, not comments. |
| `.github/workflows/prod-source-smoke.yml` | R5-3, R5-4 | Persists `PROBE_GEN_ID`/`PROBE_ATTEMPT`/`PROBE_CREATE_ATTEMPTED=1` to `$GITHUB_ENV` **before** the create request. Residue: Case A (no create ⇒ clean), Case B (created, no assetId ⇒ all UNKNOWN, fail closed), Case C (assetId ⇒ observe object via delete-attempt+refetch, never claim unobserved deletion). |
| `scripts/ci/check_single_deploy_path.mjs` | R5-6 | Header comment corrected (apps/ is NOT wholesale-exempt; any `worker` segment is caught). Added drift-guard selftest that reads its own header and fails if it wholesale-exempts apps/. |
| `scripts/ci/check_product_truth.mjs` (new) | R5-7 | Fail-closed guard scanning `apps/web/src` for present-tense editor-OUTPUT claims; 9-case selftest; live scans 44 files. |
| `apps/web/src/pages/Landing.tsx` | R5-7 | Editor-output claims → "coming soon / being rebuilt" (hero, LOOP, FAQ, pricing card, pitch). |
| `apps/web/src/pages/Metrics.tsx` | R5-7 | Funnel label `'Rendered an edit'` → `'Rendered an edit (editor rebuilding)'`. |
| `docs/PRODUCT_VISION.md` | R5-8 | HISTORICAL/ASPIRATIONAL banner: legacy Scene-Timeline-drives-editing is NOT current; states the authoritative one-loop Editor v2 flow; links ARCHITECTURE + rebuild-status + speech-analysis. |
| `.github/workflows/pr-checks.yml` | R5-2,4,5,7 | Wires docs-guard, residue classifier `--selftest`, residue harness `--selftest`, product-truth guard into the `no-legacy-editor` job. |

## Guard outputs (this head, local)

- `check_docs_no_stale_claims --selftest`: all cases passed; live: **OK (5 required canonical docs)**
- `check_single_deploy_path --selftest` + live: **OK** (registry `{ingest,build_voice,scrape_dna,validate_source,editor_v2}`)
- `check_product_truth --selftest`: all cases passed; live: **OK (44 files clean)**
- `probe_residue_report --selftest`: all cases passed (partial/unknown cleanup cannot silently pass)
- `residue_harness --selftest`: **all branches + migration policy check passed** (storage object never falsely confirmed-deleted; report-path failure stays fail-closed)
- `check_vps_diag_authority --selftest` + live: **OK**
- `vps_signoff_assert --selftest`: all cases passed
- `@twinai/web` typecheck: clean; both workflow YAMLs parse.

## Migration / policy inventory — `takes` DELETE posture (R5-4)

The workflow's residue logic assumes **there is no client-usable DELETE on the
`takes` bucket**, verified directly from migrations (not comments):

| Migration | Policy on `storage.objects` for `takes` |
|---|---|
| `0006_autoedit.sql:17` | `create policy "twinai takes insert" … for insert to authenticated` |
| `0006_autoedit.sql:21` | `create policy "twinai takes read" … for select to authenticated` |
| `0057_agency_shared_media_approvals.sql:22-23` | drops + recreates the **select** policy (still select-only) |

`grep -niE delete supabase/migrations/*.sql | grep -i takes` ⇒ **NONE**. There
is **no DELETE policy** for the `takes` bucket. Accordingly the smoke workflow
**observes** whether an object is gone (delete-attempt mapped 400/404 ⇒ absent,
200 ⇒ present, anything else ⇒ unknown) and **never claims** a deletion it did
not observe via a supported API. No broad client DELETE policy was added to make
the smoke green (explicitly forbidden by the blocker). `residue_harness.mjs`
encodes this by asserting `storage_object` is never reported confirmed-deleted.

## prod-source-smoke — branch-by-branch residue posture (R5-3)

| # | Branch | GITHUB_ENV state | Residue report | Exit |
|---|---|---|---|---|
| 1 | No create attempted | `PROBE_CREATE_ATTEMPTED` unset | Case A → **clean** (nothing was created) | 0 |
| 2 | Create attempted, response lost (no assetId) | `PROBE_GEN_ID`+`PROBE_ATTEMPT` set, no assetId | Case B → all artifacts **UNKNOWN** keyed by gen/attempt | **fail-closed (≠0)** |
| 3 | Malformed assetId in response | gen/attempt set | treated as no usable assetId → Case B UNKNOWN | fail-closed |
| 4 | Upload failure after create | gen/attempt set | Case C observe: object likely absent, row/pointer observed, jobs "unknown" → residue if any ≠false | fail-closed if residue |
| 5 | Finalize failure | gen/attempt set | Case C observe as above | fail-closed if residue |
| 6 | Object present, DELETE denied (no policy) | assetId known | Case C: delete-attempt non-2xx→200 refetch ⇒ **present**; report residue honestly | fail-closed |
| 7 | Object gone (400/404 on refetch) but DB row/pointer remain | assetId known | object=false, row/pointer/jobs not proven false ⇒ **not clean** | fail-closed |

`validation_job_events` is always reported `"unknown"` (no supported client read
path), so a run is **never** declared clean on the strength of an unobserved
artifact.

## Repository-wide user-facing copy sweep (R5-7)

Every present-tense editor-OUTPUT claim in `apps/web/src` was corrected to
"coming soon / being rebuilt". Remaining "ready to post" strings were classified
and **left as-is** because they are publishing-workflow status, not editor
output:

| Location | String | Classification | Action |
|---|---|---|---|
| `Landing.tsx:1330` | "Caption copied · ready to post" | caption-copy / clipboard status | keep |
| `History.tsx:117` | "drafts, ready to post, and published" | post pipeline status (draft/ready/published) | keep |

The product-truth guard (live) confirms **0** shipped-editor-output claims across
44 scanned files.

---

# Round 6 — independent-audit correction (residue harness honesty + observation truth table)

Round 6 corrects claims that Round 5 had not truly earned. PR #196 remains
**DRAFT**; nothing merged/deployed/enabled; `EDITOR_V2_START_ENABLED` unset,
`autoFillerRemoval=false`; `enqueue-autoedit` 410 tombstone intact;
`prod-source-smoke` NOT run against production.

## What Round 5 claimed vs. what was actually true

- Round 5's `residue_harness.mjs` asserted over a **static `SCEN` array** of
  hand-written artifact states — it validated the pure classifier but did **not
  execute the workflow's real observation/control-flow**. That is now fixed.
- The workflow's inline shell mapped a storage re-fetch of **`400|404` → false**
  (confirmed absent). A `400` is **not** proof of absence; that was a real
  observation bug. Fixed: only a documented `404` (or a valid empty PostgREST
  array) yields `false`.

## Changed files (round 6)

| File | Blocker | Change |
|---|---|---|
| `scripts/prod-smoke/residue_flow.mjs` (new) | R6-1, R6-2 | The REAL A/B/C residue control flow as an importable, fetch-injected module. The workflow runs it; the harness drives the SAME functions. Pure observation mappers `observeStorageObject` / `observeRow` / `observePointer` capture HTTP status **separately per query**. |
| `scripts/prod-smoke/residue_harness.mjs` (rewritten) | R6-1, R6-2 | Imports `runResidueAccounting` and injects a fake `fetch` per scenario: create-response-loss (after commit), malformed response, PUT failure, finalize failure, denied DELETE, observation HTTP failures (401/403/5xx), network failure, malformed bodies, classifier/report failure. Records the calls the flow issued to PROVE it ran the real observation sequence. Adds a full per-observation truth table. |
| `scripts/prod-smoke/probe_residue_report.mjs` | R6-2 | Unchanged classifier (clean iff every artifact confirmed absent); now fed by the tested flow. |
| `scripts/ci/check_takes_delete_policy.mjs` (new) | R6-4 | Migration-derived policy **inventory** (strip comments → find every `create/drop policy` clause, incl. inside `do $$ … $$` blocks → resolve live set → classify by command + bucket). DELETE-capable = `delete` OR `all`. Selftest plants a DELETE policy, a FOR-ALL policy, alt-formatting, FOR-omitted, drop-then-recreate, other-bucket, missing-insert. |
| `.github/workflows/prod-source-smoke.yml` | R6-1, R6-3 | Residue step now runs the unified `residue_flow.mjs` (deletes ~60 lines of hand-copied shell). Lines that described credentials as enabling object **deletion** now describe **observation/accounting only**. Header + safety-envelope comments corrected. Adds `setup-node`. |
| `scripts/ci/check_product_truth.mjs` | R6-5 | JSX-normalization before phrase matching (catches JSX-split claims); adversarial paraphrase patterns ("editing … gone", "scripting + editing, gone/done"); structural completion-marker check (✓/Check/"done" next to an editor-output list without a coming-soon qualifier). |
| `apps/web/src/pages/Landing.tsx` | R6-5 | Post-step preview: the `Captions / Jump cuts / B-roll` chips no longer render a green ✓ "done" marker — relabelled under an **"AI edit — coming soon"** header with a muted Clock icon. Benefit stat changed from "~2 hrs saved … scripting + editing, gone" to "~1 hr saved … scripting + recording — AI editing coming soon". |
| `.github/workflows/pr-checks.yml` | R6-4 | Wires `check_takes_delete_policy.mjs` (selftest + live); relabels the harness step. |

## Harness proof it executes the real control flow

`residue_harness.mjs` calls `runResidueAccounting(env, { fetchImpl })` — the exact
function the workflow runs. For every Case-C scenario it asserts the injected
fetch received `DELETE storage:delete`, `GET storage:get`, `GET rest:row`,
`GET rest:ptr` — i.e. the real delete-attempt + re-fetch + row + pointer
observation sequence, not a static table. Every attempted-create scenario
(Cases B and C) asserts the classifier verdict is **not clean** (fail closed).
Note: Case C can never be clean because `validation_job_events` has no supported
client read path (always `"unknown"`) — proven by the "best-case observation
still fails" scenario.

## Per-observation truth table (only confirmed absence ⇒ `false`)

| Observer | Input | Result |
|---|---|---|
| storage object | HTTP 200 | `true` (present) |
| storage object | HTTP **404** (documented "Object not found") | `false` |
| storage object | HTTP 400 / 401 / 403 / 5xx / network | `unknown` |
| media_assets row | HTTP 200 + valid **empty** array | `false` |
| media_assets row | HTTP 200 + non-empty array | `true` |
| media_assets row | HTTP 200 + malformed / non-array body | `unknown` |
| media_assets row | HTTP 400 / 401 / 403 / 5xx / network | `unknown` |
| generation pointer | HTTP 200 + `source_asset_id === asset` | `true` |
| generation pointer | HTTP 200 + `null` / different id / empty result | `false` |
| generation pointer | HTTP 200 + malformed body | `unknown` |
| generation pointer | HTTP 400 / 401 / 5xx / network | `unknown` |
| validation_job_events | (no supported client read) | `unknown` always |

The harness additionally asserts that any `false` result corresponds to a
documented-absence input (404 / empty / null / other / gone), never a guess.

## Migration-policy guard results (`check_takes_delete_policy.mjs`)

Live inventory of `storage.objects` policies targeting the `takes` bucket:
`twinai takes insert` (for **insert**) and `twinai takes read` (for **select**) —
`insert=true select=true deleteCapable=false`. These are defined inside the
idempotent `do $$ … $$` block in `0006_autoedit.sql` (which the previous bounded
regex could miss); `0057` drops+recreates the SELECT policy (still select-only).
Selftest fixtures prove the inventory FAILS on a planted `for delete` policy, a
`for all` policy, alternate multiline formatting, and a FOR-omitted (defaults to
ALL) policy — and PASSES a delete policy that is created-then-dropped or scoped
to a different bucket. This is real migration-derived evidence, not a comment.

## prod-source-smoke residue posture (unified module)

The always-run residue step now executes `residue_flow.mjs`:

| Case | Condition | Outcome |
|---|---|---|
| A | no create attempted | clean, exit 0 (nothing created) |
| B | create attempted, no assetId (response lost / malformed) | all artifacts `unknown`, fail closed |
| C | assetId known | observe object (404⇒absent / 200⇒present / else unknown), row + pointer (per truth table), job/events always unknown → fail closed unless all confirmed absent (never, due to job/events) |

Credentials exported to `$GITHUB_ENV` enable **residue observation/accounting
only**; the `takes` bucket has no DELETE policy, so no client deletion is
possible or claimed.

## Verification (this head, local)

- `check_takes_delete_policy` selftest (8 fixtures incl. planted DELETE/ALL, alt-format, drop-recreate) + live: **OK**
- `residue_harness` selftest: real-flow injection (11 scenarios) + observation truth table (25 rows) + migration policy: **all passed**
- `probe_residue_report` selftest: **OK**; `check_product_truth` selftest (18 cases incl. JSX-split + marker) + live (44 files): **OK**
- docs-guard, single-deploy, vps-diag-authority, vps-signoff: **OK**
- `@twinai/web` typecheck + `web:build`: **clean**; both workflow YAMLs parse.

---

# Round 7 — independent-audit correction (sound policy check + full-chain harness + honest protocol)

Round 7 corrects claims Round 6 had not truly earned. PR #196 remains **DRAFT**;
nothing merged/deployed/enabled; `EDITOR_V2_START_ENABLED` unset,
`autoFillerRemoval=false`; `enqueue-autoedit` 410 tombstone intact;
`prod-source-smoke` NOT run against production.

## What Round 6 claimed vs. what was actually true

- The policy checker keyed its live map by **policy name only**; its DROP parser
  ignored the target table; it ignored **ALTER POLICY**. Three adversarial
  lifecycles wrongly passed. Fixed with **(table, name)** keys, table-qualified
  DROP, and ALTER handling.
- The harness was authoritative only for `residue_flow.mjs`. **create / upload /
  finalize stayed inline shell** in the workflow, so "response lost", "PUT
  failure", "finalize failure" never exercised the real branches or their
  `$GITHUB_ENV` export. The whole chain is now executable code the harness drives.
- Two misleading Landing lines ("… editor … all done from a single paste" and
  "Paste it, edit it, post it") passed the guard.

## Changed files (round 7)

| File | Blocker | Change |
|---|---|---|
| `scripts/ci/check_takes_delete_policy.mjs` | R7-1 | (table,name)-keyed inventory; table-qualified DROP; ALTER POLICY (retarget + rename); DELETE-capable = delete OR all. Adds the 3 exact adversarial fixtures (same-name DROP/CREATE on another table; ALTER from another bucket → takes) — all now FAIL. |
| `scripts/prod-smoke/verify_takes_policy_live.sql` (new) | R7-1 | Authoritative live `pg_policies` catalog query for the sign-off sequence (migration parsing is supporting evidence only). |
| `scripts/prod-smoke/smoke_chain.mjs` (new) | R7-2 | The COMPLETE functional chain as executable code: login → persist recovery ids → create → parse → persist asset → signed PUT → finalize → poll ready → verify metadata merge → poll pointer. All I/O injected; returns `{exitCode, stage, functionalChainPass}`; persists recovery state + `PROBE_FUNCTIONAL_CHAIN`. |
| `scripts/prod-smoke/residue_flow.mjs` | R7-2 | Adds testable `runResidueMain(env, deps)` returning the exit code (classifier/reporter/exit boundaries injectable; any throw ⇒ exit 1 fail-closed). |
| `scripts/prod-smoke/residue_harness.mjs` (rewritten) | R7-2, R7-4 | Drives BOTH modules. Injects failures at create / parse / PUT / finalize / classifier / reporter / exit; asserts exit codes AND persisted recovery state; composes persisted state into residue and asserts fail-closed; asserts the two-stage protocol invariant. |
| `.github/workflows/prod-source-smoke.yml` | R7-2, R7-4 | Stage 1 runs `smoke_chain.mjs` (inline shell chain removed); adds a two-stage protocol verdict step; documents red-by-design. |
| `apps/web/src/pages/Landing.tsx` | R7-3 | "Five jobs … editor … all done from a single paste" → "Four jobs … copywriter — handled … The AI editor is being rebuilt — coming soon." "Paste it, edit it, post it" → "Paste it, script it, record it … AI editing is coming soon." |
| `scripts/ci/check_product_truth.mjs` | R7-3 | Adds the two exact strings as failing fixtures + patterns ("editor … all done", "all done from a single paste", "edit it, post it"). |
| `docs/prod-source-smoke-protocol.md` (new) | R7-4 | The two-stage operational protocol + exact functional-chain pass evidence. |

## Blocker 1 — policy checker soundness (adversarial fixtures now FAIL)

`check_takes_delete_policy.mjs --selftest` (all pass), including the three that
previously passed:
- `storage DELETE + same-name DROP on ANOTHER table → fail`
- `storage DELETE + same-name CREATE on ANOTHER table → fail`
- `storage DELETE altered from another bucket to takes → fail`

Live migration inventory: `twinai takes insert` (insert) + `twinai takes read`
(select), `deleteCapable=false`. **Authoritative** posture check =
`scripts/prod-smoke/verify_takes_policy_live.sql` against live `pg_policies`,
added to the sign-off sequence (operator-run; PASS = `delete_capable_takes_policies = 0`,
`has_insert`, `has_select`).

## Blocker 2 — full-chain harness (real branches + recovery state)

`residue_harness.mjs --selftest` drives `runSmokeChain` and asserts, at the real
boundaries:

| Injected boundary | Result | Persisted recovery state | Composed residue |
|---|---|---|---|
| login fails | exit 1 @ `login` | no `PROBE_CREATE_ATTEMPTED` | — |
| create response lost (network) | exit 1 @ `create` | attempted+gen, **no asset** | Case B all-unknown → exit 1 |
| malformed create body | exit 1 @ `create` | no asset | Case B → exit 1 |
| PUT failure | exit 1 @ `put` | **asset persisted** | Case C object present → exit 1 |
| finalize failure | exit 1 @ `finalize` | asset persisted | Case C → exit 1 |
| never ready / metadata mismatch / pointer unlinked | exit 1 @ `ready`/`metadata`/`pointer` | — | — |
| classifier throws | — | — | exit 1 (fail closed) |
| reporter throws | — | — | exit 1 (fail closed) |
| no create | — | — | exit 0 (only clean exit) |

## Blocker 3 — product copy

`check_product_truth.mjs --selftest` now fails on the exact strings
"…strategist, writer, producer, editor, copywriter — all done from a single
paste…" and "Paste it, edit it, post it — tonight, from one app.", and passes the
corrected copy. Live: 44 files clean.

## Blocker 4 — two-stage protocol (a red workflow is not a passing smoke)

`docs/prod-source-smoke-protocol.md` defines: Stage 1 functional-chain evidence
(the pass signal, `PROBE_FUNCTIONAL_CHAIN=pass` + `verifyReadyRow` + linked
pointer) → Stage 2 recoverable-artifact report (intentionally nonzero) → Stage 3
operator retention cleanup → Stage 4 supported zero-delta verification. The
workflow's overall RED conclusion is **by design** (validation_job_events is
never client-observable) and is explicitly NOT a functional failure; a Stage-1
non-pass emits a `::warning::` distinguishing a real failure. The harness asserts
the invariant: functional chain green + residue accounting red.

## Verification (this head, local)

- `check_takes_delete_policy` selftest (12 fixtures incl. 3 adversarial) + live: **OK**
- `residue_harness` selftest: full smoke-chain + residue boundary injection + protocol + truth table: **all passed**
- `check_product_truth` selftest (22 cases) + live (44 files): **OK**
- docs-guard, single-deploy, vps-diag-authority, vps-signoff, residue classifier: **OK**
- `@twinai/web` typecheck: clean; both workflow YAMLs parse; live-policy SQL present.

---

# Round 8 — independent-audit correction (HTTP-status gating, outcome-derived verdict, rendered-copy sweep, authoritative delete gate)

Round 8 closes four false-pass paths found in Round 7. PR #196 remains **DRAFT**;
nothing merged/deployed/enabled; `EDITOR_V2_START_ENABLED` unset,
`autoFillerRemoval=false`; `enqueue-autoedit` 410 tombstone intact;
`prod-source-smoke` NOT run against production.

## What Round 7 got wrong (now fixed)

1. `smoke_chain.mjs` consumed a response body whenever it *looked* valid,
   ignoring the HTTP status — a 500 with a valid-looking body advanced the chain.
2. The workflow's verdict step printed "Stage 2 RED by design" unconditionally
   and never read the actual residue-step outcome — an unexpected residue exit 0
   could make the workflow green while the summary claimed red.
3. The product-truth guard scanned only `apps/web/src`, missing imported BRAND
   copy in `packages/shared/src` and several live disabled-editor claims.
4. `verify_takes_policy_live.sql` (and the migration checker) matched DELETE/ALL
   policies by the literal text "takes", so an indirect predicate
   (`using (public.can_delete_take(...))`) was omitted and passed.

## Changed files (round 8)

| File | Blocker | Change |
|---|---|---|
| `scripts/prod-smoke/smoke_chain.mjs` | R8-1 | Every response body is consumed ONLY on a success HTTP status (login/create require 2xx; ready/pointer reads require 200). A non-2xx never advances the chain. |
| `scripts/prod-smoke/protocol_verdict.mjs` (new) | R8-2 | Testable verdict: functional evidence accepted only when Stage 1 outcome=success AND `PROBE_FUNCTIONAL_CHAIN=pass`; an attempted-create run whose residue outcome≠failure is a PROTOCOL VIOLATION (exit 1); functional failure reported distinctly from expected residue red. |
| `.github/workflows/prod-source-smoke.yml` | R8-2 | Stage 1 `id: chain`, Stage 2 `id: residue`; verdict step runs `protocol_verdict.mjs` with the real `steps.*.outcome` — no unconditional "RED by design". |
| `scripts/ci/check_product_truth.mjs` | R8-3 | Scans BOTH `apps/web/src` and `packages/shared/src`; adds patterns + the exact flagged strings as fixtures. |
| `packages/shared/src/brand.ts` | R8-3 | oneLiner/subLine/positioning corrected (no "finished video out", "whole loop", "edit"). |
| `apps/web/src/pages/Landing.tsx` | R8-3 | "posted video out", "a finished, on-brand video out, end to end", footer "Finished video out." corrected. |
| `apps/web/src/pages/Auth.tsx` | R8-3 | "record + edit in one place", "No watermark on your exports", "Get a finished video" corrected. |
| `scripts/ci/check_takes_delete_policy.mjs` | R8-4 | Sound gate: ZERO DELETE/ALL policy on `storage.objects` (bucket-agnostic). Adds indirect-function-predicate fixture (now fails) + non-storage-table fixture (ok). |
| `scripts/prod-smoke/verify_takes_policy_live.sql` | R8-4 | Authoritative live gate = zero live DELETE/ALL policies on storage.objects; enumerates roles + qual + with_check for evidence; no literal-"takes" filter. |
| `scripts/prod-smoke/residue_harness.mjs` | R8-1, R8-2 | Adds the four non-2xx-valid-body fixtures + the protocol-verdict tests (unexpected-residue-success, summary/outcome disagreement). |

## Blocker 1 — HTTP-status gating (hostile fixtures)

`residue_harness.mjs --selftest`:
- `login HTTP 500 (valid body) ⇒ exit 1 at login (body not consumed)`
- `create HTTP 500 (valid body) ⇒ exit 1 at create (body not consumed)` + no asset persisted
- `ready HTTP 500 (valid ready row) ⇒ exit 1 at ready`
- `pointer HTTP 500 (expected pointer) ⇒ exit 1 at pointer`

## Blocker 2 — outcome-derived verdict (hostile fixtures)

`protocol_verdict.mjs` via the harness:
- attempted + chain pass + residue red ⇒ exit 0, functional evidence accepted (expected two-stage)
- **attempted-create run with GREEN residue ⇒ protocol violation, exit 1** (the unexpected-residue-success path)
- chain green but `PROBE_FUNCTIONAL_CHAIN≠pass` ⇒ NOT functional evidence (summary/outcome disagreement)
- functional failure distinguished from expected residue red
- no-create + residue clean ⇒ exit 0; no-create + unexpected residue failure ⇒ exit 1

The workflow verdict derives from `steps.chain.outcome` + `steps.residue.outcome`
+ recovery state; an attempted-create run can never conclude conventionally green.

## Blocker 3 — rendered-copy sweep

Corrected: brand.ts oneLiner/subLine/positioning; Landing "posted video out" /
"finished, on-brand video out, end to end" / footer "Finished video out.";
Auth "record + edit in one place" / "No watermark on your exports" / "Get a
finished video". Guard now scans `apps/web/src` + `packages/shared/src` (59
files, live OK); the seven exact strings are failing fixtures; legitimate
finished-asset review/playback wording was left intact.

## Blocker 4 — authoritative delete gate

Both the migration checker and the live SQL now require **zero DELETE/ALL
policies on `storage.objects`** (bucket-agnostic), which cannot be evaded by an
indirect function predicate. Migration selftest: `indirect-function DELETE
predicate → fail`, `delete on another bucket (storage.objects) → fail`,
`delete on a NON-storage table → ok`. Live: `deleteCapableOnStorageObjects=0`.
`verify_takes_policy_live.sql` enumerates roles/qual/with_check as evidence and
PASSES only when `delete_or_all_policies_on_storage_objects = 0`.

## Verification (this head, local)

- `check_takes_delete_policy` selftest (14 fixtures incl. indirect-function + adversarial) + live: **OK** (deleteCapableOnStorageObjects=0)
- `residue_harness` selftest: smoke-chain boundaries + HTTP-status gating + protocol verdict + observation truth table: **all passed**
- `check_product_truth` selftest + live (59 files, both roots): **OK**
- docs-guard, single-deploy, vps-diag-authority, vps-signoff: **OK**
- root typecheck (all workspaces) + `web:build`: clean; both workflow YAMLs parse.

---

# A1/A2 CLOSED — live production gate verification (run 29829091202)

## Bootstrap path (resolving the circular release condition)

The hardened `verify-prod-gate.yml` is main-only, but it was bundled in this PR
alongside deploy-triggering paths. It was therefore split out and landed first
via audited **PR #197** (branch `bootstrap/verify-prod-gate`, squash-merged as
**`main@79e0362c5afeea5a42a3853d676587347de12add`**), carrying only the workflow,
`scripts/ci/gate_probe_assert.mjs` (48-case hostile suite: strict JSON
`code === "editor_not_available"` predicate, login-200 gate, file-based
capture, no secrets in argv), and the `gate-probe-assert` CI job. Audit rounds
on #197 additionally established:

- **External Git integrations are not governed by Actions path filters**: Vercel
  built previews for every #197 head. The operator applied Vercel's official
  **Ignored Build Step** (`git diff --quiet HEAD^ HEAD -- apps/web
  packages/shared package.json package-lock.json vercel.json`), verified by an
  empty commit (`06b0b50`) and by the #197 merge commit itself — both reported
  **"Canceled by Ignored Build Step"** (no build, no deploy).
- Only `pr-checks.yml` ran on the merge commit (verified via `runs?head_sha=`).

## Fail-closed proof (run 29827536668)

First dispatch, before the production-environment secrets existed: the run
**failed closed** at the mandatory authenticated leg
(`missing required secret(s): PROD_PROBE_EMAIL, PROD_PROBE_PASSWORD`) — the leg
cannot be silently skipped. Bracketing snapshots showed **zero delta** and zero
Auth activity (no sign-in ever occurred). The 401 wall step itself passed.

## Live verification (run 29829091202) — ACCEPTED

Operator configured the probe identity (`gate-probe-editor-v2@twinai.internal`)
and environment secrets, and attached required-reviewer protection (the dispatch
held in `waiting` until human approval — verified). Then, dispatched from
`main@79e0362`:

- **Unauthenticated: exact HTTP 401** (platform JWT wall) — tested predicate.
- **Login: exact HTTP 200** before token consumption — tested predicate.
- **Authenticated: exact HTTP 503 with top-level JSON `code === "editor_not_available"`** — tested predicate.
- **`EDITOR_V2_START_ENABLED` absent** from production secrets (name listing).
- Run: completed **success**; independently log-verified by the reviewer.

## Zero-delta bracket (BEFORE 2026-07-21T12:11:19Z → AFTER 12:30:25Z)

Identical snapshot query both sides; **every** surface unchanged in count AND
max-created watermark: `edit_projects` 0, `editor_v2` jobs 0, all jobs 107,
`media_analyses` 0, `edit_plans` 0, `edit_events` 0, `media_assets` 0, storage
`takes` 17 / `edits` 67 (only buckets), `credit_events` 41, `billing_events` 0,
`subscriptions` 0, profiles credit sum 540, generations-with-source-asset 0.

**Expected Auth side effect (separate surface, per the workflow's declared
side-effect accounting):** probe user sessions 0→1, refresh tokens 0→1,
`last_sign_in_at` null→2026-07-21T12:22:26Z (inside the run window); totals
sessions 31→32, refresh tokens 62→63, audit entries 0→0. Nothing else.

Baseline note: profiles credit sum moved 510→540 **between** the fail-closed and
live brackets — the operator-created probe user's profile receiving the standard
30 free-tier signup credits; outside both brackets, not probe activity.

## Updated closure state

1. ~~operator secrets + verify-prod-gate run~~ **DONE** (run 29829091202, above).
2. ~~zero-delta bracket around the authenticated probe~~ **DONE** (above).
3. Independent reviewer acceptance of the full evidence set — the only item
   remaining to close this PR.

## Authoritative VPS benchmark — CLOSED (speech-6 candidate-image gate, task #116)

The owner ran `worker/scripts/vps_bench.sh --sha <candidate>` on the production
Hetzner VPS (`stylique-vps`, 4 vCPU), inside a worker image built from the exact
candidate commit. Final line:

```
RESULT: CAPACITY + MODEL IDENTITY GATE PASSED (rc=0) for candidate 1dd9f693d3c361d7fe1da13482e30b7bb693132e.
```

**Benchmark identity (runtime-observed, all identity checks `pass: true`):**
`repository`, `revision`, `artifact_sha256`, `manifest_sha256`,
`analyzer_bundle`, `candidate_sha_is_40hex` — i.e. the runtime-loaded model was
verified as `Systran/faster-whisper-small@536b0662742c02347bc0e980a01041f333bce120`,
analyzer bundle `speech-6`, load path `/opt/models/faster-whisper-small`,
`verified=True`, for candidate SHA `1dd9f693d3c361d7fe1da13482e30b7bb693132e`.
The same identity was later re-confirmed **in the deployed production container**
by the fail-closed `vps-diag` snapshot (A4: in-container
`fetch_model --verify-only` → `model verified: Systran/faster-whisper-small@536b0662…bce120`,
`analyzer_bundle: speech-6`).

**Capacity measurements vs the PREDEFINED limits** (fixed in
`worker/scripts/bench_thresholds.json` before the run — no post-hoc tuning):

| Check | Measured | Limit | Pass |
|---|---:|---|---|
| processing ratio (median) | **0.55×** | ≤ 5.0 | ✅ |
| peak RSS | **569.6 MiB** | ≤ 2048 MiB | ✅ |
| cancellation exit (SIGTERM mid-run) | **0.11 s** | ≤ 12 s | ✅ |
| timeout kills a run | **true** | must kill | ✅ |
| 2× concurrent — both rc=0 | **true** | all rc=0 | ✅ |
| 2× concurrent — aggregate ratio | **1.202×** | ≤ 12.0 | ✅ |

This supersedes the earlier **pre-pin indicative baseline** (0.649× / 578 MiB —
recorded in `docs/editor-v2-phase5-speech-eval.md` as explicitly non-authoritative).
Task #116 is **CLOSED** by this run; the historical PENDING wording in the
speech-eval doc has been updated accordingly.

## Blockers that REMAIN OPEN (deliberately preserved — not closed by any of the above)

- **Pre-beta gate (task #115 / issue #193):** the ~12 privately-consented Twin AI
  user recordings eval remains **MANDATORY before beta**. Unchanged.
- **Filler removal (issues #194/#195):** `autoFillerRemoval=false` stays enforced;
  the acoustic disfluency detector (#194) and the compiler-level rejection (#195)
  are **mandatory before enabling or advertising filler removal**. Unchanged.
- Independent reviewer acceptance of this evidence set (closes the PR).
