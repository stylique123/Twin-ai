# TwinAI — Production Readiness Audit

_Source: uploaded PDF, committed verbatim (text-extracted). Reads merge history through #578 and asks one question: what stands between TwinAI and a real, working production app._

---

TwinAI — Production Readiness Audit
Read: the full merge history through #578, the live prompt assembly, the Gallery
source, and every production measurement the team published in their own commit
messages. This audit answers one question — what is between TwinAI and being a
real, working, production web app.
0. The verdict, stated plainly
Code quality is no longer the constraint. Usage is.
The last wave (#541–#578) is the most disciplined engineering run in this repo’s history.
Nearly every fix was measured against production before being written, several fixes
corrected the audit that requested them, and at least six of the team’s own tests were found
wrong and fixed rather than trusted. That standard is now the company’s real asset.
But the same commit messages carry the production census, and it is stark:
Table / signal Production rows
Onboarded creators 23
Creators who generated a script 22 (41 generations)
creator_questions_put 0
creator_knowledge where source = ‘asked’ 0
script_edits 0
brand_truth_snapshots 0
creative_transfer_plans 0 (and no caller for any of its four exports)
Every editor v2 table 0 (flags off)
Recordings completed 0
Beats carrying a checked substance + citation 5
Twenty-three real people have signed up and not one has answered a question, edited
a line, recorded a take, or received a rendered video. Every learning loop in the product
— voice preference, edit lessons, repetition judgement, render cost, quality panels — is a
correct mechanism with an empty input. That, not code, is what stands between here and
production.
1. What genuinely improved in this wave
The writer now knows which facts are guesses (#560). This is the deepest quality
finding of the whole cycle. Measured across 41 profiles: audience pain — 0 creator-stated,
34 guessed; dream outcome — 0 stated, 34 guessed; offer — 13 stated, 28 guessed.
Every script this product has ever produced described its creator’s audience pain from a
model’s synthesis of scraped posts, rendered in the same voice as a fact the creator stated.
The guess is now labelled rather than deleted — correct, since blanking it trades a labelled
inference for an empty field.
The voice work landed as a coherent stack (#569–#576): answered-question text now
feeds the style card, not just the knowledge block; a labelled genre-default register card
renders when nothing measured exists; a partial style card renders between 15 and 40
sentences with each metric labelled by its sample size; signature vocabulary is now
measured (phrases appearing in ≥3 different videos) instead of asserted; two structural AI-
tells are detected (repeated parallel triads, sentence-length uniformity); and a fresh phrase
measurement found a 41%-hit-rate tell with zero false positives.
Guards generalised from events to columns (#561): 482 columns audited, 7 genuinely
unread, all registered with a reason and a decision point. The guard’s first instrument
accused 22 correct columns and was rebuilt rather than shipped — and its own
documentation was corrected when it turned out a writer counts as a reader, which is how
generations.script_report (written at index.ts:5954, read by nothing) passes a green run.
Consent was built as what #204 actually requires (#563) — a register pointing at signed
documents held outside the database, with seven separate NOT NULL statements and a
refusing reader — rather than the in-app checkbox the audit asked for, which would have
created the appearance of compliance.
2. The unresolved contradiction that should worry you most
The blind creator panel reported 67% of scripts repeat a beat. The deterministic floor,
run over 41 production scripts, found 4.9% with an exact repeat, 11.4% sharing ≥50%
of tokens, and 0% sharing ≥70% (#564).
The module refuses to pick a reading, correctly. There are only two:
1. The panel sees repetition of meaning that no word-overlap measure can reach — in
which case the judge pass is essential and the flag should come on.
2. The panel is counting restatement the format does on purpose (the re-hook and the
CTA are features, not defects) — in which case 67% was never a defect rate and months
of concern were aimed at a non-problem.
Zero scripts carry even a 70%-overlap pair, which makes the second reading serious.
This is currently the single largest unresolved question about script quality, and it is
answerable: turn on SCRIPT_ADVISORY_ENABLED for a bounded run, compare the judge’s
findings against the floor stored beside them, and have the panel re-score with the re-
hook/CTA explicitly exempted. Until then, nobody knows whether the product’s most-cited
quality flaw exists.
3. What is actually blocking production, in tiers
Tier A — Launch blockers (nothing ships past these)
A1. The leaked service role key is still unrotated. It bypasses RLS entirely. This is the
highest-severity item in the repository and it is a five-minute action assigned to you.
Everything else in this document is subordinate to it.
A2. No human has completed the core loop. Zero recordings, zero renders, zero exports.
Editor v2 works in the staging matrix; EDITOR_V2_START_ENABLED and
EDITOR_RENDER_ENABLED are both off, so every editor table is empty by construction. The
product’s own success metric — script → recording started → recording completed →
exported → published — has never registered a single value.
A3. ASR has never been validated on real human speech (#193). The one time it met a
real recording, the filler-word detector flagged “this week” as a disfluency. Turning on
rendering before this gate is how you ship a product that cuts real words out of a creator’s
video.
A4. The 12-participant quality gate (#204) has not run. The consent register now exists
to support it; the run itself hasn’t happened.
A5. Deploy path is half-built. #527 must not merge until the Vercel deploy hook exists and
VERCEL_DEPLOY_HOOK_URL is set — otherwise production deploys stop silently while main
keeps accepting merges.
Tier B — Will break or mislead on day one at real volume
B1. Render concurrency is 1 per VPS, and the cost model still cannot produce a total:
compute is now measured, egress is not, and costIsComparable is deliberately false
(#562). output_bytes is the size of the file produced, not the bytes served — a render
watched a hundred times and one never opened look identical. You cannot price this
product yet, and you cannot detect a runaway bill.
B2. The gallery shelf is still stocked wrong. Featured content is 8 hardcoded celebrity
clips; niche resolution collapses everything into 6 buckets; roughly 35 of ~3,500 references
are assessed; Pass 2 (visual profiles) has not started. A creator whose niche has fewer than
6 matching cards silently sees everything. The ranking machinery is good and has almost
nothing correct to rank.
B3. The container resolver — the best content machinery in the product — fires on
~1% of generations, because it requires an assessed reference. Its two strongest
validators (all_slots_filled, no_unsupported_claim) therefore report not_run for nearly
every script.
B4. product_entities is effectively empty, so every generation takes the “do not write a
scene that depends on a product” branch. The entire claim-entitlement, showability, and
community-map system — genuinely the best-engineered subsystem here — has never
actually governed a real script. #566’s capture card is the first mechanism that could
change this; it needs to be watched.
B5. The dead lineage limb. creative_transfer_plans has zero rows, no writer, and no
caller for any of its four exports; brand_truth_snapshots has zero rows. The mismatch
checks that protect brand facts from drifting have never been able to fire. This is now a
decision, not a task: wire the chain or delete both halves. Carrying a dead limb costs
maintenance and creates the illusion of protection.
B6. generations.script_report is written on every generation and read by nothing —
and passes the column guard because the writing line mentions the name. Either give it a
reader or stop writing it.
Tier C — Unknowns that must become known before you can claim quality
C1. The question-answer rate is unmeasurable until now. Zero creator_questions_put
rows was equally consistent with “the card never rendered” and “shown to all 22 creators
and ignored by every one” — #565 made those separable by recording impressions. In a
week, that split tells you whether the problem is placement or persuasion. Until then,
every fix aimed at question adoption is a guess.
C2. Every quality claim is a model judging a model. #574 added a person-vs-AI
dimension to the judge panel and states its own limit honestly: it is not a creator panel. The
ledger already names a genuine human panel as the only non-circular instrument remaining.
C3. The entailment eval set is 5 beats (#578). That is thin enough that the citation-
support check cannot be tuned yet — and knowing it is thin is itself the finding. It grows only
with usage.
4. The pattern that connects Tier B and Tier C
Every item above is the same shape: a correct mechanism with an empty input.
The team has spent this wave doing the right thing — building readers for every writer,
guards for every rule, measurements before every claim. What it cannot do alone is
generate the usage that turns those mechanisms from plumbing into product. Twenty-three
creators onboarded and zero completed loops is not a build problem; it is a distribution and
dogfooding problem, and no PR fixes it.
The corollary matters: shipping more features right now has near-zero marginal value.
Each new correct-but-unexercised subsystem adds maintenance and adds nothing a
creator can feel. The highest-value engineering work available is the small set of items that
enable usage (Tier A), plus the two that make existing usage legible (gallery stocking,
question-impression split).
5. Definition of production-ready — the checklist to hold
yourself to
A launch claim is honest when all of these are true:
1. Service role key rotated; Gemini key rotated or the claim formally closed.
2. Deploy hook live, #527 merged, one deliberate production deploy proven end to end.
3. ASR validated on ≥10 real human recordings; the disfluency detector re-tested against
them.
4. Editor flags on; at least one creator has gone script → record → render → export →
publish without intervention.
5. 12-participant gate run under the consent register.
6. Cost per render computable including egress, with a budget gate that can refuse.
7. Render concurrency plan beyond 1-per-VPS.
8. Gallery Pass 1 complete (~3,500 refs), Pass 2 started, for-you feed assessed-only with
an honest scarcity state.
9. product_entities non-empty for a majority of active creators (the #566 card is the
instrument — watch its conversion).
10. Repetition question settled (§2) — either the judge earns its flag or 67% is retired as a
measurement artefact.
11. The dead lineage limb wired or deleted; script_report given a reader or removed.
12. One real human creator panel run, replacing model-judges-model as the quality arbiter.
6. What to do, in order
1. Rotate the service role key. Today. Nothing else competes.
2. Deploy hook, then merge #527. Ten minutes; unblocks the whole deploy story.
3. Record ten videos yourself this week. This single act unblocks A2, A3, A4, C1, C3,
script_edits, render-cost data, and the first honest quality claim this product will ever
have. It is worth more than any month of engineering.
4. Turn on SCRIPT_ADVISORY_ENABLED for a bounded run and settle §2 — with the cost
gate watched, since it adds a model call per generation.
5. Decide the lineage limb (wire or delete) and give script_report a reader or retire it.
6. Finish gallery Pass 1, start Pass 2, and make the for-you feed assessed-only with
honest scarcity.
7. Watch the #566 product-capture card and the #565 impression split for one week,
then act on what they say rather than on what anyone assumes.
8. Only then resume feature work — starting with the container-resolver fallback for
unassessed references, which is the largest quality unlock still sitting behind inventory.
7. The one thing wor th protecting above all
This repo’s habit of measuring before building, correcting its own instruments, and
recording what it has not proven is rarer than any feature in it. It has now caught errors in
three consecutive external audits, including several of mine. Whatever else changes as this
moves toward production, keep the rule at the top of the status page enforced: keep it
honest or delete it.
