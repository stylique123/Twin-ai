# Hook gate v2: offline report (HELD, PR #1325)

Offline only (plan v6.6 §32). No model or scraper calls and no DB writes. This file holds ids and counts only.

Reproduce: `node scripts/eval/offline-gate-report.mjs [--labels=/private/labels.csv]`

- Input: the stored fictional panel 10/11 blueprints (`scripts/ci/fixtures/replay_panel_10_11.json`, 48 scripts) and the fictional creators' items (`scripts/ops/fixtures/fictional-panel.json`).
- Ids: `P<panel>-<n> H<k>`, where `n` is the case `n` and `k` is the 1-based position in `hook_options`.
- The run is deterministic: two runs give byte-identical output.

## Labels status

The task asked for a measurement against the advisor's labels for panels 5–11. **No advisor labels for panels 5–11 exist in the repo or in the project database.**

- The only stored advisor label files cover panels 2 and 3 (`test_run_files` ids 14 and 21).
- The panel 5–11 exports (`test_run_files` ids 24–30) contain no labels.

Recall and false-block rate therefore can't be computed against the advisor's labels yet. To get them, run the script with `--labels` pointing at a private CSV (`id,label`, with labels `INVENTED` / `TRUE`). It prints recall and false-block rate, together with the item ids.

## What the gate flags (no labels needed)

| scope | hooks | v1 flagged | v2 flagged |
|---|---|---|---|
| panel 10 | 148 | 7 | 12 |
| panel 11 | 117 | 2 | 11 |
| total | 265 | 9 | 23 |

- v2 reasons (both panels): number_promise 8, invented_scene 5, unsourced_generalisation 4, unbacked_timeframe 4, absolute_efficacy 1, invented_inner_state 1.
- v1 ids: P10-1 H4, P10-6 H5, P10-7 H2, P10-13 H2, P10-13 H4, P10-15 H4, P10-18 H4, P11-14 H4, P11-15 H4.
- v2 ids: P10-1 H4, P10-6 H5, P10-6 H8, P10-7 H2, P10-12 H3, P10-13 H2, P10-13 H4, P10-15 H4, P10-17 H2, P10-17 H3, P10-18 H4, P10-19 H2, P11-3 H5, P11-4 H2, P11-6 H3, P11-14 H2, P11-14 H4, P11-15 H3, P11-15 H4, P11-15 H6, P11-18 H1, P11-18 H2, P11-19 H2.
- v2 flags a superset of v1: every v1 id is also flagged by v2.

## Earlier number, reconciled

The PR originally reported that on panel 11, v2 caught 10 of 14 invented hooks with 1 false flag, against v1's 1 of 14 with 1 false flag. Those labels were the earlier session's own, not the advisor's.

The flag counts reproduce exactly:

| gate | flags on panel 11 | equals |
|---|---|---|
| v2 | 11 | 10 caught + 1 false |
| v1 | 2 | 1 caught + 1 false |

The recall itself (10/14) can't be re-verified until labels are supplied.

On panel 10, v2 adds 5 flags with no labels behind them yet:
- P10-6 H8
- P10-12 H3
- P10-17 H2
- P10-17 H3
- P10-19 H2

Each of these is a possible false block until it is labelled.

## Flag

`HOOK_GATE_V2` stays OFF. It is on only when the value is exactly `true`, and only for test accounts with trial on.
