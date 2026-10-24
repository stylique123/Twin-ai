# Panel queue v2: self-starting panels with no new token (design, for advisor review)

Status: **alternative design (see panel-self-start-proposal.md for the recommended scheduled-dispatch option).** **Design only. Do not merge until the advisor has reviewed it.** Nothing here is wired: no workflow, secret, variable, trigger or migration is changed by this PR. Supersedes the `repository_dispatch` idea in `panel-self-start-proposal.md` (kept for the record) because v2 needs **no new token** and so no change in trust.

Source: Fast Path v1, Section 4 ("a queue table, a scheduled workflow every 30 minutes that picks one queued row, checks the budget ledger, runs the same batch code with the same safeguards, writes the package to a private location; no secrets in logs, an allowlist of labels, a kill switch as a flag row").

## 1. Why a schedule instead of a dispatch token

| | v1 (`repository_dispatch`) | v2 (schedule + queue table) |
|---|---|---|
| New credential | a PAT or GitHub App with `contents: write` | **none** |
| Who can start a run | anyone holding the token | only a row in a private table (written by the service role, never by the public) |
| Trust change | the service role key moves behind a bot token | the service role key stays where it is; the schedule runs the same job the owner already runs |
| Permissions | new | **the same as `script-batch` today** |

A GitHub `schedule` trigger runs on the default branch with the workflow's own `GITHUB_TOKEN`. It never takes inputs from outside, so there is no script-injection path from a payload.

## 2. The tables (proposed migration, not added in this PR)

```sql
-- Private: RLS on, no policies → only the service role can read or write.
create table public.panel_queue (
  id            bigint generated always as identity primary key,
  label         text not null check (label ~ '^bot-[a-z0-9-]{1,32}$'),
  preset        text not null,                    -- must be in panel_presets (allowlist)
  budget_usd    numeric(6,2) not null check (budget_usd > 0 and budget_usd <= 2.50),
  status        text not null default 'queued'
                check (status in ('queued','claimed','running','done','failed','refused')),
  refused_reason text,                            -- a fixed code, never free text from a run
  run_url       text,
  spend_usd     numeric(6,2),
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  finished_at   timestamptz
);
alter table public.panel_queue enable row level security;

-- The allowlist. Each preset fixes EVERY batch input; a queue row can only name one.
create table public.panel_presets (
  name              text primary key,
  batch_group       text not null,               -- e.g. 'panel', 'panel:reference'
  request_limit     int  not null check (request_limit between 1 and 24),
  answer_mode       text not null check (answer_mode in ('skip','fixture')),
  arms              text not null check (arms in ('writer','writer+planb')),
  max_budget_usd    numeric(6,2) not null check (max_budget_usd <= 2.50)
);
alter table public.panel_presets enable row level security;

-- The kill switch and the caps: ONE row, edited only by the owner (SQL editor).
create table public.panel_bot_control (
  id                int primary key default 1 check (id = 1),
  enabled           boolean not null default false,     -- the kill switch; starts OFF
  per_run_cap_usd   numeric(6,2) not null default 2.50,
  runs_per_day      int not null default 2,
  total_cap_usd     numeric(6,2) not null default 18.00, -- stop at $18 and ask (Fast Path §9)
  ledger_since      timestamptz not null                  -- spend before this is not counted
);
alter table public.panel_bot_control enable row level security;
```

Seed presets (all fictional accounts, `cost_mode=test`, `drafts=1`, `intake=false`, `panel_seed=false`, no second judge model; none of these can be changed by a queue row):

| preset | group | limit | answer mode | arms | max $ |
|---|---|---|---|---|---|
| `daily-24` | `panel` | 24 | fixture | writer | 1.40 |
| `daily-24-two-arm` | `panel` | 24 | fixture | writer+planb | 2.50 |
| `reference-6` | `panel:reference` | 6 | skip | writer | 0.40 |
| `idea-6` | `panel:idea` | 6 | skip | writer | 0.40 |

## 3. The scheduled workflow (proposed YAML, not added)

```yaml
name: panel-queue
on:
  schedule: [{ cron: '*/30 * * * *' }]   # every 30 minutes
  workflow_dispatch: {}                   # owner can poke it; same guard applies
concurrency: { group: panel-run, cancel-in-progress: false }   # shared with script-batch
permissions: { contents: read }
jobs:
  pick:
    runs-on: ubuntu-24.04
    timeout-minutes: 75
    steps:
      - uses: actions/checkout@v4          # main only (schedule always runs main)
      - run: npm ci
      - name: Guard and claim one row (prints only ids and fixed codes)
        id: claim
        run: node scripts/ops/panelQueueClaim.mjs >> "$GITHUB_OUTPUT"
        env: { SUPABASE_URL: ${{ secrets.SUPABASE_URL }}, SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }} }
      - name: Run the batch (the SAME code path as script-batch)
        if: steps.claim.outputs.claimed == 'true'
        run: node scripts/ops/panelRun.mjs
        env:
          # inputs come ONLY from the preset row the guard resolved, via step outputs
          BATCH_LABEL: ${{ steps.claim.outputs.label }}
          BATCH_GROUP: ${{ steps.claim.outputs.group }}
          BATCH_LIMIT: ${{ steps.claim.outputs.limit }}
          PANEL_BUDGET_USD: ${{ steps.claim.outputs.budget }}
          PANEL_ANSWER_MODE: ${{ steps.claim.outputs.answer_mode }}
          # ...the same secrets script-batch already uses, unchanged...
      - name: Package to private storage and close the row
        if: always() && steps.claim.outputs.claimed == 'true'
        run: node scripts/ops/panelQueueFinish.mjs
```

Sharing the `panel-run` concurrency group with `script-batch` means a bot run and an owner run can never overlap.

## 4. The guard (`panelQueueClaim.mjs`, proposed) — every check, in order

1. `panel_bot_control.enabled` must be `true`, else print `claimed=false reason=kill_switch` and stop. **Kill switch = one row, one column.**
2. No other `panel-queue` or `script-batch` run in progress (via `gh run list`) and no `deploy-edge` / `deploy-worker` run in progress, else `reason=busy` (the row stays queued; the next tick retries).
3. Runs claimed in the last 24 h `< runs_per_day` (2), else `reason=daily_runs`.
4. **Ledger:** sum of `ai_cost_by_stage_script.est_usd` for all `bot-%` labels since `ledger_since`, plus the row's `budget_usd`, must be `<= total_cap_usd` ($18), else the row is marked `refused` with `reason=total_cap` and **nothing more is claimed until the owner edits the control row** (hard stop at the cap).
5. Pick the oldest `queued` row; its `preset` must exist in `panel_presets` (the allowlist) and its `budget_usd` must be `<= min(preset.max_budget_usd, per_run_cap_usd)`, else `refused` with `reason=preset` / `reason=budget`.
6. Atomic claim: `update ... set status='claimed', claimed_at=now() where id=$1 and status='queued' returning id` (two ticks cannot claim the same row).
7. Emit ONLY: `claimed`, `label`, `group`, `limit`, `budget`, `answer_mode`, `arms`, `row_id`. No secret, no creator text, no request text ever reaches `$GITHUB_OUTPUT` or the log.

During the run `panelRun.mjs` keeps its existing per-label stop at `PANEL_BUDGET_USD`; the proposed addition is a re-check of the total ledger every 4 requests so one run cannot cross $18.

## 5. Where the package goes

`panelQueueFinish.mjs` builds the same blind package the owner gets today (her onboarding answers, voice cards, the "sounds like her" sheet, the model judge's pre-score) and uploads it to the **private** Supabase Storage bucket `panel-packages` (no public URL; a 7-day signed link is minted only when the owner asks). It is **never** a GitHub artifact (the repo is public). The row gets `status`, `spend_usd`, `finished_at`, `run_url`.

## 6. What stays human

Flipping `enabled` on or off; raising any cap; adding or editing a preset; anything with real creators, `cost_mode=checkpoint`, `drafts>1`, a second judge model, seeding or intake; merging deploys; any release decision.

## 7. Risks

| Risk | Bound |
|---|---|
| A bad row starts runs in a loop | 2 runs a day, $2.50 a run, $18 total, all checked server-side |
| Cost rows missing or underpriced | run-count cap still binds; the advisor sees `spend_usd` per row |
| A deploy changes code mid-run | guard step 2 refuses to start during a deploy; Option 1 of v1 §(d) (deploys wait for a running panel) still needs owner sign-off |
| Public repo leaks something | inputs are ids and fixed codes only; the package lives in private storage |

## 8. To turn it on (after the advisor's OK; the owner's clicks)

1. Merge this design's code PR (migration + two scripts + the workflow).
2. In the Supabase SQL editor: `update panel_bot_control set enabled = true, ledger_since = now();`
3. To stop at any time: `update panel_bot_control set enabled = false;`
