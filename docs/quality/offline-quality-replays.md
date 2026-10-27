# Offline quality replays (task A2, plan v6.6 §32)

Gemini is paused, so everything here is offline: no model call, no Apify call, no
network, no database write. Every switch stays OFF (`REFILL_V2`, `SPINE_COMPLETE`,
`POLISH_REORDER`, `BEST_OF_N_JUDGE`, and the new `STRUCTURE_CHECKS`). The reports
hold ids and counts only.

Inputs:

- the advisor's labels: `craft-calibration-set.csv` (109 scripts, panels 5, 6, 7, 8
  and 10; craft 1-7, postable, a class per line). No labels for panels 9 and 11
  were found in the repo.
- the fictional panel fixture `scripts/ops/fixtures/fictional-panel.json` (her
  material, products, offers, the 63 request notes; the stored request notes of
  panels 10 and 12 hash-match it);
- panels 10 and 11 stored scripts: `scripts/ci/fixtures/replay_panel_10_11.json`;
- two LOCAL files that are NOT committed: panel 12's stored blueprints (batch
  `panel-current-12`, 63 requests, one stored script each; sha256
  `8ce8b9bb...7dc2b1`) and a hashes-only index of panels 5-11 (batch, n, kind,
  creator, product and the md5 of each first line) that gives panels 5-8 their goal.

Regenerate: `bash scripts/quality/run-all.sh <panel-index.json> <panel12.json>`.
Raw numbers: `docs/quality/offline-replays/*.json`. The runs are deterministic
(two runs give byte-identical files).

## 1. REFILL_V2 (#1321)

`scripts/quality/refillV2Replay.mjs`. The lines the old refill added (section
`refill`) are taken out; V2's own picker (`relevantRefillUnits` with the V2
context the edge builds) is asked what it would add. A stored refill line is kept
when V2 picks the same unit, blocked otherwise. "After" tops the script back up to
its stored word count with V2's picks (`topUpToBudget`).

| Label | Expected | Got | Stored refill lines | Kept | Blocked |
| --- | --- | --- | --- | --- | --- |
| P10-02 | keep | keep | 0 | 0 | 0 |
| P10-09 | keep | keep | 0 | 0 | 0 |
| P10-19 | keep | **block** | 2 | 0 | 2 |
| P10-01 | block | block | 3 | 1 | 2 |
| P10-05 | block | block | 2 | 0 | 2 |
| P10-07 | block | block | 3 | 1 | 2 |
| P10-20 | block | block | 3 | 1 | 2 |

Six of seven match. **P10-19 does not**: its two stored refill lines are two of her
stories that are not about the request (a leads script for her coaching plan); V2
refuses both as off-topic stories and fills the gap with four of her on-topic
units instead (two facts of the target product, her method, her opinion). The craft-5 parts of P10-19 (hook,
problem, her client story, what it is, one CTA) are writer lines and V2 leaves
them alone. P10-02 and P10-09 carry no stored refill line at all: V2 removes
nothing and, at their stored length, adds nothing, so they ship unchanged. The
expectation in `panel-12-refill-ab.md` ("keeps P10-02/09/19 refills") therefore
holds only in the sense "V2 does not take anything out of these scripts' own
lines"; under the literal reading (every stored refill line of P10-19 is kept) it
fails. Decision needed: is replacing P10-19's two off-topic stories the wanted
behaviour (the rubric's sell/leads skeleton suggests yes) or should V2 keep them?

| Set | Scripts | With refill | Refill lines | Kept | Blocked | V2 adds | Changed | Words median before / after | Words total before / after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Panel 10 | 24 | 15 | 30 | 6 | 24 | 35 | 15 | 96 / 96 | 2323 / 2368 |
| Panel 12, all | 63 | 34 | 63 | 41 | 22 | 57 | 18 | 107 / 107 | 6798 / 6575 |
| Panel 12, arm `baseline_p10` | 31 | 16 | 29 | 9 | 20 | 25 | 15 | 77 / 77 | 3308 / 3100 |
| Panel 12, arm `refill_v2` | 32 | 18 | 34 | 32 | 2 | 32 | 3 | 115 / 115 | 3490 / 3475 |

Consistency check: on panel 12's `refill_v2` arm (made live by V2) the offline
replay reproduces 32 of the 34 refill lines V2 placed, so the offline replay and the
edge agree on 94% of lines. On the `baseline_p10` arm V2 would block 20 of 29
refill lines and change 15 of 31 scripts; total words fall 6% (3308 to 3100)
because some requests have too little on-topic material left to refill.

## 2. SPINE_COMPLETE + POLISH_REORDER (#1310) and BEST_OF_N_JUDGE (#1311)

`scripts/quality/spineBestOfReplay.mjs`. Scores are the FREE rule-based craft
judge (`craftJudge.ts`, raw 1-7). That judge's held-out agreement with the advisor
on panel 10 is Spearman 0.43 (`scripts/calibrate-judges.mjs`), so read the craft
deltas as the judge's view, not the advisor's.

Spine completion then the ending reorder:

| Set | Scripts | Changed | By spine | By reorder | Problem line added | Craft raw mean before / after | Changed scripts only | Up / down |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Labeled (P5-P8, P10) | 109 | 46 | 22 | 37 | 17 | 3.28 / 3.36 | 3.69 / 3.88 | 21 / 7 |
| Panel 10 | 24 | 14 | 5 | 12 | 3 | 3.99 / 3.98 | 4.19 / 4.18 | 6 / 3 |
| Panel 11 | 24 | 13 | 6 | 12 | 6 | 3.44 / 3.60 | 3.52 / 3.82 | 6 / 1 |
| Panel 12 | 63 | 38 | 13 | 33 | 7 | 3.76 / 3.77 | 3.97 / 3.98 | 11 / 4 |

The reorder check refused 1 reorder (panel 10). Reshapes that lost one of her
items (structure check `reshape_keeps_refs`): 2 labeled, 2 on panel 10, 0 on
panel 11, 1 on panel 12; each is an extra CTA line that held her item and was
trimmed. One of them is P10-09, a craft-5 script: the completion step should
keep a CTA line that carries her item (or move the item) before it is turned on.

Best-of-N over the stored drafts of the same 24 requests (panels 10, 11 and 12 ran
them all). Only candidates with zero blocking flags (targeted flags v2 + wrong
product) are compared; an ineligible shipped draft ships; a tie keeps it; a
shipped Plan B script is never swapped out.

| Scenario | Requests | Candidates (eligible) | Swapped | Craft raw mean before / after | Plan B shipped / swapped |
| --- | --- | --- | --- | --- | --- |
| A: panel 12 shipped, candidates P10 + P11 + P12 | 24 | 72 (67) | 12 | 3.91 / 4.13 | 0 / 0 |
| B: panel 11 shipped, candidates P10 + P11 | 24 | 48 (45) | 8 | 3.44 / 3.74 | 12 / 0 |

Scenario A: 22 compared, 2 shipped drafts had a blocking flag and shipped
unchanged. Scenario B: 11 compared, 12 Plan B scripts kept by rule, 1 with fewer
than two eligible. The gain is by construction (the judge picks what the judge
scores higher); it says nothing yet about the advisor's view.

## 3. W3 structure checks (new, DEFAULT OFF)

`packages/shared/src/script/structureChecks.ts` (unit tests in
`__tests__/structureChecks.test.ts`, 28 tests, fictional fixtures).
`structureChecksOn()` is true only for `STRUCTURE_CHECKS=on|true`, and nothing in
the edge or worker reads the module yet. Report: `scripts/quality/structureReport.mjs`.

The advisor did not label these seven properties, so precision / recall is
against the labels that exist: "not postable" (95 of 109 scripts, so a check
that fails at random scores precision 0.87) and "craft 3 or less" (59 of 109,
random precision 0.54).

| Check | Applies to | Fails | vs not postable P / R | vs craft <= 3 P / R | Panel 12 pass / fail / n/a |
| --- | --- | --- | --- | --- | --- |
| hook pays off by line 3 | 109 | 47 | 0.96 / 0.47 | 0.72 / 0.58 | 41 / 22 / 0 |
| story before lesson | 8 | 3 | 1.00 / 0.60 | 0.33 / 1.00 | 5 / 5 / 53 |
| one story per script | 109 | 15 | 0.87 / 0.14 | 0.27 / 0.07 | 45 / 18 / 0 |
| leads include the offer | 29 | 1 | 1.00 / 0.04 | 1.00 / 0.11 | 18 / 0 / 45 |
| no pitch in a non-sell script | 80 | 0 | n/a / 0 | n/a / 0 | 44 / 1 / 18 |
| reshaping keeps references | needs a before/after | see section 2 | n/a | n/a | n/a |
| pacing | 109 | 34 | 0.85 / 0.31 | 0.59 / 0.34 | 43 / 20 / 0 |

"One story" fails on P10-01, the rubric's named "unrelated stories" case. Only
"hook pays off" clearly beats the base rate on both proxies; "one story" and
"pacing" do not beat it on "not postable". No check should gate anything until the
advisor labels these properties directly.

## 4. Targeted flags v2: precision / recall against the line labels

`scripts/quality/flagsV2Report.mjs`: every labeled line through the blocking flags
Best-of-N uses (targeted flags v2 + wrong product), with her ledger from the
fixture. 474 lines.

| Positive class | TP | FP | FN | Precision | Recall |
| --- | --- | --- | --- | --- | --- |
| I (invented) | 12 | 11 | 7 | 0.52 | 0.63 |
| I or E (embellished) | 21 | 2 | 127 | 0.91 | 0.14 |

By panel (positive = I): P5 0.46 / 0.50, P6 0 / 0 (1 invented line, 2 false
flags), P7 0.50 / 1.00, P8 0.67 / 1.00, P10 1.00 / 1.00. Flags v2 was written
from panel 10's misses, so P10 is in-sample; panels 5-8 (precision 0.45, recall
0.56 on I) are the honest estimate. Of the 11 false flags on I, 9 are on lines the
advisor marked E: the flags are rarely wrong about a line being stronger than her
material, but they cannot tell an invented line from an embellished one.

## What is left

- P10-19: decide whether V2 should keep the two off-topic story refills (section 1).
- Labels for panels 9 and 11 are not in the repo; the replays above use panels
  5-8, 10 (labeled) and 10-12 (stored).
- The structure checks need direct advisor labels (one per check per script)
  before any of them gates a script; today only "hook pays off" shows signal.
- Best-of-N and spine deltas are the rule judge's view; an advisor read of the
  12 swapped requests (scenario A) and of the 38 reshaped panel-12 scripts would
  confirm or refute them.
- Panels 5-8 ledgers are rebuilt from today's fixture; if a creator's material
  changed since those panels ran, a few flags may differ from what ran live.
