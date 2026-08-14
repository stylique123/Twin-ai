# TwinAI — open items ledger

Rebuilt after the original was lost in a container rollback. Consolidates the
three uploaded audits, the master build plan, and the production audit run
against the live Supabase project.

Ordered by what unblocks what, not by phase number. An item is "done" only if
something enforces it — a test, a migration, or a CI check. Where nothing does,
it says so.

---

## ✅ 0. MERGE BLOCKER — CLEARED 2026-08-11

**Both migrations are now applied to production.** Verified twice: the owner ran
them in the Supabase SQL editor against `main / PRODUCTION` and the verify query
returned all three rows, then `list_tables` confirmed independently that
`product_entities`, `creator_knowledge` and `audience_questions` all exist with
RLS enabled.

| Migration | In repo | Applied to production |
|---|---|---|
| `0120_product_entities` | ✅ | ✅ applied 2026-08-11 |
| `0121_creator_knowledge` | ✅ | ✅ applied 2026-08-11 |

⚖️ **Kept rather than deleted, because the near-miss is the lesson.** What
follows is what was true before they were applied, and it is why the exclusion
note in `check_staging_migration_coverage.mjs` now says an exclusion is a debt.

Production's ledger ended at `0119_blueprint_idempotency` / `0118`, and both
tables were missing while a branch that reads them sat ready to merge.

⚠️ **What would have happened if #316 merged first.** `generate-blueprint` on
that branch queries `product_entities` and correctly refuses to guess when the
read fails:

```ts
if (ownedEntityErr) return json({ error: 'We could not read your product details…' }, 503)
```

Against a missing table PostgREST returns `42P01`, so **every blueprint
generation returns 503** — not a degraded script, no script at all. `main` did
not query either table (verified: 0 matches), so there was never a live outage.
The outage would have been created by merging in the wrong order.

**Correct order was: apply 0120, apply 0121, verify both tables exist, then
merge — and that is the order it happened in.**

⚖️ **Why they slipped.** Both are deliberately excluded from the staging matrix
by `check_staging_migration_coverage.mjs` — they carry foreign keys to
`brand_voices`, which on staging is a fixture applied *after* the migration loop,
so they would fail on their first statement. The exclusion is correct and its
cost is exactly this: nothing applied them anywhere, so nothing noticed they
were never applied. **Fixed at the decision site** — the exclusion note in
`check_staging_migration_coverage.mjs` now states that excluding a migration
means taking on a manual apply, and both entries record that it happened.

⚠️ **Still true after the apply, and it is the residue worth watching.** 0121's
RLS policies — including the deliberate *absence* of an INSERT policy, which is
what stops a creator asserting "I have said X" about themselves and having the
writer voice it as observed fact — have still never been EXERCISED anywhere.
They exist in production now; nothing has tested that they behave. The tables
are empty (`creator_knowledge` 0 rows), so the first real scan is also the first
test of that policy set.

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

Migrations **0110–0114** are also applied to production, and each was exercised
rather than watched:

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
- **0113** — nine cases: normalisation, duplicate refusal, the same value under
  a different kind, an undeclared kind, a blank value, the repoint refusal,
  attributed and unattributed observations, and the delete restriction. The
  second group ran inside a deliberate rollback, because 0105 makes the outcome
  log append-only and fixture readings could not otherwise be removed.
- **0114** — the ownership guard took three attempts and every failure was found
  by CALLING it. `v_owner is distinct from auth.uid()` refused every server-side
  call by comparing a real owner against NULL; `current_user <> 'service_role'`
  then refused connections arriving as `postgres`. The rule is "a signed-in
  caller must own the row", so `auth.uid() is not null` is what is tested.
  Also applied to STAGING and added to the matrix list — unlike 0112 and 0113,
  which attach to `public.posts` and cannot apply there at all.

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
removes the third independent readiness judgement (the one that was wrong).

**The "remaining consumers" note was wrong, and is retracted.** It said captions
and cover surfaces were still to be migrated. Checked 2026-08-06: neither is an
`OutputBundle` consumer, and migrating either would make the code worse.

- The COVER surface is `CoverDialog`, and `Result.tsx:882` hands it
  `gen.ai_thumb_path` — the on-demand AI cover, a GENERATION-level object in the
  `edits` bucket with its own lifecycle and its own paid-generation guard. It is
  not `EditorOutput.coverUrl`, which is the render's poster frame. Routing it
  through the bundle would tie a cover that exists without any render to a
  variant that only exists with one.
- The CAPTIONS surface is `V2EditReview`, which uses `ReviewBundle` — words,
  sentences, director cuts and zoom anchors. `OutputBundle` does not carry any
  of that and should not: it answers "is there a video and can I play it", and
  the review screen's question is "what was said and where".

So C1 has no outstanding migration. Two authorities that look similar are doing
different jobs, which is the correct end state rather than an unfinished one.

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

### C3. BrandTruthSnapshot producer — BUILT

Was the sharpest instance of "the system exists but does not connect", and
worse than the entry said. `creativeTransferPlan.ts` refuses a plan whose
`brandTruthSnapshotId` / `brandTruthSha256` the SERVER did not issue — and
nothing issued one — so those mismatch checks had **never been able to fire**.
The lineage they enforce was decorative from the day it landed.

`supabase/functions/brand-truth` is the writer. It projects SERVER-SIDE, which
is not a style choice: 0095 grants `brand_truth_snapshots` to service_role
alone and says why — "a client that could insert one could assert its own brand
truth, which is authority level 1." The request body carries a SELECTOR and
nothing else; the function reads `profiles.dna` and the `brand_voices` row
itself, and re-establishes ownership under the service key because `admin`
bypasses RLS.

Idempotent by digest, which 0095's unique index on
`(owner_id, snapshot_sha256)` already demanded: an unchanged brand reuses its
row rather than accumulating duplicates. A concurrent caller that loses the
race on that index is answered with the row that won, because two honest
clients racing is not a failure.

That reuse only holds if the projection is deterministic wherever it runs.
`supabase/functions/_shared/brandTruth.ts` is a BYTE-FOR-BYTE copy — the module
imports nothing and touches no runtime API, so unlike the hand-retyped worker
mirrors it can be exact — and `check_brand_truth_parity.mjs` fails the build
the moment it stops being. A drifted copy would hash one brand two ways,
silently end the reuse, and leave every plan pinning whichever copy produced
its digest. Nothing would error; the lineage would just stop meaning one thing.

Still open: nothing CALLS `ensureBrandTruthSnapshot` yet. The producer exists
and is reachable; wiring it into the blueprint flow touches
`generate-blueprint`, which the other session owns.

### C4. Schema drift detection — BUILT, and now covers the main row

`check_row_type_drift.mjs` compares three interfaces against their tables in
both directions. `Generation` was added last and immediately found real drift
both ways: `capability_flags` and `scene_timeline` are READ BY THE CLIENT and
were absent from the interface (`getGeneration` selects `*`, so every reader
reached them through a cast), while `approved_*` and `reviewed_at` were stored
and invisible. Three columns are declared server-only with reasons.

Migration-derived, so a column added by hand in the dashboard is a drift it
cannot see — stated in the guard rather than implied.

### C5. Consent and deletion — DELETION BUILT, CONSENT NOT

The deletion half turned out to be worse than this entry said, and the entry
repeated 0099's own header to get it wrong. `purge_media` is enqueued by a
trigger on `media_assets`, and **deleting a generation never deleted a
`media_asset`**: the key is `ON DELETE SET NULL`, verified against the live
catalog. Every route was NOT covered — the route was never connected, so every
raw take would have survived a deletion that appeared to succeed.

0114 adds `delete_generation` (projects → assets → row, in that order, in one
transaction) and History gets a delete action behind an in-place confirm that
names what goes. Exercised against production: two purge jobs queued where zero
were before, nothing left behind, the post surviving with a null link.

It also fixed a second live bug found on the way: 0105's append-only trigger
made any post with a recorded reading **undeletable**, because the reading
cascade hit a trigger that raised unconditionally. `deletePost` on the Calendar
simply threw. UPDATE stays forbidden; DELETE is allowed only as a cascade from
a post that is already gone.

**Consent is still not built, and deliberately not half-built.** A consent table
with no writer is another reader-with-no-writer — the family of defect this
ledger exists to track. It needs the moment consent is actually given (the
recorder), which is a UI change that cannot be verified without a recording.

### C6. Editor economics — MEASUREMENT BUILT, GATE NOT (that order is the point)

`editor/renderCost.ts` derives what a render cost from facts the pipeline
ALREADY writes: 0101's token columns, the append-only event log's stage
timestamps, and `edit_outputs.measured_duration_ms`. No new table and no new
worker write — a `render_cost` table filled by a new writer would be
unverifiable today (editor v2 has never completed a run in production), so the
reader would report zeros that look like cheap renders.

It computes **no total**, and that is the finding rather than an omission. The
two costs that dominate a video pipeline — VPS compute seconds and egress — are
recorded nowhere and cannot be recovered by arithmetic over these tables. So
`unmeasured` names them and `costIsComparable` returns false for every project.
A total assembled from the cheap half would be wrong in the direction that
matters: it would make every render look affordable, and a gate built on it
later would let through exactly the expensive ones it was meant to catch.

No threshold, no budget, and no boolean a caller could mistake for permission —
a gate built before the measurement is a number somebody guessed that becomes
policy the moment it ships.

### C7. Real recordings through editor v2
Zero. The legacy `autoedit` path completed 17 jobs; **editor v2 has never
completed a run in production.** Everything in section A about the real render
is a claim about staging.

### C8. Per-step outcome record — EDITOR PARTIAL, SCRIPT ABSENT, DNA PARTIAL
Requested directly: when a result comes back, we should be able to see **which
steps ran, which succeeded, which failed, and why** — for the editor, for the
script, and for DNA. Today that is true for one of the three.

**Editor — recorded, but the reason is not.** `edit_events` is append-only,
`seq`-ordered, one row per stage with `stage`/`pct`/`message_code`/`details`;
`edit_projects.failure_code` is a typed code; `edit_director_calls` is a real
state machine (`started → received → succeeded|failed|unknown`) carrying
`failure_code` and token usage. This is what answered "how often has the
director call failed, ever" on 2026-08-08 — three times in its whole history —
and it is why that failure was correctly called transient rather than guessed at.

What is missing is the CAUSE. `directorProvider.ts:151` builds
`director provider HTTP ${res.status}`; `editorDirector.ts:287` re-throws
carrying only the code. So a 429 (our quota), a 503 (Google's problem) and a
400 (our malformed request) are indistinguishable in the record, and they call
for three different responses. One-line fix; touches the render path, so it
needs its own PR and its own matrix.

**Script — no durable record of failure at all.** This is the real hole.
`generate-blueprint` inserts the `generations` row only AFTER the model call
succeeds (`index.ts:869`). On a timeout, a `MAX_TOKENS` truncation, invalid
JSON, or a non-2xx, it refunds the credits, writes a `console.error`, and
returns a generic "Generation failed." **No row is written anywhere.**
Consequences, all of them current:

- "How often does script generation fail?" — unanswerable from the database.
- "What does it fail on?" — unanswerable.
- The model-attempt loop falls back from the primary model to a backup; that
  fallback is visible only in a console line, so we cannot tell how often we
  are silently serving the second-choice model.

Edge logs are ephemeral, so this is gone within days. The one durable record is
an `ops_events` row written when the REFUND fails — i.e. we durably record the
failure of the failure handler, but not the failure.

**DNA — the claim is evidenced, the run is not.** `dna_claims` has real
discipline on the OUTPUT (correlations need a sample size, hypotheses stay
untested, business claims need attribution). There is no `edit_events`
equivalent for the run that produced it, so "why was this claim NOT made" has
no record.

**What to build, in this order** (each is independently useful; do not batch):

1. A durable attempt row for script generation, written BEFORE the model call
   and settled after — the same shape `edit_director_calls` already proves
   works. It must record the model actually used, the attempt index, and a
   typed failure code. Written before the call is the whole point: a row only
   written on success cannot describe a failure.
2. Carry the provider's status/detail into the stored failure, for the script
   path and the director path alike. A code without a cause is a code that
   sends you to the logs, and the logs expire.
3. A stage record for the DNA/brand-truth run, modelled on `edit_events`.

**The trap to avoid.** Do not add a table that nothing writes to, and do not
add a "reason" column that only ever holds a generic string. That is the
reader-with-no-writer family of defect this whole ledger exists to remove. Each
of the three lands with its writer, or it does not land.

---

## D. Loopholes found in the production audit

| | Finding | Status |
|---|---|---|
| D1 | Onboarding asked `workKind`/`forbiddenClaims` and persisted them nowhere | fixed (0109) |
| D2 | Orphan `enqueue-autoedit` edge function still deployed | **not reproducible — already gone.** Checked against production 2026-08-06: 17 functions deployed, every one maps to a repo directory, and `enqueue-autoedit` is not among them. The only repo function absent from production is `ci-bootstrap`, which is staging-only by design. This entry was carried forward from an older audit and was stale when the ledger was written; `deploy-edge.yml`'s classification step still names it in `RETIRED`, which is correct — that is what keeps it from coming back. |
| D3 | Capability flags written by nothing | **half wrong, corrected.** `brand_voices.default_capability_flags` IS written — `saveCapabilityDefaults` (`api.ts:870`), called from `Onboarding.tsx:593`, read back by `Gallery.tsx:272`. That loop is closed, for exactly one flag: `can_record_screen`. What has no writer is the PER-VIDEO override `generations.capability_flags`, which `api.ts:907` reads and nothing sets — so the per-video answer is always the default, and the precedence rule the code documents ("what is true of THIS video wins") can never actually fire. Another readers-with-no-writer, same family as C3. |
| D4 | Editor v2 usage is zero | open — C7 |
| D5 | `docs/vps.md` says Render; the worker is on a VPS at 138.201.119.239 | **fixed — and this row was itself stale.** Re-checked 2026-08-06: `vps.md:357` already carries the correction inline, naming the container (`twinai-worker`), the workflow (`deploy-worker.yml`), the env file (`/opt/twinai-worker.env`) and the restart. The ledger was reporting an open item that had been closed, which is the same defect the ledger exists to catch, pointed at itself. |
| D6 | `staging` cannot host a recorder walkthrough (no `profiles`, behind 0103/0106, 0106 needs `gallery_items`) | open, by design |

---

## E. Outstanding on the user's side

**See `docs/recording-day-runbook.md`** for what one recording settles, the two
flags that gate it, the queries to run afterwards, and the process notes that
cost hours to learn. This section is the summary; that document is the
instruction.

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

---

## G. 2026-08-13 — knowledge supply, and what measurement caught

Recorded because the findings below cost a day to produce and none of them are
visible in the code they concern. PRs #347–#366.

### G1. The recurring defect, nine times in one session

A field written, stored, displayed, and read by **nothing** — found nine times:
`product_entities` (table, no writer) · `loadProductEntities` (reader, no
caller) · `restrictions` (appeared only inside a comment) · `archived_at` ·
`productFacts` · the `IMPOSS-PROD` legend · `official_product_page` (enum value
produced by nothing) · `beat_plan.proof` / `beat` / `scene_type` ·
`selectionShape`.

**Three of those were introduced by the changes that fixed the others.** The rule
"never add a field without a reader in the same PR" is easy to state and easy to
break in the same afternoon you state it, so the guards are now written against
*the rule* (walk the interface, demand a reader for whatever is found) rather
than against the individual field.

### G2. A reader existing is not a reader being right

`beat_plan.proof` was wired to the plan card and the capture screen, with passing
tests. Then 192 real proofs said 186 were the wrong answer — the `substance` enum
verbatim, a source, or the beat's purpose restated. The row would have read
"What makes this land: creator_knowledge" to somebody holding a camera.

The display was reversed and `proof`'s reader is a **production counter** until
the counter says the value is worth showing. After the instruction was sharpened
to forbid the three wrong shapes by name: 201 beats, 100% shootable.

⚠️ **The first headline was wrong too** — "186 of 192" was inflated by a bug in
the classifier doing the measuring (it matched a bare "Creator", so every proof
whose subject was the person on camera was filed as a defect). True figure: 61%,
not 97%. *The measuring instrument is part of the experiment.*

### G3. More knowledge made scripts WORSE, and why

A/B on three creators, same references, only the store differing:

| | hand-written | +382 derived |
|---|---|---|
| grounded in creator knowledge | 63% | **52%** |
| generic beats | 20% | 25% |

Ten-item cap, ranked by lexical overlap alone. The small curated store never
filled the cap; a realistic store fills it and thin `product`/`topic` rows win on
keyword overlap, pushing claims and experiences out. **Every established creator
has the realistic store** — knowledge accumulates across scans — so a creator
with a lot to say crowds their own claims out of their own prompt.

Fixed with a substance **floor** (not depth-first ordering, which would hand a
phone review a generic business claim ahead of the phone).

⚠️ **Verified inert on the shipping configuration.** 32 cases, both selectors,
identical supplied mix: the floor never fired once, because 18 of 32 cases were
below the floor and **none of those were at the cap**. Substance was thin because
the creator had none, not because anything displaced it. A seatbelt in a car that
never crashed — correct to have, and not evidence of improvement.

### G4. The structural ceiling: captions cannot carry substance

Caption-derived knowledge contains **zero** `claim` / `experience` / `opinion` /
`framework`, by construction — the caption prompt correctly refuses to file a
position as `stated` from a headline, because nobody heard them say it. Only
transcripts produce substance.

So `TRANSCRIPT_BUDGET` is the ceiling on everything downstream, and no selector,
floor or cap change raises it. Raised 5 → 10 (**a recurring paid cost**), plus a
free stance axis that spends the same budget on titles shaped like an argument
rather than spectacle — reach is a proxy for what got views, not for what
contains a position.

**Unvalidated:** whether stance-picked videos actually yield more substance needs
a paid transcription trial. The mechanism shipped; the proof did not.

### G5. Two problems that look identical in a finished script

- `starved` — substance existed and did not reach the prompt. A ranking bug.
- small `available_substance` — the creator's store is thin. Needs transcripts or
  a question. **No selector change touches it.**

Both produce generic scripts. Without the split, every thin creator reads as a
ranking failure and the selector gets tuned at a problem that isn't selection.

### G6. Corrections to items recorded elsewhere

- **Tasks "re-scan the 8 cohort-1 creators" and "regenerate the creator pack"
  were mis-scoped.** The manifest's cohort-1 (`johnnyytech`, `brett.tech`, …) is
  a **different set** from the 8 creators the matrix runs (`AlexHormozi`,
  `garyvee`, …) — zero overlap. Re-scanning them would not have moved any number
  we report.
- **Nothing writes `creator-pack.json`.** Every QA script reads it; the items were
  hand-written. `derive-knowledge.mjs` now produces them by production's rules.
  Do **not** replace the pack wholesale — the derived set has no `opinion` items
  and swapping would delete the only stance-shaped knowledge the harness has.
- **Re-scraping was not needed** and was not done: captions were two days old and
  the manifest opens by warning that re-scraping costs credits.

### G7. Process

- **Walk the feature on real data.** Every defect above was found by walking, not
  by the suite — which was green at 2,875 tests throughout.
- **A guard that reads prose checks the wrong thing.** Two guards failed on the
  *comments explaining the defect they forbid*. Explaining a defect must not be
  indistinguishable from committing it.
- **Retyping a constant is the same defect as retyping a prompt.** A hand-typed
  `maxOutputTokens` (8k vs the real 40k) made all eight extractions fail as
  "unparseable".
- **The harness must lift, never retype.** `run-eval.mjs` carried its own copy of
  the `beat_plan` instruction; a run made to check that fix would have sent the
  pre-fix wording and reported no change — a null result indistinguishable from a
  real one.

### G8. A true citation attached to an invented number — OPEN, nothing catches it

Found by asking where `real_techh`'s digits came from, having established that
creator has **zero** speakable numeric knowledge.

**The leak (fixed, #368).** A reference's measured claim — "3x more productive",
Ali Abdaal's own self-report — transferred to five creators across 9 of 16 runs,
declared `general`, i.e. *"common knowledge, nobody's claim"*. `general` was
functioning as a licence. The prompt already forbade it and it happened anyway in
56% of runs, which is the clearest case yet for *a contract check beats a prompt
rule where the defect is decidable*.

**The second bug (OPEN).** One of those beats declared `creator_knowledge`:

```
LINE   : "This one simple filming technique has genuinely 3x'd my productivity."
CITED  : (experience) Has been a professional content creator for 8 years
SUPPLIED items containing 3x: NONE
```

The citation is REAL — that item was genuinely supplied — and it **does not
contain the claim being made**. `UNSUPPORTED` checks whether the cited *text*
traces to something supplied. It does. Nothing checks whether the citation
**supports the specific assertion in the line**, so a beat can attach any real
item to any invention and pass every counter.

| | what is wrong | caught by |
|---|---|---|
| leak | reference's number, declared `general` | #368 |
| mis-citation | invented number, citing a real but unrelated item | **nothing** |

#368 catches this instance incidentally, because the number came from the
reference. **A number that is NOT in the reference, citing an unrelated real
item, still sails through.**

⚠️ **Do not fix this with a naive string match.** "Does the beat's number appear
in the cited item" catches this case and produces false positives on legitimate
paraphrase — blocking good scripts, or shipping another green-tests-with-a-hole.
Whether a citation supports an assertion is a judgement, not a substring test,
and it needs designing rather than patching.

**RESOLVED, narrowly and on purpose.** The general form stays a judgement, so the
check is restricted to the part that is not: **numbers do not paraphrase**.
"$50,000" may be written "$50K"; it can never become "$70,000". For measured
values, "does the citation contain this figure" is decidable, and every G8
instance found on real runs was a NUMBER attached to evidence that did not carry
it.

⚠️ **AND THE FIRST ATTEMPT WALKED STRAIGHT INTO THE TRAP THIS ENTRY WARNS
ABOUT.** It reported 3 violations in 10; one was its own bug — a beat saying
"$50K in four months" citing "$50,000 a month within its first four months",
called invented because the `K` was not normalised. A second bug read "1.5M
views" as 1.5 because the multiplier test used a word boundary and "views"
follows the `m` directly. **Normalisation is the load-bearing part, not the
comparison.** True rate: 2 of 11 numeric cited beats.

Shipped as a counter (`entailment_gaps`), not a repair: both instances on the
corpus are already repaired by the reference-leak pass, so the incremental catch
today is zero. Its value is the general case — a figure NOT from the reference,
citing a real but unrelated item — which nothing has measured yet.

### G9. Paraphrase drift — a re-scan nearly doubles the store

0123 made exact repeats merge and said plainly that it did not close this:
"the extractor re-reads the transcripts on every scan and writes the same fact
in different words… BOTH survive." Nobody had measured how often.

**Two runs of the production extractor over identical input**, 18 items in the
second run:

| | |
| :--- | ---: |
| merged today (exact match) | 6 |
| **the same fact in different words — accumulates** | **9** |
| genuinely new | 3 |

> "Faster charging is not better for phone battery longevity."
> "faster charging is not better for phone battery health"

⚠️ **THE COST IS NOT DISK.** The prompt carries about ten items behind a floor
of six substance slots. Two phrasings of one opinion occupy two of those six,
and the creator's second-best idea never reaches the writer.

**Scope is a measurement, not a preference.** Across 1,033 items from 17 real
creators the rule merges *nothing* within a single scan — every pair it would
have collapsed was a `topic` or `covered` row, and most of those were not
duplicates at all ("starting AI dropshipping with Claude" vs "…with your
phone" — different videos). All nine drifted items were substance kinds. So
thin kinds keep exact-match merging and this touches the six kinds a script is
built out of.

⚠️ **AND WORD OVERLAP ALONE WOULD HAVE DELETED VIDEOS.** At the same threshold,
on the same corpus:

> "top 10 dropshipping products for July 2026" — 0.71 — "…for May 2026"
> "top 10 dropshipping products to sell now" — 0.63 — "top 7 dropshipping…"
> "Google Pixel 1" — 0.67 — "Google Pixel"

Each differs by a number or a month and by almost nothing else, which is exactly
what high overlap cannot see. Two texts are never merged when their numerals or
month names disagree — the same principle G8 runs on: numbers do not paraphrase.
The sharpest case the guard catches is a pair of experiences at 0.54 that reached
**opposite** findings (256GB choked, 512GB fine); merging them would delete the
comparison that is the content.

⚖️ **THE FALLBACK DELIBERATELY DOES NOT USE THE CANONICALISED ROWS.** Rewriting a
re-wording into an exact repeat is what lets the merge see it — and sent instead
to the plain insert that runs when 0123 is absent, it collides with 0121's unique
index and fails the whole batch. That is the precise defect 0123 was written to
fix. Without the merge, dedupe is off.

Wired at the only place it can run (`worker/src/knowledgeInsert.ts`, before the
merge RPC), with a `creator_knowledge_paraphrase_merged` counter, and every way
of failing to read the store — no `select`, a throw, a null result, an absent
`voice_id` — stores the scan unchanged. Nine mutations of the rule were checked to fail their guard; the
threshold is pinned by a test because no corpus-free assertion can catch it
being loosened.

### G10. Gap 5's premise was wrong — the selector was not dropping the numbers

Gap 5 read: *"the knowledge selector should prefer items containing figures when
the creator's own material is numeric,"* on panel evidence that Starter Story's
winning script was "completely numberless — on the one channel where numbers are
the format." The floor was written. Then it was measured, and it never fires.

**First count said ten of twenty-six creators hold numeric items and only one
loses all of them.** That count was wrong in the way that matters: it matched a
figure anywhere, including in `topic` and `product` rows.

⚠️ **A FIGURE IN A THIN KIND IS NOT A NUMBER THE CREATOR CAN SAY.** "top 10
dropshipping products that made $50k" is a video title, not an assertion. Counted
against the six kinds that can carry a beat:

| corpus | creators with figure-carrying substance | selection drops them |
| :--- | ---: | ---: |
| curated 26-creator pack | 9 | **0** |
| caption-derived, 1,033 items, 17 creators | **0** | — |

⚖️ **SO THE FLOOR WAS WITHHELD, NOT SHIPPED.** It changes nothing on the pack —
the substance floor already carries every figure through — and on caption-derived
stores there is not one figure-carrying substance item for it to reserve a slot
for. Shipping it would have been a mechanism that cannot fire, validated by
nothing, which is precisely the write-only pattern this session shipped nine
times.

**The scripts are numberless because the STORES are**, which is G4's structural
ceiling again and has a different fix — transcripts, or asking the creator —
none of it in the selector. This also corrects an earlier claim of mine in this
session: seven of eight creators "having numbers they don't use" counted figures
across all kinds and overstated the supply.

What shipped is `carriesFigure` plus `figures` / `available_figures` in
`selection`, in shared and in the edge, held identical by the parity test. **Both
halves**, because the interesting number is the denominator: logging only what
got through leaves "the selector discarded them" and "the creator has none"
indistinguishable, and those have opposite fixes.

### G11. The §18a refusal must NOT ship as a stop — measured

`containerSupply.ts` shipped as a measurement on purpose: *"a stop shipped before
anyone knows how often it fires is a stop that may refuse most generations on its
first day."* Gap 2 step 2 was blocked waiting on production traffic. It did not
need traffic — `checkSupply` is a pure function of the reference's demand and the
creator's store, so the refusal rate is computable offline.

Enumerated demands were read from the derived-reference corpus with production's
own `countsIn`, restricted to `ENUMERATED`-shape references. Demands seen: 7 and
10 — "Top 7 Products To Sell This Week", "Top 10 Dropshipping Products".

| store | creator × reference pairs | would refuse |
| :--- | ---: | ---: |
| hand fixtures (5 items) | 88 | **100%** |
| curated pack (11–35 items) | 120 | **60%** |
| caption-derived (78–109 items) | 136 | **25%** |

⚖️ **SO THE ANSWER IS NO.** Even for an established account with a hundred
caption-derived items, one generation in four against an enumerated reference
would be refused — and enumerated commerce formats are exactly what those
creators want. §18a is right that an unresolved container comes back invented;
it does not follow that refusing is the affordable response.

⚠️ **AND 25% IS THE OPTIMISTIC BOUND, BUILT ON NOTHING.** Of the 302 enumerable
items those 17 real creators had, **302 were bare `product` mentions** — not one
example, experience, claim, framework or fact. Ten "they mentioned the Z Fold 8"
rows cannot carry "the 10 products I'd sell right now"; the creator has no view
on any of them. For a caption-only creator the true rate is nearer 100%, and the
supply number was hiding it behind a total.

What ships is `bareProduct` on the supply check, in shared and the edge, held by
the parity test — the same denominator lesson as G10. **A refusal is not what to
build next.** `describeShortfall` already writes the trade — *"this format
promises 10 and we can support 4; writing it now would invent 6"* — and offering
the count the creator CAN support is the honest move where refusing is not.
Deciding that needs a generation, not another counter.

### G12. The gap-fill screen is NOT validated — the A/B ran and did not test it

The decision was to put a gap-filling step in front of the creator when the
reference promises more than their material supports, and to A/B it first. It was
A/B'd. **It should not ship on this evidence.**

**The experiment.** Six creators, one enumerated reference, two arms differing
only in how much of their own list-fillable material reached the prompt — arm A
truncated to three items, arm B their full store. Truncation rather than invented
filler, because padding with placeholder rows would measure the model's reaction
to placeholders.

**Three instruments, one answer, and two of them were broken.**

| instrument | short-supply arm | full-supply arm |
| :--- | ---: | ---: |
| citation does not trace | 0 of 48 | 0 of 38 |
| items delivered − distinct supply reached | 14% | 12% |
| blind model judge, per item | 15% filler | 13% filler |

⚠️ **THE FIRST TWO ARE BLIND, AND THE SECOND ONE PROVES IT.** It scored
0-unbacked a script whose last five items were "authentic connections", "unique
experiences", "a founder-led brand", "innovation" and "calculated risks" — from a
creator supplied four usable facts. Every invented item cited a REAL item,
loosely. That is G8's wall a second time: **provenance-shaped checks cannot see
invention that cites correctly**, and a pigeonhole metric built on a loose matcher
inherits the blindness.

⚠️ **AND THE JUDGE'S NULL IS A NULL ABOUT THE EXPERIMENT, NOT ABOUT §18a.** The
reference said "seven specific things". A list of *lessons* can be filled from
opinions — and arm A's truncation kept every opinion, so it was never starved of
fillable material. hanushkaa's starved arm built its seven items out of opinions
and did fine. The manipulation did not bite.

⚖️ **THE CORRECTED EXPERIMENT CANNOT BE RUN ON THIS CORPUS, AND THAT IS G11
AGAIN.** §18a's case is the product round-up, where a slot needs a THING. No
creator in the 26-creator pack has more than six nameable products, so there is no
full-supply arm to compare against. The only stores that could supply one are the
caption-derived ones — and those are 100% bare product mentions, which is the
supply G11 showed cannot fill a list either.

**So: no gap-fill screen, no count negotiation, no refusal — none of them is
supported by evidence that exists today.** What is needed first is a creator with
enough real, nameable material to make a full-supply arm possible, which is the
transcript ingest. Every road out of Gap 2 now runs through the same place.

Shipped: the `keepEnumerable` arm option in the harness, and the two scorers, so
the corrected experiment is one command away when a corpus exists. The blind
metric is kept, not deleted, with its failure recorded on it — it is the clearest
demonstration in the repo of what provenance checks cannot see.

### G13. The missing token that cost a session, made audible

`APIFY_TOKEN` was absent from the worker's environment for an entire session of
development. Every YouTube and Instagram scan failed, every transcript fell back
to captions, and **nothing said so.**

⚠️ **EVERY CREDENTIAL CHECK WAS CORRECT, AND EVERY ONE WAS PER-CALL.**

>     if (!env.apifyToken) throw new Error('YouTube analysis is not configured
>       yet. Try a TikTok or Instagram link, or contact support.')

So the absence only spoke when a user tripped over it — and when it spoke, it
lied. *"Not configured yet… contact support"* reads as a product limitation the
operator chose. It is a missing environment variable, and the one person who
could fix it in thirty seconds is the one person that message never reaches.

⚖️ **THE FIX IS A BOOT LINE, NOT A HARDER CHECK.** A worker without Apify still
transcribes, renders and scans TikTok — reduced capability is a legitimate state,
and crashing on it would turn a missing optional key into an outage. So it warns
and keeps running, and a mutation test asserts that it does.

⚠️ **AND IT NAMES THE VARIABLE, NOT THE SYMPTOM.** "apify unavailable" sends
somebody reading source:

>     WARN APIFY_TOKEN is not set — cannot scan a YouTube or Instagram account.
>          While this is unset, every YouTube and Instagram scan fails; TikTok is
>          unaffected.
>     WARN APIFY_PROXY_PASSWORD is not set — cannot fetch Instagram imagery.
>          While this is unset, Instagram scans succeed but return empty palettes.

⚠️ **THE PROXY PASSWORD IS ITS OWN CAPABILITY AND IS NOT DERIVABLE FROM THE
TOKEN.** Meta signs its imagery to the requesting IP, so an account with a token
and no proxy password scrapes Instagram perfectly and comes back with empty
palettes — which presents as a colour bug, not a config gap. That distinction is
the one the Gap 6 Instagram flip turns on.

Nothing is printed when everything is live: a warning on every healthy boot is a
warning nobody reads.

### G14. The founding question, answered on real data — and the bottleneck moved

Production knowledge finally exists, so the matrix was re-run on what creators'
accounts actually yielded rather than on the hand-written pack every previous
score was measured against.

**What the two sources are made of** (production, 552 items):

| source | items | substance | experiences | with a figure |
| :--- | ---: | ---: | ---: | ---: |
| caption | 374 | **13%** | **0** | 2 |
| transcript | 178 | **78%** | **50** | 23 |

⚠️ **CAPTIONS PRODUCED ZERO EXPERIENCES ACROSS 374 ITEMS.** Not few — none. That
single fact explains three things filed separately for months: "nothing has a
story" (stories are made of experiences), "the numbers vanish" (2 in 374), and
"more knowledge made scripts worse" (the extra knowledge was 87% filler).

**Then the scripts.** Same eight creators, same reference, same rules, changing
only the store:

| store | grounded | generic | story beats | beats with a figure |
| :--- | ---: | ---: | ---: | ---: |
| hand pack | 61% | 25% | 1 | 4 |
| production, all sources | **58%** | 23% | 1 | 2 |
| production, TRANSCRIPT ONLY | **73%** | **8%** | 2 | 5 |

⚠️ **THE FULL PRODUCTION STORE SCORED BELOW THE HAND-CURATED PACK**, and that is
the finding. Better material was available and the scripts did not improve —
because the selector never surfaced it. Of 50 experiences in the corpus, **11
reached a prompt**; caption `topic` and `product` rows took 24 of 80 slots.

⚖️ **SO THE BOTTLENECK MOVED FROM SUPPLY TO SELECTION.** The substance floor
counts kinds and is blind to where an item came from — and a caption-derived
`claim` counts against the floor exactly like a spoken experience. Transcript-only
stores cut generic beats by two thirds, which is the largest effect measured on
this system to date.

⚠️ **AND THE EDGE WAS NOT READING `source` AT ALL.** The column has existed since
0122; `generate-blueprint` selected `kind, text, basis, times_seen, confidence`
and nothing else, so no preference on provenance could have worked — it would
have been computed against `undefined` on every row.

Shipped: spoken material fills the substance reservation first — a stable
partition, not a sort, so relevance still decides WHICH experience, and the four
unreserved slots stay open to everything. An absent `source` counts as
unrecorded, never as caption, so voices scanned before 0122 are not demoted for
a column that did not exist when they were stored.

⚖️ **THIS ALSO CORRECTS A PREDICTION MADE EARLIER THE SAME DAY.** On seeing the
13%/78% split I said transcripts would fix Gap 3 and Gap 5. Handed to the writer
through the existing selector, they did not — grounding fell. The supply was
never sufficient on its own, and saying so before measuring was the error.

### G15. One budget for three different prices

`TRANSCRIPT_BUDGET = 10` capped every platform equally. The three cost nothing
alike:

| platform | transcript path | price per video |
| :--- | :--- | :--- |
| TikTok | yt-dlp + local whisper | **free** |
| YouTube | free captions, paid Actor fallback | free *usually* |
| Instagram | paid Actor, always | paid |

⚠️ **SO THE FREE PLATFORM WAS PRICED AS IF IT WERE THE EXPENSIVE ONE**, and this
budget is the ceiling on the only input measured to change script quality:
transcript knowledge is 78% substance against 13% for captions, and
transcript-only stores scored 73% grounded / 8% generic against 58% / 23%.

TikTok now gets 25, everything else keeps 10.

⚖️ **YOUTUBE STAYS ON THE PAID BUDGET, AND THAT IS THE JUDGEMENT CALL.** Its path
is free-*first*, not free: a channel whose videos carry no captions falls through
to a paid Actor, so raising its budget converts silently into spend on exactly
the accounts least able to afford it. Free-first is not free. An unknown platform
also defaults to paid, because defaulting the other way makes every platform
added later silently expensive and puts the cost on the owner's bill rather than
on a failing test.

⚠️ **AND A GAP FOUND WHILE MEASURING THIS: `source_ref` IS NULL ON EVERY
TRANSCRIPT ROW.** Per-video yield is therefore not computable from the store —
`count(distinct source_ref)` returns 0 for all eight creators — and an item
cannot be traced back to the video the creator said it in. The column exists and
nothing fills it. Not fixed here; recorded so the next person measuring yield
does not conclude the videos were never transcribed.

### G16. The panel ran, and it does not confirm the week's improvements

Three string metrics in a row failed to see what is wrong with these scripts, so
the instrument changed: a judge, given the creator's own material and the script,
never told which arm produced it, asked the only question that matters — would
you spend an afternoon filming this?

**24 scripts, three arms:**

| arm | would publish | mean score | dominant flaw |
| :--- | ---: | ---: | :--- |
| hand pack | 7/8 | 8.1 | spread |
| production, all sources | 6/8 | 8.0 | PAYOFF ×3 |
| production, transcript only | 6/8 | 8.0 | REPETITION ×3, VOICE ×3 |

⚠️ **THE ARMS ARE INDISTINGUISHABLE ON PUBLISHABILITY, AND THAT IS A CHECK ON THE
WEEK'S CLAIMS.** #376 and #377 moved grounding from 58% to 73% and generic beats
from 23% to 8% — real, and measured. The judged quality did not move at all.
Better sourcing removed a class of defect that a counter can see; it did not make
a script somebody wants to film. Reporting the grounding gain without this would
have been reporting half a result.

⚖️ **AND THE PANEL EARNED ITS PLACE BY FINDING WHAT THE TOOLS COULD NOT.** The
lexical dedupe found ZERO repeated beats in 24 scripts. The panel, unprompted:

> *"Beat 5 largely restates the core message about being unconventional and
> captivating, which is already covered in beats 2 and 4."*

That is the defect, quoted, on the script this session had already flagged by eye
and failed twice to measure. **REPETITION is the most common biggest-flaw in the
best arm** — three of eight — and it is semantic, not lexical, which is why every
string attempt missed it.

**Second finding: 59–74% of supplied substance never reaches the script**, and
the transcript-only arm is the HIGHEST at 74% — it supplies denser material into
the same five beats. That is not automatically a defect: a five-beat script
cannot speak seven items, and over-supplying so the writer can CHOOSE is the
point of the cap. It does mean the remaining lever is which items are chosen,
not how many.

⚠️ **A FOURTH BROKEN METRIC WAS CAUGHT BEFORE IT WAS REPORTED.** The first
version of the unused count used Jaccard between an item and the whole
concatenated script; a long text dilutes the denominator, so it returned
"100% unused" for every arm — including scripts visibly quoting the item. The fix
is containment (what share of the ITEM's words appear in one line), not overlap.
Recorded because three of this session's four metric failures share one root:
a similarity measure applied to texts of very different lengths.

### G17. Repetition is the top defect, is not cheaply detectable, and does not respond to instruction

The panel named REPETITION the most common biggest-flaw. A dedicated judge over
all 24 scripts put a number on it: **16 of 24 scripts (67%) restate an earlier
beat**, 24 pairs in total. Per arm: hand pack 6/8, all sources 3/8,
transcript-only **7/8**.

⚠️ **THE BEST-GROUNDED ARM IS THE MOST REPETITIVE.** Denser material into the
same five beats yields more ways to say the same thing, not more things to say.

**Four detectors were tested against 24 labelled positives and 306 negatives:**

| detector | catches | false alarms |
| :--- | ---: | ---: |
| lexical Jaccard on prose, any threshold | **0 / 24** | 0 |
| word containment on prose (best) | 4 / 24 | 22 / 306 |
| **embeddings**, cosine ≥ 0.70 | 17 / 24 | **57 / 306** |
| embeddings, cosine ≥ 0.75 | 6 / 24 | 16 / 306 |
| lexical containment on the BEAT PLAN | 3 / 16 | 3 / 8 |

⚖️ **NO THRESHOLD SEPARATES THEM, AND THE REASON IS STRUCTURAL.** Every beat in
one script is about the same subject, so all pairs sit close together in meaning.
Similarity cannot tell "restates the point" from "same topic, new point" — which
is precisely the distinction the judge prompt has to spell out in a sentence.
**This defect is not decidable by any cheap measure.**

**Then a prompt rule was tried and measured.** A beat-plan instruction naming the
fault, quoting the 67%, and telling the writer to check each beat against the
ones above it:

|  | scripts with a repeat | pairs |
| :--- | ---: | ---: |
| transcript-only, before | 7 / 8 | 7 |
| transcript-only, after the rule | **7 / 8** | **7** |

⚠️ **IDENTICAL. THE RULE WAS EXACTLY INERT**, so it was reverted rather than
shipped — an instruction that changes nothing is prompt bloat that costs tokens
on every generation and reads, to the next person, like a solved problem.

That is consistent with everything else measured this week: every improvement
came from changing WHAT REACHES the writer, never from telling the writer to try
harder. The remaining options are a model-based repair pass at generation time
(the judge finds these reliably, so a repair could too, at one extra call per
generation) or accepting the defect. Both are decisions with a cost, and neither
is made here.

`scripts/qa/detect-repetition.mjs` ships as the instrument, with its labelled
output kept so the next detector can be tested against real positives rather
than invented ones.

### G18. Conditional repair: built, routed, judged — and it is a coin flip at n=10

The decision was not to ship a mandatory repair pass. 67% of scripts contain a
soft beat and 6–8 of 8 are judged publishable, so "soft beat detected" is not
"script materially harmed", and a call per generation to polish what creators
already accept is an optimisation that improves the architecture and degrades the
unit economics. The detector becomes a ROUTING signal instead.

**Classification first, because a branch that never fires is not worth building.**
32 scripts, 173 beats, 36 soft beats (21% of all beats):

| axis | distribution |
| :--- | :--- |
| severity | **MEDIUM ×36** — LOW 0, HIGH 0 |
| position | BODY 29 · PAYOFF 5 · CTA 1 · SETUP 1 · **HOOK 0** |
| function | SUBSTANCE 26 · SUMMARY 6 · CLAIM 4 |

⚠️ **TWO OF THE PROPOSED BRANCHES CANNOT FIRE.** `severity` is
non-discriminating as implemented — every soft beat came back MEDIUM, so
"HIGH → repair" is dead. And **no soft beat ever landed in the HOOK**: it gets the
best material and the most attention, so the most aggressive branch is driven
entirely by PAYOFF. A policy written against axes that do not vary is a policy
that has not been tested.

What survived routed **10 of 32 scripts (31%)** to repair; the other 22 ship as
written. Repair was span-level — the line, its two neighbours, its planned
purpose and its own evidence, three candidates, one chosen — never
whole-script regeneration. 14 lines rewritten, 14 calls.

**Then the only test that pays: blind preference, repaired against original.**

| | |
| :--- | ---: |
| repaired preferred | **5** |
| original preferred | **5** |
| tie | 0 |
| repair judged less natural | 0 |

⚖️ **A COIN FLIP.** By trigger: high-value position alone 2–0, primary substance
**2–5**, the combinations 1–2. The only branch that looks good has n=2, which is
two coin flips landing heads and not a finding.

⚠️ **AND THE HIGHEST-VOLUME TRIGGER LOSES.** `primary substance` routed five
scripts and the original won three of them — repairing the beat that carries a
container makes it worse more often than better, which is the opposite of the
intuition that built the branch.

**So no repair ships, conditional or otherwise.** 5–5 is not evidence of harm
either; it is absence of evidence, at a sample far too small to route on. The one
branch worth more data is PAYOFF softness, and answering it properly needs on the
order of thirty payoff cases rather than two.

The instruments ship: classifier, span repairer, and blind preference panel. The
labelled soft beats and the repaired/original pairs are kept, so the next attempt
starts from real cases.
