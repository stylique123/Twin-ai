# Polish check v2: offline report (HELD, PR #1322)

This report was made offline only (plan v6.6 §32): no model or scraper calls and no DB writes. It contains ids and counts only.

To reproduce it, run `scripts/eval/offline-gate-report.mjs`. Its output is deterministic.

- **Against advisor labels:** `node scripts/eval/offline-gate-report.mjs --labeled=<private csv>`.
  - The CSV holds the advisor's line labels for panels 6, 7, 8, 10 and 11, normalised to `id,panel,creator,request_n,kind,pos,last,text,label`. It is private and never committed.
  - `INVENTED` means `invented_YN` = Y.
  - `TRUE` means `my_label` = S and `invented_YN` = N, i.e. the advisor marked the line as supported.
  - Lines labelled E, I-only or N are left out.
- **Without labels:** `node scripts/eval/offline-gate-report.mjs` runs on the stored panel 10/11 blueprints in `scripts/ci/fixtures/replay_panel_10_11.json`.

Inputs and assumptions:
- **Items:** the fictional creators' items, style note and samples, from `scripts/ops/fixtures/fictional-panel.json`.
- **Ids:** `P<panel>-<blind#> L<line_no>`, where `<blind#>` is the advisor sheet's blind id.
- **Lines checked:** middle lines only (not line 1 and not the last line), because the polish check judges rewrites of those lines.
- **No original line:** the line before polish is not stored, so each line is checked against her items and voice with an empty original. That makes the false-block counts an upper bound.
- **Product scope:** the video's product, taken from request `n` of the fictional panel.
- **Panels 5 and 9:** the advisor left no line labels for these panels.

## Results against the advisor's labels (middle lines)

| panel | invented | caught | supported (S) | false blocks |
|---|---|---|---|---|
| 6 | 0 | 0 | 20 | 0 |
| 7 | 4 | 1 | 21 | 3 |
| 8 | 1 | 1 | 18 | 4 |
| 10 | 2 | 2 | 67 | 3 |
| 11 | 3 | 3 | 34 | 0 |
| **total** | **10** | **7 (recall 0.70)** | **160** | **10 (0.0625)** |

Ids:
- **Caught:** P7-06 L5, P8-16 L4, P10-11 L2, P10-13 L2, P11-15 L2, P11-18 L3, P11-23 L3
- **Missed:** P7-15 L3, P7-16 L3, P7-19 L4
- **False blocks:** P7-01 L2, P7-12 L3, P7-12 L5, P8-10 L2, P8-11 L2, P8-15 L3, P8-16 L3, P10-13 L3, P10-18 L2, P10-23 L2

## Reading

**The earlier catches reproduce.** Both lines are still caught in the advisor's id space:
- P11-23 L3, as `new_first_person`
- P11-15 L2, the Night Owl fact on a Harbor Blend line, as `wrong_product`

**On panel 11** the check catches all 3 invented middle lines and blocks none of the 34 supported ones. P10-18 L2 was named earlier as a remaining synonym false rejection, and it still is one.

**The earlier "28 → 20" can't be reproduced.** It was counted on the 104 lines where the polish kept an edit, using the earlier session's own labels. The polish record is not stored. Measured instead against the advisor's labels, with the empty-original ceiling, the result is:
- 10 false blocks out of 160 supported middle lines (6.25%)
- 7 of the 10 false blocks are on panels 7 and 8, which were not used for tuning

**Verdict: keep the flag OFF.** Recall is good on small counts (7/10). The false-block ceiling is 6%, mostly outside the tuning panels.

## Without labels (stored panel 10/11 blueprints, fixture id space)

In this section the ids are `P<panel>-<n> L<i>`, where `n` is the request number. This is a different id space from the advisor sheet.

- 160 middle lines were checked and 49 were rejected:
  - new_detail: 32
  - new_first_person: 15
  - wrong_product: 2 (P10-1 L2 and P11-1 L2; P11-1 L2 is the same line as the advisor's P11-15 L2)
- This count is a ceiling. With no original line, lines the polish never touched are included.

## Flags

Both flags stay OFF. `POLISH_CHECK_V2` and `VOICE_BARE_LINES` turn on only when set to exactly `on`, and only for test accounts.
