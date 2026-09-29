# Full A-to-Z audit — 2026-09-29 (read-only, nothing fixed)

Scope read: `worker/src` (incl. `jobs/`, `nicheBrain/`, `generated/`), `apps/web/src`, `packages/shared/src`,
`supabase/migrations` + `supabase/functions`, top-level `.md`, `docs/`, `discovery/`, `eval/`, open GitHub issues.
State at time of audit: #1040 (private flag + view + final guard), #1041 (line sources), #1042 (deploy fix) are live.

Scenarios: 1 half-built · 2 dead/orphaned · 3 duplicated · 4 interrupting/conflicting · 5 not adding value.
Rec: finish / remove / merge / leave. ✔ = verified by reading the code myself, not only reported by an agent.

## Tier 1 — explains the top live symptom (private / excluded facts, fabrications)

| # | Where | Sc | Conf | What | Symptom it explains | Rec |
|---|---|---|---|---|---|---|
| 1 ✔ | `worker/src/nicheBrain/audience.ts:113-176` | 4 | high | Audience-test job **rewrites finished scripts and hooks after generation** and writes them back to `generations.blueprint`. The #1040 privacy guard and #1041 line sources are never re-run. Its only fabrication check (`audienceParse.ts:297`) rejects new digits and capitalised names only. | Private/excluded facts and fabrications appearing in a script *after* it passed every check; new hooks unchecked (`:115-127`, `:183` can make one the selected hook) | finish: run shared `guardScript` + line tracing before the write |
| 2 ✔ | `apps/web/.../V2Building.tsx:2879` + `:1802` + `:2252` | 4 | high | Plan-card "Write it" calls `setPlan(null)` before the request builds, so `usedKnowledgeIds` is null and **`use_knowledge_ids` is never sent**; the server silently picks its own facts. `api.ts:270` doesn't even declare the field. | "What the plan showed ≠ what the script used"; switched-off facts can come back on the writer's own ranking | finish |
| 3 | `creator_knowledge` schema (0121…0252) | 1 | high | **No persistent exclusion memory.** Exclusion is per request, kept in sessionStorage per build. Every new video starts with nothing excluded. No doc defines the contract. | "I removed it and it came back next video" | finish: a table or column the view filters on |
| 4 | `creator_knowledge` schema, `storyRotation.ts` | 1 | high | **No product/entity scope on facts.** A story's link to a product is guessed at runtime by matching words. | Story attached to the wrong product; cross-idea leakage | finish |
| 5 | `worker/src/voice.ts:159-165`, `jobs/voice.ts:342-372` | 4 | high | Voice profile prompt says "COMPLETENESS IS MANDATORY": offer, enemy, pov and audience are **guessed** when captions say nothing. `_provenance` marks the guesses, but nothing reads it. `targetedQuestions.ts:56` "fills it by INFERENCE". Docs say offer, audience and claims must be asked, not inferred (master-build-plan:182, :713), so this violates documented intent. | Unconfirmed coffee cart, invented offer details, invented stances | finish: allow blanks, or make the writer treat `_provenance` guesses as not sayable |
| 6 | `generate-blueprint/index.ts:12873` (length extension) | 4 | med | Extension runs **after** the entitlement/claims repair (:11991) and is never re-checked by it. Most likely LLM pass to invent. (#1040's final guard now catches private/excluded text, but not a *new* invention.) | Two-pound / gram / grind-style padding | finish: re-run entitlement check after extension |
| 7 | `worker/src/nicheBrain/audience.ts:45-49` | 4 | med | Panel reads `product_entities` by name with no archived or relationship filter (`ownerProducts.ts` has both). Stale or affiliate facts feed the panel's "fixes", which drive rewrites (#1). | "Zero inventory" and other stale product facts | merge with the `ownerProducts` filter |
| 8 | `worker/src/nicheBrain/shifts.ts:53-66`, `mentions.ts:46-60` | 4 | med | **Model-written text filed as `basis:'stated'`, `source:'user'`**, i.e. treated as her own words. `shifts.ts` also takes the voice from the first row across all voices. | Paraphrases spoken as her claims | finish: file as a synthesis, scope by voice |
| 9 | `worker/src/nicheBrain/audience.ts:250-266` `fileHerReplies` | 4 | med | Her comment replies are filed under "most recently updated ready voice", not the post's voice. (The private flag is still set by the 0252 database rule; the agent's claim that it isn't is wrong.) | Facts showing under the wrong voice | finish |
| 10 | `packages/shared/src/script/planUse.ts:74` `LEGALISH` | 3 | high | **Second private-topic list** used only by the plan screen; `guardScript`/the database flag use `SENSITIVE` alone. | Plan says "private, off", yet the guard may let the same wording through | merge into one list |
| 11 | `docs/*` G8 (open-items-ledger:678) | 1 | high | Documented open gap: "a true citation attached to an invented number — nothing catches it." | Cup score "above 80" style numbers | finish (partly covered now by #1041's unsourced highlighting) |

## Tier 2 — session state / screen bugs (Part 1 screen items)

| # | Where | Sc | Conf | What | Symptom | Rec |
|---|---|---|---|---|---|---|
| 12 | V2Building `:1246/:1251/:1386`, `rememberPick` `:2463`, key per click `V2Create.tsx:297/352` | 3/4 | high | Three writers for `video_goal`. Her pick is remembered only from one control, keyed to a per-click id, so a similar re-submit forgets it and the guess wins. | **Purpose reverts on repeat inputs** | merge into one decider; key UI memory by input, not by click |
| 13 | V2Building `:805-813` | 4 | med | Objective switch wipes answers, and fires on programmatic goal writes too (standing goal → guess in one pass). Mutates a ref inside a setState updater. | Answers vanishing; the shared-answer symptom | finish: only on her tap |
| 14 | V2Building `:2315-2350`, `:2478` | 4 | med | Every objective writes the same `claims` field; 3.9 clears it on switch but there is still one field per build. | **Two objectives share one answer field** | finish: key by objective |
| 15 | V2Building `:774,1066,1312,1706,2234,2315,2343,2590` | 3 | high | `answersRef[PRODUCT_CHOICE_FIELD] ?? state.selected_product_id` repeated ~8 times; one copy includes the idea product, the others don't. Plus the V2Create picker, `?product=`, the idea-card product and the `offer` question: up to 4 holders of one choice. | **Two product pickers / "No product attached"** (mostly fixed by 2.9/3.1) | merge into one `currentProductChoice()` |
| 16 | V2Building `:2234` vs `:1707` | 4 | med | The UI's "picked" ignores the `selectProduct` gate the request uses, so it shows "About: X" while no product id is sent. | Residual "product not attached" | merge |
| 17 | V2Building `:891-894` vs `:1982`; `Result.tsx:406` | 4 | high | 90 s "slow", 300 s hard error and rescue poll are **independent clocks**; the 300 s error can fire mid-rescue or before a late success. Result page adds a 4th (8 s). | **Three different stall messages** | merge into one build-status state machine |
| 18 | V2Building `:2206-2224`, `VideoPlanCard.tsx:33`, `:2252` | 3 | med | Plan items computed in 3 places; exclusions held in sessionStorage + state + ref; re-seed on source switch can restore stale ids. | Residual fact-count drift | merge: compute once |
| 19 | V2Building `:161-181` | 4 | med | `durableBuildState` called 4× per render; router state vs `twinai.lastBuild`. | Possible stale product/goal after reload | finish: read once |
| 20 | V2Building (3,351 lines) | 5 | med | One component owns pickers, objective, plan, build, rescue and refusal; most conflicts above are local copies of one value. | all of 12–19 | split into state hooks (after the fixes, not before) |

## Tier 3 — teleprompter vs shot list

| # | Where | Sc | Conf | What | Rec |
|---|---|---|---|---|---|
| 21 | `generate-blueprint/index.ts:10816` + schema `:5590` | 4 | high | **Not two separate passes** (corrects the brief). The main writer emits script *and* shot_list spoken_text in one call. Six later passes rewrite only the script, then `syncShotListSpokenText` (:13152, and :13887 after the guard) copies it over. Shots with no matching beat ("orphaned") keep the writer's original, possibly invented, wording. The worker's audience rewrite (#1) re-syncs, but after no guard. | merge: stop asking the writer for spoken_text; derive it from the script only |
| 22 | `ARCHITECTURE.md:231` vs master-build-plan:1123-1127 | 4 | high | Docs contradict each other ("one scene object" vs "different lines, lossy"). | fix ARCHITECTURE.md |

## Tier 4 — duplication, dead code, and not adding value

| # | Where | Sc | Conf | What | Rec |
|---|---|---|---|---|---|
| 23 | `generate-blueprint` `*Inline` helpers (e.g. :208, :214, :1432, :1475, :1540, :1547, :1574-1626, :3407, :6622-6661, :8922) | 3 | high | Hand copies of shared rules; some have parity tests, not verified for all. | merge into generated `_shared` |
| 24 | `worker/src/ownerProducts.ts:23` `OWNED` | 3 | high | Hand copy of the edge relationship filter. | merge into shared |
| 25 | `generate-blueprint/index.ts:13666` | 5 | high | Semantic-repetition repair makes an LLM call whose candidates are **never applied** (paid call, no effect). | finish (apply it) or remove |
| 26 | `product_entities.knowledge` (0126) | 1 | med | The code itself calls it "complete and unread". | verify readers; finish or remove |
| 27 | `worker/src/claimDisclaimers.ts:105` `claimsPrefillFrom` | 2 | high | Exported, never called outside its tests. | remove or wire |
| 28 | `worker/src/generated/assessed.ts`, `silentBeat.ts` | 2 | high | Generated into the worker, imported by nothing there. | drop from generator list |
| 29 | `packages/shared/src/script/privacyGuard.ts:34` `privateSqlPattern` | 2 | low | Used only by the parity test. The agent's "0252 has no parity test" is **wrong**: `factScopingRegression.test.ts` pins it. | leave |
| 30 | `packages/shared/src/questionAudit.ts:203` | 3 | med | Self-declared duplicate: "typed one silently wins". | merge |
| 31 | `packages/shared/src/generationReadiness.ts:181` | 4 | med | Facts asked of her, "then silently discarded server-side". | finish |
| 32 | `apps/web/src/pages/Result.tsx:99-245, 490` | 2 | high | DEV-only mock blueprint in production code. | move to a fixture |
| 33 | `worker/src/schemaCapabilities.ts:59-65` | 1 | med | 0252 not declared as a worker requirement. | finish if the worker starts reading the view |
| 34 | docs: 7 overlapping build plans; Postiz still "live" in ROADMAP:60,71 / BUILD_PLAN:83; the AI-editor docs; `INTELLIGENCE_ARCHITECTURE_AUDIT.md:1013` ("no product entity") | 2/3/4 | high | Stale or contradicting docs. | merge into one plan; archive the rest |

## "Silent downstream cap / two places deciding": full instance list

Worker comments name the pattern at `jobs/remineKnowledge.ts:46`, `knowledgeInsert.ts:153`, `voice.ts:378`
("fourth instance"); "two places" at `jobs/voice.ts:113, 637`, `knowledgeInsert.ts:165`, `knowledgeRows.ts:24`,
`jobs/editorCompileInput.ts:26`, `jobs/editorCompile.ts:1046`. The same shape in shared: `creatorKnowledge.ts:60-62`
(clamp makes "stated" true only by accident), `editor/uploadCeiling.ts:32`, `api.ts:282`/`entryDoor.ts`,
`questionAudit.ts:203`, `productEntity.ts:498`, `generationReadiness.ts:181`. **New instances found by this audit, not
named in any comment:** #2 (server silently picks the facts), #12 (three goal writers), #15/#16 (product choice),
#17 (three clocks), #21 (script vs shot list), #1 (a second writer after the guard), #10 (two private lists).
Caps in a row on material volume: `knowledgeRows.ts:81`, `knowledgeInsert.ts:150-166` (120), `remineKnowledge.ts:52` (40),
`voice.ts:481/590/637-673`. Now logged, but they still drop material. Leave and monitor.

## Part 2 findings: confirmed or refuted

1. **Pattern named four times** — confirmed, and it is larger: at least 7 new unnamed instances (above).
2. **No scope / exclusion field** — confirmed for both. #1040 added a *sensitivity* flag and view; there is still no entity scope and no persistent exclusion.
3. **Personal-sensitivity system separate from forbiddenClaims** — before #1040 it existed only as a list (`SENSITIVE`) used by rotation and idea cards. It is now a real system (flag, view, final guard, line sources). **Gaps remain:** a second list (`LEGALISH`) and the audience rewrite, which bypasses it.
4. **"Fills by inference" elsewhere** — confirmed and wider: the voice profile's MANDATORY completeness (#5) is the main source; `targetedQuestions.ts:56` is one instance of it.

## Issues and docs
Open issues: 7 (not 10). None cover script, fact or privacy problems. Six are about the editor or the VPS; #962 is the health
monitor failing to sign in (config), so nobody is watching production. The docs forbid invented specifics
(build-state:255-262, one-build-plan:255), so those are violations. No doc defines per-fact exclusion (a missing contract).

## Confirmed-working list (must not regress)
Dropping an unsupported beat and disclosing it; disclosing a short runtime; recommended hook = top-scored hook;
"why it works" shows the real test number; #1040 private flag + final guard; #1041 line sources; 3.7(c) reload resume.
