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
| 0.1 | Shared item attributes and slot map | — | — | — | — | — | planned |
| 0.2 | Adapters (creator knowledge and product facts) | — | — | — | — | — | planned |
| 0.5 | Disconnect-test harness and `feature_fired` counters | — | — | — | — | — | planned |

**Open gap on every row:** no feature has a disconnect test yet, so nothing is "proven." Building that harness is Phase 0.5, next.
