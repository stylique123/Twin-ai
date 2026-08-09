# TwinAI — the unified build plan

**One plan across both tracks.** Until now there were two: the editor's
`docs/twinai-master-build-plan.md` (Phases 9–13, ~2000 lines, largely built) and
the intelligence architecture (`docs/twinai-content-intelligence-system.md`,
largely unbuilt). They were never reconciled, and work was proceeding on both
from different sessions that could not see each other.

This file is the reconciliation and the running order. Read it first.

---

## 0. The finding that reorders everything

**A previous session died with four draft PRs open, and one of them contains the
single highest-value item on the intelligence roadmap.**

Session `017nAChr4nzTSXd77GTWgoJT` — the one whose branch was
`claude/camera-free-compile-phase-10` — left this behind:

| PR | Branch | Carries | State |
|---|---|---|---|
| **#294** | `feat/composer-one-position` | 🔥 **`workKind` + `workKindOther` wired into `generate-blueprint`** — the registry exemptions deleted in the same commit. Plus the Composer. | Draft, ~2500 lines, **based on stale main** |
| **#296** | `fix/product-evidence-nothing-to-sell` | The `promotes` narrowing on the product question, and why `productEvidence` is still dormant | Draft, ~1960 lines, stale base |
| **#300** | `feat/disfluency-detector` | Acoustic disfluency detection — *an ASR token is a reason to look, not evidence a filled pause happened* | Draft, ~6580 lines, stale base |
| **#306** | `claude/camera-free-compile-phase-10` | A comment-only correction to `0118` — the migration's own measurement was stale | Draft, 1 commit, current |

⚖️ **This is why the plan starts at step 0 and not step 2.** The build order I
wrote yesterday put "wire `workKind`" first because it is two lines and the
highest lever per hour. It is already written, tested and reviewed — it is just
not merged. Rebuilding it would be the exact failure this project keeps
catching itself in: **not checking what already exists before building it.**

`docs/twinai-content-intelligence-system.md` §28 step 2 is therefore
**"land #294"**, not "write the wiring."

---

## 1. Where each track actually stands

### Track A — the editor (Phases 9–13)

Measured from `docs/twinai-master-build-plan.md`'s own status log and the
production audit, not from memory.

| Phase | State |
|---|---|
| **9 — render truth layer** | ✅ COMPLETE (10/10) |
| **10 — stop guessing** | Provenance ✅ · forced alignment ✅ engine+wired+3 consumers · **onboarding questions 🟡 STARTED** · review gate ✅ backend complete, **screen built but never used by a human** · failure path ✅ COMPLETE |
| **11 — the take itself** | Capability flags ✅ (0103) · preflight ✅ built, was imported by nothing, now wired · script editing ✅ (item 8) |
| **12 — show the right thing** | Container resolution ✅ (item 12) · screen recording as clip type ✅ end to end (0106) · **clip placement ✅ but never confirmed on real media** |
| **12a — after the render** | Cover behind a button ✅ · generate-once ✅ · scheduling ✅ wired |
| **13 — don't all look the same** | Creative Transfer trust screen ✅ (item 16) |

**The one fact that matters more than all of the above:**

> **0 `media_assets`. 0 `edit_projects`. 0 `edit_plans`. 0 `edit_outputs`.**
> Against 34 profiles and 34 generations.
>
> Every gate this project has is a claim about the code. **None is a claim about
> a video.** No editor-v2 project has ever run in production.

One v2 `source` asset was opened at 13:13 UTC on 2026-08-09 and is still
`uploading` with no object behind it — the correction PR #306 exists to record.

⚖️ **So Track A is not "unfinished". It is unproven.** Those need opposite
treatments: unfinished work needs building, unproven work needs *running*. The
editor does not need more code before it needs one real recording.

### Track B — the intelligence layers

| Layer | State |
|---|---|
| Creator DNA | ✅ built and read (it is the ONLY layer with data — hence the defect) |
| User Intent (the 9 stored answers) | 4 read ✅ · 2 wired-but-unmerged in #294 🟡 · 3 unread 🔴 |
| Product DNA | 🔴 does not exist. Seed `PRODUCT_EVIDENCE_FORM` 🟨 exists, unimported |
| Reference DNA | ✅ transcripts + structure. Pixels 🔴 (nine rows honestly `unknown`) |
| Script Containers | 🟨 `creative_transfer_plans` — table, contract, validator. **No writer** |
| Creative Decision Plan | 🔴 |
| Director Plan | 🔴 |
| Gallery scoring | 🟡 built as far as data allows — **6 of 7 signals cannot be computed** |

---

## 2. ⚖️ The two tracks share one bottleneck, and it is not code

Track A is built and never run. Track B is specified and half-wired.

Both are blocked on the same thing: **nothing has ever completed end to end in
production.** `edit_projects` is 0. Until one real recording goes through, every
improvement to either track is tuning a flow that has never finished once, and
each new layer is one more untested thing between the creator and a video.

That is why item 1 below is not a code change.

---

## 3. The running order

### ▸ Step 0 — Recover the dead session's work *(hours, highest value/hour in the plan)*

Four PRs, in this order. Each is rebase → verify → un-draft → merge.

1. **#306** first — one comment-only commit, current base, no risk. Clears the
   board.
2. **#294** — carries `workKind` + `workKindOther`. **This is intelligence step
   2.** Base is stale (pre-#297/#304/#305), so rebase onto current `main`,
   re-run `check_brief_consumers.mjs` (it verifies both directions and will fail
   if the registry and the code disagree after the rebase), then merge.
3. **#296** — `promotes` narrowing. Land after #294; they touch the same brief.
4. **#300** — disfluency detector. Independent of the other three; land last
   because it is the largest and touches the worker.

⚖️ **Verify each rather than trusting its own PR body.** These were written
against a `main` that has since gained the takes-bucket lock (#297), blueprint
idempotency (#304/0119) and the reference hard stop (#307). A rebase that
silently drops a guard is exactly the failure mode this repo builds guards for.

### ▸ Step 1 — ✅ Reference `mode: 'pattern'` hard stop *(SHIPPED — PR #307)*

Refuses before spend on all five paths. Backstop above `spend_credits`, below
the replay check.

### ▸ Step 2 — **One real recording through the product** *(NOT a code change)*

Record twenty seconds. Press the button. Let it compile.

⚖️ This is item 2 and not item 12 because it is the only step that converts
Track A from *unproven* to *proven or broken*, and either answer is worth more
than the next five code changes. `edit_projects` becomes 1. Whatever breaks
becomes the real backlog, replacing a guessed one.

Everything below this line is written on the assumption that it will surface
defects that reorder the rest. **That is the point.**

### ▸ Step 3 — Wire `goal` *(hours)*

`generate-blueprint` takes goal from the voice profile, then `profiles.dna`,
then the literal string `'turn attention into trust'` — three authorities, none
of them the creator's answer. The creator's answer must win. Delete its
`unwiredReason` in the same PR.

### ▸ Step 4 — Move Q1–Q3 into the scan; chunk the confirm screen *(Phase 10 item 2)*

**This is where the two tracks meet.** It is simultaneously:
- intelligence §6 (question placement), and
- Phase 10 item 2, which the master plan lists as **STARTED** — the contract
  (`preScriptBrief.ts`) is built, `dnaProvenance.ts` is built, the OFFER and the
  CLAIMS conditional are wired. What remains is *"the full five-question
  redesign — a product-design pass, not a contract gap."*

So this step is the product-design pass the editor track already scoped and
declared blocked, done with the intelligence track's five-question spec.

⚖️ It must precede Product DNA, because steps 3 and 0 wire answers that are
currently *often blank* — they are asked below the fold, and in the real run
every question below the fold came back unanswered. Wiring a field nobody fills
in produces no visible change, and an invisible change gets reverted by someone
who thinks it did nothing.

### ▸ Step 5 — Product DNA: SaaS subtype, end to end *(weeks — the substance layer)*

Subtype routing (exclusive) + URL ingestion + the restrictions block. **SaaS
only**, because it needs a URL and no image pipeline, so it proves the whole
chain — capture → store → route → reach the prompt → change the script — at the
lowest infrastructure cost. Start from 🟨 `PRODUCT_EVIDENCE_FORM`.

### ▸ Step 6 — Give `creative_transfer_plans` its writer

Table, contract and semantic validator already exist and are careful. This is a
writer, not a build.

### ▸ Step 7 — Creative Decision Plan as a frozen object

Depends on 0, 3, 5.

### ▸ Step 8 — Director Plan: setups, framing, pattern interrupts

Depends on 7. Consumes the capability flags (0103) that Phase 11 built and
declared unconsumed, and Product DNA's *available while filming* / *can be
shown* facts.

⚖️ Achievable direction, never assumed inventory. *"Clean uncluttered
background, eye level, because this is an authority explainer"* — never *"the
walnut chair beside your lamp."*

### ▸ Step 9 — Visual reference analysis

The nine NOT OBSERVED rows. Largest step, and the only one needing new
infrastructure. Also unblocks the reference half of the gallery's production-mode
match, which is currently blocked on a missing measurement rather than missing
wiring.

### ▸ Step 10 — Gallery scoring incl. container fillability

Depends on 5 and 6. Six of seven signals are currently uncomputable; steps 5, 6
and 9 are what supply them. **All 6,608 gallery cards are unassessed** and
correctly read as `NULL` rather than `false` — a writer for 0106's assessment
columns is part of this step.

### ▸ Step 11 — Remaining Product DNA subtypes + the Product Library surface

Physical → Service → Affiliate, in that order.

### ▸ Step 12 — Prove the clip path on real media

*"No real-media run has confirmed a clip appears at the intended scene in a
rendered file."* After step 2 there will be footage to prove it with.

---

## 4. How I work each step

1. **Verify before building.** Every step begins by checking the claim against
   the repo, not the document. This plan has already caught itself twice —
   `dnaProvenance.ts` was nearly rebuilt, and step 2 turned out to be sitting in
   an unmerged PR.
2. **One shippable PR per step**, leaving the product working.
3. **The guard is the definition of done.** `check_brief_consumers.mjs` fails
   the build when a key is wired without updating the registry, in both
   directions.
4. **Never add a question without a reader in the same PR.**
5. **Status is split five ways, not two** — done/verified, merged/deploy
   unverified, half-done, not started, reported-but-not-reproduced. "Done" must
   never quietly cover "merged but nobody checked it deployed."
6. **Ask before touching `verify-prod-gate.yml`.** It asserts
   `EDITOR_V2_START_ENABLED` is absent from production, which became false on
   05 Aug. Rewriting a security assertion is the owner's call.

---

## 5. What this turns into

When Track B lands, the script stops sounding like the creator and saying
nothing, and starts sounding like the creator **and knowing what they sell** —
their real product, real features, and what they are actually allowed to claim.

When Track A is proven, the shot instructions become things they can do in the
room they are actually in, and the edit happens without them touching a timeline.

**Neither is true today.** Everything shipped in the last three sessions —
billing, provenance, a security hole, a dead end — was infrastructure. None of
it improved a single script, and no edit has ever completed in production.

Step 2 is what changes that, and it costs twenty seconds of recording.
