// A WORKFLOW THAT STOPS PARSING STOPS GATING, AND SAYS NOTHING.
//
// ⚠️ THIS HAPPENED, ON 2026-09-12, TO THIS REPOSITORY. A step name written as
//   `- name: Gate-N (gallery curation trigger: the failed state + cooldown controls)`
// is not valid YAML: in an unquoted scalar `: ` opens a mapping. `pr-checks.yml`
// stopped parsing AS A WHOLE, and GitHub does not run — or report on — a
// workflow it cannot read. PR #825 sat for 53 minutes showing THREE check runs
// instead of eleven with nothing marked red, because the other jobs never
// existed. The board looked quiet rather than broken, which is the worst way for
// a gate to fail. Had it merged, PR checks would have been down for every
// subsequent PR.
//
// ⚖️ NOTHING CAUGHT IT, AND THAT IS THE GAP THIS CLOSES. It was found by hand,
// by noticing the board was short and validating the file. No check in
// `scripts/ci` had ever parsed a workflow file.
//
// ⚠️ AND A GUARD FOR THIS MUST NOT DEGRADE SILENTLY ITSELF. `js-yaml` is a
// DECLARED devDependency rather than a transitive one that happens to resolve:
// a guard whose parser can vanish on an unrelated lockfile update is the same
// defect one level up. This runs in `web-and-shared`, which runs `npm ci`;
// `no-legacy-editor` runs checkout only and could not load it.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORKFLOW_DIR = join(ROOT, '.github', 'workflows')
const STAGING = join(WORKFLOW_DIR, 'staging-integration.yml')

/** Every workflow file must parse, and must still declare at least one job.
 *  A file that parses to `null` or carries no jobs is as inert as one that
 *  throws, and would fail in exactly the same silent way. */
export function parseProblems(files) {
  const problems = []
  for (const { name, text } of files) {
    let doc
    try {
      doc = yaml.load(text)
    } catch (e) {
      problems.push(`${name} is not valid YAML, so GitHub will never run it: ${String(e.message || e).split('\n')[0]}`)
      continue
    }
    if (doc === null || typeof doc !== 'object') {
      problems.push(`${name} parses to ${doc === null ? 'null' : typeof doc}, which declares nothing`)
      continue
    }
    const jobs = doc.jobs
    if (!jobs || typeof jobs !== 'object' || Object.keys(jobs).length === 0) {
      problems.push(`${name} declares no jobs, so it gates nothing`)
    }
  }
  return problems
}

/**
 * ⚠️ A FLAG THE PINNED NODE DOES NOT HAVE KILLS THE RUN BEFORE LINE ONE.
 *
 * MEASURED 2026-09-16, AND IT HAD NEVER WORKED ONCE. `heartbeat.yml` pinned
 * `node-version: 20` and every one of its steps ran
 * `node --experimental-strip-types`, a flag that did not exist until Node 22.6.
 * Node rejects an unknown option and exits before executing a line, so the
 * unconditional `Policy selftest` step killed the job every hour. The evidence
 * is that `heartbeat_page_state` held ZERO rows EVER, `auth.users.last_sign_in_at`
 * for the heartbeat account was still its creation timestamp from 2026-09-08,
 * and a manual `workflow_dispatch` produced no sign-in, no `ops_events` row and
 * no generation.
 *
 * ⚖️ AND IT LOOKED LIKE A CREDENTIAL PROBLEM, WHICH IS WHY THIS IS A GUARD AND
 * NOT JUST A ONE-LINE FIX. Seven of the workflow's secrets were genuinely
 * missing at the same time, so every symptom pointed at configuration. The
 * script signs in at module top level BEFORE any service-key read, so "no
 * sign-in" could never have been the service key — but nothing said so out
 * loud, and the wrong cause was reported twice before the order of operations
 * was read.
 *
 * ⚠️ AN IMPLICIT RUNNER DEFAULT IS NOT A PIN. A job with no `setup-node` gets
 * whatever the image ships today, which is exactly the thing that changes
 * without a diff. Measured: both call sites of this flag pin explicitly today,
 * so requiring it costs nothing and closes the silent case.
 */
const STRIP_TYPES_MIN_MAJOR = 22

/** The major version a `setup-node` step pins, or null when it cannot be read.
 *  `lts/*` and friends are UNREADABLE, not acceptable: a guard that treats an
 *  unparseable pin as a pass is the vacuous kind this file exists to avoid. */
function pinnedMajor(step) {
  const raw = step?.with?.['node-version']
  if (raw === undefined || raw === null) return null
  const m = String(raw).trim().match(/^(\d+)/)
  return m ? Number(m[1]) : null
}

const isSetupNode = (step) => typeof step?.uses === 'string' && step.uses.startsWith('actions/setup-node')

/**
 * Every step invoking `--experimental-strip-types` must run on a Node that has
 * it, established by walking the steps in order so the version in force is the
 * one the most recent `setup-node` actually set.
 */
export function stripTypesNodeProblems(files) {
  const problems = []
  let checked = 0
  for (const { name, text } of files) {
    let doc
    try { doc = yaml.load(text) } catch { continue }
    const jobs = doc && typeof doc === 'object' ? doc.jobs : null
    if (!jobs || typeof jobs !== 'object') continue
    for (const [jobName, job] of Object.entries(jobs)) {
      const steps = Array.isArray(job?.steps) ? job.steps : []
      let inForce = null
      for (const step of steps) {
        if (isSetupNode(step)) inForce = pinnedMajor(step)
        const run = typeof step?.run === 'string' ? step.run : ''
        if (!run.includes('--experimental-strip-types')) continue
        checked += 1
        const where = `${name} job ${jobName} step ${JSON.stringify(step.name ?? run.split('\n')[0].slice(0, 40))}`
        if (inForce === null) {
          problems.push(`${where} runs --experimental-strip-types with no readable setup-node pin; `
            + `Node rejects an unknown option and exits before running a line, so this job would die silently`)
        } else if (inForce < STRIP_TYPES_MIN_MAJOR) {
          problems.push(`${where} runs --experimental-strip-types on Node ${inForce}; `
            + `the flag landed in Node ${STRIP_TYPES_MIN_MAJOR}.6, so node exits before line one and the job never runs`)
        }
      }
    }
  }
  return { problems, checked }
}

/**
 * ⚠️ A MIGRATION MAY NOT BE APPLIED AND EXCLUDED AT ONCE.
 *
 * The APPLIED list in `staging-integration.yml` is one very long line, and it
 * has taken a merge conflict THREE times (#781, #783, #785). Each time the
 * resolution was the UNION, and each time taking either side alone would have
 * silently dropped a migration from the list — silently, because the matrix
 * then simply never exercises it and nothing else notices.
 *
 * ⚖️ BUT A UNION BUILT BY REFLEX RESURRECTS AN EXCLUSION. `0194` is the case
 * that proves it: it was DECLARED excluded, with a measured reason (it was put
 * in the APPLIED list first and the matrix failed in four minutes with
 * `relation "public.gallery_items" does not exist`). A union that sweeps it back
 * in re-learns that at the cost of a lane hour.
 *
 * ⚠️ AND THE EXISTING COVERAGE GUARD DOES NOT CATCH THIS. Verified by mutation
 * on 2026-09-12: adding 0194 back to the APPLIED list left
 * `check_staging_migration_coverage.mjs` reporting OK with an applied count one
 * higher. It asks whether every migration is applied OR excluded; it never asks
 * whether one is BOTH.
 */
export function appliedExcludedOverlap(appliedNames, excludedNames) {
  const excluded = new Set(excludedNames)
  return appliedNames.filter((n) => excluded.has(n))
    .map((n) => `${n} is in the APPLIED list AND declared EXCLUDED — a merge that took the union resurrected it`)
}

/** The APPLIED list is the `for f in ... ; do` loop. Read the names out of it. */
export function appliedFrom(text) {
  const m = text.match(/for f in ((?:0\d{3}_[A-Za-z0-9_]+\s*)+);/)
  return m ? m[1].trim().split(/\s+/) : []
}

async function main() {
  const files = readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ name: `.github/workflows/${f}`, text: readFileSync(join(WORKFLOW_DIR, f), 'utf8') }))
  if (files.length === 0) {
    console.error('::error::no workflow files found — this guard would pass vacuously')
    process.exit(1)
  }

  const problems = parseProblems(files)

  const { EXCLUDED } = await import('./check_staging_migration_coverage.mjs')
  const applied = appliedFrom(readFileSync(STAGING, 'utf8'))
  if (applied.length === 0) {
    problems.push('could not read the APPLIED migration list out of staging-integration.yml')
  }
  problems.push(...appliedExcludedOverlap(applied, Object.keys(EXCLUDED)))

  // ⚠️ REFUSES A VACUOUS PASS. If nothing in the repo uses the flag any more,
  // this check is silently inert and must say so rather than report OK.
  const strip = stripTypesNodeProblems(files)
  if (strip.checked === 0) {
    problems.push('no step uses --experimental-strip-types, so the node-pin check verified nothing — '
      + 'delete it or fix the detection rather than leaving a guard that cannot fail')
  }
  problems.push(...strip.problems)

  if (problems.length) {
    for (const p of problems) console.error(`::error::${p}`)
    process.exit(1)
  }
  console.log(`workflows-parse guard: OK (${files.length} workflows parse, ${applied.length} applied migrations, none also excluded, `
    + `${strip.checked} strip-types steps on a Node that has the flag)`)
}

async function selftest() {
  let failed = 0
  const ok = (name, cond) => { if (cond) console.log(`  ok: ${name}`); else { console.error(`  SELFTEST FAIL: ${name}`); failed++ } }

  // THE EXACT LINE THAT BROKE #825, as a fixture.
  const broken = 'name: x\njobs:\n  a:\n    steps:\n      - name: Gate-N (thing: the failed state)\n'
  ok('the colon-in-an-unquoted-step-name is caught',
    parseProblems([{ name: 'broken.yml', text: broken }]).length === 1)
  ok('quoting the same name makes it parse',
    parseProblems([{ name: 'fixed.yml', text: 'name: x\njobs:\n  a:\n    steps:\n      - name: "Gate-N (thing: the failed state)"\n' }]).length === 0)
  // ⚠️ A FILE THAT PARSES BUT DECLARES NOTHING FAILS THE SAME WAY IN PRACTICE.
  ok('an empty file is caught', parseProblems([{ name: 'empty.yml', text: '' }]).length === 1)
  ok('a jobless workflow is caught', parseProblems([{ name: 'nojobs.yml', text: 'name: x\non: push\n' }]).length === 1)

  ok('0194 in both lists is caught',
    appliedExcludedOverlap(['0176_x', '0194_the_backfill_wrote_a_column_that_did_not_exist'],
      ['0194_the_backfill_wrote_a_column_that_did_not_exist']).length === 1)
  ok('a clean applied list is not flagged',
    appliedExcludedOverlap(['0176_x', '0200_y'], ['0194_z']).length === 0)

  // Against the REAL files, so the fixtures cannot drift away from production.
  const real = readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => ({ name: f, text: readFileSync(join(WORKFLOW_DIR, f), 'utf8') }))
  ok('every real workflow parses today', parseProblems(real).length === 0)
  const applied = appliedFrom(readFileSync(STAGING, 'utf8'))
  ok('the real APPLIED list is readable and non-trivial', applied.length > 50)
  const { EXCLUDED } = await import('./check_staging_migration_coverage.mjs')
  ok('0194 is really declared excluded, so the assertion has a subject',
    Object.keys(EXCLUDED).includes('0194_the_backfill_wrote_a_column_that_did_not_exist'))

  // ⚠️ THE FIXTURE IS THE SHIPPED BUG. heartbeat.yml pinned Node 20 and ran the
  // flag, so the job died before line one -- for every scheduled run since it
  // was written, with `heartbeat_page_state` empty the whole time.
  const wf = (nodeLine, run) =>
    `name: x\non: push\njobs:\n  beat:\n    steps:\n      - uses: actions/checkout@v4\n${nodeLine}      - name: go\n        run: ${run}\n`
  const PIN20 = '      - uses: actions/setup-node@v4\n        with: { node-version: 20 }\n'
  const PIN22 = '      - uses: actions/setup-node@v4\n        with: { node-version: 22 }\n'
  const FLAG = 'node --experimental-strip-types scripts/ops/heartbeat.mjs'
  ok('a strip-types step on Node 20 is caught',
    stripTypesNodeProblems([{ name: 'a.yml', text: wf(PIN20, FLAG) }]).problems.length === 1)
  ok('the same step on Node 22 is not flagged',
    stripTypesNodeProblems([{ name: 'a.yml', text: wf(PIN22, FLAG) }]).problems.length === 0)
  // An implicit runner default is not a pin: it is the thing that changes with
  // no diff, which is how a job stops running with nothing red.
  ok('no setup-node at all is caught',
    stripTypesNodeProblems([{ name: 'a.yml', text: wf('', FLAG) }]).problems.length === 1)
  ok('an unreadable pin is caught rather than passed',
    stripTypesNodeProblems([{ name: 'a.yml',
      text: wf('      - uses: actions/setup-node@v4\n        with: { node-version: "lts/*" }\n', FLAG) }]).problems.length === 1)
  // A step that does not use the flag must not be counted or flagged.
  ok('a plain node step is neither counted nor flagged', (() => {
    const r = stripTypesNodeProblems([{ name: 'a.yml', text: wf(PIN20, 'node scripts/x.mjs') }])
    return r.problems.length === 0 && r.checked === 0
  })())
  // And the real files, so the fixtures cannot drift from production.
  const realStrip = stripTypesNodeProblems(real)
  ok('every real strip-types step runs on a Node that has the flag', realStrip.problems.length === 0)
  ok('the real check is not vacuous', realStrip.checked > 0)

  if (failed) { console.error(`workflows-parse selftest: ${failed} failed`); process.exit(1) }
  console.log('workflows-parse selftest: all cases passed')
}

if (process.argv.includes('--selftest')) await selftest()
else await main()
