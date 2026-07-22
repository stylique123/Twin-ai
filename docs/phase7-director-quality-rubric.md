# Phase 7 — Target-user Director-quality gate (Gate 2)

**Frozen before the first rating result.** This gate blocks **beta enablement**
(alongside task #115), **not** the Phase-7 engineering merge. Valid,
schema-conformant JSON is **not** proof of good editing. The machine-checkable
thresholds live in `scripts/director-eval/thresholds.json`; this document is the
human procedure. The combined digest of both files is frozen in
`scripts/director-eval/QUALITY_GATE_DIGEST.txt` and verified in CI. **Any change
to the sample table, procedure, or thresholds requires a new
`evaluationVersion` and a full rerun — never a reinterpretation of results.**

## Evaluation version
`phase7-director-quality-v1`.

## Sample (exact N = 16, mutually exclusive primary strata)

| Duration | Delivery | Count |
|---|---|---|
| < 2 min | scripted | 2 |
| < 2 min | improv | 2 |
| 2–8 min | scripted | 3 |
| 2–8 min | improv | 3 |
| 8–30 min | scripted | 3 |
| 8–30 min | improv | 3 |
| **Total** | | **16** |

Each recording occupies **exactly one** primary cell. Secondary tags are
attributes of the same 16 recordings (no double-counting, satisfied by
assignment): **≥5 fast** (>180 wpm) and **≥5 normal** speech-rate; **≥4 noisy**
(SNR below the frozen audio floor); **≥1 recording ≥25 min** (exercises the
envelope cap). A pre-drawn **reserve of 4** replaces any unratable recording to
hold N = 16.

## Procedure
- **3 trained raters per recording**, blinded to AI-vs-human origin, randomized
  order.
- A separate **senior adjudicator** (not a rater) establishes the **action-level
  ground truth** — the correct removal/keep spans — from the source **before**
  seeing Director output.
- A Director removal is a **true positive** iff it is contained in, or has
  IoU ≥ 0.5 with, a ground-truth removal span; otherwise a **false positive**.

## Metrics, denominators, and thresholds (immutable)
- **Removal precision** = `TP / (TP + FP)` over all Director removal actions.
  **≥ 0.95 overall (point)**, **Wilson-95% lower bound ≥ 0.90 overall**, and
  **≥ 0.90 point per duration stratum**. Minimum denominators: **≥ 40 removal
  actions overall** and **≥ 8 per duration stratum**; below either ⇒
  **INCONCLUSIVE** (never a pass).
- **Harmful cuts** = any Director removal overlapping a ground-truth keep span
  by > 0 ms. **Threshold = 0**, applied **overall and per recording** (a single
  harmful cut fails the gate).
- **Rater agreement** = **Fleiss' κ** on the per-action "acceptable" judgement,
  **≥ 0.60 overall**; below ⇒ **FAIL** (retrain raters + full rerun under a new
  version — never reinterpret).
- **Would-ship** = fraction of recordings where **≥ 2/3 raters** say a creator
  would ship the edit. **Hard rule: ≥ 15/16.** (Derivation: at N = 16 a
  Wilson-95% lower bound ≥ 0.70 is met only at 15/16, LCB ≈ 0.717; 14/16 gives
  LCB ≈ 0.640. So the operative hard rule is ≥ 15/16, not 13/16.)

## Outcome rules
- **PASS**: all metrics meet thresholds **and** all minimum denominators are
  satisfied.
- **INCONCLUSIVE** (never a pass): removal-action denominator below the minimum
  (overall or any duration stratum), or reserves exhausted before 16 ratable
  recordings.
- **FAIL**: any harmful cut, precision below threshold/LCB, would-ship < 15/16,
  or κ < 0.60.
- **Disagreement**: per-action verdict by 2/3 majority; a tie ⇒ not acceptable
  (conservative).
- **Missing/unratable**: excluded and replaced from reserves (logged); reserves
  exhausted ⇒ INCONCLUSIVE.

## Filler removal
Out of scope for Phase 7 (`EDITOR_FEATURES.autoFillerRemoval=false`); filler
recall is **N/A**. This gate never rewards filler removal while the flag is off.
