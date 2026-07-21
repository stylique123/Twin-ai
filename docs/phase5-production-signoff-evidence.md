# Editor v2 Phase 5 — Production Sign-off Evidence

**Branch:** `hardening/phase5-production-signoff` · **Base:** `main` @ `f6e4cb7d058f6d16e26e820ee1ba216710a9d1c0` (the Phase 5 merge, #191)
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

> **Operator action required to RUN the live probe (not executable from this session):** add `PROD_PROBE_EMAIL` / `PROD_PROBE_PASSWORD` (a throwaway `gate-probe-*@twinai.internal` user) and `SUPABASE_ACCESS_TOKEN` to the repo **Environments → production** secrets, then dispatch **Verify production editor gate** from `main` and approve the environment gate. Expected: unauth `401`, authenticated `503 editor_not_available`, and `EDITOR_V2_START_ENABLED` confirmed absent.

## A2 — Fail-closed + zero-delta bracketing — **OPEN (operator-run; not complete)**

`verify-prod-gate` proves the HTTP fail-closed walls but has **no built-in before/after DB counters**. A2 is therefore **not closed by this branch** — it requires the operator sequence below. Do **not** call A1, A2, or the reopened sign-off complete until it is done.

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

> **Operator sequence to CLOSE A1 + A2 (none of it executable from this session — needs secrets + human approval). ORDER MATTERS — do the secrets BEFORE the merge:**
>
> ⚠️ **This PR changes `worker/deploy-vps.sh` and `deploy-worker.yml`, so merging it to `main` TRIGGERS the `deploy-worker` workflow (it deploys the worker to the VPS).** Because `deploy-worker` now requires a pinned host key, it will **fail closed** if `VPS_KNOWN_HOSTS` is not already set. So configure that secret first.
>
> 1. **BEFORE merge — add the `VPS_KNOWN_HOSTS` repository secret** (one-time; see `DEPLOY.md → Pinning the VPS host key`) and **verify it** by dispatching the read-only `vps-diag` from this branch — it must reach the VPS under strict host verification and pass. (`vps-diag` and `deploy-worker` fail closed until this exists — by design.)
> 2. **BEFORE merge — configure protected `Environments → production` secrets**: `PROD_PROBE_EMAIL`, `PROD_PROBE_PASSWORD`, `SUPABASE_ACCESS_TOKEN`.
> 3. **Capture BEFORE counts** with the query above for the probe identity.
> 4. **Merge** this hardening branch to `main` (this fires `deploy-worker` → VPS deploy; it now succeeds because step 1's secret is present).
> 5. **Dispatch `Verify production editor gate` from `main`** and approve the environment gate → unauth `401`, authenticated `503 editor_not_available`, `EDITOR_V2_START_ENABLED` absent.
> 6. **Capture AFTER counts** with the same query.
> 7. **Prove every delta is zero** (global editor rows stay 0; probe-scoped counts + credit balance unchanged).
>
> Only after step 7 may A1/A2 (and the reopened sign-off) be called complete. **`prod-source-smoke` is a separate, mutating workflow — it creates a probe `media_assets` row + generation pointer + Storage object and its in-workflow cleanup does NOT fully remove them (it reports residue and fails closed for sanctioned operator retention). It must NOT be run as part of this fail-closed check — only under its own separate authorization.**

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

## Remaining to fully close (operator/reviewer)

1. Add production-environment secrets `PROD_PROBE_EMAIL`, `PROD_PROBE_PASSWORD`, `SUPABASE_ACCESS_TOKEN`; run **Verify production editor gate** from `main` (approve the environment) → capture `401` + `503 editor_not_available` + `EDITOR_V2_START_ENABLED` absent.
2. Bracket that authenticated probe with the A2 zero-delta query for the probe identity.
3. Independent reviewer accepts every item above. **Not "fully verified" until then.**

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
