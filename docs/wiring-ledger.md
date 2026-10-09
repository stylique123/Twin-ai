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
