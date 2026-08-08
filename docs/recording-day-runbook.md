# Recording day — runbook and session handoff

Written 2026-08-08, at the end of the session that landed PR #291 and #292.
The next thing that happens to this product is a **real recording through
editor v2 in production**, and that has never happened. This document exists so
whoever is at the keyboard when it does — a new session, the other session, or a
person — does not have to reconstruct any of the below.

Times in this document are UTC. Islamabad is UTC+5.

---

## 1. Where things stand

### Merged

- **PR #291** — `3c467581`. Pins `jsr:@supabase/supabase-js@2.112.2` in all 17
  edge functions, plus `check_edge_dependency_pins.mjs`. Merged on a green
  `staging-matrix-gate` at the exact head. Merging fired `deploy-edge.yml` and
  `deploy-worker.yml`.

- **PR #292** — head `c8d63ee`, 11 commits. All 9 `pr-checks` jobs green;
  waiting only on `staging-matrix-gate`, which is running at that exact head.
  Everything below about output, approval, publish, deletion, attribution and
  brand truth is in this PR.

### Applied to production and VERIFIED BY EXERCISING, not by watching apply

| Migration | What | How it was proven |
|---|---|---|
| 0110 | `generations.reference_analysis`, server-owned | guard accepts `real`/`pattern`/`none`, refuses the rest |
| 0111 | approval binds the output it approved | approve + unapprove + re-approve, all four paths |
| 0112 | a post may only bind a render of its own generation | 7 cases incl. both FK-cascade paths |
| 0113 | `post_attributions` — UTMs, promo codes, CRM refs | 9 cases incl. the repoint refusal |
| 0114 | `delete_generation` — deleting a video deletes the footage | 11 cases, in a rollback |
| 0115 | owner may set their own approval | approve/unapprove/re-approve/unknown-id |

**The database is ahead of the code.** These are live in production now; the
code that uses them ships when #292 merges.

---

## 2. When the recording arrives

### Before recording — two flags

Editor v2 is gated OFF in production. Both must be on:

- `EDITOR_V2_START_ENABLED` — Supabase edge secrets.
- `EDITOR_RENDER_ENABLED` — `/opt/twinai-worker.env` on the VPS
  (`138.201.119.239`), applied by `docker restart twinai-worker`.

### What one recording actually settles

Production has **zero** completed editor-v2 projects. Everything the open-items
ledger marks proven about the real renderer is a claim **about staging**. One
recording converts the following from untested to tested:

1. **The whole v2 pipeline in production** — capture → analyze → director →
   compile → render → complete.
2. **`delete_generation` against representative data.** This is the sharpest
   one. Its first version was WRONG — it deleted `media_assets` while
   `generations.source_asset_id` still pointed at one, which raises 23503
   (`generations_source_asset_id_fkey`). It passed a production test anyway,
   **because no generation in production has a `source_asset_id`**. The fixture
   could not be representative of a system that has never run. Fixed and
   re-proven both ways, but the first real recording is the first honest test.
3. **`OutputBundle`'s `ready` variant** with real bytes, and `Result.tsx`'s
   player.
4. **The approval binding** against a real `output_asset_id` — `approvalState`
   returning `current` rather than `unbound`.
5. **`renderCost`** with real stage timings and real director tokens.

### Watch these while it runs

- `edit_events` for the stage sequence; a stall is usually a missing migration
  on the environment, which is what `check_staging_migration_coverage.mjs`
  exists to prevent on staging.
- `jobs` where `type = 'purge_media'` — only relevant if you then delete the
  video.
- The worker container logs on the VPS.

### After it completes, run these

```sql
-- Did it produce a video, and is the row coherent?
select ep.id, ep.status, ep.output_asset_id, eo.state, eo.measured_duration_ms
  from edit_projects ep
  left join edit_outputs eo on eo.edit_project_id = ep.id and eo.kind = 'video'
 where ep.status = 'completed'
 order by ep.completed_at desc limit 5;

-- The case that hid a real bug: a generation that points at its source.
select count(*) from generations where source_asset_id is not null;
```

Then **delete one test video through the UI** and confirm two things: the
`media_assets` rows are gone, and `jobs` gained `purge_media` entries naming the
right bucket and path. That is the first end-to-end proof that deletion deletes.

---

## 3. What is left, by owner

### Blocked only on the recording

- **C7 / D4 — editor v2 usage is zero.** The single largest unknown.
- **C6's cost gate.** `renderCost` measures what is already recorded and
  deliberately computes NO total, because VPS compute-seconds and egress are
  recorded nowhere. Instrumenting them needs a render to instrument.

### Blocked on a boundary, not on effort

- **C3's last step.** `supabase/functions/brand-truth` exists and works;
  `ensureBrandTruthSnapshot` is exported. Nothing CALLS it yet, because the
  natural call site is inside `generate-blueprint`, which the other session
  owns. This is a two-line change once that boundary allows it.
- **C5 consent.** Deletion is built. The consent RECORD is not, deliberately: a
  consent table with no writer is another reader-with-no-writer, which is the
  family of defect this whole session was spent removing. It needs the moment
  consent is actually given — the recorder — which is a UI change that cannot be
  verified without a recording.

### On the operator

1. **Rotate the Gemini key.** It was pasted in plaintext in a session transcript
   and is still live. https://aistudio.google.com/apikey, then
   `/opt/twinai-worker.env` + `docker restart twinai-worker`, then check the
   Supabase edge secrets — `generate-blueprint` and `generate-thumbnail` both
   read `GEMINI_API_KEY`.
2. **Delete `rebuild/editor-v2-phase12-item13` — but only after #292 merges.**
   It is the only thing that triggers the staging matrix. Deleting it earlier
   leaves no way to turn `staging-matrix-gate` green.

### The other session

Items 7 and 8, audit Gates 1–4, roadmap step 5, and `feat/brief-consumer-guard`
(which will fail any PR storing a brief answer nothing reads; it reported 5 of 9
unread). Untouched here: `preScriptBrief.ts`, the `generate-blueprint` prompt
block, `creativeTransferRows.ts`, `Onboarding.tsx`, the create screen's
brand/tone/fidelity inputs, `brief_consumers.json`.

---

## 4. Things that cost hours and should not cost them again

**A fixture is not representative until the system has run.** The
`delete_generation` bug above is the canonical case. When production has no data
of a kind, a test against production proves nothing about that kind. Build the
fixture to include the field, not to match what happens to be there.

**A migration applying is not a migration working.** 0111 applied cleanly and
the function was created cleanly, and the first CALL raised `record "proj" is
not assigned yet` — a plpgsql record filled only inside one branch has no fields
to reference in the other, and the surrounding `case` does not save it. That
path is what "request changes" uses. Call every function you write.

**An ownership guard keyed to a role NAME changes meaning with the
connection.** `current_user <> 'service_role'` refused connections arriving as
`postgres` — which is what the dashboard and the migration runner use. The rule
that actually holds is `auth.uid() is not null and owner <> auth.uid()`:
a signed-in caller must own the row, and a null uid means no end user is asking.
Both `delete_generation` and `set_generation_approval` use exactly this.

**`staging-matrix-gate` is a commit status, not a check run.** It goes green
only for a `staging-integration` success at the EXACT head SHA. Pushing during a
run orphans it. The mirror branch `rebuild/editor-v2-phase12-item13` is how a
head gets a matrix; `workflow_dispatch` against it also works and is what
unjammed a stuck queue on 2026-08-07 when cancel returned 409.

**`pr-checks.yml` has no `workflow_dispatch`.** When its `pull_request` event
was lost during a GitHub outage, the only way to re-fire it was to close and
reopen the PR. Worth adding a dispatch trigger when the tree is calm — a
merge-gating workflow whose only trigger is an unreplayable event is a workflow
you cannot recover.

**Verify a fix by removing it and watching the test fail.** Used on every guard
this session. It is the only thing that distinguishes a test from decoration.

---

## 5. The guards now in the tree

Each has a `--selftest` and runs in `pr-checks.yml`:

| Guard | Refuses |
|---|---|
| `check_staging_migration_coverage.mjs` | a migration newer than the matrix's newest, neither applied nor excluded with a reason |
| `check_brand_truth_parity.mjs` | the edge copy of the brand-truth projection drifting from the shared one |
| `check_edge_dependency_pins.mjs` | a floating version in any edge import |
| `check_row_type_drift.mjs` | a column stored and absent from its TS interface, or vice versa, without a stated reason |
| `check_shadowed_globals.mjs` | a module that shadows a constructor and then constructs it |
| `check_icon_button_labels.mjs` | an icon-only button that does not say what it does |

The migration-coverage one is the load-bearing addition: the matrix list had
fallen behind three times, and every time the symptom was a harness timeout that
looked nothing like a missing migration.
