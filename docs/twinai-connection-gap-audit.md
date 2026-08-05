# Connection-gap audit — what is built but does not connect

**Date:** 2026-08-05 · **Scope:** the whole repository · **Status:** findings only, nothing fixed

The question this answers: *where does something exist — a table, a contract, a
module, a column — with no producer, no consumer, or no path between them?*

A gap here is not a bug. Every one of these runs correctly in isolation and is
tested. The defect is that **nothing reaches them**, and the cost is that they
read as done. A reader finding `creative_transfer_plans` with a semantic
validator and 61 tests will reasonably assume something writes one.

## Method

Producers and consumers were counted mechanically, not from memory:

- every `create table` in `supabase/migrations/`, checked against `from('…')`
  reads in the app and shared layers, and identifier references in `worker/src`
  and `supabase/functions/`
- every edge function, checked against `invoke('…')` call sites
- the worker's handler registry against the `jobs.type` values anything inserts
- named columns, checked for non-test references

Test files were excluded from the consumer count deliberately. A test proves a
module works; it does not prove the product uses it.

---

## A. ORPHANED TABLES — no reader and no writer anywhere

Eight tables have no reference in the app, the worker, or any edge function.

### A1. The Track C selective-transfer lineage (0095) — four tables

`brand_truth_snapshots` · `campaign_intents` · `reference_evidence_sets` ·
`creative_transfer_plans`

**This is the largest gap in the repository.** The migration creates four
tables with RLS, triggers and cross-table integrity checks. `packages/shared/`
carries `brandTruth.ts`, `campaignIntent.ts`, `referenceEvidence.ts` and
`creativeTransferPlan.ts` — roughly 2,000 lines with a full semantic validator
that refuses uncited evidence, unknown-backed transfers and n=1 correlations.
`scripts/db-tests/gate-tc-lineage/` proves the SQL against real Postgres.

**Nothing writes a row to any of them, and nothing reads one.**

The contract document (`docs/twinai-selective-transfer-reasoning-contract.md`
§7) specifies "one bounded planner call" as the producer. That call does not
exist. There is no `transferPlan` job in the worker, no planner edge function,
and no client path.

*Consequence:* the whole selective-transfer reasoning layer — the thing meant to
decide what may be copied from a reference and what may not — is inert. The
blueprint generator still builds directly from the reference plus DNA, with none
of the layer policy, prohibited-transfer list or authority hierarchy applied.

*What it needs:* one planner that produces a `CreativeTransferPlanV1`, and
`generate-blueprint` changed to consume only that plan plus cited evidence.
That is the largest single piece of unbuilt work in the repository, and it is
specified in detail rather than open.

*Partial mitigation already in place:* `creativeTransferRows.ts` reads the
evidence taxonomy for the §1.1 Creative Transfer screen and works from the
blueprint instead, precisely because no plan exists. That was a deliberate
workaround, documented at the top of that file.

### A2. `discovery_dispatch_log`

Referenced nowhere in the repository, including `discovery/`. The discovery
scraper is a separate Python service; either it writes this table from outside
this tree (in which case the reference is external and this is a false positive
worth confirming), or the log is dead.

*Needs:* confirm against the deployed discovery service before touching.

### A3. `workspace_invites`

No reference anywhere. `JoinWorkspace.tsx` exists as a page, so either invites
are handled through a different table/RPC or the invite flow is half-wired.

*Needs:* trace `JoinWorkspace.tsx` to whatever it actually reads.

### A4. `templates`

No reference anywhere. Likely a retired concept that kept its table.

*Needs:* confirm dead, then a dropping migration — or a note recording why it
stays.

*(`referrals` appeared in the first pass and is a FALSE POSITIVE — the app
reaches it via `getReferralCode`, which uses an RPC rather than a table read.
Recorded here so the next audit does not re-flag it.)*

---

## B. WRITTEN BUT NEVER READ — columns with a producer and no consumer

### B1. `media_assets.clip_label` (0106)

**Zero non-test references.** The column exists, `editor_create_clip_asset`
writes it, and nothing reads it. This is the name-matching key for Phase 12
item 11's declared clips.

*Known and expected* — PR #283 ships the clip server half deliberately
unconsumed, and 0107 is not applied to production for exactly this reason.
Listed so it is not mistaken for an oversight.

### B2. `gallery_items.requires_filming_objects` / `requires_screen_recording` (0106)

Referenced in 2 files — `galleryRank.ts` reads them and `Gallery.tsx` passes
them through. **But nothing WRITES them.** All 6,608 production rows are NULL.

The intended writer is the discovery scraper (service-role), which has no
concept of them.

*Consequence:* §7a's production-mode match is correct, wired, and permanently
`not_checked` in practice. It will stay that way until the scraper assesses
cards.

*Needs:* an assessment step in `discovery/run.py`, or a backfill pass. Note the
0106 constraint requires `requirements_source` ('human' | 'model') alongside any
assessment — a writer cannot set one without saying where it came from.

---

## C. ASKED FOR BY NOTHING — flags and questions with no entry point

### C1. `can_record_screen` is never asked

Confirmed by grep across `Onboarding.tsx` and `preScriptBrief.ts`: **no
onboarding question, no settings toggle, no screen sets this flag.**

0103 shipped all three capability flags as storable, and Phase 10 item 2 wired
only the offer and the claims conditional. So:

- `can_record_screen` — never asked. Any consumer gated on `isExplicitlyTrue`
  is invisible to 100% of users.
- `can_film_objects` — never asked. §7a's production-mode match reads it and
  will therefore report `not_checked` on the creator side for everyone.
- `needs_approval` — never asked, and has no consumer either.

*Consequence:* the capability-flag system is complete on both the storage and
resolution sides and has **no input**. This is the smallest, highest-leverage
gap in the audit: one onboarding question unblocks a signal that is otherwise
fully built.

*Needs:* questions in the onboarding brief. `preScriptBrief.ts` already has the
question-set contract to hang them on. The DNA's observed `formats` can SEED the
answer as a suggestion, but §8a.2's observed-is-not-stated rule means it cannot
be the answer.

### C2. `dna_claims` has a reader and no writer

`listDnaClaims()` reads the table; **nothing inserts.** By design the table is
service-role write only (a client that could write one could put a sentence in
the product's mouth), so the writer must be a worker or edge function. Neither
exists.

*Consequence:* the only claim a creator ever sees is the Dashboard's format
insight, computed client-side and never persisted. §7b's five claim types are
enforced in SQL and unused.

*Needs:* a producer — most naturally a periodic job over
`post_outcome_observations` once that log has data.

---

## D. NO PATH TO THE OUTPUT — built, connected, and dropped at the end

### D1. The renderer cannot composite a second video source

`EditPlan.identity.sourceAssetId` is **singular**, and `ffmpegGraph.ts` builds
every filter chain from input `0:v` / `0:a`.

*Consequence:* screen clips (0106/0107), any b-roll footage, and any
picture-in-picture or split-screen treatment are **not expressible in the render
pipeline**. Footage can be captured and stored correctly and will be dropped.

This blocks Phase 12 items 11 and 13 entirely, and it is the reason PR #283
ships the server half alone.

*Needs:* a second source in the EditPlan contract, a second input in the graph,
and a decision on the composition model (cutaway vs overlay). This is an editor
change, not a wiring change.

### D2. `alignment` is computed and not consumed

`analysis_components.json` records `"consumedByDirector": false` for the
alignment component, and a CI guard fails if any site disagrees.

This is the **model gap-declaration in the repository** — the state is declared,
machine-checked, and cannot silently drift. Listed here as the positive example
rather than as a defect: every other gap in this document would be less
dangerous if it were recorded this way.

*Needs:* per the plan, false starts need an `alignment-2` schema bump (the
component records `insertionCount` only, and a count cannot distinguish a
restart from an ad-lib), and the hook boundary needs a director-eval run.

---

## E. UNCALLED SURFACE

### E1. `billing-webhook` is never invoked from this repository

Expected — a payment provider calls it directly. **False positive**, recorded so
it is not re-flagged.

### E2. `autoedit` job type

Appears in 12 places with **no handler in the worker registry**. This is
intentional: 0073 blocks new autoedit jobs and the legacy editor was removed.
The references are the block itself plus historical migrations.

*Needs:* nothing. Recorded to close the question.

---

## F. BUILT BUT UNSEEN BY A HUMAN

Not gaps in wiring — gaps in *verification*. Each is fully connected and has
never been used by a person:

- **The review screen** (`V2EditReview.tsx`) — §4.8's claim is that editing the
  words reads as editing the video. Nothing in this repository tests that.
- **The script editor** — never used on a phone.
- **The preflight contract** (`preflight.ts`, 337 lines, tested) — has **no
  surface at all**. It is a complete checker with no signal source; wiring it
  needs a live camera preview computing orientation, framing, luminance and mic
  level.
- **First-frame selection** — needs canvas access to a signed URL; a tainted
  canvas would fail, and that cannot be verified from a headless environment.

---

## Ranked by leverage

| # | Gap | Cost to close | What it unblocks |
|---|---|---|---|
| 1 | **Capability questions never asked** (C1) | Small — one onboarding step | §7a's creator half, and every future flag consumer |
| 2 | **Gallery requirements never written** (B2) | Small — a scraper pass | §7a's reference half; the signal becomes live |
| 3 | **Preflight has no surface** (F) | Medium — a camera preview | The panel's #1 named gap |
| 4 | **Second video source** (D1) | Large — editor change | Phase 12 items 11 and 13; all b-roll |
| 5 | **Transfer planner** (A1) | Largest — a bounded model call + generator rewrite | The entire selective-transfer layer, ~2,000 lines currently inert |
| 6 | **`dna_claims` writer** (C2) | Medium — needs the log to have data first | §7b's claims surface |
| 7 | **Orphan tables** (A2–A4) | Small — confirm and drop or document | Nothing; removes false signal |

## The pattern worth naming

Six of these follow one shape: **a contract was built to a high standard, with
tests and often a database gate, and the thing that would feed it was left for
later.** That is not carelessness — the contract-first order is deliberate and
it is why the gaps are cheap to close rather than open design questions.

The failure mode is that a completed contract is indistinguishable from a
completed feature at a glance. `analysis_components.json` (D2) is the only place
this repository solves that: the gap is declared in a machine-checked file, and
CI fails if code and declaration disagree.

**The single highest-value structural change suggested by this audit is
extending that pattern** — a declared-consumers registry, CI-checked, covering
the capability flags, the gallery requirements, `dna_claims` and the transfer
plan. `CAPABILITY_CONSUMERS_BUILT` already does it for one of the four, and it
worked: it failed the moment a consumer landed, exactly as its comment promised.
