# Proposal: letting the Claude Code loop start panels safely (no human click)

Status: **proposal only, for advisor review.** Nothing here is wired. This PR does not change any workflow, secret, variable or trigger.

## Today

- `.github/workflows/script-batch.yml` is `workflow_dispatch` only. A guard step stops the run unless it is on `refs/heads/main` and `github.actor == github.repository_owner`. So every panel run needs the owner to click.
- `scripts/ops/panelRun.mjs` reads `PANEL_BUDGET_USD` (default 2.5) and stops once the summed `ai_cost_by_stage_script.est_usd` for **this batch label** reaches it. The cap is per label and set by the caller: a new label starts at $0, and the caller can raise the input. There is no daily or cumulative cap.
- Nothing stops two batches running at once, or an edge/worker deploy landing in the middle of a run (`deploy-edge` and `deploy-worker` each use their own concurrency group).

## (a) Capped trigger

Add `repository_dispatch` with one event type, `panel-run`, to the existing workflow. Keep the owner's manual dispatch as it is. The caller sends only a **preset name** plus a label suffix. It cannot send free-form inputs:

| preset | group | limit | panel_answer_mode |
| --- | --- | --- | --- |
| `panel-reference` | `panel:reference` | 8 | skip |
| `panel-idea` | `panel:idea` | 8 | skip |
| `panel-mixed-small` | `panel` | 24 | fixture |

The following are fixed for every bot run and the caller cannot change them:
- `cost_mode=test`, `drafts=1`, `intake=false`, `panel_seed=false`, `judge2_model` empty.
- `panel_file_id` comes from a repo **variable** (`PANEL_FILE_ID_BOT`), never from the payload.
- Label = `bot-` + `[a-z0-9-]{1,32}` from the payload. The `bot-` prefix keeps bot rows apart in `script_batch_results`.
- `limit` must be at most 24. Any unknown preset, any extra key, or a malformed suffix makes the run fail before checkout.

`repository_dispatch` always runs the default branch (main), so the existing "main only" guard holds. The actor check becomes: actor is the owner (manual dispatch), or the event is `repository_dispatch` and the actor is the one bot identity.

## (b) Server-side budget, independent of the caller

Add a guard script, `scripts/ops/panelBudgetGuard.mjs`, that runs before the batch. It is proposed here and not written in this PR. It has two jobs:
- **Per run:** set `PANEL_BUDGET_USD` from the preset table (for example $0.80 for 8 requests, $2.00 for 24). The payload never sets it.
- **Per day:** sum `est_usd` for all `bot-%` labels in the last 24h. Refuse to start if the sum is at or above `BOT_DAILY_CAP_USD`, for example $4.
- **Cumulative ledger:** sum all `bot-%` spend since `BOT_LEDGER_SINCE` and refuse if it is at or above `BOT_TOTAL_CAP_USD` (**$18**). The caps live in repo variables that only the owner edits. The ledger itself is the existing `script_batch_results` joined to `ai_cost_by_stage_script`, so the bot cannot reset it.
- During the run, `panelRun.mjs` keeps its per-label stop. One proposed small change: also re-check the daily and cumulative caps inside the loop, so a long run cannot cross them.

## (c) Refuse if a run is already in progress

Two layers:
- A concurrency group `panel-run` with `cancel-in-progress: false` queues a second run instead of running both at once.
- The guard step then lists in-progress runs of this workflow (`gh run list --workflow script-batch.yml --status in_progress`). If any run other than itself is in progress, it fails fast instead of waiting in the queue.

## (d) No edge/worker merges during runs

The goal is that `deploy-edge`, `deploy-worker` and a bot panel run never run at the same time. GitHub allows one concurrency group per workflow, so there are two options:
- **Option 1 (preferred):** at their first step, the deploy workflows check for an in-progress `script-batch` run and wait or fail. A panel run then never sees code change under it.
- **Option 2:** the panel guard refuses to start while a deploy is in progress. This covers only the start of the run and is weaker.

Either option edits deploy workflows, so it needs owner sign-off.

## (e) Audit log

Each bot run inserts one row into a `panel_run_audit` table before it does anything else. It is proposed here as a migration and not written in this PR. The row records: run id and URL, event, actor, preset, label, the resolved inputs, the caps in force, spend before the run, `head_sha`, and the Claude session URL taken from the payload. After the run it writes spend after and status. The workflow also prints the same JSON to the job summary.

## (f) Kill switch

Repo variable `PANEL_BOT_ENABLED`. The guard refuses unless the value is exactly `true`. The owner sets it to `false` to stop all future bot runs, and can cancel the current run by hand. Revoking the bot token (g) is the hard stop.

## (g) Secrets and owner approval

- **New:** a fine-grained PAT, or better a GitHub App, scoped to this repo with only `contents: write`. That is the scope `repository_dispatch` needs, but it also allows pushes. Prefer a GitHub App limited to the dispatch endpoint. Only the owner can create it.
- **Reused by the job (unchanged):** `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `HEARTBEAT_*`. A bot trigger means these secrets get used without a human click.
- Today the service role key is behind the owner's click. This proposal puts it behind a token held by an automated loop. That is a change in trust, so **the owner must approve it explicitly.**

## (h) Minimal YAML diff (proposal only)

```diff
 on:
   workflow_dispatch:
     inputs: ...            # unchanged
+  repository_dispatch:
+    types: [panel-run]
+
+concurrency:
+  group: panel-run
+  cancel-in-progress: false

 jobs:
   batch:
     steps:
-      - name: Guard — main branch and owner only
+      - name: Guard — main, owner or bot, preset, kill switch, caps
         run: |
           if [ "$REF" != "refs/heads/main" ]; then echo "::error::main only"; exit 1; fi
-          if [ "$ACTOR" != "$OWNER" ]; then echo "::error::owner only"; exit 1; fi
+          if [ "$EVENT" = "repository_dispatch" ]; then
+            [ "$ACTOR" = "$BOT_ACTOR" ] || { echo "::error::bot actor only"; exit 1; }
+            [ "$BOT_ENABLED" = "true" ] || { echo "::error::kill switch off"; exit 1; }
+            node scripts/ops/panelBudgetGuard.mjs >> "$GITHUB_ENV"   # validates preset, checks in-progress runs, day/total caps, writes audit row, emits fixed inputs
+          elif [ "$ACTOR" != "$OWNER" ]; then echo "::error::owner only"; exit 1; fi
         env:
+          EVENT: ${{ github.event_name }}
+          PAYLOAD: ${{ toJSON(github.event.client_payload) }}   # read as data by the guard only
+          BOT_ACTOR: ${{ vars.PANEL_BOT_ACTOR }}
+          BOT_ENABLED: ${{ vars.PANEL_BOT_ENABLED }}
+          BOT_DAILY_CAP_USD: ${{ vars.BOT_DAILY_CAP_USD }}
+          BOT_TOTAL_CAP_USD: ${{ vars.BOT_TOTAL_CAP_USD }}
+          GH_TOKEN: ${{ github.token }}
           ...
       - name: Run the batch
         env:
-          BATCH_GROUP: ${{ inputs.group }}
+          BATCH_GROUP: ${{ env.G_GROUP || inputs.group }}      # same pattern for label, limit, budget, answer mode
```

Bot runs take every input from `env.G_*`, which the guard writes. `client_payload` is never put directly into a `run:` line. Doing so would open a script-injection path.

## (i) Risks, and what stays human

Risks:
- **The token leaks.** Someone could then spend up to the daily or total cap. The caps bound the loss, and the kill switch and token revoke stop it.
- **The ledger depends on `ai_cost_by_stage_script`.** If cost rows are missing or wrong (UNCONFIRMED prices), the caps under-count. Mitigation: the guard also caps the number of runs per day, for example 3.
- **The loop runs panels in a tight loop.** The daily cap, the in-progress refusal and the run count cap stop this.
- **Concurrent deploys still slip through** until option 1 in (d) is in place.

Always human (owner click or owner edit):
- S2/S3 runs, `cost_mode=checkpoint`, `drafts>1`, `judge2_model`.
- `panel_seed`, `intake`, and anything that touches **real creators** or non-fictional accounts.
- Raising any cap, editing the presets, flipping the kill switch back on, rotating or creating the bot token.
- Merging edge or worker changes, and promoting any result to a release decision.
