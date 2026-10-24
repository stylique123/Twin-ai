# CRAFT RUBRIC v1 (advisor, 22 Oct) — what a 5-of-7 Twin script looks like, from 109 labeled scripts and 603 rated hooks
Data: `craft-calibration-set.csv` (109 scripts from panels 5, 6, 7, 8, 10: script text, craft 1 to 7, postable, labels) and `hook-calibration-set.csv` (603 hooks rated 1 to 5 for "would you stop scrolling"; 38 flagged as inventing a claim). All creators are fictional.

## What the data says
- **Length matters most:** craft correlates 0.46 with length. Average craft by words: up to 50 words 2.8 (0% postable); 51 to 75 words 3.2 (7%); 76 to 100 words 3.9 (**35% postable**); 101 to 130 words 3.9; over 130 words 4.3. A script under about 75 words is almost never postable.
- **More true lines alone do not make it good** (craft correlates only 0.25 with the share of lines that follow her material): a script that dumps true but unrelated lines scores about 3.5. **Structure and relevance** decide craft.
- Scripts with an invented line averaged higher craft (3.8 vs 3.3) only because the free writer pads with fiction: the job is to get the same length and richness **from her real material, in the right order.**
- **Hooks:** real-story and sharply specific hooks average 4.1 to 4.5 of 5; generic questions, product-first lines and bare facts average 1.5 to 3.

## The seven things a craft-5 script has (score each 0 to 1; craft is roughly 1 + 6 x the weighted sum)
1. **One thread (weight 0.20):** a single topic from hook to close; every line serves it; no unrelated story dumped in (a stale-beans video must not also tell the garage story).
2. **A hook that is true and specific (0.20):** her story's first beat, or a sharp specific fact or stance; no invented number, timeframe or frequency; no bare spec line.
3. **Her real proof in the right place (0.15):** her story or testimonial verbatim, placed AFTER the problem and BEFORE the offer; never repeated (a story hook must not be followed by the same sentence).
4. **A useful middle (0.15):** her method or steps, or the product fact that bridges her story to the offer (educate: the rule or steps; sell and leads: what it is plus the price or trial).
5. **One clear call to action (0.10)** that matches her offer (link in bio, intro call, trial), once, at the end.
6. **Length and flow (0.10):** Standard 90 to 145 words; Sprint 55 to 80 with at least one story line and one specific fact; no filler lines; each line adds new information.
7. **Her voice (0.10):** matches her style note and samples (sentence length, exclamations, signature words, hedging).
**Automatic caps:** an invented or wrong-product line caps craft at 3; a spoken placeholder caps it at 1; a repeated story caps it at 3.

## The 5-of-7 skeletons (from the best scripts)
- **Educate** (P10-02 "unglazed mug bottoms", P8-09 "hip hinge"): hook (the question or claim) → her story that explains why → the rule or steps in her method → a check-it action.
- **Sell and leads** (P10-09 "FlowDesk", P10-19 and P8-11 "Home Strength Starter"): hook (the shared pain, her story's first beat) → the problem in plain terms → why she built it (origin story) → what it is (product fact, price or trial) → one call to action.
- **Story** (P10-18 "first kiln load"): hook (the failure moment) → what happened (verbatim) → what she does now (practice or product fact) → a closing question or call to action. Never add a lesson she did not state.
- **Thin request (little material):** her single best on-topic story plus one opinion plus a call to action; short is acceptable (Sprint) but the story must be vivid and specific; never pad.

## Examples
**GOOD (craft 5):**
P10-09 (FlowDesk, leads, 102 words): "We kept answering the exact same customer email twice. / When multiple people work out of one standard shared inbox, nobody knows who owns what. So you end up tripping over each other or leaving replies sitting in drafts. / I built the first version of FlowDesk over a winter because my partner and I kept answering the same customer email twice. / So I made a shared inbox that turns each email into a card on a board, with a 14-day free trial with no card needed. / It is $12 per month for up to three teammates. / FlowDesk: free 14-day trial, link in bio." (Why it works: one thread, her origin story, what it is, price, one call to action. To improve: voice (clipped founder talk) and a less repetitive hook.)
P10-02 (Clay & Kiln, educate, 90 words): hook about unglazed bottoms → her glued-mugs story → the buyer story → the reason (raw clay stops fusing) → a check-it action. (To improve: do not tell the buyer story in both line 1 and line 3.)
P8-09 (Coach Ana, educate, 145 words): hook → her deadlift story and broomstick method → four plain steps → a save-this action. (To improve: the steps are general technique, not hers; avoid absolute safety words.)
**BAD (craft 1):**
P8-03 (Clay, thin request, no material on file): "Stop rushing wheel work if the clay is still cold. / It forces you to slow down, the wall collapses. / Do you prefer pottery that feels perfectly smooth..." (Why it fails: generic, garbled, no story, no offer, invented craft claims.)
**BAD (craft 3, honest but incoherent):** P10-01 (Maya, stale beans): the real fridge story, then the garage story and the market-stall story (unrelated), her light-roast opinion, then a general tip: every line true, no single thread.

## How to use this (the Quality Sprint v2)
1. **Calibrated craft judge:** score any candidate script with this rubric plus six few-shot examples; validate it against the 109 ratings (train on panels 5 to 8, test on panel 10; target Spearman correlation at least 0.6 and agreement within one point on at least 80%). Re-validate on every new advisor-labeled panel.
2. **Best-of-N selection:** the parallel hedge call already produces two drafts: when both finish, keep the one the judge scores higher; add Plan B's output as a third candidate when it is on; never add latency (p90 at most 125 s).
3. **Spine completeness:** target at least 80% of scripts with a reality check or a clear problem line, her truth, and one call to action (panel 10: 5, 17 and 18 of 23).
4. **Hooks:** generate 8 to 10 candidates, filter by the claim gate, rank by a hook judge calibrated on the 603 ratings, and prefer a story-first or specific-fact hook.
5. **Meaning-level repeat check:** shadow-run it on the labeled panels (precision and recall) before turning it on.
6. **Ending and memorable line (C4, C5):** the polish step may reorder or trim her lines but never adds a claim; one line should stand out (her strongest specific).
