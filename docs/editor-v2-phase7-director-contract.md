# Editor v2 — Phase 7 "Director" implementation contract (FROZEN)

Frozen before implementation on branch `rebuild/editor-v2-phase7` (PR #199), on
approved Gate-0 head `0e634d0`. This is the single authority for the Phase-7
batch. Definitions here do not change after seeing results.

**Scope in:** the real `directing` stage — build the frozen Director input
envelope from the pinned Phase-5 speech component, make exactly one pinned
`gemini-3.5-flash` `generateContent` call, validate + re-resolve the decision
server-side against the immutable components, persist a mutable call ledger +
an immutable decision. DB migration `0088`, worker directing stage, no-retry
provider client, `phase7.mjs` staging matrix, CI wiring.

**Scope out (zero-delta boundary):** compiling / rendering / validating stay
SIMULATED; no `edit_plans` write (that is Phase 8 — `edit_plans` stays 0); no
`output_asset_id`; no FFmpeg/compile/render/output assets; no web UI / landing;
no production enablement or deploy; PR stays draft; no merge.

---

## 1. Schema, RPCs, identities, grants/RLS, transitions, idempotency, fencing, cancellation

Migration: **`supabase/migrations/0088_editor_director.sql`** (next free number).

### Tables (both new; neither exists today)

**`public.edit_director_calls`** — MUTABLE ledger of the single provider call.
Columns: `id uuid pk default gen_random_uuid()`; `owner_id uuid not null → auth.users on delete cascade`; `edit_project_id uuid not null → edit_projects(id) on delete cascade`; `source_asset_id uuid not null`; `attempt integer not null` (the claim fence token at start time); `envelope_sha256 text not null check ~ '^[0-9a-f]{64}$'`; `model text not null`; `provider text not null`; `state text not null check in ('started','received','succeeded','failed','unknown')`; `response_sha256 text check ~ '^[0-9a-f]{64}$'`; `failure_code text`; `started_at timestamptz not null default now()`; `updated_at timestamptz not null default now()`.
- **Idempotency key (one call per project):** `create unique index edit_director_calls_project_uniq on (edit_project_id)`. Exactly one call row per project, ever.
- State machine (see §2). Immutability of terminal states enforced by a guard trigger: once `state` is `succeeded`/`failed`/`unknown` it cannot change; legal forward edges only.

**`public.edit_director_decisions`** — IMMUTABLE result (append-only).
Columns: `id uuid pk default gen_random_uuid()`; `owner_id uuid not null → auth.users on delete cascade`; `edit_project_id uuid not null → edit_projects(id) on delete cascade`; `director_call_id uuid not null → edit_director_calls(id) on delete cascade`; `schema_version integer not null`; `envelope_sha256 text not null`; `response_sha256 text not null`; `decision jsonb not null`; `decision_sha256 text not null check ~ '^[0-9a-f]{64}$'`; `model text not null`; `provider text not null`; `auto_filler_removal boolean not null default false`; `created_at timestamptz not null default now()`.
- `create unique index edit_director_decisions_project_uniq on (edit_project_id)` — one decision per project.
- **DB filler guard (item 4):** `check (auto_filler_removal = false)` AND a `before insert` trigger `edit_director_decisions_guard()` that parses `decision->'selections'` and RAISES `director_filler_disabled` if any selection has `kind = 'filler'` or `selectionEnabled <> 1`, and RAISES `director_decision_invalid` if any `candidateIndex`/`boundaryIndex` is not a non-negative integer. Append-only trigger `edit_director_decisions_append_only()` (UPDATE raises; DELETE only via FK cascade, `pg_trigger_depth() > 1`) — mirrors `media_analyses_append_only`.

### RLS + grants (mirror the editor-table template exactly)
Both tables: `enable row level security`; `create policy "<t> read" for select to authenticated using (owner_id = (select auth.uid()) or owner_id in (select workspace_peers()))`; `grant select ... to authenticated`; `revoke all ... from anon`; `revoke insert,update,delete,truncate,references,trigger ... from authenticated`. All writes only via `security definer set search_path = pg_catalog, public` RPCs granted `to service_role`.

### Fenced RPCs (all `security definer`, service_role only; every one re-proves the lease via `editor_assert_lease(p_project,p_job,p_worker,p_attempt)` first, job-before-project lock order)

- **`editor_director_begin(p_project uuid, p_job uuid, p_worker text, p_attempt integer, p_source_asset uuid, p_envelope_sha256 text, p_model text, p_provider text) returns text`** — asserts lease; requires `edit_projects.status = 'directing'` (else raise `director_wrong_stage`); then, on the existing call row for the project:
  - none → `insert ... state='started'`, return `'started'`.
  - `succeeded` → return `'already_succeeded'` (crash-resume: skip the provider call, reuse the persisted decision).
  - `started` or `received` → this is an indeterminate crash-resume mid-call → `update state='unknown'` then RAISE `director_call_indeterminate` (permanent; NEVER a second provider call).
  - `failed` → RAISE `director_call_failed` (permanent; no retry).
  - `unknown` → RAISE `director_call_indeterminate` (permanent).
- **`editor_director_receive(p_project uuid, p_job uuid, p_worker text, p_attempt integer, p_response_sha256 text) returns void`** — asserts lease; `update ... state='received', response_sha256=... where state='started'`; 0 rows → RAISE `director_state`. Persisted BEFORE validation so a crash during re-resolution resumes as `received` → `unknown` → fail (charge known, decision absent, no re-call).
- **`editor_director_succeed(p_project uuid, p_job uuid, p_worker text, p_attempt integer, p_schema_version integer, p_response_sha256 text, p_decision jsonb, p_decision_sha256 text, p_model text, p_provider text) returns uuid`** — asserts lease; requires call `state='received'`; inserts the immutable `edit_director_decisions` row (triggers enforce filler guard); `update edit_director_calls state='succeeded'`; returns decision id.
- **`editor_director_fail(p_project uuid, p_job uuid, p_worker text, p_attempt integer, p_failure_code text) returns void`** — asserts lease; `update ... state='failed', failure_code=... where state in ('started','received')`.

**Stage transition** stays the existing spine: the worker calls `editor_advance_stage(..., p_to => 'directing')` to enter (validated by the 0080 guard, `analyzing → directing`), and after a succeeded decision the loop advances to `compiling` (still simulated) exactly as today. **Cancellation:** honored at the stage boundary (`cancel_requested_at` on the advance row) and cooperatively mid-stage via `watchCancellation(projectId)` → `DirectorCancelledError` → settle `cancelled`; `editor_request_cancel` unchanged.

---

## 2. Exactly one pinned `gemini-3.5-flash` generateContent call

- Model/provider are the frozen shared constants `DIRECTOR_MODEL='gemini-3.5-flash'`, `DIRECTOR_PROVIDER='google'` — NOT `GEMINI_MODEL`/`env.fastModel`.
- A **dedicated no-retry client** `worker/src/jobs/directorProvider.ts`: one `fetch` to `…/v1beta/models/gemini-3.5-flash:generateContent` with `x-goog-api-key`, `responseMimeType:'application/json'` + strict `responseSchema`, an `AbortController` timeout (`env.editorDirectorTimeoutMs`, default 60000), and **no retry on any status** (429/5xx/timeout all fail closed). It is never the shared `geminiJson` (which retries — unsafe here).
- Fail-closed with no key: `if (!env.geminiKey) throw PermanentJobError(..., 'director_no_credentials')` before any state change.
- Call-once state machine: `started → received → (succeeded | failed)`; crash mid-flight → `unknown` (permanent fail, no second pass). One provider call per eligible project, enforced by the `edit_director_calls` project-unique row + the begin-RPC guards.

## 3. Server-side re-resolution against pinned immutable components

The provider returns only **indices + bounded enums + bounded text** — never authoritative timestamps or ids. The Director **decision output contract** lives in the shared authority `packages/shared/src/editor/director.ts` (new `DirectorDecision` type + `validateDirectorDecision(raw, envelope)`), duplicated in the worker and pinned by a parity test.

`validateDirectorDecision(raw, envelope)`:
- Accepts `unknown`; every malformed case fails with a stable `DirectorDecisionError` code (never a raw TypeError). Strict key policy, tuple/enum shapes, finite integers.
- `selections[]`: each `{ candidateIndex:int }` (+ optional bounded `reason`). Re-resolve `candidateIndex` against `envelope.candidates`: reject out-of-range/fabricated → `director_decision_bad_ref`. Read kind/selectionEnabled/span **from the pinned envelope tuple**, never from the model. Reject `selectionEnabled !== 1` and `kind === 'filler'` → `director_decision_filler`. Reject duplicate indices.
- `keptBoundaries[]` (optional): int indices re-resolved against `envelope.boundaries`; out-of-range → reject.
- Any timestamps/ids present in `raw` are IGNORED (no raw-timestamp authority): the persisted decision carries only re-resolved indices + the authoritative span copied from the pinned envelope.
- Bounded text fields (`summary`, `reason`) are length-capped and stored as inert data — never interpreted (prompt-injection containment: the model cannot widen its own authority because only indices/enums are consumed).
- The persisted `decision` jsonb: `{ schemaVersion, selections:[{candidateIndex, kind, selectionEnabled, startCs, endCs}], keptBoundaries:[int], summary }` — kind/selectionEnabled/span copied from the re-resolved envelope so the DB trigger can independently re-verify the filler guard.

Cross-tenant/id-fabrication is structurally impossible: the worker loads the envelope from THIS project's pinned components (`loadComponentStrict(asset.id, asset.content_sha256, 'speech', pinned.componentVersions.speech)`), and the RPCs are all fenced to `(project, job, worker, attempt)`.

## 4. TypeScript AND database enforcement that filler removal stays disabled
- **TS:** `kindSelectionEnabled('filler') === 0`; `validateDirectorDecision` rejects any selected filler / non-selection-enabled candidate; the envelope validator already rejects a selection-enabled filler tuple (`director_envelope_filler_selectable`). The prompt instructs the model that filler is not removable, but enforcement never trusts the prompt.
- **DB:** `edit_director_decisions.auto_filler_removal` CHECK `= false` + the insert-guard trigger that re-parses `decision->'selections'` and raises `director_filler_disabled` on any `kind='filler'`/`selectionEnabled<>1`. Independent of the worker. A future decision validator/compiler gate remains tracked for Phase 8.

## 5. Stable sanitized errors, observability, crash windows, cleanup
- Every failure surfaces a **stable code** (`director_no_credentials`, `director_provider_http`, `director_provider_timeout`, `director_response_unparseable`, `director_decision_*`, `director_call_indeterminate`, `director_call_failed`, `director_wrong_stage`) through the existing `sanitizeError`/`queueSafeError` path; raw provider bodies are never surfaced to the queue.
- Observability: `edit_events` rows via `editor_append_event` — `director_started`, `director_received` (`details:{response_sha256}`), `director_succeeded` (`details:{decision_sha256, selections:n}`), `director_failed` (`details:{failure_code}`). No PII, no raw model text.
- Crash windows (all fail-closed, no double provider call): (a) before `started` → clean start; (b) `started`↔`received` mid-call → resume ⇒ `unknown` ⇒ permanent fail; (c) `received`↔`succeeded` mid-re-resolution → resume ⇒ `unknown` ⇒ permanent fail; (d) after `succeeded` → resume reuses the persisted decision and advances. Temp-dir + lease cleanup inherit the existing `finally` teardown.

## 6. Phase-7 staging acceptance matrix + zero-delta boundary
`scripts/staging-integration/phase7.mjs` (keeps the Gate-0 section; appends the real matrix, mirroring phase6 idioms), wired into `.github/workflows/staging-integration.yml` as a new "Run Phase 7 integration matrix" step with `GEMINI_API_KEY` threaded into the job env and a new staging worker flag `EDITOR_DIRECTOR_ENABLED=true` for the matrix (unset in production → directing stays simulated).
- **A. Happy path:** eligible project runs to `completed` with directing REAL; exactly one `edit_director_calls` row `state='succeeded'`; one `edit_director_decisions` row; `director_started`+`director_succeeded` events; `edit_plans` count still 0; `output_asset_id` NULL.
- **B. Project-scoped single-call / cache:** re-running the worker on the same project makes NO second provider call (call row stays one; decision unchanged).
- **C. Crash windows:** inject failure at `before_stage:directing` and mid-call (retryable + hang→timeout + permanent), assert: no second decision row, indeterminate resume ⇒ project `failed` with a stable code, never two calls.
- **D. Hostile / fenced RPC truth table:** direct `admin.rpc('editor_director_*', …)` with wrong attempt/worker/stage ⇒ `lease_lost`/`director_wrong_stage`; a decision insert selecting a filler candidate ⇒ `director_filler_disabled`; a fabricated `candidateIndex` ⇒ rejected before persistence.
- **E. Fail-closed credentials:** with `EDITOR_DIRECTOR_ENABLED=true` but no `GEMINI_API_KEY`, directing fails closed (`director_no_credentials`), project `failed`, no call row leaks to `succeeded`.
- **F. Zero-delta boundary:** Phase 1–6 matrices unchanged; with `EDITOR_DIRECTOR_ENABLED` unset, directing stays simulated (`simulated_after_analysis`) — production behavior identical.
- Gate-0 real `countTokens` remains mandatory in the Phase-7 step.

**Definition of done:** frozen contract implemented in one batch; shared+worker typecheck+tests green (incl. new parity + decision tests); migration `0088` reviewed (applied on staging, not production); `phase7.mjs` wired; full Phase 1–7 staging regression on the exact final head; one consolidated evidence report; PR draft; production untouched.

---

## Correction addendum (post-audit hardening)

1. **No-credentials FIRST.** The `!env.geminiKey` check runs in `runDirectingStage`
   BEFORE `editor_director_begin` — zero call rows, zero decisions, stable
   `director_no_credentials` (Phase-7 case E asserts zero call rows).
2. **Cooperative cancellation into the provider.** `callDirectorOnce` takes the
   stage cancel signal and aborts the in-flight fetch (`director_cancelled`,
   distinct from `director_provider_timeout`). Conservative ledger outcome:
   before dispatch → `fail(cancelled_before_call)` (no charge); in-flight and
   after-response-before-persist → `editor_director_mark_unknown` (delivery/charge
   uncertain, never a second call, no decision persisted); after persist → the
   immutable decision remains as evidence. Deterministic tests: `director-cancel.test.ts`.
3. **DB authority binding (migration 0089).** `editor_director_begin` rejects a
   source asset that is not `edit_projects.source_asset_id`
   (`director_source_mismatch`); `editor_director_succeed` requires the caller
   response-hash/model/provider to match the received ledger row and PERSISTS
   those identities FROM THE LEDGER, not the caller (`director_response_mismatch`
   / `_model_mismatch` / `_provider_mismatch`). Phase-7 case D truth table.
4. **Staging credential path.** `ci-bootstrap` is version-controlled
   (`supabase/functions/ci-bootstrap`) and, after the JWT signing-key rotation,
   hands out a new-format secret key (`sb_secret_…`) selected from the
   auto-injected `SUPABASE_SECRET_KEYS` dictionary — no operator step, no minted
   custom secret, no legacy `service_role` fallback. Missing/malformed/empty/
   non-`sb_secret_`/ambiguous ⇒ fail closed 503, logging only the key source
   (never bytes). Selection proven offline by
   `scripts/ci/check_ci_bootstrap_keyselect.mjs`; details in
   `docs/staging-ci-bootstrap.md`. No blind retries around invalid credentials;
   earlier matrices unchanged.
