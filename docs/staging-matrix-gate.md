# The staging-matrix merge gate

**Status:** replaces the `staging-matrix-required` job that lived in
`.github/workflows/pr-checks.yml`.

| | old | new |
|---|---|---|
| Workflow | `pr-checks.yml` → job `staging-matrix-required` | `staging-matrix-gate.yml` → job `gate` |
| Trigger | `pull_request` (push time) | `workflow_run` on **staging-integration completion**, plus a `pull_request` half that only reports what is already true |
| Reports | a check run named `staging-matrix-required` | a **commit status** with context `staging-matrix-gate` |
| Green when | a `staging-integration` run with conclusion `success` exists at the exact head SHA | **unchanged** |
| While unknown | red | `pending` |

## The one manual step ✅ DONE

Branch protection is an admin setting; no workflow file can change it. This was
applied by hand when the gate merged. The current state of the `main protection`
ruleset (id `19777534`, enforcement `active`, targeting `~DEFAULT_BRANCH`):

| required check | why |
|---|---|
| `staging-matrix-gate` | this gate — replaced `staging-matrix-required` |
| `unit-tests` | |
| `web-and-shared` | typecheck + web build |
| `worker` | worker typecheck |

**The last three are deliberate, and are new.** Before this, the matrix was the
*only* required check, so a PR could merge with a passing matrix and a **failing
typecheck**. They entered as a bridge — a ruleset refuses an empty required list,
so the old check could not simply be removed — and were kept because that hole
was worth closing.

Two footnotes for whoever changes this next:

- **The order was: bridge, merge, swap.** The gate's own PR deletes the job the
  ruleset required, so `staging-matrix-required` could never report on it and the
  merge button never lit up. The required check has to be replaced *before* the
  merge, not after. A required check that no longer reports leaves every PR
  blocked on *"Expected — waiting for status to be reported"* — skipping this does
  not fail open, it fails stuck.
- **All four are stored as "any source"**, i.e. no `integration_id` pin. The
  originals were pinned to GitHub Actions (`15368`); typing a check name rather
  than picking it from the dropdown stores it unpinned, and re-saving the rule
  reset the one that was pinned. Any app with `statuses: write` can therefore
  satisfy them. Worth re-pinning by removing and re-adding each from the
  suggestion list.

## Why the trigger had to change

The matrix takes **~77 minutes**. The old gate ran at push time and demanded a
successful matrix run at that exact head, so it asked its question roughly 77
minutes before the answer could exist. Its only two options were to fail
immediately or to hold a billable runner for over an hour and then usually fail
anyway. It failed immediately.

The cost was not just noise. Every push produced a red X that meant "not yet",
clearing it was something a human had to remember to do, and two genuine staging
failures — a caption-timing defect and an auth flake — sat unnoticed among
dozens of identical false ones.

No timeout value fixes this; it is structural. The old workflow said so itself
and deferred the change as one that "wants a review".

## Why a commit status rather than a check run

A commit status has a `pending` state. A check run's terminal conclusions do
not include one — which is precisely why the old design had to choose between a
premature "no" and an hour of waiting. `pending` lets the gate say *not answered
yet*.

**A required status in `pending` blocks the merge exactly as a failure does.**
Nothing that was unmergeable becomes mergeable. Only the label changes.

## What the gate answers

Decided in `scripts/ci/staging_matrix_gate.mjs` (selftested in CI, run by the
`no-legacy-editor` job):

| At the head SHA | verdict |
|---|---|
| any run concluded `success` | **success** — one success outranks earlier failures; a green re-run proves the head |
| otherwise, any run still in flight | **pending** |
| no run at all | **pending**, forever if need be — silence is not proof |
| every run concluded, none `success` | **failure** |
| run list unreadable | **error** |

Only the literal string `success` opens the gate. An unrecognised *conclusion*
is a finished run that did not succeed, and reads as failure; an absent
conclusion is a run that has not finished, and reads as pending.

## Fail-closed properties worth not regressing

- **Documentation-only PRs are exempt**, and nothing else is. `.github/*` is not
  wholesale-exempt — CI config decides what gets deployed to production.
- **The file list is paginated.** GitHub silently caps `per_page` at 100, so an
  unpaginated query classifies a >100-file PR on a truncated list.
- **Any failure to enumerate the diff fails the gate**, rather than exempting it.
  Zero resolved files throws.
- **A PR is judged by the base branch's copy of the gate**, never its own — the
  `pull_request` half checks out `base.sha`. Otherwise a PR could widen the
  exemption rules and then be judged by them.
- **A fork PR fails loudly.** Its token cannot write commit statuses, so the gate
  says so instead of never reporting.
- **A failed status POST fails the run.** A gate with no way to report must not
  look like one that passed.

## Two things that only work after merge

1. `workflow_run` workflows always execute the **default branch's** copy of the
   file, so the completion-triggered half cannot fire until this is on `main`.
   This gate's own PR is therefore judged by the old rules.
2. `staging-integration` only runs on push to `rebuild/editor-v2-*` or via
   dispatch, and its keyless `ci-bootstrap` credential exchange only answers to
   that workflow file on those refs or `main`. A PR on any other branch cannot
   get a matrix run at its head without being pushed under a
   `rebuild/editor-v2-*` name.
