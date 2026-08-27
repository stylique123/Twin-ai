# TwinAI — Unblock Instructions

_Source: uploaded PDF, committed verbatim (text-extracted). Resolves the previously-missing-PDF blocker, corrects two audit findings (G3, G8 pt.2), and gives the build order for the 15-fix loop._

---

TwinAI — Unblock Instructions
Hand this file to the engineering session. It answers the four open questions, corrects
two things the previous audits got wrong, and gives a build order with the prerequisite
for each item stated explicitly.
0. Read this first: the missing-PDF question is answered
The routine referencing “Deep Audit + Fix Specs” PDFs and a fix-numbering scheme is
referencing documents that were produced outside this repository. They were never
committed, so three searches finding nothing is the correct result, not a failed search. You
were right to refuse to build against them.
The resolution, in order:
1. The audit documents are being committed to docs/audits/. Once they land, every
“fix #N” reference resolves and the numbering scheme becomes real. Until the commit
lands, treat the routine as paused.
2. Where a routine’s own text fully specifies a fix, that text IS the spec — build from it.
A rule like “CTA/Payoff beats may never carry substance: needs_user, with a
deterministic fallback derived from goal + offer” is complete on its face; it names the
condition, the repair, and the source of the fallback. You do not need the document to
build that.
3. The boundary, and it is the only one: if a fix’s text names a threshold, a schema field
name, a metric, or a rollout decision you cannot derive from the text alone, that specific
fix waits. Do not infer a threshold. Do not invent a field name that other code will have to
match.
1. Corrections to the audits — you were right, they were wrong
1.1 G3 (brand truth) — your finding supersedes the audit’s instruction
The audit said “wire ensureBrandTruthSnapshot into generate-blueprint, it’s a one-call fix.”
You checked further and found creative_transfer_plans has zero writers anywhere in
the codebase. That is correct and it changes the item completely.

Wiring the producer alone would create a snapshot that nothing reads — the exact “written
but unread” defect the ledger documents nine times, and three of those nine were
introduced by the fixes for the others. Building it as instructed would have added a tenth.
The item is now a decision, and the decision has been made: wire the whole chain, not
the producer alone. Scope:
generate-blueprint calls ensureBrandTruthSnapshot after the brand/voice read,
before prompt assembly. Fail-open: a failure logs and proceeds. A lineage feature must
never cost a creator their script.
The returned {id, sha256} is carried onto the generation row (one column pair).
A creative transfer plan is actually written per generation — this is the missing
writer, and it is the real work. The plan’s brandTruthSnapshotId / brandTruthSha256 are
populated from step 1, which is what finally allows creativeTransferPlan’s mismatch
refusal to fire for the first time.
A guard asserting the call exists: delete the call, the test fails (mutation-style, per house
rule).
If, on inspection, the transfer-plan consumer turns out to be genuinely dead weight
rather than dormant — say so and propose deleting both halves instead. A dead limb
costs maintenance; a documented deletion is a legitimate outcome of this item.
Estimated two days, not one call. Scope it that way.
1.2 G8 part 2 — “ask queue” was the audit’s vocabulary, not a real module
There is no module named “ask queue.” The audit was describing, imprecisely, this cluster:
packages/shared/src/questionRegistry.ts — the layer/authority registry,
questionsToAsk(context, layer), with PRODUCT_DNA questions already defined and
gated by askWhen
packages/shared/src/productQuestions.ts
packages/shared/src/creatorQuestions.ts
The actual task, restated so it is answerable: the registry exists and enforces good rules
(one question owns one fact, every question names a downstream consumer, no consumer
means the question is deleted). Determine whether the screens actually consult it, or
whether onboarding / DNA review / product capture still ask their own separately-worded
versions. If the screens don’t consult it, the registry is itself a module with no caller — the
same defect class as G3, one level up.

Why this matters more than it looks: product_entities holds zero rows in production.
Every generation therefore takes the unrecordedProduct branch, and the entire product-
DNA permission system — claim entitlement, showability, scene guidance, community map
— is correct code that never runs. The registry being consulted (or not) is the difference
between that table filling up and staying empty.
2. The four items that remain deferred — correctly — with their
exact prerequisites
2.1 G4 (citation-support / entailment check) — deferral upheld
Your reasoning is right: an NLI-style check without a labeled eval set, and without a block-
vs-telemetry decision, ships a defect behind green tests. Both prerequisites are now
decided:
Rollout decision: telemetry-only, permanently, until measured. It never blocks a
script. Not in v1, not behind a flag that could be flipped casually. A false positive here
silently destroys legitimate work.
The eval set is buildable from what you already have. Every beat in production
carries its declared source. Ship a script in scripts/qa/ that extracts (claim text, cited
source text) pairs from existing generations into a candidate set. That extraction script
is a complete, shippable PR on its own — it is not a prerequisite you are waiting on
someone else for.
Sequence: extraction script → hand-label a sample → then, and only then, the check.
2.2 Callback token (Creativity #3) — deferral upheld, but reclassify it
“Don’t edit the Gemini responseSchema unattended” is correct. But the item is not blocked
— it is scheduled. Reclassify it from “can’t build” to “needs a supervised window.”
When the window happens: add the field as optional (backward-compatible), deploy, watch
the first ten real generations before considering it done. The check itself is trivial — hook
plants a concrete token, CTA contains it — but the schema edit is the risk and it deserves
eyes.
2.3 Creativity #1/#2 (named creative moves, niche exemplars) — deferral
upheld
Exemplar injection genuinely depends on an assessed-reference library. Pass 1 has covered
roughly 35 of ~3,500 references, and Pass 2 (frames → visual profile) has not started. This

is inventory work, not a coding blocker, and it is being kicked off separately.
One note for when it unblocks: the named-creative-moves field (#1) touches
responseSchema the same way the callback token does. Batch them into the same
supervised window rather than taking that risk twice.
2.4 AI-tell phrase list (Voice Cause 2) — deferral upheld, prerequisite being
supplied
Measuring before building is right, and #550’s methodology requires a real corpus.
Production access is being arranged.
Split it into two PRs so the first one ships now:
PR 1: a query script committed to scripts/qa/ that anyone with credentials runs — it
pulls spoken lines from production generations and reports hit-rate and false-positive
rate for a candidate phrase list. This is shippable today; running it is a separate act from
writing it.
PR 2: wire only the phrases that survive the false-positive test into the existing lint.
Phrase-level, never word-level — the “hustle” lesson (57% false positives, the word was
the creator’s actual stance).
3. The standing-rules amendment this session earned
Add to the standing rules:
Before declaring a prerequisite missing, grep for it. Three deferrals in the last cycle
rested on believing a module didn’t exist when it did (questionRegistry), or on a one-
call framing that a search disproved (creative_transfer_plans having no writer — a
correct catch that should be the norm, not the exception).
Filing the prerequisite IS shipping the item. A same-session PR with one falsifiable
sentence is a good default unit, not the only valid one. Where an item needs a caller, a
dataset, or an eval set first, build that and say which item it unblocks. “Not yet, and
here’s why” is the right answer only when nobody can build the missing piece — not
when the missing piece is a day’s work sitting outside the session’s chosen scope.
A subsystem needs a caller in production, the same way a field needs a reader. The
existing guards catch fields. They do not ask whether an exported entry point named as
shipped has a non-test caller. Where it deliberately doesn’t yet, list it with its unblock
condition — the way counter_ephemeral records a debt instead of hiding one. Four
subsystems reached “complete” with no production caller; a guard at the entry-point

level would have caught all four.
4. Build order
# Item Prerequisite Status
1 Registry-consultation check (G8 pt
2) The three filenames in §1.2 Buildable now
2 Entailment eval-set extraction script
(G4 PR 1) None Buildable now
3 AI-tell corpus query script (Voice PR
1) None — writing ≠ running Buildable now
4 Brand-truth full chain (G3) Scope accepted as 2 days,
per §1.1 Buildable now
5 Any fix whose routine text is self-
complete §0 rule 2 Buildable now
6 Callback token + creative-moves
field
One supervised deploy
window Scheduled
7 AI-tell lint wiring (PR 2) PR 1 run against production Waiting on data
8 Entailment check (telemetry-only) Labeled sample from item 2 Waiting on data
9 Niche exemplars Gallery Pass 1 + Pass 2 Waiting on
inventory
Items 1-5 are unblocked as of this document. Nothing in that set requires a missing PDF.
5. Owner-side punch list (not yours — do not wait on it for items
1-5)
1. Rotate the leaked service role key — highest severity item in the repo; it bypasses RLS
entirely.
2. Rotate the Gemini key (closes an unresolvable open claim for five minutes of work).

3. Create the Vercel Deploy Hook on main + add VERCEL_DEPLOY_HOOK_URL as a GitHub
secret — #527 must not merge before this exists, or production deploys stop silently.
4. Supply Supabase read access (or run the query scripts from items 2-3 above and paste
results back).
5. Kick off Gallery Pass 1 backlog (~3,500 references) and start Pass 2.
6. Commit the audit documents to docs/audits/.
7. Record ten real videos. This gates editor v2’s first production run, the ASR validation
(#193), the 12-user quality gate (#204), the empty script_edits table, and the only
success metric that counts: script → recording started → recording completed.