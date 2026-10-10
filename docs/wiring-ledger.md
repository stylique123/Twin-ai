# Wiring ledger

One row per feature in the consolidated build plan. A feature is **proven** only when all of these hold:
- a production caller exists
- an end-to-end disconnect test fails when the feature is unplugged
- it fires in a real batch
- its flag status is stated
- any mirror copy has a parity test
- the orphan count does not rise
- a real run's output has been seen

No private text here. Examples use fictional accounts (Maya's Coffee, FlowDesk).

**Status:** planned → built (code + unit tests) → wired (production caller) → proven (disconnect test + fire count + seen in a run).

**Flag:** `trialOn` means the test account only. The plan for everyone: decided at the Phase 6 exit, after the hold-out rating.

**Orphan count** (`node scripts/ci/check_symbol_readers.mjs`): 1340 exported symbols, 198 unreached, 145 unregistered. The CI ceiling is 145, so it cannot rise.

`index.ts` below means `supabase/functions/generate-blueprint/index.ts`.

| # | Feature | Producer (shared) | Consumer (file:line) | Flag | Disconnect test | Last-batch fires | Status |
|---|---|---|---|---|---|---|---|
| 3.1a | Camera follows the beat's purpose | `script/beatCamera.ts` `decideBeatCameras(…, {jobFirst})` | `index.ts:14642` | trialOn | none | not yet (merged after showit-2) | wired |
| 3.1b | Close-up shot type on showing beats | `script/showItBeat.ts` `applyCloseUpShots` | `index.ts:16029` | trialOn | none | showit-2: 12 close-up shots / 161 | wired |
| 3.3 | Show-it beat enforced on the final script | `script/showItBeat.ts` `enforceShowItBeat` | `index.ts:15992` | trialOn | none | showit-2: 4/4 physical scripts carry a showing beat | wired |
| 3.3b | Shown audit recomputed on the final script | `script/shownJob.ts` `auditShownScript` | `index.ts:16021` | all | none | showit-2: 31 blueprints | wired |
| 1.3 | Physical products showable by default | `script/inferShowability.ts` | `index.ts:7613` | trialOn | none | log tool down; not counted | wired |
| 3.4a | Software 25 s length target | `script/showItBeat.ts` `trialSoftwareTarget` | `index.ts:11783` | trialOn | none | not counted | wired |
| 3.4b | Software close answers cost, sign-up or time (measure) | `script/softwareClose.ts` `auditSoftwareClose` | `index.ts:16004` (#1178, open) | trialOn | none | — | built |
| 4.2 | Sentence support check (shadow) | `script/supportCheck.ts` | `index.ts:16091` | trialOn, log only | none | live: flags 50–64% of sentences | wired (shadow) |
| — | Provenance per sentence (ids only) | `script/provenance.ts` `buildProvenance` | `index.ts:16070` | trialOn, log only | none | not counted | wired (log) |
| — | Lessons: synthetic dropped, capped, deduped, expiry | `script/lessonSelect.ts` | `index.ts:7277` | trialOn | none | not counted | wired |
| — | Privacy guard cuts hard limits only | `privacyGuard.ts` `isHardLimit` | `index.ts:7270`, `index.ts:9609` | trialOn | none | storyload-3: 0 private cuts | wired |
| guard | Stock closer dropped | `script/beatCleanup.ts` `dropStockCloser` | `index.ts:15815` | trialOn | none | storyload-4: 0/16 stock closers | wired |
| guard | Invented causes cut | `script/inventedCause.ts` | `index.ts:15838` | trialOn | none | not counted | wired |
| guard | No-story invented events dropped | `script/noStoryEvents.ts` | `index.ts:15848` | trialOn | none | run 5: 2 dropped | wired |
| 2.2 | Complete-story detection | `script/passages.ts` `isCompleteStory` | **no caller** | — | none | 0 | built (orphan) |
| 4.3 | Question ladder (story ladder, templates) | `script/questionLadder.ts` (#1148) | **no caller** | — | none | 0 | built (orphan) |
| 4.3 | `storeGap` (gap → question) | `questionDeficit.ts` | **no caller** | — | none | 0 | built (orphan) |
| 0.1/0.2 | Item format, slot map, adapters (counts per slot) | `script/itemFormat.ts` `slotCoverage` | `index.ts` after the speakable set (`feature_fired` `item_slots`) | trialOn, log only | `check_wiring_ledger.mjs` row 0.1 | not yet counted | wired |
| 0.5 | Disconnect gate | `scripts/ci/check_wiring_ledger.mjs` + `wiring-ledger.json` | `pr-checks.yml` | CI | selftest (5 cases) | 13 rows pass | wired |

**Disconnect gate:** every wired row is now in `scripts/ci/wiring-ledger.json`, and CI fails if one is unplugged (import, call, flag argument or event). This is a static check on the real consumer file. Runtime proof is the fire count per batch, so a row becomes **proven** only after a batch counts it.

## 0.3 Field-reader audit (2026-10-08)
**Product facts.** All 15 stored fields reach the writer, but only generically, through `placeFacts` (`index.ts`). None is grouped by slot yet; that is plan 1.6.

| Field | Rows | Read by name anywhere in the edge? |
|---|---|---|
| feature | 191 | no |
| description | 43 | no |
| claim | 40 | yes |
| price | 38 | yes (CTA price) |
| category | 36 | no |
| name | 32 | yes |
| cta | 27 | yes |
| guarantee | 20 | no |
| benefit | 18 | no |
| audience | 11 | yes |
| object_shape | 10 | yes (showability) |
| use_case | 6 | no |
| page_section | 5 | yes (screen answer) |
| integration | 3 | no |
| plan | 1 | no |

**Creator knowledge.** All 9 kinds reach the writer through the speakable set:
- experience 256 and example 63 (slot: story)
- opinion 471 (stance)
- framework 213 (process)
- claim 220 (proof, unconfirmed)
- fact 84 (context)
- product 312 (what it is)
- covered 597 and topic 147 (context, subject-only on the trial)

**Fields the plan needs that don't exist yet:** problem, process_step, faq, proof_number, testimonial, screen, terms, includes, comparison, show_action. That is plan 1.1.

**No orphan fields:** every stored field has a reader.

## 0.6 Baselines (batch scripts from the last 3 days, before #1177 was live)
| Category | Scripts | With a showing beat | Showing beats on the back camera | Talk, claim or story beats on the back camera | Non-talk shots / all shots |
|---|---|---|---|---|---|
| All | 324 | 97 (30%) | 50/153 (33%) | 113 of 1402 beats | 14/1730 (0.8%) |
| PHYSICAL_PRODUCT | 81 | 53 (65%) | 33/93 | 40 | 12/453 |
| SERVICE | 48 | 3 (6%) | 0/3 | 6 | 1/260 |
| COURSE | 23 | 1 (4%) | 1/1 | 16 | 0/117 |
| COMMUNITY | 17 | 2 (12%) | 0/2 | 8 | 0/88 |
| DIGITAL_PRODUCT | 15 | 0 | — | 5 | 0/73 |
| APP | 3 | 0 | — | 2 | 0/16 |

Software-like scripts (APP, DIGITAL_PRODUCT, COURSE, COMMUNITY) with a showing beat: 3 of 58 (5%). Teleprompter and shot-list agreement is not measured yet; that comes with plan 3.1.

## Planned rows from master plan v3.1, Part 8 (status: planned)
| Source | Item | Belongs in |
|---|---|---|
| 8.1-1 | Leak and cleanup list: origin check for everyone, profile-label leaks, brand-name-only-when-relevant, idea scripts naming a product, scan topics as claims, invented causes made general, padding, conversations arc, held bridge/teaser and CTA changes (tested against the rated library first) | W3, re-checked in Phase R |
| 8.1-2 | Hard-limit regression tests (street address, precise location, deleted posts, minors' identifying details still cut) | Phase R |
| 8.1-3 | Ask-first rate re-measured cleanly after the skip fix; repeated-ask check | Phase R, W1 |
| 8.1-4 | Latency budget (about 95 s per script) and real step events on wait screens | W5, W8 |
| 8.1-5 | Reference, Idea and Suggest modes evaluated in the hold-out; Reference: shape kept, words new | Phase 6, before B4/B14 |
| 8.1-6 | Option dependency split (needs her moment / her facts / general knowledge) | Phase 4.3 (minimal), W8 |
| 8.1-7 | Phase 5 specifics: stance profile, idea ledger, 30–50 sourced claim library, origin tags and claim ids, mix dial, labeled sets | Phase 5 |
| 8.1-8 | Coffee-specific word lists in the claim check replaced by a general check; non-coffee fixtures per rule | Phase 6, rollout |
| 8.1-9 | Roadmap gates A–E (frozen hold-out, second-account sentinel started early, gradual rollout with kill switch, scheduling/AI edit after rollout, beta) | Gates A–E |
| 8.1-10 | Beta readiness checklist | Gate E |
| 8.1-11 | Policy text for counsel, data deletion path, consent record for test creators | Gate E, owner |
| 8.1-12 | Side-by-side sheet of 3 reshaped stories (local only) and the 30-story human check | Phase 2.4 |
| 8.1-13 | Create flow v4 details (angle screen, panels, preflight, durable job, take, flow state, skip caution outcomes, script_kind) | W8 |
| 8.1-15 | Scheduling and AI-edit audit now, fixes after rollout | Gate D |
| 8.1-16 | Persona and reviewer v2, second judge from a different model family | W5, parked |

## Planned rows from master plan v3.10, Parts 11 to 16 (added 2026-10-10)
| Source | Item | Status / belongs in |
|---|---|---|
| 11.1-1 | Every update reports spend (model cost, cost per script by stage, CI minutes) | standing rule; per-script tokens from `blueprint.ai_usage` (#1199) |
| 11.1-2 | Usage ledger: every model call with model, stage, tokens, request id, traffic tag (test/audit/real) | partial: edge writer calls only (`_shared/aiUsage.ts`); worker calls and traffic tag planned |
| 11.1-3 | Separate keys or projects for test and real traffic, budget alert, daily quota | owner (Google Cloud) |
| 11.1-4 | Batch caps (daily about 40, per batch), above needs owner approval with cost | harness; only the approved 30-script physical batch |
| 11.1-5 | Deploy check before any batch (worker and edge equal main) | harness runbook |
| 11.1-6/7 | Frozen sets once per checkpoint; replay recorded outputs instead of live calls | Phase R, W10 |
| 11.1-8 | Stage toggles off in tests (panel, reviewer, second judge, lengthen) | built: `cost_mode=test` (#1199) |
| 11.1-9 | Dedupe and cache by input hash plus code version; incremental re-mine and re-scan | planned |
| 11.1-10 | Cheapest suitable model per job; batch mode and context caching for backfills | planned |
| 11.1-11 | Call budget per script; clean failure at the cap | planned |
| 11.1-12 | Trim the writer prompt; tokens per script as a metric | planned (writer input contract) |
| 11.2 | CI minutes: timeouts, cancel-in-progress, caching, path filters, heavy suites on main only | partial (#1190); target about 5 minutes per PR |
| 12.4 / 13.4 | Preservation: run manifests, private archive table, nightly export | built (`test_run_manifests`, `test_run_files`); nightly export waits on owner destination |
| 14.2 | Public-window rules (no creator material, row-id inputs, no generated output, no self-hosted runner) | standing rule; runner guard (#1190) |
| 14.3-1 | Cut minutes per PR to about 5 | planned |
| 14.3-2 | Self-hosted runner on a separate server, for the return to private | planned; not attached while public |
| 14.3-3 | Sanitize fixtures to fictional examples (about 20 files) | in progress (#1194 first) |
| 14.3-4 | Return to private: back up, switch, set `CI_RUNNER`, verify a check | owner, on the return date |
| 15.1 | Creator Brain layers: persona card and blind "is this her?" test, catalyst, product, niche intelligence, synthesis log | after Phase 2 exits; Need Check record built (#1205) |
| 15.2-1 | Content pillars asked at onboarding, planner checks fit | built (#1208), Need Check pillar layer |
| 15.2-2 | Trend plus her own point of view, in her niche | after Phase 4 |
| 15.3 | Niche sources: first-party questions, curated format library, Google Trends, YouTube API; Reddit or TikTok only licensed | research; counsel |
| 15.4 | Ablation tests (about 20 paired requests per layer, keep a layer at about +0.4) | Phase 4 exit |
| 16 | Need Check record (persona, catalyst, product, niche, pillar, urgency; write/pick/ask) | built, logged (#1205) |
| 16-1.4 | Product details pop-up by kind (hold-up three-way, screens, steps, urgency, hesitation; three required) | built (#1206), trial only |
| 16-2.2 | Passage store, verbatim, tagged Moment/Meaning/Detail | built (#1207), `PASSAGE_STORE_OWNERS` only |
| 16-2.3 | Story classifier output becomes catalyst status (stored_fit/partial/none) | blocked on the owner's answer key |
| 16-4.3 | Question engine on the Need Check (ranked, max 3, drop rules) | Phase 4.3 |

## Reverse coverage check (8.4), 2026-10-08
Compared against the scratchpad backlog, the parked list, open GitHub issues (7) and TODO/FIXME markers in source (0 real ones).

| Found | Status | Added to |
|---|---|---|
| **Heartbeat `reference` check fails with HTTP 409 since 2026-10-02** (issue #1076, 28 comments). A real Reference-mode generation on a frozen store returns nothing usable | open, not in the plan | **Phase R, first item** (and 8.1-5) |
| #203 VPS container restart loop (blocks the Phase 8 render deploy) | open, video editor track | parked (editor track) |
| #193 / #204 pre-beta private speech eval (~12 consented users) | open, editor gate | Gate E checklist |
| #206 Phase 8 EditPlan → FFmpeg render | open, editor track | parked (editor track) |
| #302 / #303 speech detector accuracy | open, editor track | parked (editor track) |
| Question ladder (#1148), complete-story detection (#1164), `storeGap`: built, no caller | orphan rows (capped at 3) | W1, Phase 2.2, Phase 4.3 |
| Held stashes `cta` and `bridges` | parked | W3 (tested against the rated library) |
| No-story present-tense scenes and invented specifics | parked | W2 |
| 1.2 subpages by role + ld FAQ | worker/src/jobs/extractProduct.ts (`subpagesByRole`, `ldFaqLines`) | subpagesByRoleAndFaq.test.ts | `feature_fired subpages_by_role`, `ld_faq` (worker logs) | worker, unflagged (extraction only) | awaiting CI (Actions billing) |
| Part 11 test cost controls | scripts/ops/scriptBatch.mjs (`cost_mode`, `reportUsage`); generate-blueprint `lengthenOff` (test traffic only) | n/a (harness) | `::notice batch-usage`; `feature_fired lengthen_off` | `cost_mode=test` default | built |
| 1.1 urgency field | worker/src/jobs/extractProduct.ts schema + prompt | extractorFields11.test.ts | product_knowledge field counts | always needs confirmation | built |
| 1.5 Need Check record | generate-blueprint trial block (`needCheck` from itemFormat) | needCheck.test.ts | `feature_fired need_check` (layers, decision, ask) | trial flag, log only | built |
| 1.4 product details pop-up by kind | ProductLibrary card → `ProductDetailsByKind` (`productDetailsByKind`, `saveProductDetail`) | productDetailsByKind.test.ts | product_entities.knowledge facts with `origin=details_popup` | `VITE_TRIAL_USER_ID` only | built |
| 2.2 passage store | worker/src/jobs/remineKnowledge.ts → `story_passages` (verbatim, `passageTags`) | passageTags.test.ts, passageStoreGate.test.ts | `feature_fired passage_store` (worker logs) | `PASSAGE_STORE_OWNERS` only (unset = off) | built; table applied (0284) |
| Onboarding pillars + background (v3.10 Part 16) | Onboarding ProfileQuestion → brief `contentPillars`, `background`; edge Need Check pillar layer reads `contentPillars` | the-brief-and-its-constraint-agree.test.ts | `feature_fired need_check` layers.pillar | input shown to `VITE_TRIAL_USER_ID` only | built; 0285 applied |

## Reverse coverage check (8.4), update 2026-10-10
Compared plan v3.10 against the scratchpad backlog, open GitHub issues (6, all editor track, unchanged) and source TODOs.

| Found | Status | Added to |
|---|---|---|
| Heartbeat Reference 409 (#1076) | **closed 2026-10-10**: five monitor-side causes fixed (#1196, #1200–#1202, #1204); Reference mode itself works | done |
| Question events table: `left`, `skip_caution_shown`, `skip_choice` (owner decision 2026-10-07) | not in v3.10 | Phase 4.3 (question engine) |
| Line-repeat rest (a sentence said in 2 of the last 5 scripts rests) | built earlier, not named in v3.10 | W3 cleanup list |
| Unreached-code triage list (costly lessons, contrarian stances, registry and objective pool, duration contract, DNA provenance for audience labels) | not in v3.10 | W1 to W3, one at a time with a paired test |
| Usage ledger covers edge writer calls only; worker calls (extraction, re-mine, panel) and the traffic tag missing | partial | 11.1-2 |
| `background` brief key stored with no reader | registered unwired | Phase 4.3 |
| 11.1-2 usage ledger, worker side | worker/src/index.ts job loop → `withUsage` → `ai_usage_ledger` (one row per model per job, stage = job type, traffic test/real) | aiUsageLedger.test.ts | rows in `ai_usage_ledger` | all jobs; `TEST_OWNER_IDS` tags test traffic | built; 0286 applied |
| 1.2 follow-up fields probe | scripts/eval/fields-probe.ts via fields-probe.yml (job SYSTEM + SCHEMA from `extractPrompt.ts`, same save filters) | made-up pages in scripts/eval/fixtures/pages | `::notice fields-probe` per-field counts | manual dispatch, 2 model calls | built |
| 11.1-1 cost by stage | edge `stageOfCall`/`inStage` in callModel → `blueprint.ai_usage_by_stage`; worker failed jobs recorded; `ai_model_prices` (UNCONFIRMED) + views `ai_cost_by_stage_script`, `ai_cost_by_stage_worker`; batch `::notice batch-cost` | usageStageOfCall.test.ts, aiUsageLedger.test.ts | views above | all traffic | built; 0287 applied |
