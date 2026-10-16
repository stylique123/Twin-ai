# Release flags and shadow mode

Owner rule: the live script flow for real creators is production. Every new
component stays behind a flag that is OFF for real creators until it passes
its release gate. This PR adds the plumbing only. **Nothing is enabled for
real creators.**

## 1. Today: how `trialOn` gates each component

In `supabase/functions/generate-blueprint/index.ts`:

`trialOn = isHeartbeat`, where `isHeartbeat` is the heartbeat user or a
fictional-panel account (`app_metadata`, set by the service role). A test
account may send `trial_off: true` to get the plain path for one request.
Real creators never have the trial.

| Component | Where it was gated | Now routed through |
|---|---|---|
| planner (spine plan + plan record) | `if (trialOn)` around `planSpine`; `trialOn && spinePlan` before `planRecord` | `newOn('planner')` |
| spine (beat plan) | `trialOn && spinePlan` around `planSpineBeats` | `newOn('spine')` |
| templates | `trialOn ? chooseTemplates(...) : []` | `newOn('templates')` |
| hook engine | `renderHookCandidateRule` block and `runHookEngine` record | `newOn('hook_engine')` |
| robot phrases | `robotPass` inside the `trialOn && bp.script` leftovers block | `newOn('robot_phrases')` (nested, so still requires `trialOn`) |
| outside select | `if (trialOn) pickOutsideForWriter(...)` | `newOn('outside_select')` |
| invention gate | `trialOn && blueprint` (queue) and `trialOn && rescuedBp` (rescue) | `newOn('invention_gate')` |

Other `trialOn` uses (prompt wording, lesson reads, sensitive knowledge,
lengthen rules, Reddit items and so on) are unchanged and still read
`trialOn` directly. They can move onto the registry one by one later.

## 2. Flag registry

`packages/shared/src/script/releaseFlags.ts`, generated into
`supabase/functions/_shared/releaseFlags.ts`. It is pure: no I/O, env or clock.

- `COMPONENTS`: planner, hook_engine, spine, templates, robot_phrases, outside_select, invention_gate.
- Each entry is `{ stage: S0|S1|S2|S3, rolloutPct, killed }`.
- `DEFAULT_REGISTRY` puts every component at S0, 0%, not killed.
- `stageFor(component, account, registry?)` returns `'new' | 'shadow' | 'old'`:
  - killed: `old` for everyone (test accounts too) and no shadow run;
  - test or panel account: `new`, or `old` when that request sent `trial_off`;
  - real creator at S0: `old`. At S1: `shadow`. At S2: `new` if the account is a canary, else `shadow`. At S3: `new` if the stable FNV bucket of `component:userId` is below `rolloutPct` (5, 25, 50, 100), else `shadow`.
- `componentOn` returns `stageFor(...) === 'new'`.

The edge calls `componentOn(c, releaseAccount)` with **no registry**, so only
the default (S0) can apply. Moving a component past S0 needs a later PR that
loads the registry from a service-role source (a config table or an env JSON)
and passes it in. That PR is where the release gate is enforced.

Tests (`releaseFlags.test.ts`) check that, at the default registry, every
component matches today's `trialOn` for real creators, real creators who send
`trial_off`, test accounts and test accounts with `trial_off`. They also check
500 real users × 7 components, all `old`. The later stages, the kill switch and
the fallback for malformed entries are tested too. A further test fails if a
component is not routed through `newOn` or if the edge passes a registry.

## 3. S1 shadow

- **When:** after the real response has been sent. The edge would schedule it
  with `EdgeRuntime.waitUntil` (or queue a worker job), so the creator's
  latency and output never depend on it. It is never shown, never saved to
  `generations` and never charged a credit.
- **What:** the same request, run again with the S1 component(s) on. The
  comparison scores both outputs.
- **Budget:** a cap of its own, separate from creator credits. It has a daily
  USD ceiling (`SHADOW_DAILY_USD`) checked against `ai_usage_ledger`
  (traffic `shadow`), a per-run token cap and a sample rate. When the cap is
  hit, the run records `budget_skipped` and spends nothing. A killed component
  records `killed`.
- **Storage:** `public.shadow_runs` (migration `0290_shadow_runs.sql`, file
  only, **not applied**). The table is service-role only (RLS on, no policies).
  Each row holds ids, latencies, cost, invented counts, postable flags and an
  error code. Live and shadow outputs sit in private jsonb columns for
  blind judging.
- **Logs:** ids, counts and status only. No script text, no creator
  facts. The same rule as the existing `outside_selected` and hook engine records.

## 4. Golden set: old vs new

- A fixed and versioned set of requests: fictional panel creators, every goal
  and every product kind, plus regressions taken from past failures. Only fictional fixtures are used.
- Each candidate registry runs the set twice, once with the component at
  `old` and once at `new`, with the same facts (the same mechanism as the
  `trial_off` pairing).
- Measures per pair:
  - blind craft score (judges never see which arm is which);
  - invented-claim count (invention gate, measure mode);
  - postable (yes/no);
  - failure (error, empty or rescued);
  - end-to-end latency.
- The set must pass before S1 and again before every move up.

## 5. Gate to advance (any stage to the next)

Measured on the golden set and, from S1 onwards, on the live shadow pairs as well:

| Metric | Requirement |
|---|---|
| Blind craft | new ≥ old + 0.5 |
| Invented rate | new < old |
| Postable rate | new > old |
| Failure rate | new ≤ old |
| p90 latency | new ≤ old + 20 s |

Minimum sample before a decision: 30 golden pairs, plus 200 shadow or
served requests for S2 and above.

## 6. Monitoring and automatic rollback

Every served (`new`) request is compared against the `old` baseline over a
rolling window of the last 200 requests or 24 h:

- failure rate more than 2 points above baseline, or
- p90 latency more than 20 s above baseline, or
- invented rate above baseline, or
- error-code spike (any new code over 1%).

Any one of these triggers an automatic rollback. The component's `killed` is
set to true, so the old path is served to everyone and no shadow runs. An ops
event is raised and the owner is notified. Only a person can clear a kill. It
is never cleared automatically. Shadow-only stages (S1) cannot harm creators,
so a breach there stops the shadow run (`killed`) and nothing else changes.

## 7. Built (inert until the owner acts)

- **Registry source:** `public.release_flags` (migration `0291_release_flags.sql`, file only,
  seeded S0 everywhere). The edge reads it only when `RELEASE_REGISTRY_SOURCE=table`;
  otherwise it passes no registry and the default (S0) applies. A read error falls back to S0.
- **Shadow runner:** `_shared/shadowRun.ts` (edge) + `shadowRunner.ts` (pure, generated).
  After a live script is saved, `scheduleShadowRun` hands a task to `EdgeRuntime.waitUntil`.
  It picks ONE shadowed component, checks `SHADOW_SAMPLE_RATE` (default 0.1), that
  `shadow_runs` exists (one warning if not), and today's shadow spend in `ai_usage_ledger`
  (traffic `shadow`) against `SHADOW_DAILY_USD` (default 0 = off). It re-sends the request
  to generate-blueprint with the service key and `x-twin-shadow: <component>`; that re-run
  uses a read-only service client (`_shared/readOnlyClient.ts`), returns before the
  generation insert, and is never shown or charged. The runner writes one `shadow_runs`
  row and the ledger rows. Logs: ids, counts, status. Optional: `SHADOW_RUN_MAX_TOKENS`
  (flags `token_cap`), `SHADOW_TIMEOUT_MS`.
- **Golden set:** `scripts/ops/goldenSet.mjs` (`golden-v1`: first 24 panel requests).
  Old arm sends `release_off: [component]` (test accounts only); new arm does not.
  Dry run by default; `--live` capped by `GOLDEN_BUDGET_USD` (default 2.0). Local JSON report.
- **Monitor:** `scripts/ops/releaseMonitor.mjs` + `releaseMonitor.ts` (rules of §6; no rule
  trips below 20 completed runs). Dry-run report unless `--apply` AND
  `RELEASE_MONITOR_ENABLED=1`; then it sets `release_flags.killed` and inserts an
  `ops_events` row (`release_rollback`, critical). It never clears a kill.

### Turning S1 on for one component

1. Apply `0290_shadow_runs.sql` and `0291_release_flags.sql`.
2. Run the golden set for the component with `--live` and check the §5 gate.
3. `update public.release_flags set stage = 'S1', updated_at = now() where component = '<c>';`
4. Edge secrets: `RELEASE_REGISTRY_SOURCE=table`, `SHADOW_DAILY_USD=<cap>`, optionally `SHADOW_SAMPLE_RATE`.
5. Schedule the monitor; set `RELEASE_MONITOR_ENABLED=1` and pass `--apply` when ready.
