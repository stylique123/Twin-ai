# TwinAI — open items ledger

Rebuilt after the original was lost in a container rollback. Consolidates the
three uploaded audits, the master build plan, and the production audit run
against the live Supabase project.

Ordered by what unblocks what, not by phase number. An item is "done" only if
something enforces it — a test, a migration, or a CI check. Where nothing does,
it says so.

---

## A. Genuinely complete

These have a writer, a reader, and something that fails if they drift.

| | What | Enforced by |
|---|---|---|
| A1 | EditPlanV1 strict contract, canonical JSON, plan hashing, metacharacter scan | `edit-plan-contract.test.ts`, Gate-F |
| A2 | FFmpeg graph as argv arrays; no shell string ever built | `ffmpegGraph.ts` + unit tests |
| A3 | Detached process groups, SIGTERM→SIGKILL teardown | `runMediaProcess` |
| A4 | The real renderer produces a real video | matrix #223 Phase 8 A1–A18 |
| A5 | Caption cue ordering (the `pending.shift()` before `flush()` bug) | `caption-cue-order.test.ts` |
| A6 | Review screen navigates with the generation id, not the project id | `reviewBundleIdentity.test.ts` |
| A7 | A timed-out job aborts the work, not just the wait | `job-deadline-aborts.test.ts` |
| A8 | Readiness means a video exists, not that the pipeline stopped | `editReadiness.test.ts` |
| A9 | Brief is stored rather than asked-and-discarded | migration 0109 + `briefPersistence.test.ts` |
| A10 | Clip scene number travels with the clip label | migration 0108 |
| A11 | Higgsfield-derived product/link ingestion contract | `productEvidence.test.ts` |
| A12 | Preflight measures only what it can measure; unmeasured draws as unmeasured | `preflightSignals.test.ts` |
| A13 | A module cannot shadow a global constructor and then construct it | `check_shadowed_globals.mjs` |
| A14 | Stage order in the worker and in SQL cannot drift | migration 0080 trigger |
| A15 | Column-level GRANT discipline on `brand_voices` | 0109 + test asserting the grant line |

---

## B. Merged and applied

PR #286 merged at `c449b22`, green on `staging-matrix-gate` at head `f4967e6`
(matrix run #224). Everything from A5 onward is in `main`.

Migrations **0107, 0108, 0109** are applied to production
(`jmdecibuytznsonrasxw`) and verified against the database rather than trusted
from the apply result:

- **0107** — three clip functions present, all `security definer`, ACL is
  `service_role` only (no `anon`, no `authenticated`).
- **0108** — exactly ONE `editor_create_clip_asset` overload, the 8-argument
  one. The old 7-argument signature is gone, which was the migration's whole
  point: a defaulted trailing argument would have let an old caller keep writing
  rows with no scene number. Both CHECK constraints present, column nullable.
- **0109** — the CHECK exercised rather than read: `null` and `{}` accepted,
  `"none"` storable, empty string / whitespace / explicit null / unknown key all
  refused, `"declined"` and an evidence object storable, a product *description*
  refused. `authenticated` holds column-level UPDATE, so the column is writable.

The remaining launch gate is the flag, not the schema: `EDITOR_V2_START_ENABLED`
on Supabase edge, and `EDITOR_RENDER_ENABLED` in `/opt/twinai-worker.env`
(applied by `docker restart twinai-worker`).

---

## C. Not built — ordered by what they unblock

### C1. OutputBundle — the largest single unlock
What a finished edit *is* to a consumer is currently assembled at each call
site: status, output asset, signed URLs, craft facts, captions, cover. Every
consumer reassembles it and each one can disagree. Until this exists, every new
surface that shows a finished video is a new place for the readiness bug in A8
to reappear in a different spelling.

### C2. Approval → posts binding
`posts` can reference an edit project (0098) but nothing binds an *approval* to
the thing approved. A creator approving a video and a video being posted are two
facts with no enforced relationship.

### C3. BrandTruthSnapshot producer
**The readers exist and the writer does not.** This is the sharpest instance of
the "system that exists but does not connect" complaint: code reads a snapshot
nothing writes, so it silently takes its fallback path forever.

### C4. Schema drift detection
No check compares the TypeScript row interfaces against the live database.
`briefPersistence.test.ts` does this for one column pair by hand; there is no
general mechanism.

### C5. Consent and deletion
`purge_media` deletes bytes and is enqueued by a database trigger, so every
route to deleting a `media_asset` is covered. There is **no user-facing deletion
flow** that exercises it, and no consent record.

### C6. Editor economics
Nothing measures what a render costs, and nothing refuses one before the money
is spent. `edit_director_call_token_usage` (0101) records director tokens only.

### C7. Real recordings through editor v2
Zero. The legacy `autoedit` path completed 17 jobs; **editor v2 has never
completed a run in production.** Everything in section A about the real render
is a claim about staging.

---

## D. Loopholes found in the production audit

| | Finding | Status |
|---|---|---|
| D1 | Onboarding asked `workKind`/`forbiddenClaims` and persisted them nowhere | fixed (0109) |
| D2 | Orphan `enqueue-autoedit` edge function still deployed | flagged by `deploy-edge.yml`, not deleted |
| D3 | Capability flags written by nothing | open |
| D4 | Editor v2 usage is zero | open — C7 |
| D5 | `docs/vps.md` says Render; the worker is on a VPS at 138.201.119.239 | corrected in `ARCHITECTURE.md`, `vps.md` itself still wrong |
| D6 | `staging` cannot host a recorder walkthrough (no `profiles`, behind 0103/0106, 0106 needs `gallery_items`) | open, by design |

---

## E. Outstanding on the user's side

- **Rotate the Gemini API key** that was pasted in plaintext in the session
  transcript. https://aistudio.google.com/apikey, then update
  `/opt/twinai-worker.env` and `docker restart twinai-worker`. Check the
  Supabase edge secrets for the same key — `generate-blueprint` and
  `generate-thumbnail` both read `GEMINI_API_KEY`.

---

## F. Process notes worth keeping

- **`staging-matrix-gate` is a commit status, not a check run.** It goes green
  only for a `staging-integration` success at the *exact* head SHA. Pushing
  while a run is in flight orphans it. Serialise by hand.
- **Verify a fix by removing it and watching the test fail.** Two caption fixes
  were shipped on theory and failed staging identically; the regression test
  written for them passed with them reverted, which was the signal.
- **Pull real failing inputs before changing anything.** The caption bug was
  found by reading staging project `90eeb742`'s actual data, not by reasoning
  from the error string.
