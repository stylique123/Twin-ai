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
// ── ⚠️ AN EXCLUSION IS A DEBT, NOT A DISMISSAL ────────────────────────────
//
// EXCLUDING A MIGRATION HERE MEANS NOTHING WILL EVER APPLY IT ANYWHERE. That is
// the whole cost and it went uncollected: on 2026-08-11, `0120_product_entities`
// and `0121_creator_knowledge` were found committed and NOT PRESENT IN
// PRODUCTION — the live ledger ended at 0119. Both were excluded below for a
// correct reason (their FK target is a staging fixture applied after the
// migration loop). Because they never ran on staging, nobody noticed they had
// never run in production either, and the branch that reads `product_entities`
// was one merge away from returning 503 on EVERY blueprint generation.
//
// So when you exclude a migration, you are taking on a manual apply. Say so in
// the reason, and do not ship code that reads the new tables until it is done.
// This guard cannot check production — it has no credentials and should not
// have any — which is exactly why the obligation has to be written down here.
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
  '0148_would_you_actually_post_this':
    'The creator\'s own "would you post this?" answer. The staging matrix exercises the '
    + 'editor pipeline and never asks a human anything, so it cannot exercise this table. '
    + '⚠️ THIS IS A DEBT: it must be applied to production by hand BEFORE any UI writes '
    + 'to `publish_intents`. Nothing reads or writes it yet — the funnel in '
    + 'packages/shared/src/recordingFunnel.ts treats a missing answer as `pending`, which '
    + 'is the same thing it says about a creator who has not been asked.',
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
  '0117_no_trigger_function_is_an_rpc':
    'Eleven REVOKEs, and staging has only TWO of the eleven functions (verified by '
    + 'querying its catalog: `editor_capture_no_mutate` and `editor_capture_ready_guard` '
    + 'exist; the other nine do not). A REVOKE on a function that does not exist is an '
    + 'error, so the migration would fail on its first statement rather than pass '
    + 'vacuously — staging is an editor test bed and has no credits, profiles, ops or '
    + 'subscriptions tables to hang the rest on. Applied to production and verified by '
    + 'exercising BOTH classes after the revoke: `reject_new_autoedit_job` still refuses '
    + 'an autoedit insert, and the SECURITY DEFINER `notify_admins_on_ops_alert` still '
    + 'wrote one notification per admin.',
  '0109_pre_script_brief':
    'Adds a column to `brand_voices`, which on staging is a fixture rather than the '
    + 'real table. The editor reads the brief through the blueprint, not directly.',
  '0120_product_entities':
    'Creates a table with a foreign key to `public.brand_voices`, which on staging is '
    + 'a FIXTURE APPLIED AFTER the migration loop — so the FK target does not exist at '
    + 'apply time and the migration fails on its first statement rather than passing '
    + 'vacuously. Verified by reading the workflow order: the `for f in …` loop runs, '
    + 'then `staging-brand-schema.sql`. Weakening the production FK to suit that '
    + 'ordering would be the tail wagging the dog. The editor never reads '
    + '`product_entities` either — entities reach it through the blueprint prompt, the '
    + 'same route the brief takes in 0109 above. ⚠️ MANUAL APPLY: excluding it here means nothing applies it anywhere, so it was applied to production BY HAND on 2026-08-11 (verified: the table exists with RLS on). Any future migration excluded here carries the same debt.',
  '0169_a_failed_read_leaves_a_trace':
    'Adds `knowledge_failed_at` and `knowledge_error` to `product_entities`, which is '
    + 'itself excluded above for the staging FK-ordering reason -- staging has no such '
    + 'table, so this would fail on its first statement rather than pass vacuously. THE '
    + 'EXCLUSION IS INHERITED, not a new judgement: the coverage guard names this case '
    + 'itself and refuses to let the migration in while its creator is out. The editor '
    + 'never reads `product_entities`; entities reach the blueprint through the prompt. '
    + '⚠️ MANUAL APPLY, NOT YET DONE, AND IT BLOCKS THE MERGE. Excluding it means nothing '
    + 'applies it anywhere. VERIFIED against production on 2026-08-24: product_entities '
    + 'has knowledge, knowledge_extracted_at and knowledge_source_url and NEITHER new '
    + 'column. So the worker update names columns that do not exist -- and the success '
    + 'path treats an update error as FATAL (`if (error) throw`), which would mean every '
    + 'successful extraction stores nothing. An earlier draft of this note said the write '
    + 'would silently no-op; that was an assumption and it was wrong. The code must not '
    + 'merge before the migration is applied, the same way #316 waited on 0120 and 0121.',
  '0138_generation_choices_product_fk':
    'Adds the `generation_choices.selected_product_id` FK to `product_entities`, '
    + 'which is itself excluded above for the staging FK-ordering reason. It is a '
    + 'SEPARATE FILE precisely so the exclusion stops at the constraint instead of '
    + 'swallowing the table: 0137 declared the reference inline, failed on staging, '
    + 'and took `generation_choices` down with it — leaving the insert path with no '
    + 'automated exercise anywhere, which is the uncollected cost this guard exists '
    + 'to name. Split out, staging applies 0137 and really inserts rows; only the '
    + 'constraint is skipped. \u26a0\ufe0f MANUAL APPLY: the constraint is already present in '
    + 'production, because the table was applied there by hand on 2026-08-17 with the '
    + 'reference inline (verified: table exists, RLS on, `authenticated` holds SELECT '
    + 'only after the default write grants were revoked). The file guards on '
    + '`pg_constraint`, so it is a no-op against that state rather than an error.',
  '0124_product_entity_archive':
    'Adds `archived_at` to `product_entities`, which is itself excluded above for the '
    + 'staging FK-ordering reason — a column cannot be applied to a table staging does '
    + 'not have, so this inherits that exclusion rather than introducing a new one. '
    + '⚠️ MANUAL APPLY: applied to production BY HAND on 2026-08-12 (verified: '
    + '`information_schema.columns` reports archived_at, timestamptz, nullable). The '
    + 'READERS shipped in the same change — `loadProductEntities` hides archived rows '
    + 'by default and both `generate-blueprint` product reads filter them — so an '
    + 'unapplied column would surface as a PostgREST error on the filter rather than '
    + 'as an archived entity silently keeping its permissions, which is the failure '
    + 'that mattered.',
  '0125_commercial_entity_types':
    'Replaces the `type` CHECK on `product_entities`, which is itself excluded '
    + 'above for the staging FK-ordering reason — a constraint cannot be altered on '
    + 'a table staging does not have. ⚠️ MANUAL APPLY: applied to production BY HAND '
    + 'on 2026-08-12. Verified SAFE FIRST rather than after: the table held 0 rows '
    + 'and 0 rows of the renamed values, so the rename could not orphan anything. '
    + 'That check is the whole reason to do this now — after a creator registers a '
    + 'product it becomes a backfill with a window where the CHECK and the code '
    + 'disagree. The migration deliberately carries NO backfill statement, so if it '
    + 'ever runs against a database holding old values it fails loudly on the '
    + 'constraint rather than silently no-opping.',
  '0126_product_entity_knowledge':
    'Adds `knowledge`, `knowledge_extracted_at` and `knowledge_source_url` to '
    + '`product_entities`, which is itself excluded above for the staging '
    + 'FK-ordering reason. ⚠️ MANUAL APPLY: applied to production BY HAND on '
    + '2026-08-12. The WRITER ships in the same change (`extract_product`, a worker '
    + 'job) and the grade it stores is what decides whether an extracted claim may '
    + 'be spoken — so an unapplied column would surface as a PostgREST error on the '
    + 'update, loudly, rather than as ungraded marketing copy reaching a script.',
  '0121_creator_knowledge':
    'Creates `creator_knowledge` and `audience_questions`, both with foreign keys to '
    + '`public.brand_voices` — the same staging FIXTURE-APPLIED-AFTER-THE-LOOP ordering '
    + 'that excludes 0120 above, and the same verification: the `for f in …` loop runs, '
    + 'then `staging-brand-schema.sql`, so the FK target does not exist at apply time. '
    + 'The editor never reads either table; knowledge reaches the writer through the '
    + 'blueprint prompt, the route 0109 and 0120 already take. ⚠️ The RLS policies and '
    + 'the deliberate ABSENCE of an INSERT policy are therefore unexercised on staging, '
    + 'which is the real cost of this exclusion and is worth saying out loud: nothing '
    + 'proves before production that a creator cannot insert claims about themselves. ⚠️ MANUAL APPLY: applied to production BY HAND on 2026-08-11, together with 0120 and in one transaction (verified: both tables exist with RLS on). The RLS policies still have no automated exercise anywhere — that cost stands.',
  '0123_merge_creator_knowledge':
    'Creates a function over `creator_knowledge`, the table 0121 above excludes — staging '
    + 'does not have it, so CREATE FUNCTION would succeed and then reference a missing '
    + 'table at first call, which is worse than failing outright. ⚠️ MANUAL APPLY '
    + 'OUTSTANDING: until it is applied, insertKnowledge logs '
    + '`creator_knowledge_merge_absent` and falls back to the plain insert that loses a '
    + 'batch on the first duplicate — the defect this migration exists to fix.',
  '0135_transcript_subject':
    'Adds `subject` to `public.transcripts`, which 0004 creates — a migration far '
    + 'below this list\'s floor and never applied to staging, which starts at 0090 and '
    + 'is an editor test bed that never scans a handle or ingests a reference. '
    + '⚠️ THE INHERITED-EXCLUSION CHECK CANNOT DECIDE THIS ONE, and that is by design: '
    + 'staging was bootstrapped with its own stubs (its `generations` is an 11-column '
    + 'table though 0001 was never applied), so "the creating migration is not in the '
    + 'list" does not imply the table is missing. Only a human can say which it is, '
    + 'which is what this reason is. ⚠️ MANUAL APPLY: applied to production BY HAND on '
    + '2026-08-15 — verified `subject` text nullable, the CHECK present, and the '
    + 'reference backfill matched 50 of 58 rows. The READER ships in the same change '
    + '(`generate-blueprint` filters `subject = \'own\'` before compiling a voice), so '
    + 'an unapplied column would surface as a PostgREST error on the filter — loudly, '
    + 'rather than as a stranger\'s cadence being compiled into a creator\'s voice, '
    + 'which is the failure that matters.',
  '0133_knowledge_surface_forms':
    'Adds `surface_forms` to `creator_knowledge` — the table 0121 above excludes for the '
    + 'staging fixture-ordering reason, so the ALTER fails on its first statement rather '
    + 'than passing vacuously. ⚠️ AND IT DID: this migration was added to the applied '
    + 'list first and the matrix died with `relation "public.creator_knowledge" does not '
    + 'exist`, which is the one failure mode this guard exists to make impossible to '
    + 'reach by accident — the guard only demands a decision, it cannot check that the '
    + 'decision is applicable. The editor never reads the column; surface forms are read '
    + "by the next scan's matcher in the worker, which staging does not run. "
    + '⚠️ MANUAL APPLY: applied to production BY HAND on 2026-08-15 (verified: '
    + '`surface_forms` jsonb NOT NULL default \'[]\', 552 rows, 0 carrying forms — correct, '
    + 'since nothing has re-scanned yet).',
  '0122_creator_knowledge_source':
    'Adds a nullable `source` column plus a CHECK constraint and an index to '
    + '`creator_knowledge` — a table 0121 above excludes, so staging does not have it '
    + 'and the ALTER would fail on its first statement rather than pass vacuously. It '
    + 'cannot be applied without first un-excluding 0121, which the fixture ordering '
    + 'forbids. The editor never reads the column; provenance reaches the writer '
    + 'through the blueprint prompt, the same route 0109/0120/0121 take. ⚠️ MANUAL '
    + 'APPLY OUTSTANDING: nothing applies this anywhere, and the worker writes '
    + '`source` on every knowledge insert. `insertKnowledge` retries without the '
    + 'column on PGRST204 and logs `creator_knowledge_source_column_absent`, so the '
    + 'pipeline degrades rather than breaks — but until the owner applies 0122 to '
    + 'production, every row is written with no provenance and that log line is the '
    + 'only thing saying so.',
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

// ── ⚠️ AN EXCLUSION IS INHERITED, AND NOTHING WAS CHECKING THAT ───────────
//
// The rule above demands a DECISION, and a decision can be wrong: `0133` was
// decided into the applied list, and the matrix died with
//   ERROR: relation "public.creator_knowledge" does not exist
// because 0133 alters a table 0121 creates and 0121 is excluded. The guard was
// satisfied — the migration was classified — and staging still could not host it.
//
// ⚖️ THIS PART IS DECIDABLE FROM THE FILES, so it is checked rather than
// described. A migration that ALTERs a table whose only `create table` lives in
// an EXCLUDED migration inherits that exclusion, and saying otherwise is a
// statement the SQL contradicts.
//
// It is deliberately narrow: `alter table` against a table this repo creates.
// Functions that merely REFERENCE a missing table (0123's case) still need the
// human reason above, because CREATE FUNCTION succeeds and only fails at call
// time — no file says so.
export function inheritedExclusions(applied, sqlFor, migrationNames, excluded = EXCLUDED) {
  const createdBy = new Map()
  for (const name of migrationNames) {
    const sql = sqlFor(name) ?? ''
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)) {
      if (!createdBy.has(m[1])) createdBy.set(m[1], name)
    }
  }
  const problems = []
  for (const name of applied) {
    const sql = sqlFor(name) ?? ''
    const seen = new Set()
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?public\.(\w+)/gi)) {
      const table = m[1]
      if (seen.has(table)) continue
      seen.add(table)
      const owner = createdBy.get(table)
      if (owner && owner !== name && owner in excluded) {
        problems.push(
          `${name} alters public.${table}, which only ${owner} creates — and ${owner} is `
          + `EXCLUDED, so staging has no such table and the migration fails on its first `
          + `statement. Exclude ${name} too (the exclusion is inherited), or un-exclude ${owner}.`)
      }
    }
  }
  return problems
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
  // ⚠️ THE INHERITED EXCLUSION — the rule the 0133 failure bought.
  const sql = {
    '0121_creator_knowledge': 'create table if not exists public.creator_knowledge (id uuid);',
    '0133_surface_forms': 'alter table public.creator_knowledge add column if not exists surface_forms jsonb;',
    '0131_beat_audit': 'alter table public.generations add column if not exists beat_audit jsonb;',
    '0001_generations': 'create table public.generations (id uuid);',
  }
  const sqlFor = (n) => sql[n]
  const allNames = Object.keys(sql)
  const inherited = [
    ['altering an EXCLUDED table FAILS',
      ['0133_surface_forms'], { '0121_creator_knowledge': 'staging has no brand_voices FK target' }, 1],
    ['altering a table whose creator is APPLIED passes',
      ['0131_beat_audit'], { '0121_creator_knowledge': 'reason' }, 0],
    ['un-excluding the creator clears it',
      ['0121_creator_knowledge', '0133_surface_forms'], {}, 0],
  ]
  for (const [name, applied, exc, expected] of inherited) {
    const problems = inheritedExclusions(applied, sqlFor, allNames, exc)
    if (problems.length !== expected) {
      console.error(`SELFTEST FAIL: ${name} => ${problems.length} problems, expected ${expected}`)
      for (const p of problems) console.error(`    ${p}`)
      failed++
    } else console.log(`  ok: ${name}`)
  }

  // ⚖️ AND AGAINST THE REAL FILES: putting 0133 back in the list must fail.
  {
    const real = migrationNames()
    const realSql = (n) => { try { return readFileSync(join(MIGRATIONS, `${n}.sql`), 'utf8') } catch { return '' } }
    const p = inheritedExclusions(['0133_knowledge_surface_forms'], realSql, real)
    if (p.length !== 1) {
      console.error(`SELFTEST FAIL: re-applying 0133 should be caught, got ${p.length} problems`); failed++
    } else console.log('  ok: re-adding 0133 to the applied list is caught against the real files')
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
    const names = migrationNames()
    const { applied, problems } = parse(readFileSync(WORKFLOW, 'utf8'), names)
    const sqlFor = (n) => readFileSync(join(MIGRATIONS, `${n}.sql`), 'utf8')
    problems.push(...inheritedExclusions(applied, sqlFor, names))
    console.log(`  matrix applies ${applied.length} migrations, newest ${applied.slice().sort().pop()}`)
    console.log(`  ${Object.keys(EXCLUDED).length} excluded with a stated reason`)
    if (problems.length) { for (const p of problems) console.error(`::error::${p}`); process.exit(1) }
    console.log('staging-migration-coverage guard: OK')
  }
}
