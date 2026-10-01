# Audit: "We never fabricate" vs. confirmed behaviour

This responds to the owner brief of 2026-10-01. Sources: a code audit of current `main` and production data from the coffee test account.

## Bottom line

The honest version of the claim today is: **"Twin is built so it never invents facts, and every finished script is checked against what you gave it."** The unconditional "Twin never fabricates" is still not provable. One point in Part 5 (§5.1, the fact list) is only partly closed, and none of today's fixes has run on a real script yet.

## Status of each Part 3 violation

All violations in Part 3 come from scripts made on or before 2026-09-29. The last invented cup score was at 13:03 that day, and the last private leak at 13:18. Production scan of the coffee account's 33 scripts:
- invented cup score: 7 scripts
- "zero inventory": 2
- "two-pound batches": 3
- "six months on shelves": 1
- private matter (police/neighbour): 3
- invented cart identity: 1

| Violation | Fix that now applies | Status |
|---|---|---|
| 3.1 Invented figures (cup score 82, two-pound batches, six months) | **New today:** the final guard removes any sentence with a figure that nothing she gave states. A figure counts if it is 10 or more, or has a unit. Value and unit are matched, so "six months" is not backed by "6 years". Removals are shown on the page. Tested on these exact phrases. | **Closed** for figures in the script. Titles and captions are not yet covered. |
| 3.1 Invented methods (gram doses, humidity rules) | The `invented_method` cut already removes them (shown as "Twin removed … steps"). | Closed (existing) |
| 3.1 Contradicting her ("zero inventory" vs "restocked in small batches") | Covered only indirectly, by the excluded-fact and first-person checks. | **Partial.** There is no contradiction check. |
| 3.2 Invented identity ("I run a cart") | `entitlementFailures` and `firstPersonFailuresInline` check first-person claims. A beat that still fails after repair is blanked into a question for her. | Partial: catches first-person claims, but not a role framing such as a section title. |
| 3.3 Excluded facts reaching the script | 0253: `creator_excluded_at` is saved from her taps, the writer reads only the `creator_knowledge_writable` view, and a final guard bans excluded wording and quantities. | Closed. Caveat: an id she turns back on is honoured. |
| 3.4 Private matter in a sales script | 0252/0255: private rows are flagged by the extractor or by a word list, and the writer never reads them. The final guard removes private sentences from the script, hooks, captions, titles, thumbnail text and shot notes. Test-viewer rewrites pass `rewriteIsSafe`. | Closed for every path inside the writer and the worker. |
| 3.5 Material never shown on the "what I'll use" screen | The screen sends its exact list (`use_knowledge_ids`), and the writer uses it verbatim. | **Partial.** The writer still reads her DNA profile, her own captions (with private matter removed), niche brain notes and reference text. Those are not on the screen. |
| 3.6 Wrong brand from a photo | The photo's brand is checked against her brands and products; a mismatch drops the identity fields. | Closed for photos. **Open for web/URL extraction.** |

## Root causes (Part 4), re-checked

1. **No entity field, no exclusion field.** Exclusion is fixed (0253). Entity is still name-matching only, with no product id on a fact. **Open.**
2. **No personal-sensitivity gate.** Fixed. There is a gate at selection and a guard after writing, as described in `docs/research` and the 0252/0253/0255 migrations.
3. **Inference fallbacks.**
   - **Fixed today:** audience pain and dream outcome no longer tell the writer to infer; they now say "do not invent". Format, title and thumbnail style no longer present a guess as her established style.
   - Niche still falls back to the scan or quiz value. That value is a guess from her profile, not invented at prompt time.
4. **Silent disagreement between systems.**
   - **Fixed today:** the final guard overwrote earlier removal reports (`bp.guardrail_report = …`). It now appends, so all removals are shown.
   - A shown fact id can still drop silently because the screen and writer reads differ (voice scoping). **Open.**

## Part 5: what must hold, and where it stands

| # | Requirement | Status |
|---|---|---|
| 1 | Writer reads only what the screen shows | Partial (see 3.5) |
| 2 | Personal-sensitivity gate, end to end | Done |
| 3 | No silent inference | Done for facts; style fields now general |
| 4 | Extraction cross-checked against her identity | Photos done; web open |
| 5 | Regression tests for Part 2's wins | Existing tests kept and passing (11,200+). A test pins today's figure guard on the real violating phrases. |

## Recommendation on the claim (Part 6)

Soften the public claim until the remaining open items are closed **and** measured on real scripts, for example:

> "Twin is built to never invent: every script is checked against what you gave it, and anything it can't back is removed or asked about."

That sentence is true today. The unconditional claim is not provable yet.

## Next fixes, in order

1. Screen = writer for every source: either show her DNA and brain-note facts on the screen, or stop the writer reading them as facts.
2. Brand cross-check for web/URL extraction.
3. Give knowledge rows a product id, replacing name-matching.
4. Extend the figure guard to titles and captions.
