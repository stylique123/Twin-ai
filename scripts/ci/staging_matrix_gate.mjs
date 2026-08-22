// The decision half of the staging-matrix merge gate. The workflow
// (.github/workflows/staging-matrix-gate.yml) does the HTTP; every pass/fail/
// wait predicate lives here, so the offline selftest proves the exact logic the
// gate runs rather than a copy of it.
//
// WHY THIS EXISTS AT ALL — the gate it replaces was structurally unable to
// answer its own question. `staging-matrix-required` ran on `pull_request`,
// i.e. at PUSH time, and demanded a SUCCESSFUL `staging-integration` run on the
// exact head being merged. That matrix takes ~77 minutes. So the check ran
// roughly 77 minutes before the evidence it needs could possibly exist, and had
// exactly two options: fail immediately, or hold a billable runner for over an
// hour and then usually fail anyway. It was set to fail immediately. Every push
// therefore produced a red X that meant "not yet", and somebody had to remember
// to come back and re-run it. Two genuine staging failures (a caption-timing
// defect and an auth flake) sat unnoticed among dozens of identical false ones.
//
// The old workflow diagnosed this itself and declined to fix it in place:
//
//     THE RIGHT DESIGN, not built here: trigger the gate from `workflow_run` on
//     staging-integration COMPLETION rather than on push. Then it costs
//     seconds, fires once, and reports the true answer. That is a real change
//     to a merge-protection gate and wants a review, so it is written down
//     rather than slipped in.
//
// This is that change, written down and reviewable.
//
// THE GATE IS NOT WEAKENED, AND THIS IS THE LOAD-BEARING CLAIM. It still goes
// green on exactly one condition, unchanged: a `staging-integration` run whose
// conclusion is `success` exists at this exact head SHA. What changes is the
// answer given while that is still unknown. A commit status has a `pending`
// state; a check run's terminal states do not include one, which is the whole
// reason the old design had to pick between a lie and an hour of waiting. A
// required status in `pending` BLOCKS THE MERGE exactly as a failure does — so
// nothing that used to be unmergeable becomes mergeable. Only the label
// changes, from "answered no" to "not answered yet".
//
// FAIL-CLOSED IN THE ABSENCE OF EVIDENCE. No run at this head is `pending`, not
// `success`: silence is not proof. It stays pending forever if the matrix is
// never run, which is the correct and intended outcome — the branch must be
// pushed as `rebuild/editor-v2-*` or the matrix dispatched against that head.
//
//   node scripts/ci/staging_matrix_gate.mjs --selftest
//   node scripts/ci/staging_matrix_gate.mjs --classify --files /tmp/pr_files.txt
//   node scripts/ci/staging_matrix_gate.mjs --verdict --runs /tmp/runs.json
import { tierForFiles } from './gate_tiers.mjs'
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// GitHub truncates a commit-status description past 140 characters. Truncating
// here rather than letting the API do it keeps the visible text ours.
export const MAX_DESCRIPTION = 140

// The selftest reads this to prove the workflow has not re-grown a copy of the
// decision in YAML. Repo-root-relative: the selftest runs from the repo root.
export const WORKFLOW_PATH = '.github/workflows/staging-matrix-gate.yml'

// In flight = HAS NOT REACHED A CONCLUSION. Keyed on the absence of
// `conclusion` rather than on a whitelist of queue statuses, deliberately.
// GitHub has grown that status list over time — `queued`, `in_progress`,
// `waiting`, `pending`, `requested` — and a whitelist would silently
// misclassify the sixth one it invents. The invariant that actually holds is
// GitHub's own: `conclusion` is null until the run finishes, whatever the run
// is called while it waits.
//
// An unrecognised CONCLUSION is the opposite case and must not be confused with
// this one: it has finished, and it did not finish `success`, so it is a
// failure. The only string that opens the gate is `success`.
export function isInFlight(run) {
  const conclusion = run?.conclusion
  return conclusion === null || conclusion === undefined || conclusion === ''
}

export function isSuccess(run) {
  return run?.conclusion === 'success'
}

// THE VERDICT. Precedence is success > pending > failure, and the order matters
// in a way that is easy to get backwards:
//
//   * One success is enough even if ten other runs at this head failed. The
//     question is "was this head proven", not "was it ever unproven". A flake
//     followed by a green re-run is a proven head.
//   * A run still in flight outranks a concluded failure, because a re-run of a
//     failed matrix is the normal way a head gets proven, and calling that red
//     while it is actively running is the same premature answer this file
//     exists to stop giving.
export function verdictFromRuns(runs, { headSha = '' } = {}) {
  if (!Array.isArray(runs)) {
    return { state: 'error', description: 'Could not read the staging-integration run list — failing closed on an unknown answer.' }
  }
  const short = String(headSha).slice(0, 8)
  const success = runs.find(isSuccess)
  if (success) {
    return {
      state: 'success',
      description: `Staging matrix passed on this exact head${short ? ` (${short})` : ''}.`,
      targetUrl: success.html_url ?? '',
    }
  }
  const inFlight = runs.find(isInFlight)
  if (inFlight) {
    return {
      state: 'pending',
      description: 'Staging matrix is running on this head. This will turn green or red on its own when it finishes.',
      targetUrl: inFlight.html_url ?? '',
    }
  }
  if (runs.length === 0) {
    return {
      state: 'pending',
      description: 'No staging matrix has run on this head. Push the branch as rebuild/editor-v2-* or dispatch staging-integration against it.',
      targetUrl: '',
    }
  }
  const outcomes = runs.map((r) => String(r?.conclusion ?? 'unknown')).join(', ')
  return {
    state: 'failure',
    description: `Every staging matrix run on this head concluded without success (${outcomes}). Do not merge around this check.`,
    targetUrl: runs[0]?.html_url ?? '',
  }
}

// THE STRICT ALLOWLIST, carried over verbatim in spirit from the job this
// replaces, including the two bugs its comments record having already fixed:
// `.github/*` is NOT wholesale-exempt (that once exempted deploy-worker.yml, so
// a change to WHAT GETS DEPLOYED TO PRODUCTION could bypass the gate), and the
// caller must paginate the file list rather than trusting a capped page.
//
// The matrix is REQUIRED unless every changed file is provably incapable of
// altering runtime behaviour — documentation, and nothing else.
export function isExemptPath(file) {
  const f = String(file ?? '').trim()
  if (!f) return false
  return (
    f === 'LICENSE' ||
    f.endsWith('.md') ||
    f.startsWith('docs/') ||
    f.startsWith('.github/ISSUE_TEMPLATE/') ||
    f.startsWith('.github/PULL_REQUEST_TEMPLATE')
  )
}

// Returns { required, reason }. Throws on an empty list: resolving zero changed
// files is an API problem or an empty PR, and neither is evidence of safety.
export function matrixRequiredForFiles(files) {
  const list = (Array.isArray(files) ? files : []).map((f) => String(f).trim()).filter(Boolean)
  if (list.length === 0) {
    throw new Error('Resolved zero changed files. That is an API problem or an empty PR; neither is evidence of safety. Failing closed.')
  }
  // ⚖️ THE TIER DECIDES, AND IT IS STRICTLY MORE CONSERVATIVE THAN WHAT IT
  // REPLACES. The old rule exempted documentation and nothing else. The tier
  // adds exactly one more cheap destination — STATIC — and escalates everything
  // it does not recognise, including several paths the old rule would have let
  // through as ordinary runtime files and then gated identically anyway.
  //
  // ⚠️ THE DOCUMENTATION EXEMPTION IS KEPT AS A SEPARATE, NARROWER CHECK rather
  // than folded away. If the tier table ever regressed, doc-only PRs would
  // still be exempt by the original rule, and a bug in the new code could make
  // the gate stricter but never looser.
  const v = tierForFiles(list)
  const docOnly = list.every((f) => isExemptPath(f))
  if (docOnly) {
    return { required: false, tier: 'DOC', decidedBy: list[0],
      reason: `Documentation-only PR (${list.length} files) — the editor matrix cannot prove anything about it.` }
  }
  return { required: v.matrixRequired, tier: v.tier, decidedBy: v.decidedBy, reason: v.reason }
}

export function clampDescription(text) {
  const s = String(text ?? '')
  return s.length <= MAX_DESCRIPTION ? s : `${s.slice(0, MAX_DESCRIPTION - 1)}…`
}

export const DOC_ONLY_DESCRIPTION =
  'Documentation-only PR — the staging matrix cannot prove anything about it.'
export const NO_VERDICT_DESCRIPTION =
  'The gate could not reach a verdict — see the workflow log.'

// WHICH STATUS ACTUALLY GETS POSTED. This used to be a YAML expression and a
// shell `if`, which is how it came to fail open:
//
//     EXEMPT: ${{ steps.scope.outputs.required == '0' }}     # WRONG
//
// The classify step that sets `required` runs only on `pull_request`. On the
// `workflow_run` path it is correctly SKIPPED, so `steps.scope.outputs.required`
// is null — and GitHub Actions coerces null → 0 and '0' → 0, which makes
// `null == '0'` TRUE. Every workflow_run therefore took the exemption branch and
// posted `success — "Documentation-only PR"`, overwriting STATE before the real
// verdict was read. A runtime PR went green whether the matrix had passed OR
// FAILED. Observed on #242: `pending` at 12:10 from the pull_request half, then
// `success — Documentation-only PR…` at 12:53 from the workflow_run half.
//
// Two independent guards now stand where one loose comparison did:
//   1. the exemption is UNREACHABLE unless the event is literally
//      `pull_request` — a skipped classify step can no longer exempt anything;
//   2. a real verdict OUTRANKS the exemption, so even if guard 1 were somehow
//      defeated, evidence beats the absence of it.
// Both are string-exact comparisons: '' , null and undefined are all not-'0'.
//
// Living here rather than in YAML is the point. This file's whole claim is that
// the selftest proves the logic the gate runs rather than a copy of it, and the
// one predicate left behind in YAML is the one that broke.
export function resolvePostedStatus({
  eventName,
  required,
  state,
  description,
  targetUrl,
  runUrl = '',
} = {}) {
  const fallbackUrl = String(runUrl ?? '')
  const verdictState = String(state ?? '').trim()

  // A verdict exists: it is evidence, and evidence always wins.
  if (verdictState) {
    return {
      state: verdictState,
      description: clampDescription(description),
      targetUrl: String(targetUrl ?? '') || fallbackUrl,
      exempt: false,
    }
  }

  // No verdict. The documentation-only exemption is the ONLY thing that may
  // turn that into a green, and only on the event that computed it.
  // Strict identity, not `==` and not coerced: Actions' loose `==` is precisely
  // what turned a skipped step's null into a green.
  if (eventName === 'pull_request' && required === '0') {
    return {
      state: 'success',
      description: clampDescription(DOC_ONLY_DESCRIPTION),
      targetUrl: fallbackUrl,
      exempt: true,
    }
  }

  // Anything else means an earlier step failed or was skipped. Never silently
  // pass: `error` blocks the merge and points at this run's log.
  return {
    state: 'error',
    description: clampDescription(NO_VERDICT_DESCRIPTION),
    targetUrl: fallbackUrl,
    exempt: false,
  }
}

function selftest() {
  let failed = 0
  const ok = (cond, msg) => { if (!cond) { console.error(`SELFTEST FAIL: ${msg}`); failed++ } else console.log(`  ok: ${msg}`) }

  const run = (conclusion, status = 'completed') => ({ conclusion, status, html_url: 'https://example.invalid/run' })
  const running = { conclusion: null, status: 'in_progress', html_url: 'https://example.invalid/live' }
  const queued = { conclusion: null, status: 'queued', html_url: 'https://example.invalid/queued' }
  const pendingRun = { conclusion: null, status: 'pending', html_url: 'https://example.invalid/pending' }

  // --- the one green condition, and nothing else -------------------------
  ok(verdictFromRuns([run('success')]).state === 'success', 'a successful run at this head → success')
  ok(verdictFromRuns([run('failure'), run('success')]).state === 'success', 'one success outranks an earlier failure (a green re-run proves the head)')
  ok(verdictFromRuns([run('success'), running]).state === 'success', 'success outranks a run still going')
  for (const bad of ['failure', 'cancelled', 'timed_out', 'skipped', 'action_required', 'neutral', 'stale', 'startup_failure'])
    ok(verdictFromRuns([run(bad)]).state === 'failure', `every run concluded "${bad}" → failure, never green`)

  // --- "not answered yet" is pending, and pending still blocks the merge --
  ok(verdictFromRuns([]).state === 'pending', 'NO run at this head → pending (silence is not proof, and never becomes success on its own)')
  ok(verdictFromRuns([running]).state === 'pending', 'a run in flight → pending, not the premature red the old gate gave')
  ok(verdictFromRuns([queued]).state === 'pending', 'a queued run (serialised behind the shared staging project) → pending')
  ok(verdictFromRuns([pendingRun]).state === 'pending', 'GitHub\'s own "pending" run status → pending')
  ok(verdictFromRuns([run('failure'), running]).state === 'pending', 'a re-run in flight after a failure → pending, not failure')

  // Non-vacuity control: the reason a failed matrix must NOT read as pending.
  ok(verdictFromRuns([run('failure')]).state !== 'pending', 'CONTROL: a concluded failure is an answer, and the answer is no')
  ok(verdictFromRuns([run('failure')]).state !== 'success', 'CONTROL: a concluded failure is never success')

  // A status we have never heard of concluded — it is not `success`, so it is
  // not green. It must not be mistaken for in-flight.
  ok(verdictFromRuns([run('some_future_conclusion')]).state === 'failure', 'an unrecognised CONCLUSION is not success and is not in-flight → failure')
  ok(isInFlight({ conclusion: null }), 'null conclusion → in flight')
  ok(!isInFlight(run('success')), 'a concluded run is not in flight')

  // A malformed API answer is an error, never a pass.
  ok(verdictFromRuns(null).state === 'error', 'unreadable run list → error (fail closed)')
  ok(verdictFromRuns(undefined).state === 'error', 'missing run list → error (fail closed)')
  ok(verdictFromRuns('nope').state === 'error', 'a string where the run list should be → error')

  // --- the exemption allowlist -------------------------------------------
  ok(!matrixRequiredForFiles(['docs/x.md', 'README.md', 'LICENSE']).required, 'documentation-only → matrix not required')
  ok(matrixRequiredForFiles(['docs/x.md', 'worker/src/jobs/editorV2.ts']).required, 'one runtime file among docs → REQUIRED')
  ok(matrixRequiredForFiles(['.github/workflows/deploy-worker.yml']).required, 'CI config is NOT exempt — it decides what gets deployed')
  ok(matrixRequiredForFiles(['.github/workflows/staging-matrix-gate.yml']).required, 'this gate\'s own workflow is not exempt from itself')
  ok(!matrixRequiredForFiles(['.github/ISSUE_TEMPLATE/bug.md']).required, 'issue templates are inert')
  ok(matrixRequiredForFiles(['scripts/ci/staging_matrix_gate.mjs']).required, 'a script is runtime-capable')
  ok(matrixRequiredForFiles(['supabase/migrations/0100_x.sql']).required, 'a migration is runtime-capable')
  // The near-misses that a sloppier prefix test would wave through.
  ok(matrixRequiredForFiles(['docsy/thing.ts']).required, 'CONTROL: "docsy/" is not "docs/"')
  ok(matrixRequiredForFiles(['worker/docs.md.ts']).required, 'CONTROL: a .ts file merely containing ".md" is not a doc')
  ok(matrixRequiredForFiles(['LICENSE.ts']).required, 'CONTROL: LICENSE.ts is not LICENSE')
  ok(matrixRequiredForFiles(['.github/workflows/ISSUE_TEMPLATE/x.yml']).required, 'CONTROL: the template exemption is anchored at the start of the path')

  let threw = false
  try { matrixRequiredForFiles([]) } catch { threw = true }
  ok(threw, 'an empty file list THROWS rather than exempting the PR')
  threw = false
  try { matrixRequiredForFiles(['  ', '']) } catch { threw = true }
  ok(threw, 'a list of blanks THROWS too — it resolves to zero real files')

  // --- the exemption must be unreachable on workflow_run ------------------
  // The regression this section exists for: `required` is NULL on the
  // workflow_run path because the classify step is skipped there, and Actions'
  // `null == '0'` is true. Every one of these used to come back green.
  const wr = (extra = {}) => resolvePostedStatus({ eventName: 'workflow_run', runUrl: 'https://example.invalid/gate', ...extra })
  for (const absent of [undefined, null, '']) {
    const label = absent === undefined ? 'undefined' : absent === null ? 'null' : "''"
    ok(!wr({ required: absent, state: 'failure', description: 'matrix failed' }).exempt,
      `workflow_run with required=${label} is NOT exempt — a skipped classify step cannot exempt anything`)
    ok(wr({ required: absent, state: 'failure', description: 'matrix failed' }).state === 'failure',
      `REGRESSION: workflow_run + required=${label} + a FAILED matrix posts failure, not "Documentation-only PR"`)
    ok(wr({ required: absent, state: 'success', description: 'matrix passed' }).state === 'success',
      `workflow_run + required=${label} + a passed matrix posts the real success`)
    ok(wr({ required: absent }).state === 'error',
      `workflow_run + required=${label} + NO verdict → error, never a green exemption`)
  }
  // Even the literal '0' cannot exempt a workflow_run: the event guard is
  // independent of the value, so a future step that sets `required` on the
  // wrong path still cannot open the gate.
  ok(!wr({ required: '0' }).exempt, 'workflow_run with required="0" is still NOT exempt — the exemption is pull_request-only')
  ok(wr({ required: '0' }).state === 'error', 'workflow_run + required="0" + no verdict → error')
  ok(wr({ required: '0', state: 'failure', description: 'matrix failed' }).state === 'failure',
    'workflow_run + required="0" + a failed matrix still posts failure')

  // --- the verdict outranks the exemption when both are set ---------------
  const pr = (extra = {}) => resolvePostedStatus({ eventName: 'pull_request', runUrl: 'https://example.invalid/gate', ...extra })
  for (const s of ['failure', 'pending', 'error', 'success']) {
    const r = pr({ required: '0', state: s, description: `verdict says ${s}` })
    ok(r.state === s, `pull_request + required="0" + verdict "${s}" → the VERDICT wins, not the exemption`)
    ok(!r.exempt, `pull_request + required="0" + verdict "${s}" → not reported as exempt`)
    ok(r.description === `verdict says ${s}`, `the verdict's own description survives (${s})`)
  }

  // --- the exemption still works where it is supposed to ------------------
  ok(pr({ required: '0' }).exempt, 'pull_request + required="0" + no verdict → exempt (the documentation-only case still works)')
  ok(pr({ required: '0' }).state === 'success', 'the documentation-only exemption still posts success')
  ok(pr({ required: '0' }).description === DOC_ONLY_DESCRIPTION, 'the exemption posts the documentation-only description')
  ok(pr({ required: '1' }).state === 'error', 'CONTROL: pull_request + required="1" + no verdict → error, never success')
  ok(pr({ required: '1', state: 'pending', description: 'still running' }).state === 'pending', 'a required PR awaiting the matrix posts pending')
  for (const absent of [undefined, null, ''])
    ok(pr({ required: absent }).state === 'error',
      `CONTROL: pull_request with an UNSET required → error — a classify step that failed exempts nothing`)

  // Exhaustive: across every event/required pair we can name, `exempt` is true
  // for exactly one of them.
  {
    let exemptCount = 0
    for (const eventName of ['pull_request', 'workflow_run', 'push', 'schedule', '', null, undefined])
      for (const required of ['0', '1', '', ' 0 ', 0, null, undefined])
        if (resolvePostedStatus({ eventName, required }).exempt) exemptCount++
    ok(exemptCount === 1, `exactly one (event, required) pair is exempt across the whole grid — got ${exemptCount}`)
  }
  ok(!resolvePostedStatus({ eventName: 'pull_request', required: 0 }).exempt, 'a NUMERIC 0 is not the string "0" — no loose coercion is reintroduced')
  ok(!resolvePostedStatus({}).exempt, 'an empty resolve call is not exempt')
  ok(resolvePostedStatus({}).state === 'error', 'an empty resolve call fails closed')

  // A verdict with no target_url falls back to the run URL rather than posting
  // a status that links nowhere.
  ok(wr({ state: 'failure', description: 'x' }).targetUrl === 'https://example.invalid/gate', 'a verdict with no target_url falls back to the run URL')
  ok(wr({ state: 'failure', description: 'x', targetUrl: 'https://example.invalid/run' }).targetUrl === 'https://example.invalid/run', 'a verdict keeps its own target_url')

  // --- the workflow must not recompute any of this in YAML ----------------
  // The bug was never in this file; it was in a YAML expression that duplicated
  // this decision. Read the frozen workflow and fail if that shape returns.
  // Read UNGUARDED, like every sibling check in scripts/ci. An earlier draft
  // skipped these when the file could not be read, which would have let the
  // five assertions below vanish silently the moment anything changed about the
  // checkout — a contract test that can quietly stop testing is worse than none.
  // The selftest runs from the repo root in pr-checks.yml; if it cannot, that is
  // a real finding and should be loud.
  {
    let wf
    try {
      wf = readFileSync(WORKFLOW_PATH, 'utf8')
    } catch (err) {
      console.error(`SELFTEST FAIL: cannot read ${WORKFLOW_PATH} (${err.code ?? err.message}). Run the selftest from the repo root — these assertions must never be skipped.`)
      failed++
    }
    if (wf !== undefined) {
      // Comment lines are stripped first: the file DESCRIBES the broken
      // expression at length so the next reader knows why it went, and quoting
      // a bug must not read as committing it.
      const live = wf.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
      ok(/#.*EXEMPT/.test(wf), 'CONTROL: the comment explaining the fail-open is still there (so the check below is not passing by deletion)')
      ok(!/EXEMPT\s*:/.test(live), 'the workflow no longer computes an EXEMPT flag in YAML — that expression is what failed open')
      ok(!/steps\.scope\.outputs\.required\s*==\s*'0'/.test(live), "no live YAML expression compares required == '0' (Actions coerces a SKIPPED step's null to 0, so it matched on workflow_run)")
      ok(/--resolve/.test(live), 'the workflow posts the status resolved by --resolve, so the tested logic is the shipped logic')
      // The one place `required` may still be read in YAML is the verdict
      // step's guard, and only in the fail-CLOSED direction: `null == '1'` is
      // false, so a skipped classify step withholds the verdict rather than
      // granting it.
      const looseReads = [...live.matchAll(/steps\.scope\.outputs\.required\s*==\s*'([^']*)'/g)].map((m) => m[1])
      ok(looseReads.every((v) => v === '1'), `every live YAML read of required compares against '1' (fail-closed); saw [${looseReads.join(', ')}]`)
      // The workflow keeps a fallback for when the base branch's copy of this
      // script is missing or older than --resolve — version skew is the normal
      // case, since the workflow comes from the PR head and the script from
      // base.sha. That fallback may only ever BLOCK, so no line of the workflow
      // may hand out a green on its own; `success` must come from here.
      ok(!/\bSTATE=(success|"success"|'success')/.test(live), 'no shell line in the workflow assigns STATE=success — a green may only come from resolvePostedStatus')
      ok(!/DESCRIPTION=.*[Dd]ocumentation-only/.test(live), 'the documentation-only description is not reproduced in the workflow — the exemption has exactly one source')
    }
  }

  // --- description clamping ----------------------------------------------
  ok(clampDescription('short').length === 5, 'a short description is untouched')
  ok(clampDescription('x'.repeat(400)).length === MAX_DESCRIPTION, `an over-long description is clamped to ${MAX_DESCRIPTION}`)
  for (const v of [verdictFromRuns([]), verdictFromRuns([run('failure')]), verdictFromRuns([running])])
    ok(clampDescription(v.description) === v.description, `the shipped description fits in ${MAX_DESCRIPTION} chars: "${v.description.slice(0, 40)}…"`)

  if (failed) { console.error(`\nstaging_matrix_gate selftest: ${failed} failure(s)`); process.exit(1) }
  console.log('\nstaging_matrix_gate selftest: all predicates OK')
}

function readFileArg(flag) {
  const i = process.argv.indexOf(flag)
  if (i < 0 || !process.argv[i + 1]) {
    console.error(`::error::${flag} requires a path`)
    process.exit(1)
  }
  return readFileSync(process.argv[i + 1], 'utf8')
}

// Hand a value to the later steps. Newlines are flattened because a raw one
// would end the `key=value` line early and the rest would be parsed as another
// output — a description containing a newline could otherwise forge `state=`.
// Written synchronously: a fire-and-forget append can lose the value if the
// process exits first, and a gate whose verdict silently fails to arrive is the
// exact failure mode this whole file is about.
function emit(key, value) {
  const line = `${key}=${String(value).replace(/\r?\n|\n/g, ' ')}`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`)
  console.log(line)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) {
    selftest()
  } else if (process.argv.includes('--classify')) {
    const files = readFileArg('--files').split('\n')
    let decision
    try {
      decision = matrixRequiredForFiles(files)
    } catch (err) {
      console.error(`::error::${err.message}`)
      process.exit(1)
    }
    console.log(decision.reason)
    emit('required', decision.required ? '1' : '0')
  } else if (process.argv.includes('--verdict')) {
    let payload
    try {
      payload = JSON.parse(readFileArg('--runs'))
    } catch {
      console.error('::error::The staging-integration run list did not parse as JSON. Failing closed — an unreadable answer is not a pass.')
      process.exit(1)
    }
    const headSha = process.env.HEAD_SHA ?? ''
    const verdict = verdictFromRuns(payload?.workflow_runs, { headSha })
    for (const r of payload?.workflow_runs ?? []) console.log(`  ${r.status}/${r.conclusion ?? '-'}  ${r.html_url}`)
    console.log(`verdict: ${verdict.state} — ${verdict.description}`)
    emit('state', verdict.state)
    emit('description', clampDescription(verdict.description))
    emit('target_url', verdict.targetUrl ?? '')
  } else if (process.argv.includes('--resolve')) {
    // Reads the step outputs the workflow collected and prints the status to
    // POST as JSON on stdout. JSON rather than shell assignments because the
    // description is arbitrary text and `eval` of it would be an injection.
    // Diagnostics go to stderr so stdout stays parseable.
    const resolved = resolvePostedStatus({
      eventName: process.env.EVENT,
      required: process.env.REQUIRED,
      state: process.env.VERDICT_STATE,
      description: process.env.VERDICT_DESCRIPTION,
      targetUrl: process.env.VERDICT_TARGET_URL,
      runUrl: process.env.RUN_URL,
    })
    console.error(
      `resolve: event=${process.env.EVENT ?? '-'} required=${process.env.REQUIRED || '(unset — classify did not run)'} ` +
      `verdict=${process.env.VERDICT_STATE || '(none)'} → ${resolved.state}${resolved.exempt ? ' (documentation-only exemption)' : ''}`,
    )
    console.log(JSON.stringify(resolved))
  } else {
    console.error('usage: staging_matrix_gate.mjs [--selftest | --classify --files <path> | --verdict --runs <path> | --resolve]')
    process.exit(1)
  }
}
