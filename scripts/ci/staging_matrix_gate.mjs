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
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// GitHub truncates a commit-status description past 140 characters. Truncating
// here rather than letting the API do it keeps the visible text ours.
export const MAX_DESCRIPTION = 140

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
  const runtime = list.filter((f) => !isExemptPath(f))
  return runtime.length === 0
    ? { required: false, reason: `Documentation-only PR (${list.length} files) — the editor matrix cannot prove anything about it.` }
    : { required: true, reason: `${runtime.length} of ${list.length} changed files can alter runtime behaviour (e.g. ${runtime[0]}). A successful staging matrix on this exact head is REQUIRED.` }
}

export function clampDescription(text) {
  const s = String(text ?? '')
  return s.length <= MAX_DESCRIPTION ? s : `${s.slice(0, MAX_DESCRIPTION - 1)}…`
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
  } else {
    console.error('usage: staging_matrix_gate.mjs [--selftest | --classify --files <path> | --verdict --runs <path>]')
    process.exit(1)
  }
}
