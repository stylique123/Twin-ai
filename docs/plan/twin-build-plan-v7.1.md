# Twin build plan v7.1 — turn it on, connect it, make it safe for the first creators

This plan builds on v7.0 (advisor) and the owner's additions of 27 Oct. It keeps every item of v7.0 and of plan v6.8 Sections 1–34. Its order of work replaces theirs. Two changes from v7.0: **dates are dropped** and **the repo stays public**. Every public-repo rule stays: fictional fixtures only, and no creator material, third-party text, keys or server details anywhere in the repo.

Code paths below are relative to the repo root. **G** = `supabase/functions/generate-blueprint/index.ts`.

---

## 0. The aim (one loop)

1. She picks a door (Product, Idea, Reference, or "I don't know" → Gallery) and a goal, and types an idea or pastes a link.
2. Twin reads what it already knows about her:
   - voice, onboarding answers, pillars;
   - stories and earlier answers;
   - product facts;
   - brain notes, lessons and moments;
   - the niche pain map from Reddit and other public posts.
3. It **finds the gaps for this exact request** and asks **two questions** about them, in her topic's terms.
4. It writes **one script** in **her voice**, from **her material and her answers**, in **the house structure**:
   - hook → setup or problem → her proof or story built in phases → **re-hook** → method or product → payoff → **one CTA at the end**.
5. It checks that nothing is invented. She reviews, edits and posts.
6. Her answers, edits and ratings feed the next request.

Outside material (Reddit, TikTok, Instagram, YouTube) gives topics, audience pain and shapes. It **never** becomes her experience, is never quoted, and never shows a username.

## 1. Rules that do not change
v7.0 §1 and the standing rules all hold:
- Every line traces to a source.
- Nothing posts without her review.
- The hard limits hold.
- No pasted credential is ever used.
- Checks are never weakened or bypassed.
- Each component has one kill switch.
- Merges happen only on the owner's explicit "merge X", with `safe-merge.sh`.
- No `supabase db push`.
- Workflows that use secrets change only with the advisor's review.

**On "turn everything on":**
- Every component is **built so it can be ON for all accounts**, behind its own switch.
- The actual flip for real creators is one owner word per component: "turn on X for all".
- The advisor's two limits stay unless the owner overrules them:
  - Personas score and log only, until r ≥ 0.5.
  - The question flow and the new writer path go 5% → 25% → 50% → 100%.
- Research-only components can flip for everyone at once. These are the Reddit scan, the pain map, and post scraping, because none of them changes what a creator sees.

## 2. What the code audit found (27 Oct, main at f1a6798)

### 2a. Questions are lost before the writer
The owner's complaint is confirmed. There are seven break points, all in G unless named:

| # | Where | What happens | Fix |
|---|---|---|---|
| Q1 | G:6943 + `_shared/itemFormat.ts:74` | A typed answer is saved as kind `claim`, then read back as `unconfirmed` and skipped, so the same question is asked again | Treat basis `stated` plus `creator_confirmed_at` as usable (`angleMaterialUsable`, already on #1319); move it into its own PR |
| Q2 | G:6967, `itemFormat.ts:42` | An answered key is never excluded from the next plan; `claim` maps to the `proof` slot, not to the slot that was asked | Store the asked **slot** with the answer; exclude answered keys as well as skipped ones |
| Q3 | G:6912 → G:7741 `scopeToVoice` | The answer row is saved with `voice_id = null`; the writer reads only rows with her voice id, so **the writer never sees it** | Pass the ready voice id in `angle_answer`; also read rows with no voice id |
| Q4 | G:8183 | In Product mode an answer is dropped as "off-ask" unless it repeats a product word | Exempt `asked:mn:*` answers given for this request |
| Q5 | G:16614 | The `mn_answers` sent with the request are only used to measure afterwards, never put into the prompt | Put this request's answers into the writer's pile as her material, in their own block |
| Q6 | G:10532 | Pillars reach neither the writer nor the angle planner | Pass them to `pickAngles`/`planQuestionsForAngle` and into the writer brief |
| Q7 | G:6900, 6728, 6751, 6814 | The question side doors open only for heartbeat and panel accounts, so the owner and the canary are shut out | `trialSideDoorOpen` (#1319); then the ramp |

### 2b. The voice is under-used
| # | What happens | Fix |
|---|---|---|
| V1 | With `VOICE_CARD_ENABLED` unset, **real creators get no voice card**, only the old dos/donts summary | Turn it on for all under the ramp (the card is built from her own words, so the risk is low) |
| V2 | Thin creators get no card; the manual card (#1336) is off | Merge #1336 and turn on both manual flags |
| V3 | `style_note` and her real sample lines reach only the polish step, **never the writer** | Send the voice brief (note, 2–3 of her own lines, rhythm rules) to the writer |
| V4 | The card is a block of counts at the end of a very long line; the empty `voice_samples` slot still says "strongest signal"; a default register card can fill in over hers | When a card exists, put it **first** in its own section, mark it highest priority, and drop the default register card and the empty-slot wording |
| V5 | The voice check (`voice_match`) only logs | When it fails, run one repair driven by rhythm (sentence length, openers, pacing), not only by never-uses words |
| V6 | Two field names (`voice_samples` vs `profile.samples`) | Use one field; point onboarding at it |

### 2c. The house structure is weak in the writer
| # | What happens | Fix |
|---|---|---|
| S1 | Real accounts without a reference get **one sentence** about a re-hook: no beat order, no phases, no build-up to the CTA. The template, spine and hook engine reach test accounts only (`releaseFlags` S0) | Always send one explicit **beat order with each beat's purpose and word budget**; ramp the `templates`/`planner`/`spine` components |
| S2 | The 13 T-templates have no re-hook role; only 3 of the 14 container templates have one | Add a re-hook beat to every template longer than Sprint |
| S3 | `renderTemplateSkeleton` lists filled slots only: no purpose, no phases | Render each beat's purpose, budget and "end with a pull" |
| S4 | The retry prompt drops the template and spine (G:12782) | Keep a short spine block on retry |
| S5 | Container templates, T-templates and the spine are three unlinked structures | One ordering source per request: the **house structure** (§4), with the reference shape or T-template mapped onto it, and the source logged |
| S6 | Clean-up can delete a weak re-hook (`cleanBeats`, `dropEchoCloser`) | Exempt beats labelled re-hook; repair them instead of dropping |
| S7 | CTA-last is enforced only behind `SPINE_COMPLETE=on` (test only) | Run the CTA part for all accounts |
| S8 | `BEAT_WORD_BUDGETS` (#1338) and the QC structure checks (#1341) are unmerged | Merge; make "re-hook present" and "CTA last" blocking checks in the QC (they repair, not drop) |

### 2d. Inputs, knowledge and corrections to the v7.0 table
- The doors are Reference, Idea, Product and "I don't know" (that one goes to the Gallery). There is no separate Suggest mode. A product URL is entered in the Product Library, not at create time.
- **Idea text** already gets 0–3 questions (`idea_questions`, G:6600) that read the niche and `niche_reddit`. It is not linked to the angle questions.
- **Read when a script is built:** `creator_knowledge`, product facts, onboarding (`pre_script_brief`), lessons, corrections, `brain_notes`, `brain_moments`, `niche_research`, `niche_reddit`, vocabulary, reference profiles.
- **Never read:** `creator_ideas`, `creator_seasonal_ideas`, `creator_shifts`, `brain_links`, `own_post_reads`.
- The `audience_pain_map` is read only by the trial-gated `angle_plan`. `runRedditScanV2` has no caller.
- **The v7.0 §6 "unconnected honesty modules" are in fact wired:** `claimEntitlement`, `referenceClaimLeak`, `scanTargetConfirmation` and `creativeTransferPlan` all have production callers. So WP8 becomes "prove they run **after the last edit**". The truly tests-only modules are `factClass` and `storyClassify` (the story classifier). `resolveCreatorState` looks dead.
- Several modules v7.0 listed for deletion are **inlined and called** in G: `eventRetention`, `ownVisualShape`, `nicheAnchor`, `paragraphDecomposition`, `subjectRecurrence`, `traceability`, `voiceMetrics`. **They are not deleted.** Only modules with no production caller are deleted: `storeGap` (after its UI user is moved), `factClass`, and the dead `resolveCreatorState`. Each deletion is checked by grep in its PR.
- `isCompleteStory` does write `story_passages` (`remineKnowledge.ts`), yet the table holds 0 rows. WP4 finds out why.
- Migrations 0290 and 0291 exist as files. The release registry reads the table only when `RELEASE_REGISTRY_SOURCE=table`.

## 3. The question engine (owner's spec, made concrete)

**Inputs for every request:**
- the door (mode) and the goal;
- the idea text, or the link (reference or product);
- the picked product;
- the picked angle.

**Step 1 — inventory by slot.** For this angle and template, list the slots it needs (story, problem, proof, stance, method or steps, product fact, offer and CTA, audience). Mark each slot from its sources: her material, earlier answers, product DNA, onboarding, voice card, brain (notes, lessons, moments), and the pain map. The result per slot is **filled**, **thin**, **missing** or **conflicting**.

**Step 2 — gaps by source.** Each gap is tagged with where the knowledge is missing:
- **product:** a fact slot has nothing on file, or is unconfirmed;
- **voice:** no card, or a thin one;
- **onboarding:** audience, offer, or a missing pillar;
- **story:** no on-topic story;
- **pain:** a niche pain this topic touches, with no example from her;
- **input:** the link didn't read, or the idea is vague.

**Step 3 — door-specific question banks** (wording is Twin's own, never a quote):
| Door | Asks about |
|---|---|
| Product | the problem it solves *for her buyers*; her first or best use moment; the missing fact slot (price, trial, steps, who it's for); the objection buyers raise (from the pain map) |
| Idea | what made her think of it (the moment); her stance; the one example she'd give; who it's for |
| Reference | what *her* version of the reference's beat is (the shape is borrowed, the story is hers); which of her stories fits the reference's turn |
| Gallery or "I don't know" | which of her pillars this trend fits; her take on it |
| Any | a sharpener when nothing is missing: a number, a place, a before/after detail she can confirm |

**Step 4 — pick two (mandatory to show, never random, never repeated):**
- **Q1 (pain):** from the pain map matched to her niche and this topic (`painToQuestion`). It asks for her real example.
- **Q2 (gap):** the highest-value missing slot for this angle, in the order story → problem → proof → product fact → offer. If nothing is missing, ask the sharpener.
- **Dedupe:** by slot and by meaning, against saved answers and `question_asks`. A skip is never asked again.
- **Never** ask for dates or scarcity. Never presume an event.

**Step 5 — use:**
- Answers are saved with their slot, her voice id and confirmed status.
- They go to the writer **in their own block, placed at their slot's beat**.
- The QC fills from answers first.
- A skipped question gives a shorter honest script, never an invented line.

**Metrics:**
- **question necessity ≥ 70%:** a question avoided an invented or general fallback;
- **question use ≥ 60%:** her answer appears in the script;
- **re-ask = 0.**

## 4. The house structure (made explicit to the writer, enforced after)

| Phase | Beat | Purpose | Words (Standard) | Rule |
|---|---|---|---|---|
| 1 | **Hook** | stop the scroll: her story's first beat, or a sharp, true, specific claim or stance | 12–20 | no bare spec, no invented number; story-first; picked from 8–10 candidates by the hook engine |
| 2 | **Setup / problem** | name the pain in plain terms (pain map → topic, never proof) | 15–30 | pays off the hook's promise by the declared beat |
| 3 | **Her proof / story, built in phases** | what happened, in her words, after the problem and before the offer | 30–50 | verbatim or close; nothing added; never repeats the hook |
| 4 | **Re-hook** | bring them back mid-video with a new specific (a turn, a number, "here's the part nobody tells you", followed by real substance) | 8–15 | must carry substance; never a stall; never deleted by clean-up |
| 5 | **Method / product** | her steps, or the product fact that bridges the story to the offer | 20–40 | only confirmed facts |
| 6 | **Payoff** | the result or lesson *she* stated | 10–20 | no lesson she didn't say |
| 7 | **CTA** | one ask that matches her offer, at the end | 8–15 | exactly one, last |

**Sprint** keeps hook, story, one specific and the CTA, and has a re-hook only when it runs over 60 words. **Deep** may repeat phases 3–5 once.

**Mapping the existing structures:**
- Each T-template and each reference-video shape maps onto these phases, and the mapping is logged.
- The educate, sell and story skeletons of the craft rubric are three paths through this table.

**Enforcement:**
- The QC checks one thread, hook paid by the declared beat, story before offer, re-hook present, and CTA last.
- Failures are **repaired** from her unused on-topic material.
- Lines are never just dropped.

## 5. Work packages (offline first; in order)

Each package is its own PR, flag OFF by default or test-only, with tests that use fictional fixtures. Packages marked **[paid]** wait for Gemini quota.

**WP0 Housekeeping**
- Merges (§6), the small decisions of v7.0 §4 (with the deletion list corrected per §2d), and migration 0297 by the owner.
- Pause the hourly heartbeat until quota returns, then run it daily.
- A spend reconciliation script: Gemini by project and model, against Google's billing.
- Close #1070, #902, #883 and #805 on the owner's word.

**WP1 Make answers count** (Q1–Q6)
- Read-back as its own PR (from #1319), slot plus voice id on save, answered-key exclusion, the Product-mode exemption, this request's answers in the writer block, pillars to the planner and the writer.
- *Done when* a test shows an answered question is never asked twice and its text reaches the writer prompt, in every door.

**WP2 Ladder and problem question:** turn on #1334 for test, panel and canary accounts.

**WP3 Question engine** (§3)
- Slot inventory with source tags, door banks, `painToQuestion`, the always-two rule with the sharpener, and meaning dedupe.
- Merge `idea_questions` into the same engine so Idea doesn't ask twice.
- Tested with the fictional pain map and fixture answers for every door.

**WP4 Classifier check:** why `story_passages` is empty; wire `storyClassify` into the writer's story pick, or fix the pipe. Backfill is **[paid]**.

**WP5 Reddit and public posts ON**
- Wire a caller for `runRedditScanV2` (batch tier, under the owner-confirmed cap, 30-day cache per niche, kill switch, the 0295 breaker).
- The pain map is read by the question engine and the writer for all accounts once flipped.
- A test fails the build if a username key or raw post text reaches the writer or the screen.
- TikTok, Instagram and YouTube scraping continues under the research-only rule.

**WP6 Writer receives the loop**
- Review and merge #1340 (`withRealisticContext`).
- Separate blocks for her answers, her material, pillars and pain themes (outside, labelled).
- Real accounts' prompt stays byte-identical until each ramp step (a test pins it).

**WP7 Voice in the writer** (V1–V6)
- The card first and highest priority, the style note plus her real lines in the writer, the default register card dropped when hers exists, one sample field, and a rhythm repair on a failed voice check.
- `VOICE_CARD_ENABLED` ramps with the writer path.

**WP8 House structure in the writer** (S1–S8)
- The beat table of §4 sent explicitly, re-hooks added to the templates, the skeleton rendering purposes, structure kept on retry, the re-hook protected in clean-up, CTA-last for all.

**WP9 Quality controller, answers first:** review and merge #1341 and #1338 (budgets). The QC fills from answers, then unused on-topic material, and stops at 110%. The structure checks of §4 repair. Free-judge best-of-N.

**WP10 Honesty proof:** a test per honesty module that its call site runs after the last text edit (corrected scope, §2d). Wire `factClass` or delete it.

**WP11 Personas in shadow** **[paid]**: calibrate against 603 hooks and 109 scripts. They log only until r ≥ 0.5.

**WP12 Panel kit:** scripted fixture answers per fictional creator and door, so the question path really runs. Two arms on the same 24 requests (A = P10 baseline, B = the full loop). The budget is printed before every run. A blind package with no key.

**WP13 Reconcile and run** **[paid]**: billing reconcile; staging re-runs (#1315 and the PRs touching `supabase/functions`, which clears `risky-path-gate`); Audit Set v2 on real pages (HTML kept out of the repo); Reddit scans for the fixture niches; panel 13; advisor labels.

**WP14 Canary and ramp**
- #1315, then #1319. Then the canary account (owner first, then a consenting coach), feedback capture, a daily report and the kill switch.
- Then the 5/25/50/100 ramp per component, each step on the owner's "go".

**Not in the order but kept:**
- panel 12 key and metrics go to the advisor after labels;
- labels for panels 5 and 9 and the structure checks;
- unholding #1322 and #1325 after panel 13;
- the assembled-body fallback if craft stays under 3.8;
- real niche packs (owner input);
- a private advisor-label store;
- keeping pre-polish text for an exact false-block rate;
- everything in v7.0 §13 (parked) and the plan-v6.8 register.

## 6. Merge order (unchanged in substance, owner says "merge X" each)
1. Now:
   - #1336 → #1334 → #1342 → #1343 (then 0297) → #1333 → #1344 → #1335 (the cheaper-actor switch stays off).
   - #1337 (0296 waits for counsel).
2. #1315 when staging passes (re-run after quota; no bypass), then #1319.
3. Advisor review first: #1341, #1340, #1339.
4. Hold: #1338 (until WP9), #1322 and #1325 (until panel 13), #1324 and #1312 (the advisor reads them).
5. Frozen: #1332.

## 7. Gates (unchanged)

**Canary gate, single user, on a panel that includes the question loop with scripted answers:**
- craft ≥ 3.8;
- median words ≥ 90;
- invented-line scripts ≤ 8% and zero wrong-product facts;
- failures ≤ 1/24;
- p90 ≤ 125 s;
- 0 placeholders;
- repeats ≤ 2/24;
- hooks at 4–5 ≥ 45%;
- the general version available;
- "check this line" visible.

New measures:
- question use ≥ 60%;
- re-ask = 0;
- re-hook present in Standard and Deep ≥ 90%;
- CTA last = 100%.

**Canary exit:**
- ≥ 15 real scripts averaging 7 of 10 or better;
- ≥ 50% posted with light edits;
- zero honesty failures seen by a viewer;
- cost per script known.

**S3:** craft 4.2 on a blind panel.

## 8. Who does what
- **Owner:**
  - "merge X" and "turn on X for all";
  - the Reddit cap;
  - the lawyer's written note (Reddit and video sources);
  - Gemini quota or billing;
  - migrations by hand (0290, 0291, 0297; 0296 after counsel);
  - the canary UID;
  - the go for each ramp step.
- **Claude Code:** WP0–WP14 in order. It never stops while an offline package is open.
- **Advisor:**
  - reviews #1341, #1340, #1339 and #1324;
  - labels each panel blind;
  - checks the gates.

## 9. Risks
- **Quota** blocks every paid step.
- **Spend** is not understood: the ledger shows about 10× less than Google's bill. Reconcile before any panel.
- **Thin real creators:** the questions are the remedy, which is proven only by use.
- **The flip:** turning question and voice changes on for all at once, without the ramp, puts honesty checks that have only run on test accounts in front of real creators. That is why the ramp is the default.
