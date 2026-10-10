# CI minutes and the self-hosted runner

## Where the minutes go (last 30 days, sampled from the Actions API)

| Workflow | Runs | Billed per run | Approx. minutes |
|---|---|---|---|
| PR checks (8 jobs) | 316+ | ~18 | ~5,700 |
| script-batch | 77 | ~18 avg (46 max) | ~1,360 |
| staging-matrix-gate | 318+ | 1 | ~320 |
| heartbeat (hourly) | ~720/month | 1 | ~720 |
| deploys (edge, worker, production) | ~250 | 1–2 | ~300 |

That is about 8,000 or more billed minutes a month. The Free plan includes 2,000 for private repos. The API returns at most 1,000 runs, so these are lower bounds.

## What this change does

1. Every job picks its runner with `(!github.event.repository.private || !vars.CI_RUNNER) && 'ubuntu-latest' || vars.CI_RUNNER`. On a **public** repo this is always `ubuntu-latest`, even if `CI_RUNNER` is set, so a fork PR can never reach a self-hosted machine. `scripts/ci/check_runner_guard.mjs` fails CI if any job uses another `runs-on`.
2. PR checks: a new push to the same PR cancels the older run. Runs on `main` are never cancelled.

## Switching to a self-hosted runner (owner steps)

Minutes used on self-hosted runners are free.

1. Pick a machine, e.g. the existing VPS or a small Linux box with 2 or more vCPUs, 4 GB RAM and 20 GB disk. It needs Node 22, git, jq, curl and Docker (the deploy-worker job calls `docker`).
2. Go to Settings → Actions → Runners → New self-hosted runner (Linux x64) and follow the download and `./config.sh` steps it shows. Add the label `twin`. Then run `sudo ./svc.sh install && sudo ./svc.sh start`.
3. Go to Settings → Secrets and variables → Actions → Variables and set `CI_RUNNER` = `self-hosted`.
4. Re-run any red PR. To roll back, delete the variable.

Notes:
- Only for a private repo. The guard above ignores `CI_RUNNER` while the repo is public; keep the variable unset until it is private again.
- Jobs run one at a time per runner. Register 2 runners on the same box to keep PR checks reasonably fast.

## Further cuts (need an owner decision)

- Stop running the full PR checks on push to `main`. Squash merges of green PRs re-run the same 8 jobs, so this saves about half of the PR-check minutes.
- Run the heartbeat every 3 hours instead of hourly, saving about 480 minutes a month.
- Run script-batch with `drafts=1` and smaller limits.
