# Editor v2 — Worker orchestration (Phase 3)

Phase 3 registers the `editor_v2` job type in the worker and makes the
orchestration around the edit pipeline durable and safe. **Every stage handler
is simulated** — no Whisper, media analysis, Gemini Director, EditPlan
compilation, FFmpeg, captions, zooms, music, or output rendering exists yet.
Those arrive in later phases *inside* the contract this phase proves.

## State machine

`edit_projects.status` advances one stage at a time; the order is enforced by
the `trg_edit_projects_stage` trigger (0080) for **every** role, service_role
included:

```
queued → inspecting → transcribing → analyzing → directing
       → compiling → rendering → validating → completed

any active stage → failed
any active stage → cancelled
completed | failed | cancelled → (immutable, forever)
```

A simulated run completes with `output_asset_id = null` — rendering is a later
phase; nothing is charged and no output exists.

## Fencing (duplicate-worker prevention)

Claim-time exclusivity (`FOR UPDATE SKIP LOCKED`) is necessary but not
sufficient: a worker that stalls past its visibility lease gets its job
reclaimed, and the *original* process may wake up later and keep writing.
Phase 3 closes that at the database — every project-state write is a fenced
RPC that re-proves, inside the same transaction, that the caller still holds
the **running** lease on the project's job **under the attempt it claimed**.
The fencing token is `jobs.attempts` (0081): `claim_job` increments it and
nothing ever decrements it, so it is immutable per claim. `locked_by` alone
would not fence the same worker identity reclaiming its own job later — the
stale run carries a lower attempt and is rejected even against its own
successor (proven in the matrix with two processes sharing one worker id):

| RPC | Purpose |
|---|---|
| `editor_advance_stage` | one stage forward + `stage_started` event, atomically |
| `editor_finish_project` | terminal transition + terminal event, atomically |
| `editor_append_event` | history marker (resume/retry) without a status change |
| `renew_job_lease` | extend the lease; returns 0 when lost → caller must stop |
| `dead_letter_job` | settle a permanent failure without burning retries |

A stale worker's calls raise `lease_lost`; the worker abandons without
settling (its `complete_job`/`fail_job` are also owner-fenced no-ops). The
staging matrix proves this with a SIGSTOP'd worker woken after its job was
reclaimed and completed by a peer: zero post-settlement writes.

Lock order inside every function that touches both rows is **job first, then
project** — including `editor_request_cancel` and the reconciler — so the
fenced writes cannot deadlock against each other.

## Crash recovery and resume

State lives in the project row, not in worker memory. A reclaimed job's new
owner reads `edit_projects.status` and re-enters the pipeline **at the
persisted stage** (re-running the interrupted stage; stage handlers must be
idempotent — the simulated ones trivially are), recording a `resumed` event.
A project found already terminal (cancelled while queued, reconciled) makes
the job a fenced no-op.

## Stage timeouts and retry classification

- Each stage runs under `EDITOR_STAGE_TIMEOUT_MS`; a hung stage fails
  **retryable** well before the lease expires (no silent reclaim mid-stage).
- Failures are classified:
  - **retryable** (default, incl. stage timeouts): `fail_job` with exponential
    backoff until `max_attempts`; a `stage_retry_scheduled` event is appended
    first. On the *last* attempt the handler fails the project
    (`retries_exhausted`) before the job dead-letters.
  - **permanent** (`PermanentJobError`): `dead_letter_job` immediately; the
    handler fails the project with the error's code first.
  - **lease lost**: abandon silently — another worker owns the work now.

## Cancellation foundations

`editor_request_cancel(project_id)` is the single authenticated entry point
(owner-only — workspace peers observe but never control; foreign and missing
projects raise the identical `not_found`):

- job **unclaimed** (never started, or parked in retry backoff) → settle
  immediately (`cancelled`; the job is closed without ever running again).
  The RPC holds the job row lock, so a concurrent claim cannot race it.
- claimed/running → set `cancel_requested_at`; the worker observes it at the
  next stage boundary and finishes the project as `cancelled`
- already settled → idempotent no-op returning the settled status (a terminal
  project can never be revived or mutated — the stage guard enforces this for
  every role)

## Lost-job reconciliation

`editor_reconcile_lost_projects()` (pg_cron, every 5 min, 10-min grace) sweeps
non-terminal projects whose job is missing, dead-lettered, or settled — and
stale jobs left under already-terminal projects:

| Situation | Action |
|---|---|
| any swept project with `cancel_requested_at` set | settle as `cancelled` — cancellation is honored, never re-enqueued, never mislabeled `failed` |
| `queued` project, job row missing | re-enqueue under the same dedup key (`job_reenqueued` event, emitted only when the insert actually inserted) |
| mid-flight project, job row missing | fail the project: `lost_job` |
| job dead-lettered (`failed`) | fail the project: `job_dead_lettered` (job error copied into details) |
| job `done` but project active | fail the project: `job_settled_without_project` |
| **terminal** project with a `queued` (or ≥60s-stale `running`) job | close the job (`stale_job_closed` event); an actively leased running job is never touched |
| running job with an expired lease, active project | left alone — `claim_job` reclaims it on the next poll (that is the recovery path) |

Properties: repeated runs are idempotent (healed state is a no-op); two
concurrent runs converge on exactly one heal/settle (row locks serialize,
counters/events fire only on actual writes); a healthy, actively leased run
is never altered. The 5-minute cadence is a **recovery target**, not an
absolute bound — during a database or pg_cron outage the sweep resumes when
the scheduler does. No project can hang in a non-terminal state forever.

## Temp-dir lifecycle

Each **attempt** gets its own scratch dir `$TMPDIR/editor-v2/<job_id>-a<attempt>`
(a reclaimed attempt never shares state with a crashed one), removed on every
exit path — success, failure, timeout, cancellation, lease loss. Both path
components are validated UUIDs/integers, so a path can never escape the temp
root. Crashes skip the cleanup by nature; orphans older than
`EDITOR_TEMP_MAX_AGE_MS` (default 6 h) are swept at each claim — safely, since
the hard job cap (35 min) is far below the sweep age, a *live* attempt's dir
can never be old enough to sweep. A crash **during cleanup** just leaves an
orphan for the sweep.

## Crash-point convergence and future idempotency keys

Recovery is proven at exact boundaries (deterministic crash injection in the
matrix): before a stage starts, mid-stage, after stage work before the state
commit, **after the terminal commit before job acknowledgement** (the new
claim finds the project terminal and no-ops the job), during lease renewal,
and during cleanup. The invariant: re-running the persisted stage is always
safe, stages are never skipped, terminal events are never duplicated.

Simulated stages are trivially idempotent; the real ones must carry their own
idempotency keys when they land, because "re-run the interrupted stage" stays
the resume contract:

| Future stage | Idempotency key (planned) |
|---|---|
| transcription | `(source_hash, transcriber_version)` — write-once cache |
| media analysis | `(source_hash, analyzer_bundle_version)` — already unique in `media_analyses` (0078) |
| directing (LLM) | `(edit_project_id, plan version)` — one plan row per version, unique in `edit_plans` |
| compiling | deterministic from the plan: keyed by `plan_hash` |
| rendering | `(edit_project_id, plan_hash)` — the output asset's storage path derives from it, so a re-render overwrites its own object, never duplicates |
| billing finalize | one reservation row per project; finalize/release transition that row exactly once |

## Event history

`edit_events` is append-only at the database (0078) with a deterministic
`seq`. Phase-3 message codes: `stage_started`, `resumed`,
`stage_retry_scheduled`, `cancel_requested`, `job_reenqueued`,
`project_completed`, `project_failed`, `project_cancelled`. Clients render
progress from this history (durable across refresh/devices), via
`getEditEvents` in `@twinai/shared`.

## Billing reservation — DESIGN ONLY (no billing code in Phase 3)

Nothing in Phase 3 touches credits; free-beta pricing stays as is. The
reservation state machine that later phases implement:

```
            worker claims job (first attempt only)
                       │
                 [ reserved ]───────────────┐
                       │                    │
        editor_finish_project(completed)    │ editor_finish_project(failed|cancelled)
                       │                    │      or reconciler closes the project
                 [ finalized ]        [ released ]
              (usage recorded;      (hold removed; the
               charged when the      user pays nothing
               plan says so)         for no output)
```

- **Reserve at worker claim** — not at `start-editor-v2`. Starting costs
  nothing; only work that actually begins holds credit. The reservation
  insert is idempotent per project (retries/reclaims must not double-hold).
- **Finalize exactly once on `completed`**, in the same transaction as the
  terminal transition (`editor_finish_project` is the single writer, so the
  charge and the completion cannot disagree).
- **Release on `failed`/`cancelled`** — including reconciler-driven failures:
  a lost job must release its hold, never leak it.
- During free beta, "finalize" records usage without charging — the state
  machine runs identically so the flip to paid is a pricing change, not a
  correctness change.

## Simulation knobs (staging matrix only)

| Env | Meaning |
|---|---|
| `EDITOR_SIM_STAGE_MS` | how long each simulated stage "works" |
| `EDITOR_SIM_FAIL_STAGE` / `EDITOR_SIM_FAIL_MODE` | inject `retryable` \| `permanent` \| `hang` at a named stage |
| `EDITOR_SIM_FAIL_ATTEMPTS` | inject only while `job.attempts <=` N (deterministic retry tests) |
| `WORKER_RETRY_BACKOFF_BASE_SECS` | shrink the backoff curve so retry scenarios settle in seconds |

Production values leave injection off; the knobs exist so the staging matrix
(`scripts/staging-integration/phase3.mjs`) can prove every failure path
through the real worker binary and the real database.
