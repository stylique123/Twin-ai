# Script batch audit: 12 parts (2026-10-03)

**Scope:** every successful script (status 200 with a stored blueprint) on the test account `c23267b3…`. That is **370 scripts**: batch-1 14, part-1-product 16, part-1b 78, part-1c 76, part-1d 23, **part-1e 91, part-2-idea 48, part-1f-trace 24**. The 6 batch-1 rows that have no generation are left out.
**Reference data:** 58 stored facts. 10 are flagged `sensitive` and 5 are excluded (`creator_excluded_at`, all set 2026-09-29, before every batch). There are also 16 products, the default brand voice, 17 `script_ratings` (14 with notes, all written 09-28 and 09-29, before every batch) and 704 `creator_lessons`.
**How to reproduce:** `node scripts/ops/batchAudit.mjs --batch=<label>` (live, read-only) or `--all`. Every number below comes from that script, run on a dump of the same data. Each section explains what was counted and what the counting cannot see.

> **Judge coverage warning.** The model judge returned 429 (quota) on **84 of 370** scripts. In the latest batches it ran on only **part-1e 62/91, part-2 15/48 and part-1f 2/24**. Judge-based numbers for those batches are therefore mostly missing. The batch runner should fail or retry on a judge error instead of storing it.

## Summary

| # | Part | All batches | part-1e | part-2 | part-1f |
|---|---|---|---|---|---|
| 1 | Scripts with a figure not backed by her facts, the chosen product or her answers | 26/370 (7.0%) | 9 | 4 | 3 |
| 1 | Judge "invented claims" (scripts judged) | 116/256 (45%) | 25/62 | 11/15 | 1/2 |
| 2 | Private content she did not type (strict) | **1** | 1 | 0 | 0 |
| 2 | Next to private: the officer or inspector visit | **8** | 2 | 1 | 1 |
| 3 | Excluded facts showing up anyway | 1/370 (0.3%) | 0 | 0 | 0 |
| 3 | Facts she *says* she excluded (two-pound batches) that appear anyway | **67/370 (18%)** | 23 | 17 | 5 |
| 4 | Teleprompter and shot list fully agree | 368/368 (100%) | 100% | 100% | 100% |
| 5 | First line is the hook with the top audience score | 160/368 (43.5%) | 34/91 | 21/48 | 12/24 |
| 6 | Diagnosed gap fixed and written back | 78/516 (15.1%) | 25/109 | 7/56 | 4/22 |
| 7 | Arc fits (scripts that have an arc) | 123/171 (72%) | | | |
| 8 | Uses a real signature phrase | 57/370 (15.4%) | 18/91 | 8/48 | 6/24 |
| 9 | Stated price or size matches the stored product exactly | 28/40 (70%) | 9/14 | n/a | 3/4 |
| 10 | Another product's material in the wrong script | 15/370 (4.1%) | 5 | 1 | 1 |
| 11 | A correction she already gave, repeated | see part 11 (two-pound batches: 67) | | | |
| 12 | Demo beats labelled `front` | 30/34 (88%) | 17/18 | 6/6 | 3/5 |

---

## 1. Recurring fabrication

What was counted: every figure in the spoken lines (as value plus unit, using the same rule as `statedFigures` in `privacyGuard.ts`). A figure counts as backed if it appears in a non-sensitive, non-excluded fact, the chosen product, her readiness answers or note, or her voice vocabulary and CTAs. Unbacked figures were then traced back to every stored fact and product.

**Recurring unbacked figures (in more than one script).** Every one of them traces to a stored row. None was invented fresh. What makes them unbacked is that they were used in the wrong script:

| Figure (example wording) | Scripts | Traced to |
|---|---|---|
| 12 oz ("twelve-ounce bag") | 16 | Signature Blend Beans offer (`cca97158`), used for House Espresso, Bella Donovan, Cold Brew, Single-Origin and "Sunflower Coffee Roasters" |
| 5 lb ("five-pound bulk bag") | 15 | same |
| $18 ("twelve-ounce bag for eighteen dollars") | 11 | same |
| $65 ("for sixty-five dollars") | 10 | same |
| "ship within two days" | 5 | the `page_section` on Starter Guide, Mini Course, Club and RoastLog, plus the readiness answer the batch gives with `rich` answers |
| "104 to 212 degrees" | 2 | Stagg EKG listing, so correct inside a kettle script |

**Recurring judge claims.** "native and women-owned" (11 + 5) is **not** a fabrication. It is the stored `brands.description` ("Micro specialty coffee roaster, native and women-owned, Farmington, NM"), which the judge never sees. Likewise "Her name is Savannah" (8) comes from her own voice sample hooks. "Shipped within two days" (4) is the readiness answer. These are judge false positives.

**Recurring unsourced phrasing** (5-word phrases in 4 or more scripts that appear in no stored text):

| Phrase | Scripts | Source |
|---|---|---|
| "gave up my first month (of roasting)" | 13 | close paraphrase of fact `c853e87c`, so backed |
| "sit on shelves for months" | 8 | **fresh**: "for months" is never stated anywhere. It grew from a lesson ("coffee sitting dead on grocery shelves") |
| "two-pound batches with zero inventory" | 7 | fact `35d868c7`, which she believes she excluded (see part 3) |
| "twelve ounce bag for eighteen dollars" | 7 | Signature Blend, often in the wrong script |
| "half the batch was scorching" | 6 | **fresh**, and she already corrected it (part 11) |
| "roast date stamp" | 4 | **fresh**, and she already corrected it (part 11) |

**One-off fabrications.** There are 6 one-off unbacked figures. Examples: part-1c#44 "ready in five seconds", part-1e#22 "adjusts through forty", part-1f#4 "cuts through sixteen ounces". The judge also flagged 135 one-off claims. Most are invented technique or how-to specifics. Examples:
- part-1b#4: "fresh beans hold their full moisture" (also wrong)
- part-1b#11: "keep your opening menu strictly to espresso, milk, and one signature syrup"
- part-1b#14: "I kept my menu tight"

The stored findings are `unbacked_figure` in 45 scripts, `writer_flagged_unsourced` in 6, `unbacked_role` in 0, and `guard_removed` in 125. That means the guard is cutting lines in a third of all scripts.

## 2. Private and sensitive content (zero tolerance)

The account marks 10 facts `sensitive = true`: the police and code-enforcement visits, the neighbour complaints, animal control, postpartum depression and financial hardship, and the broadcast home address. Every spoken line, shot-list line, hook, hook option and caption was scanned. The scan used the guard's own `PRIVATE` regex plus paraphrases of those stories.

| Script | generation_id | Content | Caught by guard regex? |
|---|---|---|---|
| **part-1e#92** | 971f9c9f-e481-47aa-aff3-ca1e207238d7 | "I had 26 days to move my roastery… or face **fines and a court date**." / "I had **$11 in my bank account** during inspections—until **the officer** joked she was coming back just for the coffee." | no |

Next to private: the officer or inspector visit. These come from fact `cbd27272` ("The visiting officer joked…"). That fact is the same police story but it is **not** flagged sensitive. Her voice `sample_hooks` and `hook_patterns` also contain "city inspector" and "Police Department code enforcement":

| Script | generation_id | Content |
|---|---|---|
| part-1b#79 | 151336d4-77cc-4e40-833e-ebe424270ac6 | hooks: "today the city inspector walks through our doors", "Our inspector told her entire office she might return with coffee" |
| part-1c#20 | 2c316a6f-f64c-4df8-ba29-4fc4fa0128c9 | "city inspectors have specific requirements…" (generic, borderline) |
| part-1d#16 | 09188740-9cf2-40e4-84b7-a8b368b60300 | "inspection checklist" (generic, borderline) |
| part-1d#18 | 1164ac0f-28ce-4898-932f-459a1f4b7fb6 | hook "What city health inspectors never tell…" (generic) |
| part-1e#5 | 72d9c0e1-8cd8-4b97-9344-837340e20699 | "The visiting inspection officer walked through our doors today… joked…" plus hook "The city inspector just walked into my home roastery" (House Espresso sell script) |
| part-1e#77 | e201011a-ac3c-4c81-9909-f8f5bb63323e | "it reminds me of the visiting officer who joked…" (Bella Donovan sell script) |
| part-1f#5 | bc7bec02-b884-442c-92ae-04932e04acb7 | "Even a visiting officer joked she told the girls in the office…" |
| part-2#128 | 6edf5e1c-0df8-4d73-bf21-f687e71d2dcc | caption "inspectors walked through doors" |

She already rated a script 1 star for exactly this ("mentions police visits and neighbor complaints in a coffee ad… it's private"). **Every one of these slipped past the guard regex**, because "officer", "inspector" and "court date" are not in `SENSITIVE`, and the fact the material comes from is not flagged.

## 3. Exclusion reliability

There are 5 facts with `creator_excluded_at` set: Breville (2 facts), the Brazil roast (2) and the Ethiopia light roast. Scripts containing their distinctive terms, when the term was not in her own note or the chosen product: **1/370 (0.3%)**. That is part-1c#4, "velvety". The DB-level exclusion works.

**The real problem is the facts she excluded in her own words but the database never recorded.** Rating `64a35077` says: "brings back the two-pound batches and cup-score claims I've excluded multiple times now." Neither the two-pound facts (`0cf64884`, `35d868c7`) nor the cup-score facts (`82087f3c`, `c1f4a73d`, `0e59dfe1`, `c86ede34`) are flagged excluded. Results:
- two-pound batches appear in **67/370 scripts (18%)**: part-1e 23/91, part-2 17/48, part-1f 5/24.
- cup scores appear in 8 scripts.

Measured against her stated intent, the exclusion failure rate is about **20%**, not 0.3%.

## 4. Teleprompter vs shot list

| Check | Result (368 scripts with lines) |
|---|---|
| Full agreement: same lines, same order, same count | 368 (100%) |
| Opening line matches | 368 (100%) |
| Closing line matches | 368 (100%) |
| Scene count matches | 368 (100%) |
| Exact line mismatch | 0 |
| Scene-count mismatch | 0 |
| Camera mismatch where the lines match | 0 |

This is fixed in every batch. Her complaint from 09-28 (rating `3f1ee653`) no longer reproduces. Caveat: the shot list now copies the beats, so agreement is guaranteed by construction. It does not show that direction and framing are coherent; part 12 covers that.

## 5. Hooks

Hook scores are stored in `audience_tests.hooks[].stopped`: the number of the 6-viewer panel who would stop scrolling. `best_hook` is the index of the winner.

- The first line is the top-scored hook in **160/368 (43.5%)**. In 290 scripts the first line is one of the tested hooks; of those, 152 used the top one and 138 used a lower-scoring one (by 1 viewer in 46 cases, 2–3 in 67 and 4–8 in 25). In the other 78 scripts the opening line was never tested.
- Latest batches: part-1e 34/91 (37%), part-2 21/48 (44%), part-1f 12/24 (50%).
- `hook_options` count: fewer than 3 in **1** script, 3–6 in **369**, more than 6 in **0**.

Top hook score by goal (out of 6 viewers; a few panels had up to 10):

| Goal | n | Avg | Min | Max |
|---|---|---|---|---|
| authority | 14 | 6.6 | 4 | 10 |
| followers | 14 | 6.3 | 4 | 9 |
| conversations | 65 | 6.2 | 3 | 9 |
| educate | 67 | 6.1 | 3 | 10 |
| personal_brand | 59 | 5.9 | 3 | 10 |
| entertain | 31 | 5.6 | 4 | 10 |
| sell | 61 | 5.5 | 3 | 10 |
| leads | 57 | 5.2 | 3 | 9 |

## 6. Diagnosed gap to fix

An actionable gap is an `audience_tests.fixes[]` entry with a fix text and a beat. A gap counts as addressed when `improved.lines` changed that beat (±1) or `improved.lines_added` is not empty. It counts as written back when the changed line is in the final script.

- **78 of 516 gaps (15.1%)** were addressed, and all 78 were written back.
- Latest batches: part-1e 25/109, part-2 7/56, part-1f 4/22.
- Typical unfixed gaps are `promise_not_kept` ("Deliver the practical first step… promised in the hook") and `weak_ending` ("tell people where to get it"). She has complained about this pattern twice (ratings `5dff4aab` and `9b54c67c`: "your own viewers told you… you knew that was missing and sent it anyway").

## 7. Arc adherence by goal

`blueprint.arc` exists from part-1c onward (171 scripts).

| Goal | Arc row | With arc | Fits | Mean `product_first_at` | `arc_mismatch` findings | Mean beats |
|---|---|---|---|---|---|---|
| sell | sell (27), teach (1) | 28 | **92.9%** | 0.04 | 2 | 3.7 |
| leads | sell | 28 | 85.7% | 0.09 | 4 | 4.2 |
| conversations | answer | 27 | 100% | 0.05 | 0 | 4.0 |
| authority | teach | 8 | 100% | n/a | 0 | 4.4 |
| followers | entertain | 8 | 100% | n/a | 0 | 4.6 |
| educate | teach | 29 | **44.8%** | 0.08 | 16 | 4.0 |
| personal_brand | story | 16 | **43.8%** | 0.15 | 9 | 4.5 |
| entertain | entertain | 27 | **37.0%** | 0.13 | 17 | 4.1 |

**The shapes barely differ.** The product shows up in the first 4–15% of the script for every goal, including entertain and story. Every goal averages 3.7–4.6 beats. Sell and leads fit because their arc asks for the product early. Entertain, story and teach fail because the product is still pulled to the front.

## 8. Signature voice

The real signature phrases are `brand_voices.profile.vocabulary`: "hits your hopper", "little home coffee roastery", "roast to order", "cup scores above 80", "shop small", "mission", "free shipping", "what is my life".

- **57/370 (15.4%)** use at least one. Counting her CTAs ("link in my bio", "stick around") raises this to 19.7%.
- By phrase: hits your hopper 18, roast to order 14, mission 13, free shipping 9, little home coffee roastery 6, cup scores above 80 3. "shop small" and "what is my life" were never used.
- Latest batches: part-1e 18/91 (20%), part-2 8/48 (17%), part-1f 6/24 (25%).

## 9. Product fact exact match

There are 40 scripts that name a price, an oz size or a bag size for a selected product. **28 (70%) match exactly.** All 12 drifts are the same thing: Signature Blend's "12oz / $18 / 5lb / $65" stated for a product that has **no stored offer**. Those products are House Espresso (part-1c#2, part-1d#1, **part-1e#5**, **part-1f#5**), Bella Donovan (part-1c#61, #62, **part-1e#72, #74, #77**), Cold Brew (**part-1e#53**) and Single-Origin (part-1c#53). The Stagg EKG "60-minute" hit (part-1c#48) is backed by the listing's hold mode, so it is a false positive.

No script misquoted a product's *own* stored price.

## 10. Cross-script contamination

**15/370 (4.1%).** Fourteen of them are the Signature Blend sizes and prices above, placed in another product's script. The fifteenth is part-2#119 ("packing orders on a Saturday"), an idea video that quotes "$18 / $65" with no product chosen. part-1c#74 and #79 ("Sunflower Coffee Roasters") quote the Signature prices too. No script named a different product that was not chosen (`rule_context.unpicked` is respected).

## 11. Repeated corrections

She left 17 ratings (14 with notes), all before the first batch. Scripts that repeat a mistake she corrected, when the wording was not in that scenario's own note:

| Correction she gave | Scripts repeating it | Examples |
|---|---|---|
| Two-pound batches ("excluded multiple times") | **67** | part-1e (23), part-2 (17), part-1f (5) |
| "burnt / overly acidic" grocery coffee ("I didn't describe it that way") | 60 | wording is backed by stored opinion `6d39f81c`, so the correction never reached the fact |
| Cup-score claims | 8 | part-1d#5, part-1e#10, #56, #60 |
| "half the batch was scorching" | 6 | part-1d#11, part-1e#3, #58, #73, part-1f#7 |
| Police or officer story in a coffee ad | 5 | part-1e#5, #77, #92, part-1f#5, part-2#99 |
| "roast date stamp" | 4 | part-1e#61, #63, #74, part-2#106 |
| "Hello, I am Savannah / welcome back" greeting | 2 | part-1c#79, part-1e#44 |
| Velvety body (excluded) | 1 | part-1c#4 |

`creator_lessons` holds 16 `avoid` lessons (15 active), but the mistakes still repeat. Her notes have not been turned into fact exclusions: the two-pound, cup-score and burnt/acidic facts are still live, and the writer is handed them as usable facts, which outweighs the avoid lesson.

## 12. Camera labels

- Only **683 of 1,521 spoken beats (44.9%)** have a camera label. batch-1 through part-1c have none.
- Of those labelled: `front` 678, `back` 5.
- Demo beats (show, turn, pour or hold the bag, point at the screen) labelled `front`: **30/34 (88%)**. Example: part-1d#7 "Turn the bag slowly to show the side profile" labelled `front`.
- Talking beats labelled `back`: 1/649.
- Overall, 4.5% of labelled beats are backwards. Effectively the label is always `front`, so it carries no information.

---

## Top root causes

1. **Corrections never reach storage.** Her notes say "excluded" and "never said that". But the facts (two-pound batches, cup scores, burnt/acidic) stay unflagged and are still handed to the writer as usable, which outweighs the 15 active avoid lessons. This drives part 3 (67 scripts), part 11 and much of part 1.
2. **Sensitivity is a keyword regex.** The police story also lives in an unflagged fact (`cbd27272`, "visiting officer") and in her voice `sample_hooks` and `hook_patterns`, and paraphrases ("officer", "inspector", "court date", "$11") pass the guard. This is part 2.
3. **The Signature Blend offer bleeds into products with no offer.** When the selected product has no price or size, the writer borrows the only priced coffee product's 12oz/$18/5lb/$65. This drives parts 9 and 10 and most recurring figures in part 1.
4. **Audience-test output is advisory, not binding.** The top hook is used 43.5% of the time, and only 15% of diagnosed gaps get fixed.
5. **Arc and camera are labels, not constraints.** The product appears first in every goal, so entertain, story and teach fit only 37–45% of the time. Camera is `front` by default, and 88% of demo beats are labelled `front`. Separately, the batch judge failing on quota left the latest batches mostly unjudged.

