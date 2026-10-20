# Wiring ledger: trial components since #1262 (plan v5.3 item V)

Plan v5.3 Phase R, "the wired standard". A component counts as done only when it is:

- **CALLED**: a real route or screen calls it, and a **disconnect test** fails if that call is removed;
- **USED**: a fire count or ablation shows it changes output;
- **FIXED**: a before/after rate exists.

This page covers every trial component merged after #1262 (B2 pain-map importer), up to #1294.
The older, feature-by-feature ledger is `docs/wiring-ledger.md`. All examples and measurements
refer to the fictional panel only. The page includes no creator text, no server details and no keys.

`index.ts` means `supabase/functions/generate-blueprint/index.ts`. `recheck.ts` means
`worker/src/jobs/inventionRecheck.ts`. Line numbers are taken from `main` at 9cad9d60 (#1293).

**Kill switches.** Every name in the *Kill switch* column is an env var. `scripts/ci/check_kill_switches.mjs`
checks that each one is still read in non-test code (`Deno.env.get('X')`, `env.get('X')` or `process.env.X`).
If a switch is renamed or deleted without updating this page, CI fails. `trial_off` (request body) turns
off every trial component for a test account. `release_off: [component]` turns off one registry
component for one request.

**Disconnect test.** A test that reads the real caller (edge source, worker handler or screen) and fails
when the call is removed. A unit test of the pure helper does not count. `missing` means only the helper
is tested.

**Status key.** C = called (caller and disconnect test), U = used (a fire count or ablation exists),
F = fixed (a before/after rate exists). `-` means not met yet.

## Ledger

| # | Component (PR) | Caller (real path) | Flag | Kill switch | Disconnect test | Fires: counter / log event | Latest measured effect | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | releaseFlags components: planner, spine, templates, hook_engine, robot_phrases, outside_select, invention_gate (#1269, #1277) | `index.ts:7119` `newOn()`, which calls `componentOn()`. Call sites are `index.ts:9807, 12582, 12615, 12626, 12641, 16676, 17111, 17150, 17332, 17604` | registry stage (S0 default = `trialOn`) | `RELEASE_REGISTRY_SOURCE` (the `killed` entry applies only when the registry is loaded from the table) | `packages/shared/src/script/__tests__/releaseFlags.test.ts` (every component routed through `newOn`) | per component (see the rows below); shadow: `shadow_runs` rows | none (S0 only; the shadow has never run) | C - - |
| 2 | ANGLE_FIT in generation (#1268) | `index.ts:10425` `angleCardsRecord()` (gate `index.ts:7127`) | `trialOn`, body `angle_fit` | `ANGLE_FIT_KILL` | `packages/shared/src/script/__tests__/disconnect/angleFit.disconnect.test.ts` | `feature_fired` feature `angle_fit` (`index.ts:10426`) | none | C - - |
| 3 | QUESTION_USEFULNESS (#1268) | `index.ts:10436` `questionNecessity()`; question-use pass at `index.ts:16453` | `trialOn`, body `question_usefulness` | `QUESTION_USEFULNESS_KILL` | `packages/shared/src/script/__tests__/disconnect/questionUsefulness.disconnect.test.ts` | `feature_fired` feature `question_necessity` (`index.ts:10437`), `index.ts:16461` | none | C - - |
| 4 | VOICE_CARD in generation: brief, voice gate, voice match (#1270, #1288) | `index.ts:8393` `voiceCardOn()`, which calls `buildCreatorVoiceCard()`. Brief at `index.ts:8401`, repair via `voiceCardMisses()` in the voice gate, record `voice_card_id` / `voice_match` on the blueprint | `trialOn` and a fictional account | `VOICE_CARD_ENABLED`, `VOICE_CARD_THIN_FLOOR` | `packages/shared/src/script/__tests__/disconnect/voiceCardGeneration.disconnect.test.ts` | `voice_gate` (`voice_card.misses`, `repaired`) | blind-test protocol only (`docs/quality/voice-match-blind-test.md`); no result recorded | C - - |
| 4b | VOICE AT THE POLISH STEP: style note, verbatim samples, rhythm rules; voice check keeps a polish only when the score improves and the claim/number/name checks pass; rich samples lower the thin floor (panel-10) | `index.ts:8408` `voicePolishOn()`; Plan B `index.ts:17353` `voicePolishBrief()` + `index.ts:17358` `voicePolishVerdict()`; async job payload `ledger.polish.voice`; worker `recheck.ts:233` `polishVoiceOf()` then `runPolish()` (`voicePolishVerdict()`, `polishFactChecks()`); card build `buildCreatorVoiceCard(..., { richSamples })` at both edge sites | `trialOn` (and the card: VOICE_CARD gate) | `VOICE_POLISH`, `VOICE_CARD_RICH_SAMPLES` | `packages/shared/src/script/__tests__/disconnect/voicePolish.disconnect.test.ts`, `worker/src/__tests__/voice-polish-recheck.test.ts` | `async_polish` (`voice_before`, `voice_after`, `voice_reason`); blueprint `plan_b_voice`, `polish.voice` | panel-current-10: 0 of 24 generations had a card (23 `voice_card_skipped: thin`); after: not measured yet | C - - |
| 5 | MATERIAL_FLOOR (#1271) | `index.ts:8085` `applyMaterialFloor(..., materialFloorOn(...))` (gate read at `index.ts:8090`) | `trialOn` | `MATERIAL_FLOOR_ENABLED` | `packages/shared/src/script/__tests__/disconnect/materialFloor.disconnect.test.ts` | `material_floor_restored` | none | C - - |
| 6 | Hook scorer A5b: appeal score, STORY-OPEN/FACT-OPEN (#1272) | `index.ts:17155` `runHookEngine(raw, ledger, { trial: trialOn, ... })` | `newOn('hook_engine')`, `trialOn` | none of its own (`release_off: hook_engine`, `trial_off`) | `packages/shared/src/script/__tests__/disconnect/hookScorer.disconnect.test.ts` | `hook_engine` (`index.ts:17215`) | none | C - - |
| 7 | Story-first (#1273, #1284) | `index.ts:8100` `restoreAskedStory()`; pick at `index.ts:10583`; used at `index.ts:17066` | `trialOn` | `STORY_FIRST` | `packages/shared/src/script/__tests__/disconnect/storyFirst.disconnect.test.ts` | `asked_story_restored`, `story_first`, `story_used` | none | C - - |
| 8 | Outside minimum relevance (#1273) | `index.ts:9811` `pickOutsideForWriter(..., { requestTexts })` | `newOn('outside_select')`, `trialOn` | `OUTSIDE_MIN_RELEVANCE` | `packages/shared/src/script/__tests__/disconnect/outsideMinimum.disconnect.test.ts` | `outside_selected` | none | C - - |
| 9 | Duration from material (#1273, #1284) | `index.ts:12458` `if (durationFromMaterialOn)` | `trialOn` | `DURATION_FROM_MATERIAL` | `packages/shared/src/script/__tests__/disconnect/durationFromMaterial.disconnect.test.ts` | `duration_choice` | none | C - - |
| 10 | Writer guards (#1274, #1279) | `index.ts:17083` `writerGuardScript()` on the script; `index.ts:17170` on the picked hooks; CHECK THIS LINE route `index.ts:6752` | `trialOn` | none of its own (`trial_off`) | `packages/shared/src/script/__tests__/disconnect/writerGuards.disconnect.test.ts` | `writer_guards` (only when something is dropped) | none | C - - |
| 11 | Gate repair trial (#1278) | `index.ts:17359` and `index.ts:17621` `gateMeasureOnly({ repairTrial: gateRepairTrialOn(...) })`, which goes to the worker as `measure_only` | test/panel account | `GATE_REPAIR_TRIAL` | `packages/shared/src/script/__tests__/testAccount.test.ts` | `invention_gate_queued`; worker `invention_recheck` (outcome) | none after the change | C - - |
| 12 | Gate calibration: rule-review recalibration (#1275), repair calibration (#1289) | `index.ts:17360` ledger flags `rule_review`, `repair_calibrated`, which `recheck.ts:190, 197` passes to the gate | `trialOn` | `REPAIR_CAL_KILL` | `packages/shared/src/script/__tests__/inventionGateUnchecked.test.ts` (pins the ledger flags) | worker `invention_recheck` (before/after counts) | before: panel 3 false-block 4/18 = 22.2% (offline re-score); repair allowed only where false-drop <=15% (panel 6). No after-rate on a live panel | C - - |
| 13 | Narrow repair, first-person claim check, no bare-fact hooks, repeats by meaning (#1294) | `index.ts:7050-7051` (`narrow_repair`, `story_dedup` via `panel7GateExtras()`), which `recheck.ts:207-208` reads; `index.ts:17158-17159` hook options; `index.ts:17268` `dedupByStoryItem()` | `trialOn` | `NARROW_REPAIR`, `STORY_DEDUP`, `HOOK_BARE_FACT`, `HOOK_CLAIM_CHECK` | `packages/shared/src/script/__tests__/disconnect/narrowRepair.disconnect.test.ts`, `worker/src/__tests__/narrow-repair-disconnect.test.ts` | `story_dedup`; worker `invention_recheck` | panel-7 offline replay: 9 of 125 audit lines dropped; 4 of 4 advisor-I final lines flagged, 0 other lines flagged | C U - |
| 14 | CHECK THIS LINE (#1282) | route `index.ts:6728` (`specMode === 'check_line'`); gate flag `index.ts:17360`, which reaches `recheck.ts:274`; screen `apps/web/src/pages/Result.tsx:789` | test/panel account | `CHECK_LINE_KILL` | `packages/shared/src/script/__tests__/inventionGateUnchecked.test.ts` (edge flag), `worker/src/__tests__/check-lines-recheck.test.ts` (worker). The screen mount is not pinned | worker `check_lines` | none | C - - |
| 15 | M/N angles and questions (#1287) | route `index.ts:6810` (`angle_plan` / `angle_answer`); screen `apps/web/src/pages/v2/V2Building.tsx:2613` `<AngleQuestionsCard>` | test/panel account | `ANGLES_QUESTIONS_KILL` | `packages/shared/src/script/__tests__/anglesQuestionsV51.test.ts` (route block). The screen mount is not pinned | `question_asks` rows (skip key `mn`); `creator_knowledge` source_ref `asked:mn:*` | none | C - - |
| 16 | L voice card: view/edit route and Settings panel (#1288) | route `index.ts:6705` (`specMode === 'voice_card'`); screen `apps/web/src/pages/Settings.tsx:802` `<VoiceCardPanel>` | test/panel account | `VOICE_CARD_ENABLED` | `packages/shared/src/script/__tests__/disconnect/voiceCardRoute.disconnect.test.ts`, `apps/web/src/components/VoiceCardPanel.disconnect.test.tsx` | `voice_card_view` | none | C - - |
| 17 | I template rank v2 (#1288) | `index.ts:12595` `chooseTemplates({ rank })` | `newOn('templates')` | `TEMPLATE_RANK_V2` | `packages/shared/src/script/__tests__/disconnect/templateRank.disconnect.test.ts` | `script_template_applied` | fixture coverage harness only (`templateCoverage.test.ts`); no panel rate | C - - |
| 18 | G packaging promise (#1288) | `index.ts:17324` `enforcePackagingPromise()` | `trialOn` | `PACKAGING_PROMISE` | `packages/shared/src/script/__tests__/disconnect/packagingPromise.disconnect.test.ts` | `packaging_promise` | none | C - - |
| 19 | H spine fill (#1289) | `index.ts:17126` `fillSpineBeats()` | `newOn('planner')`, `trialOn` | `SPINE_FILL_KILL` | `packages/shared/src/script/__tests__/disconnect/spineFill.disconnect.test.ts` | `spine_fill` | none | C - - |
| 20 | #1290 writer degrade at the deadline | `index.ts:12679-12680` ladder `{ startedAt, degrade }`; `index.ts:7064` `optionalPassAllowed()` | `trialOn` | `WRITER_DEADLINE`, `WRITER_DEGRADE` | `packages/shared/src/script/__tests__/disconnect/writerDegrade.disconnect.test.ts` | `optional_pass_skipped_degraded` | before: panel-current-7, 5 of 24 runs `GENERATION_FAILED` at about 121 s. No after-rate | C - - |
| 21 | #1291 length to the profile budget and refill | `index.ts:12520` `budgetPromptLine()`; `index.ts:17049` `enforceWordBudget()`; `word_budget` goes to `recheck.ts:203` | `trialOn` | `LENGTH_BUDGET`, `LENGTH_REFILL` | `packages/shared/src/script/__tests__/disconnect/lengthBudget.disconnect.test.ts` | `word_budget_enforced` | none | C - - |
| 22 | #1291 spoken de-dup | `index.ts:17251` `dedupeSpokenLines()`; `spoken_dedup` goes to `recheck.ts:200` | `trialOn` | `SPOKEN_DEDUP` | `packages/shared/src/script/__tests__/disconnect/spokenDedup.disconnect.test.ts` | `spoken_dedup` | none | C - - |
| 23 | #1293 async polish | `index.ts:12681` `asyncPolishOn()`; `index.ts:17362` defers `polish_pending`, which is handled at `recheck.ts:157` | `trialOn` | `ASYNC_POLISH` | worker side only: `worker/src/__tests__/async-polish-recheck.test.ts`. Edge side missing | `async_polish_queued` (edge), `async_polish` (worker) | model only: 0.42 expected failures per 24 at 30 s (panel-7 distributions). Not measured live | - - - |
| 24 | #1293 parallel writer hedge | `index.ts:6445` `runHedged()` (ladder `hedge` set at `index.ts:12683`) | `trialOn` and async polish | `WRITER_HEDGE` | `packages/shared/src/script/__tests__/disconnect/writerHedge.disconnect.test.ts` | `writer_hedge`; `writer_hedge` on the blueprint | about 1.97 writer calls per request (estimate) | C - - |
| 25 | #1292 Plan B assembly | `index.ts:17301` `assemblePlanB()`; polish `index.ts:17302` | `trialOn` and (`PLAN_B_ASSEMBLY=true` or body `plan_b`) | `PLAN_B_ASSEMBLY`, `PLAN_B_POLISH` | `packages/shared/src/script/__tests__/disconnect/planB.disconnect.test.ts` | `plan_b_assembled`, `plan_b_skipped` | none | C - - |
| 26 | #1286 repair audit capture | `recheck.ts:213` `repairAuditCaptureOn()` (env read `recheck.ts:349`) | `hold_asks` (trial) | `REPAIR_AUDIT_CAPTURE` | `worker/src/__tests__/repair-audit-capture.test.ts` | the gate record's `repair_audit` entries; `scripts/ops/repairAuditSheet.mjs` | none | C - - |
| 27 | Reddit off switch (#1283) | `worker/src/nicheBrain/sweep.ts:163`, which calls `runNicheReddit` and then `nicheReddit.ts:32` `nicheRedditEnabled()` | off by default | `NICHE_REDDIT_ENABLED` (on only when `true`) | `worker/src/__tests__/niche-reddit-disconnect.test.ts` | `niche_reddit` (absent while off) | n/a (off switch) | C - - |
| 28 | Writer timeout fallback (panel-current-9) | `index.ts:12765` `writerTimeoutFallbackOn()` around the writer call; `degradedBlueprint()` | `trialOn` and async polish | `WRITER_TIMEOUT_FALLBACK` | `packages/shared/src/script/__tests__/disconnect/writerTimeoutFallback.disconnect.test.ts` | `writer_degraded` (log and ops_events); `degraded` on the blueprint | simulated 0.02 degraded per 24 (panel 8+9 durations) | C - - |
| 29 | Targeted check-this-line (plan v5.4 §20) | `recheck.ts` `buildTargetedCheckLines()` under `ledger.check_lines` (env read in `handleInventionRecheck`) | `check_lines` (trial, `CHECK_LINE_KILL`) | `TARGETED_FLAGS` | `worker/src/__tests__/check-lines-recheck.test.ts` | worker `check_lines` (reason ids) | panel-8 offline replay: 67 flags to 3, both advisor-I lines caught; 0 of 22 S lines flagged | C U - |
| 30 | Onboarding answers and pillars in the trial ledger (plan v5.4 §20) | `recheck.ts` `loadOnboarding()` / `onboardingRows()` (creator_knowledge `asked`/`user`, `pre_script_brief`) | `hold_asks` (trial) | `ONBOARDING_LEDGER` | `worker/src/__tests__/check-lines-recheck.test.ts` | the gate ledger; `scripts/ops/panelCreatorContext.mjs` for blind packages | none | C - - |
| 31 | No bare-fact hooks in generation (plan v5.4 §20) | `index.ts` `renderHookCandidateRule(templateLedger, { noBareFact })` and `runHookEngine` `noBareFactGen` | `trialOn` | `HOOK_BARE_FACT_GEN` | `packages/shared/src/script/__tests__/disconnect/hookBareFactGen.disconnect.test.ts` | `hook_candidates` (no `fact_open`, no `price_or_proof`) | panel-8 hook ratings: 5 of 131 rated hooks are bare spec lines (mean scroll 1.6 vs 3.3) | C U - |
| 32 | O "Using" list on the result page (plan v5.4 O) | screen `apps/web/src/pages/Result.tsx` `<UsingList>` reads `blueprint.line_sources`; "Never use" calls the existing `fact_confirm` route (`yes: false`) | `VITE_TRIAL_USER_ID` (web trial) | `VITE_USING_LIST_KILL` | `apps/web/src/components/UsingList.test.tsx` | `spec_confirm` log (existing route) | none | C - - |
| 33 | O general-version banner (plan v5.4 O) | screen `apps/web/src/pages/Result.tsx` `<GeneralVersionBanner>` reads `blueprint.degraded` (row 28) | `VITE_TRIAL_USER_ID` (web trial) | `VITE_GENERAL_BANNER_KILL` | `apps/web/src/components/GeneralVersionBanner.test.tsx` | none (screen only) | none | C - - |
| 34 | O skip caution under the angle questions (plan v5.4 O) | screen `apps/web/src/components/AngleQuestionsCard.tsx` (row 15's card) | test/panel account (row 15's server gate) | `VITE_SKIP_CAUTION_KILL` | `apps/web/src/components/AngleQuestionsCard.test.tsx` | `mn_answer` (existing route; nothing sent until she picks) | none | C - - |

**Totals.** 34 rows (29-31 added by plan v5.4 §20; 32-34, web-only, by plan v5.4 O). 33 have a disconnect test. 1 has one on the worker side only (row 23).
**None is missing one.** None is FIXED: no row has a live before/after rate. Only row 13 has a measured
effect (offline replay), so it is the only row marked USED.

**How the 20 disconnect tests added for rows 2-10, 13, 16-22, 24, 25 and 27 work.** `index.ts` cannot be
unit-run, so each test (1) runs the shared function the edge calls on a fixed fictional input with the
switch on and off, and checks that the output differs and shows the effect; (2) reads the real caller and
fails if the call or the switch is removed. Where the switch is inline in `index.ts`, the test evaluates the
edge's own gate expression from its source (TypeScript stripped) with the env var set both ways
(`packages/shared/src/script/__tests__/disconnect/edge.ts`). Rows 13 and 27 also run the worker
orchestrator (`runInventionRecheck`, `runNicheReddit`) with fakes; row 16 also renders the Settings panel.

## Unreached trial code (W7): list only, nothing deleted

These exports from the trial modules above have no caller on any path (edge, worker, web, scripts)
outside tests. Pure constants that are used only inside their own module are not listed.

| Symbol | File (shared source; the edge/worker copies are generated) | Notes |
|---|---|---|
| `summarizeGateRecords` | `packages/shared/src/script/inventionGate.ts:2320` | declared, never called |
| `isMeasuredRun` | `packages/shared/src/script/testAccount.ts:53` | test-only reader |
| `allSourced` | `packages/shared/src/script/planner/planBAssembly.ts:55` | Plan B never asserts this on the real path |
| `hasDate` | `packages/shared/src/script/templates/scriptTemplates.ts:57` | declared, never called |
| `ASYNC_REQUEST_TARGET_MS` | `packages/shared/src/script/asyncPolish.ts:24` | constant, never read |
| `ROLLOUT_STEPS` | `packages/shared/src/script/releaseFlags.ts:30` | the S3 rollout steps are never read (S0 only) |
| `INVENTION_JUDGE_TASKS`, `INVENTION_JUDGES`, `PARENT_MIN` | `packages/shared/src/script/inventionGate.ts:51, 959, 422` | constants, never read |
| `_resetShadowCaches` | `supabase/functions/_shared/shadowRun.ts:169` | test hook |
| `templateCoverage`, `chooseForRequest`, `fixtureLedger`, `isVerifiedDated`, `shortTemplateId` | `packages/shared/src/script/templates/templateCoverage.ts` | test harness by design, registered in `scripts/ci/check_symbol_readers.mjs` |
| S1 shadow path: `scheduleShadowRun` / `runShadow` | `supabase/functions/_shared/shadowRun.ts:106, 118` | imported, but only reached when a component is at S1, and nothing is past S0, so the code is unreached in practice |
