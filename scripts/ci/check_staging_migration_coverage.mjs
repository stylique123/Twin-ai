// THE STAGING MATRIX'S MIGRATION LIST DRIFTS, AND THE SYMPTOM NEVER LOOKS LIKE
// THE CAUSE.
//
// `staging-integration.yml` applies a HAND-MAINTAINED list of migrations before
// running the editor end to end. Its own comments record the list falling
// behind three times, and each time the failure was unrecognisable:
//
//   0100  the analyze stage began writing an `alignment` component; without the
//         migration `editor_record_analysis` rejected it, and run 215 timed out
//         four times with the project stuck in `analyzing`.
//   0104  the glossary reader landed the day after the last green matrix; run
//         220 died with "Could not find the table 'public.brand_glossary_terms'"
//         on every attempt and Phase 3 timed out with the project `queued`.
//   0110/
//   0111  found by this author before they could bite — staging could not
//         exercise reference provenance or the approval binding at all, so the
//         gate protecting those changes was blind to them. A green tick that
//         implies coverage it does not have is worse than an absent gate.
//
// Every one of those presented as a HARNESS TIMEOUT. Nothing in the diff
// mentioned a migration. The list is exactly the kind of thing a person cannot
// be relied on to update, because the cost of forgetting arrives later, wearing
// someone else's face.
//
// ── WHAT THIS ENFORCES, AND WHAT IT DELIBERATELY DOES NOT ─────────────────
//
// NOT "apply every migration". Staging is a purpose-built editor test bed with
// no brand tables, and many migrations legitimately cannot run there. Demanding
// them all would be a rule the repo has to break on day one, and a rule that
// gets broken is a rule that gets deleted.
//
// Instead: every migration NEWER than the newest one in the list must be either
// APPLIED or EXPLICITLY EXCLUDED WITH A REASON. That converts "nobody noticed"
// into "someone wrote down why", which is the only difference between an
// omission and a decision — the same shape as `SERVER_ONLY` in the row-drift
// guard.
//
// An exclusion naming a migration that does not exist ALSO fails, so the list
// cannot rot into a set of names that excuse nothing.
//
//   node scripts/ci/check_staging_migration_coverage.mjs            # live
//   node scripts/ci/check_staging_migration_coverage.mjs --selftest # fixtures
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const WORKFLOW = join(REPO, '.github', 'workflows', 'staging-integration.yml')
const MIGRATIONS = join(REPO, 'supabase', 'migrations')

/**
 * Migrations the matrix deliberately does NOT apply, each with the reason.
 *
 * A migration belongs here when staging genuinely cannot host it or the editor
 * genuinely never reads it. "We did not get to it" is not a reason — that is
 * the case this guard exists to surface.
 */
export const EXCLUDED = {
  '0105_outcome_log':
    'Self-reported post outcomes. The editor never reads them, and staging has no posts.',
  '0106_clips_and_reference_requirements':
    'Requires `gallery_items`, which staging does not have. The clip columns it adds '
    + 'are covered by 0107/0108 being unnecessary here — staging never captures a clip.',
  '0107_clip_capture':
    'Clip capture RPCs. Staging exercises the source path only; no clip is ever captured.',
  '0108_clip_scene_number':
    'Same as 0107 — no clip exists on staging to carry a scene number.',
  '0112_post_output_binding_coherent':
    'A trigger ON `public.posts`, which staging does not have (verified: '
    + "`to_regclass('public.posts')` is null there). Staging is an editor test bed "
    + 'and never publishes, so it cannot exercise the rule and cannot even host it — '
    + 'the migration would fail outright rather than pass vacuously.',
  '0115_owner_may_set_own_approval':
    'Replaces `set_generation_approval` and re-grants it. Staging DOES host that '
    + 'function (0111 is in the matrix list), so this is a candidate for applying — '
    + 'but the matrix never exercises the OWNER toggle, only the review path, so '
    + 'applying it there would prove nothing the review path does not already prove. '
    + 'Applied to production and exercised there instead: approve, un-approve, '
    + 're-approve, and an unknown id refused.',
  '0116_trigger_functions_are_not_rpcs':
    'Two REVOKEs. One targets `posts_binding_coherent`, whose trigger is on '
    + '`public.posts` — a table staging does not have, so the function is not there '
    + 'either. The other targets `enqueue_media_purge`, which staging DOES have; '
    + 'applying half a migration is worse than applying none, and the half that '
    + 'matters is the one attached to publishing. Applied to production and verified '
    + 'by exercising BOTH triggers after the revoke.',
  '0113_post_attribution':
    'Creates a table referencing `public.posts` and adds columns to '
    + '`post_outcome_observations` and `dna_claims` — none of which staging has. '
    + 'Same reason as 0112: staging is an editor test bed that never publishes, so '
    + 'the migration would fail outright rather than pass vacuously.',
  '0109_pre_script_brief':
    'Adds a column to `brand_voices`, which on staging is a fixture rather than the '
    + 'real table. The editor reads the brief through the blueprint, not directly.',
}

// `excluded` is a PARAMETER rather than a direct read of the constant so the
// selftest can drive the logic with fixture names. The first version closed over
// EXCLUDED and validated it against whatever migration list it was handed, so
// every fixture case reported all five real exclusions as "no longer exists" —
// three failures that said nothing about the rule being tested.
export function parse(workflowText, migrationNames, excluded = EXCLUDED) {
  // The applied list is the `for f in … ; do` line in the migration step.
  // The final name is followed directly by `;`, not by whitespace — the first
  // version of this pattern required a space after EVERY name and therefore
  // matched nothing at all, which the selftest caught immediately.
  const m = /for\s+f\s+in\s+([0-9A-Za-z_][0-9A-Za-z_\s]*?)\s*;\s*do/.exec(workflowText)
  const applied = m ? m[1].trim().split(/\s+/) : []
  const problems = []

  if (applied.length === 0) {
    problems.push('could not find the `for f in … ; do` migration list in the workflow')
    return { applied, problems }
  }

  const known = new Set(migrationNames)
  for (const a of applied) {
    if (!known.has(a)) problems.push(`the workflow applies '${a}', which is not a migration file`)
  }
  for (const e of Object.keys(excluded)) {
    if (!known.has(e)) {
      problems.push(
        `EXCLUDED names '${e}', which no longer exists — remove it, or the list stops meaning anything`)
    }
  }

  // Only migrations NEWER than the newest applied one are in scope. Everything
  // older predates the rule and is settled; re-litigating it would produce a
  // wall of findings nobody acts on.
  const newestApplied = applied.slice().sort().pop()
  for (const name of migrationNames) {
    if (name <= newestApplied) continue
    if (applied.includes(name)) continue
    if (name in excluded) continue
    problems.push(
      `${name} is newer than the matrix's newest applied migration (${newestApplied}) and is `
      + `neither applied nor excluded. Apply it, or add it to EXCLUDED with the reason — `
      + `staging cannot exercise what it has not got, and the gate goes green anyway.`)
  }
  return { applied, problems }
}

function migrationNames() {
  return readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, ''))
}

function selftest() {
  const names = ['0100_a', '0104_b', '0110_c', '0111_d']
  const wf = (list) => `          for f in ${list}; do\n            echo hi\n          done`
  const cases = [
    ['everything applied passes', wf('0100_a 0104_b 0110_c 0111_d'), names, {}, 0],
    ['a newer unapplied migration FAILS', wf('0100_a 0104_b'), names, {}, 2],
    ['an unknown name in the workflow FAILS', wf('0100_a 0999_ghost'), names, {}, 1],
    ['a missing list FAILS loudly', 'no list here', names, {}, 1],
    // The escape hatch works …
    ['a newer migration that is EXCLUDED passes', wf('0100_a 0104_b'), names,
      { '0110_c': 'staging has no such table', '0111_d': 'the editor never reads it' }, 0],
    // … and cannot rot into names that excuse nothing.
    ['an EXCLUDED name that no longer exists FAILS', wf('0100_a 0104_b 0110_c 0111_d'), names,
      { '0999_deleted': 'a reason for a file that is gone' }, 1],
    // Only ONE of two is excused — the other must still be reported, so the
    // hatch cannot be read as "any exclusion silences the whole check".
    ['one excluded, one not, still FAILS once', wf('0100_a 0104_b'), names,
      { '0110_c': 'staging has no such table' }, 1],
  ]
  let failed = 0
  for (const [name, wfText, mig, exc, expected] of cases) {
    const { problems } = parse(wfText, mig, exc)
    if (problems.length !== expected) {
      console.error(`SELFTEST FAIL: ${name} => ${problems.length} problems, expected ${expected}`)
      for (const p of problems) console.error(`    ${p}`)
      failed++
    } else console.log(`  ok: ${name}`)
  }
  // The exclusion mechanism, against the REAL files, so a stale name is caught.
  const real = migrationNames()
  for (const e of Object.keys(EXCLUDED)) {
    if (!real.includes(e)) { console.error(`SELFTEST FAIL: EXCLUDED names missing migration ${e}`); failed++ }
  }
  if (failed) { console.error(`staging-migration-coverage selftest: ${failed} failed`); process.exit(1) }
  console.log('staging-migration-coverage selftest: all cases passed'); process.exit(0)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--selftest')) selftest()
  else {
    const { applied, problems } = parse(readFileSync(WORKFLOW, 'utf8'), migrationNames())
    console.log(`  matrix applies ${applied.length} migrations, newest ${applied.slice().sort().pop()}`)
    console.log(`  ${Object.keys(EXCLUDED).length} excluded with a stated reason`)
    if (problems.length) { for (const p of problems) console.error(`::error::${p}`); process.exit(1) }
    console.log('staging-migration-coverage guard: OK')
  }
}
