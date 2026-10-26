# Polish check v2: offline report (HELD, PR #1322)

This report is offline only (plan v6.6 §32): no model or scraper calls and no DB writes. It contains ids and counts only.

Reproduce: `node scripts/eval/offline-gate-report.mjs [--labels=/private/labels.csv]`

**Input:**
- the stored fictional panel 10/11 blueprints (`scripts/ci/fixtures/replay_panel_10_11.json`, 48 scripts)
- the fictional creators' items, style note and samples (`scripts/ops/fixtures/fictional-panel.json`)

**Ids:** `P<panel>-<n> L<i>`, where `i` is the 1-based position in the stored script. This is the same numbering as the panel export's `script_id` (`panel-current-<panel>#<n>`).

**Checked lines:** every middle line (not Hook and not CTA), 160 in total (panel 10: 94, panel 11: 66).

**Original line:** the line before polish is not stored, so each line is checked against her items and voice with an empty original. This makes the counts an upper bound on rejections.

**Product scope:** the fixture keeps no source product per line, so the scope is the video's product (request `n` of the fictional panel).

The output is deterministic.

## Labels status
No advisor labels for panels 5–11 exist in the repo or in the project database:
- The stored advisor label files cover only panels 2 and 3 (`test_run_files` ids 14 and 21).
- The panel 5–11 exports (ids 24–30) hold no labels.

So recall and the false-block rate against the advisor's labels can't be computed yet. Pass a private `id,label` CSV (`INVENTED` / `TRUE`) with `--labels` and the script prints both, with ids.

## What v2 rejects (no labels needed)

| scope | middle lines | rejected |
|---|---|---|
| panel 10 | 94 | 25 |
| panel 11 | 66 | 24 |
| total | 160 | 49 |

Reasons: new_detail 32, new_first_person 15, wrong_product 2.

- wrong_product: P10-1 L2, P11-1 L2
- new_first_person: P10-2 L7, P10-6 L3, P10-7 L3, P10-11 L2, P10-11 L3, P10-18 L2, P10-18 L6, P10-19 L2, P10-21 L2, P11-3 L4, P11-4 L2, P11-6 L2, P11-6 L4, P11-11 L2, P11-23 L3
- new_detail: P10-4 L3, P10-4 L7, P10-6 L4, P10-7 L2, P10-8 L2, P10-8 L6, P10-9 L2, P10-12 L3, P10-12 L7, P10-14 L2, P10-16 L4, P10-18 L3, P10-20 L4, P10-21 L3, P10-21 L6, P11-3 L2, P11-4 L3, P11-4 L4, P11-6 L3, P11-7 L2, P11-7 L3, P11-8 L4, P11-14 L2, P11-14 L3, P11-15 L2, P11-15 L3, P11-16 L2, P11-18 L2, P11-19 L2, P11-20 L4, P11-22 L2, P11-23 L2

## Earlier numbers, reconciled

**P11-23 L3 is still caught (new_first_person).** This matches the earlier report.

**The Night Owl fact on a Harbor Blend line is caught (wrong_product) in both panels: P10-1 L2 and P11-1 L2.**
- The earlier report called the panel-11 case "P11-15 L2". That was an id slip: `panel-current-11#15` belongs to a different creator.
- The line is P11-1 L2.
- The P11-15 L2 that this run rejects is a different line (new_detail).

**28 → 20 false rejections.** This count came from the 104 middle lines of the 34 blueprints whose polish kept an edit, compared against the earlier session's own labels. Neither the polish record nor those labels are stored, so the count can't be reproduced exactly here. Two parts of it do agree with this run:
- **The 8 lines the rework released all pass here:** P10-8 L3, P10-9 L4, P10-15 L2, P10-17 L3, P10-18 L4, P10-22 L3, P11-8 L2, P11-14 L4.
- **The 4 lines named as remaining synonym false rejections are all still rejected:** P10-16 L4, P10-18 L2, P10-19 L2, P11-14 L3.

**49 of 160 is a ceiling, not a false-rejection count.** The run checks every middle line with no original text, so lines the polish never touched are included. On a live polish, a rewrite is compared with the line it replaces, which covers more words.

## Flags

Both flags stay OFF:
- `POLISH_CHECK_V2` and `VOICE_BARE_LINES` are on only at `on`, and only for test accounts.
