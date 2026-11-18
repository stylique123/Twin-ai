# AI editor: what actually runs (read-only report, 18 Nov 2026)

Section 2.7.6 of the Developer Services Agreement: "The Developer's first job here
is a read-only report of what actually runs, then the repairs in Section 2.2."
Nothing was changed to produce this. Evidence is file:line on branch
`security/audit-fixes` (same as `main` for every file cited), plus CI runs.
No production access was used.

## The short answer

1. **There is one editor: `editor_v2`.** The old editor (`autoedit`) was removed and
   is blocked at the database (`worker/src/jobs/index.ts:21`). Nothing writes
   `generations.edit_path` any more, so the "live editor" in Section 2.8.1 no
   longer exists.
2. **Seven stages.** The first three always do real work. The last four do real
   work only when two switches on the worker server are set; otherwise they are
   simulated and the project "completes" with no video.
3. **On staging every stage runs for real**, including the renderer, and the CI
   matrix passed on 13, 14, 17 and 18 Nov.
4. **Production has never finished an AI-edited video.** Read-only check of the
   production database (18 Nov): exactly **one** edit has ever run, on 30 Sep. It
   ran every stage for real (both stage switches were on) and **failed at
   compiling** with "accepted capture windows overlap or touch". That bug was
   fixed the next day (1 Oct, commit `43026be7`, with a test) and has been
   deployed since, but **no edit has been run in production since**, so the full
   chain is still unproven there. The start switch was on as of 30 Sep, and the
   app offers "start edit" to every creator.
5. **The editor never charges or refunds a credit.** The credit is taken when the
   script is written. The "reserve at start, release on failure" design in
   Section 2.8.1 is not built.

## Stage by stage

| # | Stage (what the creator sees) | Real or simulated | Switch | Test files |
|---|---|---|---|---|
| 1 | inspecting ("Checking your recording…") | Always real | none | 3 |
| 2 | transcribing ("Transcribing…") | Always real | none | 1 |
| 3 | analyzing ("Analyzing the footage…") | Always real | none | 0 direct; 1 each for its parts (visual, audio, hook, alignment) |
| — | awaiting_review ("Ready for your review") | Pause for the creator, optional | review gate (0102) | covered in editorV2 tests |
| 4 | directing ("Directing the cut…") | Real only if `EDITOR_DIRECTOR_ENABLED=true` | worker env | 3 |
| 5 | compiling ("Compiling the edit…") | Real only if `EDITOR_RENDER_ENABLED=true` | worker env | 25 |
| 6 | rendering ("Rendering your video…") | Real only if `EDITOR_RENDER_ENABLED=true` | worker env | 4 |
| 7 | validating ("Finishing up…") | Real only if `EDITOR_RENDER_ENABLED=true` | worker env | 3 |

Evidence:
- Stage order: `worker/src/jobs/editorPipeline.ts:7-15`; the database enforces the same order (trigger in 0080).
- Real-or-simulated rule: `worker/src/jobs/editorV2.ts:112-117`; switches read in `worker/src/env.ts:176` and `:186`, both default off.
- A simulated run records `simulated_after_*` and finishes with `output_asset_id` NULL (`editorV2.ts:99-110`).
- The header comment at `editorV2.ts:1-7` still says the last four stages "remain SIMULATED". That was true before the switches existed; it is now out of date.

## Where each stage has really run

| Environment | Directing | Compiling / rendering / validating | Evidence |
|---|---|---|---|
| Staging CI (`staging-integration.yml`) | Real (Phase 7 sets the switch per worker) | Real (Phase 8, asserts real bytes in storage and ffprobe streams) | workflow lines 929-943; runs passed 13, 14, 17, 18 Nov |
| Production | Real (`simulated=false` on the one project, 30 Sep) | Compiling started for real (`simulated=false`), then failed; rendering and validating never reached | production `edit_events` for that project, read 18 Nov (see below) |

### The one production edit, step by step (read-only, 18 Nov)

| Step | Result | Time |
|---|---|---|
| inspecting, transcribing, analyzing (4 components) | real, recorded | 19:16:25 → 19:16:43 |
| directing (Gemini `gemini-3.5-flash`, director v2) | real, succeeded | 19:16:43 → 19:16:47 |
| compiling | real, **failed**: `edit_plan_divergent` — "accepted capture windows overlap or touch" | 19:16:48 |
| rendering, validating | not reached | — |

Cause: the compiler treated two recording segments that touch end-to-start as
overlapping, so every teleprompter take with back-to-back scenes failed. Fixed in
`worker/src/jobs/editorCompile.ts:840-853` (audit 2026-10-01 E1, commit
`43026be7`), covered by `worker/src/__tests__/compile-source-domain.test.ts`
("accepted windows that touch are legal; only true overlap fails"). `deploy-worker`
has succeeded 97 times since 1 Oct (latest 14 Nov), so production has the fix.

## Who can start an edit in production

- The endpoint checks one global switch, `EDITOR_V2_START_ENABLED`, with no per-account list (`supabase/functions/start-editor-v2/index.ts:55`).
- The production gate check records that the switch was "DELIBERATELY activated" on 5 Aug (`.github/workflows/verify-prod-gate.yml:12-19`). Its last run was 12 Aug (passed); the logs have expired, so today's value is not provable from the repo.
- The Result page shows the start button to anyone whose recording has finished uploading; there is no client-side flag (`apps/web/src/pages/Result.tsx:1184`).
- This differs from Section 2.7.6 ("The newer editor is switched off for real creators today").

## Failure handling (retries, cancelling, clean-up)

| What | Status | Evidence |
|---|---|---|
| Lease kept alive during long stages | Built | renew every 30 s, `env.ts:157`, `editorV2.ts:444` |
| Per-stage time limit | Built, 5 min default | `env.ts:154`, `editorV2.ts:500-503` |
| Resume after a crash (re-runs the interrupted stage) | Built | `editorPipeline.ts:57-68` |
| Lost-project sweeper (job died, project stuck) | Built, pg_cron | `editor_reconcile_lost_projects`, 0080:22 and :398 (latest body 0102) |
| Cancel | Built for real stages 1-2 (inspect, speech): download and subprocess are aborted | `worker/src/jobs/editorCancel.ts:1-4` |
| Temp file clean-up | Built, files older than 6 h | `editorV2.ts:469`, `env.ts:159` |
| Failure injection for tests | Built (EDITOR_SIM_* env) | `env.ts:164-170` |

## Credits against Section 2.7.1

"One credit is one whole video through the full loop. It is never charged per step, and never charged for a failed job."

| Rule | Today | Evidence |
|---|---|---|
| Charged once per video | Charged once when the **script** is written, before the model call | `supabase/functions/generate-blueprint/index.ts:9689` |
| Never charged for a failed script | Refunded by the writer's own error handling | `generate-blueprint/index.ts:9771`, `:18492`, `:18719`, `:18736` |
| Never charged if the request is killed at the 150 s limit | **Not covered.** No server-side reconciler refunds a spend whose request died; the writer's own deadline guard only runs when `trialOn` | `generate-blueprint/index.ts:13228`; no reconcile function in migrations |
| Never charged if the edit fails | **Not covered.** The editor neither charges nor refunds; a failed or no-video edit keeps the script's credit | no `spend_credits`/`refund_credits` in `start-editor-v2` or the worker |
| Refund trigger on failed jobs | Exists only for the removed `autoedit` job type | `supabase/migrations/0019_autoedit_refund.sql:20` |
| Reserve at start, finish once, release on failure | **Not built** | — |

## Problems found, worst first (candidates for the Section 2.2 repairs)

1. **Production has never produced a finished AI edit.** The only run failed on a bug fixed the next day; nothing has run since, while every creator can press "start edit". Next step (Section 2.8.3, owner's own account first): run one real edit end to end on the owner's account and confirm a video in storage, before any creator relies on it.
2. **No retry after a no-video run.** If a run "completes" without a video (stage switches off), Result says "This run finished without producing a video" (`Result.tsx:1286`) but hides the start button: it only reappears for `failed` or `cancelled` (`Result.tsx:1184`), although the comment above it says it should also reappear "unless that edit ended without a video" (`:1182`). Lower impact in production today because both switches are on. Small fix in the app.
3. **Credit model is not the one in the Agreement** (table above). The writer-side part (150 s kill) sits in the frozen writer; the editor side needs the reserve/release design.
4. **Design documents are out of date**: `docs/ai-editor-rebuild-status.md` (3 Aug), `docs/editor-v2-analysis.md` (22 Jul), `docs/editor-v2-phase8-gate0.md` (28 Jul); editor code last changed 1 Oct. The `editorV2.ts` header is also stale.
5. **The analyzing stage has no test of its own**, only tests of its parts.

## Answered from production (read-only, 18 Nov)

| Question | Answer |
|---|---|
| Is the start switch on? | Yes as of 30 Sep (an edit was started then; 5 Aug record agrees). Today's value is a function secret and cannot be read from the database; check its digest on the Secrets page if needed. |
| Are the worker's stage switches on? | Yes: directing and compiling ran with `simulated=false` |
| How many edits, how many with a video? | 1 ever (30 Sep), failed, no video |
| Context | 76 profiles (54 onboarded, including test and panel accounts), 2,184 scripts, 5 published posts |

## Decisions for the owner

1. OK to run one real edit end to end on your own account in production now that the 30 Sep bug is fixed (Section 2.8.3: owner's own account first)?
2. Until that edit succeeds, keep "start edit" on for every creator, or switch `EDITOR_V2_START_ENABLED` off?

## How this was checked

Read-only: the files cited above, the worker job registry, the staging CI
workflow and its recent runs, and the production gate workflow history.
Production was read on 18 Nov with GET requests only, using a key held in a
local file outside the repo (never printed), and only counts, statuses, stage
flags, dates and the one project's failure code and message were read; no
creator content.
