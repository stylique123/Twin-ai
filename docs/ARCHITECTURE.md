# TwinAI — how the system actually fits together

This document exists because of a specific complaint, and it is worth quoting
because it is the acceptance criterion:

> "I don't want a system which exists but does not connect, overlaps, calls
> something else, remains turned off and not working as a system."

So this is not a feature list. Every section answers the same four questions
about one seam:

1. **Who writes the fact**, and is that the only writer?
2. **Who reads it**, and does the reader agree with the writer about the shape?
3. **What turns it on**, and what does the system do when that thing is unset?
4. **Where does it break**, and does the break say so?

Anything asserted here is checked against the tree, not remembered. Where a
claim is enforced by a test or a migration, the file is named — a claim nothing
enforces is marked **(unenforced)** so it can be told apart from one that is.

---

## 1. The four processes

There are exactly four places code runs. Confusing them is the source of most
"why is this off in production" questions.

| | What it is | Where it runs | Deployed by |
|---|---|---|---|
| **Web** | React/Vite SPA (`apps/web`) | Vercel | Vercel on push |
| **Shared** | `@twinai/shared` — types, contracts, the client API layer | *compiled into web*, not a service | n/a |
| **Edge** | Deno functions (`supabase/functions/*`) | Supabase | `.github/workflows/deploy-edge.yml` |
| **Worker** | Node process in the `twinai-worker` Docker container | **a VPS at 138.201.119.239** | `.github/workflows/deploy-worker.yml` |

**The worker is not on Render.** `docs/vps.md` still contains a stale line
saying otherwise; the workflow is the authority. Worker environment lives in
`/opt/twinai-worker.env` on that box and is applied by restarting the container.
Nothing reads it at build time, so a flag change needs
`docker restart twinai-worker` and nothing else.

`@twinai/shared` is the reason the web app and the contracts cannot drift: the
web app's `lib/api.ts` and `lib/types.ts` are two-line re-export shims
(`export * from '@twinai/shared'`). There is no second copy of a contract to
update.

### What the worker will do at all

`worker/src/jobs/index.ts` is the whole dispatch table:

```
ingest → transcribe          scrape_dna → TikTok DNA
build_voice                  validate_source / validate_clip
editor_v2 → the editor       purge_media → deletes bytes
```

A job type absent from that map is a job that will be claimed and then dropped.
`purge_media` is enqueued by a **database trigger**, not by application code —
which is deliberate, because it means every route to deleting a `media_asset`
purges its bytes, including routes written later by someone who never read this
file.

---

## 2. The editor pipeline, end to end

This is the path a recording takes. Each arrow is a real call, and the flag that
can stop it is named.

```
 Web: V2Capture records a take
   │
   │  source-asset (edge)  → mints an upload intent: server-chosen path,
   │                          short-lived token. The browser NEVER supplies a path.
   ▼
 media_assets(kind='source', status='uploading' → 'ready')
   │      ▲
   │      └── worker: validate_source probes the bytes and promotes to 'ready'
   │
   │  start-editor-v2 (edge)   ⟵ GATE: EDITOR_V2_START_ENABLED
   │                              unset = off = 503 `editor_not_available`
   ▼
 edit_projects(status='queued')  +  jobs(editor_v2)   ← created ATOMICALLY, one RPC
   │
   ▼
 worker: handleEditorV2 walks EDITOR_STAGES
   inspecting → transcribing → analyzing → directing
      → [awaiting_review]  ⟵ GATE: EDITOR_REVIEW_GATE_ENABLED
      → compiling          ⟵ GATE: EDITOR_RENDER_ENABLED
      → rendering          ⟵ GATE: EDITOR_RENDER_ENABLED
      → validating
      → completed  (+ output_asset_id, via editor_complete_output)
   │
   ▼
 Web: Result.tsx polls edit_projects, then calls editor-output (edge) for
      short-lived signed URLs. It never handles a storage path.
```

### The stage list exists twice, on purpose, and they are pinned together

`worker/src/jobs/editorPipeline.ts` declares `EDITOR_STAGES`; migration 0080's
`edit_projects_guard_stage` trigger declares the same order in SQL. The database
**rejects any transition the worker would not produce, and vice versa**. This is
not redundancy — it is the reason a worker deployed with a reordered pipeline
fails loudly on its first transition instead of writing a project into a state
no reader understands.

### `awaiting_review` is neither running nor finished

It is the one status that is a *person*, not a worker. `editorPipeline.ts`
documents the three places that must know:

- `stagesFrom()` returns **nothing** for it — and the handler must return rather
  than fall through, because an empty stage list otherwise reaches
  `finishProject('completed')` and marks a project done that was never rendered.
- the lost-project reconciler must not sweep it. Every other non-terminal project
  with no live job has a dead job; this one has a job that ended *on purpose*.
- the stage guard admits `directing → awaiting_review → compiling` **without**
  removing `directing → compiling`, so turning the gate off does not strand
  every project already past directing.

### The flags, and what "unset" means

Every one of these fails **closed**. Unset is off, and off is a defined product
state rather than an error.

| Flag | Lives in | Unset behaviour |
|---|---|---|
| `EDITOR_V2_START_ENABLED` | Supabase edge secrets | Start refuses with 503 `editor_not_available` |
| `EDITOR_RENDER_ENABLED` | `/opt/twinai-worker.env` | Compile and render are simulated; project reaches `completed` with **`output_asset_id` NULL** |
| `EDITOR_REVIEW_GATE_ENABLED` | `/opt/twinai-worker.env` | No review pause; `directing → compiling` directly |
| `EDITOR_DIRECTOR_ENABLED` | `/opt/twinai-worker.env` | `directing` is a simulated stage |

Note the second row, because it is the single most misread state in this system
and section 4 is entirely about it.

---

## 3. Who is allowed to write what

The rule throughout: **clients read via RLS and never write the facts the
pipeline owns.** Writes go through security-definer RPCs that check their own
preconditions, so a compromised client cannot construct a state by writing
fields in an order nobody validated.

Two mechanisms carry most of that weight, and both have drawn blood:

**Column-level GRANTs.** `brand_voices` revoked table-level `UPDATE` from
`authenticated` in 0002 and grants it back **one column at a time**. A new column
is therefore *unwritable by default*, and the failure is a bare `42501` naming
no column. This has cost real debugging three times — 0051 (`brand_kit`), 0053
(`scene_timeline`, which dead-ended the V2 flow *after* the creator had spent a
recreation), and it is why 0109 grants `pre_script_brief` in the same migration
that adds it. `briefPersistence.test.ts` asserts the grant line exists.

**CHECK constraints as shape contracts.** `is_pre_script_brief` (0109) refuses
unknown keys, empty strings, and a description of a product. A closed vocabulary
means a client cannot grow the brief by writing to it — which is how a designed
question set becomes "whatever a form posted".

That constraint's key list and the TypeScript `BRIEF_STORED_KEYS` are two lists
that must agree. `briefPersistence.test.ts` reads the key list back out of the
SQL and compares it to the TypeScript, in both directions, because a tenth
question added to one and not the other is either a production write that fails
a constraint or a key the database accepts and no reader understands.

---

## 4. Three-state discipline

**Unset is not false.** This appears everywhere, and every place it was
collapsed to two states was a bug that read correctly.

- **`forbiddenClaims`** has three states, not two: *we never asked*, *they left
  it blank*, *they said there are no restrictions*. A system that reads an empty
  box as permission has quietly decided a doctor may say anything. So: an absent
  key means unanswered, an empty string is **refused rather than stored**, and
  `"none"` is a real, storable answer that means something different.
- **Preflight** is four-state, not three — orientation and mic are measured;
  framing, lighting and reverb are `unmeasured` and draw as *"not checked"*
  rather than as a pass. `apps/web/src/lib/preflightSignals.ts` measures only
  what it can actually measure, and the panel never blocks record.
- **`completed` with `output_asset_id` NULL** is the scaffold state. The
  pipeline stopped; nothing was produced. `status === 'completed'` is a
  statement about the pipeline, **not** about there being something to watch.

That last one is now a named predicate rather than a conjunction each caller
writes out: `editProducedVideo(project)` and `editFinishedWithoutVideo(project)`
in `packages/shared/src/editor/contracts.ts`. Pinned by
`editor/__tests__/editReadiness.test.ts`, including that exactly one of them is
true for any completed project — if both could be false the card renders
permanently blank, and if both could be true it shows a player *and* "this
produced no video".

The reason it needed a name: written by hand, the check passes review, reads
correctly, and is wrong **only** on the runs that finished empty — which is the
population nobody has fixtures for.

---

## 5. Identity: which id crosses which boundary

A `generation`, an `edit_project`, a `media_asset` and a `post` are four
different things with four different uuids, and the bug this section exists for
shipped without a single failing test:

The review screen submitted successfully, then navigated to
`/result/<edit-project-uuid>` — a route that loads a **generation**. Result found
no generation with that id and rendered a missing plan. Nothing threw. Two
correct components disagreed about which id they were passing.

The fix is that `ReviewBundle` carries `generationId` explicitly, read from
`edit_projects.generation_id` — the project's **own immutable column** (0078
declares it NOT NULL), not a second lookup. Resolving it any other way (newest
project for the generation, latest by `created_at`) could return a different row
after a re-edit, landing the creator on a video they were not reviewing.
`reviewBundleIdentity.test.ts` asserts the column is in the SELECT list, not
merely that the field is populated.

**The general rule: a boundary that takes id X and hands back id Y must read Y
from X's own row.** Anything else is a second authority for one fact, resolved by
whichever reader was written last.

---

## 6. Cancellation and deadlines reach the actual work

`runMediaProcess` spawns ffmpeg in a **detached process group** and tears it down
`SIGTERM` → `SIGKILL` when its `CancelWatch` aborts. That machinery was correct;
the wire to it was missing.

The defect: the worker loop applied its hard timeout with `Promise.race`, which
settles the **job** and leaves the **handler** running. The ffmpeg it spawned
kept encoding — holding CPU, disk and the model — and finished into a project
already marked failed. On a single-worker box that is the next job's capacity,
spent on a result nobody reads, and the render could still write an output
*after* the failure was recorded.

The wire, in `worker/src/index.ts` and `worker/src/jobs/editorCancel.ts`:

```
deadline.abort()  →  job scope signal  →  every CancelWatch opened inside it
                                       →  runMediaProcess  →  the child dies
```

Three properties `job-deadline-aborts.test.ts` pins, each of which is a distinct
way to get this wrong:

- A watch opened **after** the deadline already fired starts **cancelled** —
  otherwise a later stage gets a fresh un-aborted watch and starts a new encode
  against a job that is already over.
- `watch.stop()` **unsubscribes**, so a finished stage is not resurrected by a
  later abort and listeners do not accumulate across a long job's stages.
- An aborted scope does **not** block the next job. Otherwise one timeout wedges
  the worker permanently, which is a worse failure than the one being fixed.

The scope is module-level, which is only correct because `main()` awaits one
`tick()` at a time. So it **throws** on a second open scope rather than silently
killing one job's render on another job's clock — a failure that would be
indistinguishable from a flaky encoder.

---

## 7. Deployment gates

### `staging-matrix-gate` is a commit status, not a check run

The distinction matters because it is why a PR sits pending with everything
green. `staging-matrix-gate.yml` posts a **commit status** that turns green only
when a `staging-integration` run succeeded **at the exact head SHA**.

The practical consequence: **pushing to the branch while the matrix is running
orphans the run.** The head moves, the finished run is for a SHA that is no
longer the head, and the status never posts. Merge-blocking work and matrix runs
must be serialised by hand. (This has happened once, to run #221.)

### `ci-bootstrap` only answers for the refs it is meant to

The OIDC credential-issuing function refuses anything that is not
`rebuild/editor-v2-*` or `main`, and `CI_BOOTSTRAP_DISABLED=1` kills it outright.

### `deploy-edge.yml` checks its own classification

A step compares the functions actually deployed against the ones this workflow
classifies, with `RETIRED="enqueue-autoedit"` named explicitly. Both halves of
the pipe are `|| true`: the step **reports** drift and does not fail the deploy
on it — this is a mirror, not a gate. **(unenforced by design)**

---

## 8. Where the seams are still open

Stated plainly, because a document that only describes what works is the thing
the opening quote was complaining about.

- **The editor v2 path has never completed a real run in production.** The
  legacy `autoedit` path did (17 jobs). Every claim in section 2 about the real
  render is a claim about code and staging runs, not production traffic.
- **`OutputBundle`** — the single biggest unlock, not built. Until it exists,
  what a finished edit *is* to a consumer is assembled at each call site.
- **Approval → posts binding** and **BrandTruthSnapshot's producer** are
  designed and unbuilt; the snapshot's *readers* exist, which means they read a
  thing nothing writes.
- **Consent and deletion** are partial: `purge_media` deletes bytes on the
  trigger path, but there is no user-facing deletion flow that exercises it.
- **Editor economics** (what a render costs, refused before it is spent) is not
  instrumented.
- **`docs/vps.md`** still says Render in at least one place. It is wrong.

---

## Appendix — the failure mode this document is guarding against

Three real examples from this tree, because the abstraction is less useful than
the pattern:

1. **A question asked and discarded.** Onboarding collected `workKind` and
   `forbiddenClaims`, wrote them to a `localStorage` draft, and persisted them
   nowhere — there was no column. Grepping the whole repository for `work_kind`
   returned nothing. *This is worse than not asking*: an unasked question leaves
   the creator knowing the system does not know; a question asked and dropped
   leaves them believing it does, and the belief is the dangerous half, because
   it is why they stop checking the output for the claim they told us never to
   make.

2. **Two components, both correct, disagreeing about an id.** Section 5. Nothing
   failed. Every unit test passed throughout.

3. **A fix reasoned from a symptom instead of from inputs.** A caption ordering
   failure was diagnosed twice by theory — a crossfade, then a boundary
   calculation — and shipped twice, and staging failed identically both times.
   The actual cause was a `pending.shift()` that ran before `flush()`, found only
   by pulling the real failing inputs out of staging Postgres and instrumenting
   the function. Both speculative changes were reverted. **The regression test
   written for them passed with them reverted, which was the signal.**

The habit that catches all three: **verify a fix by removing it and watching the
test fail.** A test that passes both ways is testing nothing.
