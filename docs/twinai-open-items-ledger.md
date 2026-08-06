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

Migrations **0110, 0111, 0112** are also applied to production, and each was
exercised rather than watched:

- **0110** — `generations.reference_analysis` is server-owned, the
  `is_reference_analysis()` guard accepts `real`/`pattern`/`none` and refuses
  anything else. `unknown` is not `pattern`: a reference we never analysed and a
  reference we analysed and found nothing in are different facts.
- **0111** — applying it cleanly proved nothing. *Calling* it found a real bug:
  the function declared `proj record` and filled it only on the approve branch,
  so the UNAPPROVE path raised `record "proj" is not assigned yet` — the path
  `review/index.ts` uses for "request changes", which would have 500'd for every
  client who asked for a change. Fixed to scalars, which initialise to NULL, and
  both branches re-tested.
- **0112** — the seven cases listed under C2, run against production with a
  synthetic fixture that was deleted in the same statement.

The remaining launch gate is the flag, not the schema: `EDITOR_V2_START_ENABLED`
on Supabase edge, and `EDITOR_RENDER_ENABLED` in `/opt/twinai-worker.env`
(applied by `docker restart twinai-worker`).

---

## C. Not built — ordered by what they unblock

### C1. OutputBundle — BUILT
`packages/shared/src/editor/outputBundle.ts`, pinned by `outputBundle.test.ts`
(14 cases). A discriminated union where only `state: 'ready'` carries `output`
and `craft`, so rendering a player for a project that produced no video is not
a bug that can be written — the field does not exist in the other variants.

`Result.tsx` is migrated to it and `CraftChecks` is now presentational, which
removes the third independent readiness judgement (the one that was wrong). The
remaining consumers named in the original entry — captions and cover surfaces —
are not yet migrated; they are additive, and each one that moves deletes another
hand-rolled derivation.

Worth keeping as the reason this mattered: naming the predicate
(`editProducedVideo`, A8) stopped the *mistake*; the union stops the *shape*.

### C2. Approval → posts binding — BUILT

Was: `posts.edit_project_id` exists (0098 adds it, with a comment calling it
"THE join key") and **nothing writes it**; and nothing binds an *approval* to
the thing approved, so a creator approving a video and a video being posted were
two facts with no enforced relationship.

Now, in three parts:

- **The approval names its subject.** 0111 adds
  `generations.approved_output_asset_id` / `approved_edit_project_id` /
  `approved_at`, a CHECK forbidding a binding on an unapproved row, and
  `set_generation_approval()` — one statement, so the approval and what it
  approved cannot be written apart. NULL means *approved before we recorded
  what*, not unapproved.
- **Publishing writes what went out**, from the same resolution used to sign the
  URL, so the record cannot describe a different file from the one the platform
  received. The publish path also refuses a *superseded* approval — but only
  when the brand set `needs_approval` explicitly, because unset is not consent
  and is not refusal.
- **The post names its render at SCHEDULE time**, not only at publish time
  (`schedulePost` → `bindCurrentOutput`). Without that, a creator who
  re-edits between scheduling and the cron tick has their scheduled post quietly
  become about a different video, with no moment at which anyone decided that.
  A bound post publishes what it was bound to; if that file is no longer
  readable it FAILS rather than substituting the current render.

0112 is the part that only became necessary because of the third. Making those
columns client-writable opened a cross-tenant read: `posts` is owner-scoped by
`owner_id` and nothing else, so a client could insert a post it owns naming
*another user's* edit project, and the publish path would sign and post that
video to the attacker's own account. A `before insert or update` trigger now
requires the bound project to belong to the post's own generation, and the asset
to be the one that project produced. Both columns null stays legal — every
pre-existing post is in that state.

Verified against production by exercising it, not by reading it: unbound insert
allowed, correct binding allowed, foreign generation refused, half a binding
refused, mismatched asset refused. And both cascade cases pass — the `on delete
set null` FKs arrive as an UPDATE nulling one side, so a trigger that merely
raised would have made this constraint reach backwards and forbid deleting an
edit project at all.

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
| D2 | Orphan `enqueue-autoedit` edge function still deployed | **not reproducible — already gone.** Checked against production 2026-08-06: 17 functions deployed, every one maps to a repo directory, and `enqueue-autoedit` is not among them. The only repo function absent from production is `ci-bootstrap`, which is staging-only by design. This entry was carried forward from an older audit and was stale when the ledger was written; `deploy-edge.yml`'s classification step still names it in `RETIRED`, which is correct — that is what keeps it from coming back. |
| D3 | Capability flags written by nothing | **half wrong, corrected.** `brand_voices.default_capability_flags` IS written — `saveCapabilityDefaults` (`api.ts:870`), called from `Onboarding.tsx:593`, read back by `Gallery.tsx:272`. That loop is closed, for exactly one flag: `can_record_screen`. What has no writer is the PER-VIDEO override `generations.capability_flags`, which `api.ts:907` reads and nothing sets — so the per-video answer is always the default, and the precedence rule the code documents ("what is true of THIS video wins") can never actually fire. Another readers-with-no-writer, same family as C3. |
| D4 | Editor v2 usage is zero | open — C7 |
| D5 | `docs/vps.md` says Render; the worker is on a VPS at 138.201.119.239 | corrected in `docs/system-connections.md`, `vps.md` itself still wrong |
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
