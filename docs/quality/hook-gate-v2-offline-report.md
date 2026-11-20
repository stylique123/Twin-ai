# Hook gate v2: offline report (HELD, PR #1325)

This report was made offline only, per plan v6.6 §32: no model or scraper calls and no DB writes. It contains ids and counts only.

## How to reproduce

Run `scripts/eval/offline-gate-report.mjs` (deterministic: a re-run gives byte-identical output).

- **Against advisor labels:** `node scripts/eval/offline-gate-report.mjs --labeled=<private csv>`. The CSV holds the advisor's hook ratings for panels 6, 7, 8, 10 and 11, normalised to `id,panel,creator,request_n,kind,pos,last,text,label`:
  - `INVENTED` = the advisor's `invented_YN` is Y
  - `TRUE` = `invented_YN` is N
  - The CSV is private and is never committed.
- **Flags only:** `node scripts/eval/offline-gate-report.mjs`. This uses the stored panel 10/11 blueprints in `scripts/ci/fixtures/replay_panel_10_11.json` and needs no labels.

Inputs and ids:
- **Creator items:** the fictional creators' stories, answers and product facts, from `scripts/ops/fixtures/fictional-panel.json`.
- **Item ids:** `P<panel>-<blind#> H<k>`. `blind#` is the advisor sheet's blind id, and `k` is the hook's row within that blind id in the sheet.

Label coverage:
- **No hook labels:** panels 5 and 9 have no advisor hook ratings anywhere I could find.
- **Not in the repo:** the labels exist only as private files, outside the repo and outside the project DB.

## Results against the advisor's labels

| panel | invented | v1 caught | v2 caught | true | v1 false blocks | v2 false blocks |
|---|---|---|---|---|---|---|
| 6 | 9 | 2 | 3 | 136 | 2 | 5 |
| 7 | 4 | 0 | 0 | 97 | 3 | 6 |
| 8 | 3 | 3 | 3 | 128 | 4 | 10 |
| 10 | 18 | 6 | 7 | 130 | 1 | 5 |
| 11 | 14 | 1 | **10** | 103 | 1 | **1** |
| **total** | **48** | **12 (0.25)** | **23 (0.479)** | **594** | **11 (0.019)** | **27 (0.045)** |

**v2 false blocks (27):**
- P6: P6-03 H2, P6-11 H5, P6-12 H1, P6-14 H4, P6-17 H7
- P7: P7-01 H4, P7-05 H1, P7-05 H4, P7-14 H6, P7-15 H5, P7-18 H7
- P8: P8-03 H3, P8-04 H1, P8-04 H3, P8-08 H1, P8-08 H3, P8-11 H1, P8-11 H3, P8-13 H8, P8-14 H6, P8-15 H6
- P10: P10-04 H8, P10-11 H1, P10-21 H1, P10-21 H2, P10-23 H3
- P11: P11-18 H4

**v2 missed (25):**
- P6: P6-05 H3, P6-10 H6, P6-10 H7, P6-10 H8, P6-11 H2, P6-13 H5
- P7: P7-03 H5, P7-04 H1, P7-15 H4, P7-19 H3
- P10: P10-05 H1, P10-05 H5, P10-05 H8, P10-09 H1, P10-10 H3, P10-13 H1, P10-13 H3, P10-13 H5, P10-13 H6, P10-14 H7, P10-22 H4
- P11: P11-22 H2, P11-22 H7, P11-24 H3, P11-24 H4

## Reading

**The earlier number reproduces exactly.** On panel 11, v2 catches 10 of 14 invented hooks with 1 false block (P11-18 H4, the existing v1 inner-state flag). v1 catches 1 of 14.

**Panel 11 is where v2 was tuned. On panels 6, 7, 8 and 10 it does much less:**
- It catches 13 of 34 invented hooks, against v1's 11.
- Its false blocks rise from 10 to 26 out of 491 true hooks.
- Panel 8 takes 6 of the 16 extra false blocks.

**Most of the remaining misses are on panels 10 and 6** (11 and 6 of the 25). I haven't classified them.

**Verdict: keep the flag OFF.** v2 roughly doubles recall overall (0.25 → 0.48), but it also more than doubles the false-block rate (1.9% → 4.5%), and the recall gain is concentrated on the panel it was tuned on.

## Flags without labels (stored panel 10/11 blueprints, 265 hooks)

The stored blueprints use a different id space: `P<panel>-<n> H<k>`, where `n` is the request number. In those 265 hooks:
- v1 flags 9 and v2 flags 23. v2 flags every hook that v1 flags.
- v2 reasons: number_promise 8, invented_scene 5, unsourced_generalisation 4, unbacked_timeframe 4, absolute_efficacy 1, invented_inner_state 1.

## Flag

`HOOK_GATE_V2` stays OFF. It turns on only when the value is exactly `true`, and only for test accounts with trial on.
