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

  if (problems.length) {
    for (const p of problems) console.error(`::error::${p}`)
    process.exit(1)
  }
  console.log(`workflows-parse guard: OK (${files.length} workflows parse, ${applied.length} applied migrations, none also excluded)`)
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

  if (failed) { console.error(`workflows-parse selftest: ${failed} failed`); process.exit(1) }
  console.log('workflows-parse selftest: all cases passed')
}

if (process.argv.includes('--selftest')) await selftest()
else await main()
