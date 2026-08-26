#!/usr/bin/env node
// A COLUMN NOBODY READS IS A DECISION NOBODY MADE.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// The recurring defect in this codebase is not a wrong value -- it is a value
// with no consumer. `visual_hook`, `beat_plan.proof`, `messageForOwnAccount`,
// the whole BrandTruth lineage: each was built, stored, and read by nothing,
// and each looked finished from the writer's side. `check_counter_durability`
// closed this for EVENTS. This closes it for COLUMNS, with the same mechanism
// and for the same reason: it cannot decide whether a column deserves to exist,
// but it can refuse to let the question go unasked.
//
// ── THE INSTRUMENT, AND WHY THE OBVIOUS ONE IS WRONG ──────────────────────
//
// ⚠️ THE FIRST VERSION OF THIS CHECK GREPPED ONLY TS/TSX/MJS AND REPORTED 29
// ORPHANS OF 482. TWENTY-TWO OF THOSE TWENTY-NINE WERE FALSE. They are read
// from SQL -- `jobs.run_after` inside `claim_job`, `referrals.referrer_id`
// inside its redemption RPC, `reference_content_profiles.last_success_at`
// inside a recovery query. A guard shipped on that instrument would have
// accused twenty-two correct columns on its first run, which is how a guard
// teaches people to ignore it.
//
// So a READER is either:
//   * the column name appearing in TS/TSX/MJS outside supabase/migrations, or
//   * a NON-DEFINITIONAL mention in a migration -- anything that is not the
//     column's own `create table` line, an `add column`, an index, a
//     constraint, or a comment.
//
// With that instrument the real number is 7 of 482 (1.5%), and all seven were
// verified by hand: each appears exactly once in the entire tree, in the
// statement that creates it.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
//
// ⚠️ IT CANNOT SEE A `select('*')` READER. A caller that selects the whole row
// and passes it around consumes the column without naming it, so this guard
// reports a column as unread when it is not. That direction is the safe one --
// it asks a question that has an easy answer -- but it means a registry entry
// saying "read via select('*') in X" is a legitimate resolution, not a dodge.
//
// ⚠️ IT PROVES NOTHING ABOUT VALUES. A column with a reader may still be
// written null forever. That is `check_counter_durability`'s territory and the
// mutation tests', not this one's.
//
//   node scripts/ci/check_column_readers.mjs            # the real tree
//   node scripts/ci/check_column_readers.mjs --selftest # fixtures
import { readdirSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const REPO = join(fileURLToPath(import.meta.url), '..', '..', '..')
const MIG = join(REPO, 'supabase', 'migrations')

// ⚠️ EVERY ENTRY IS A DECISION SOMEBODY MADE, WITH A DATE. An unregistered
// unread column fails the build; a registered one is a debt that was named.
export const REGISTRY = {
  'profiles.free_export_used': {
    why: 'Added by 0034 for a free-export allowance that was never built. No code '
      + 'has ever read it and no feature depends on it. Kept rather than dropped '
      + 'because dropping a column on a live table is a migration with a rollback '
      + 'story, and this one costs a boolean per row. DECIDE when export pricing '
      + 'is next opened: wire it or drop it.',
  },
  'subscriptions.cancel_at_period_end': {
    why: 'Standard billing-provider field stored by 0009 against the day the '
      + 'billing UI shows a pending cancellation. Nothing reads it yet because '
      + 'that screen does not exist.',
  },
  'subscriptions.customer_ref': {
    why: 'The provider-side customer id, stored by 0009 so a subscription row can '
      + 'be reconciled against the provider by hand. Deliberately write-only: it '
      + 'is for an operator with a support ticket, not for a code path.',
  },
  'watched_sessions.taxonomy_version': {
    why: 'Pins which blocker taxonomy a watched session was coded against, so '
      + 'sessions coded under different versions are never pooled. Unread because '
      + 'only one version exists; the first taxonomy change is what makes it '
      + 'load-bearing, and by then the old rows must already carry it.',
  },
  'reference_frames.sampled_at': {
    why: 'When a frame was captured. Its siblings (schedule_basis, frame_index) '
      + 'are read; this one is audit only -- it answers "was this frame set '
      + 'captured before or after the sampler change?" for a human reading rows.',
  },
  'creative_transfer_plans.model_identity': {
    why: 'Part of the CreativeTransferPlan lineage, which is measured dead: 0 rows '
      + 'in production and no caller for any of its four exported functions '
      + '(2026-08-26). Registered rather than fixed because the whole lineage is '
      + 'one decision -- wire it or drop it -- and that decision is not this '
      + 'column\'s to make.',
  },
  'creative_transfer_plans.prompt_version': {
    why: 'Same dead lineage as model_identity, same single decision. See that entry.',
  },
}

const SKIP = new Set(['id', 'created_at', 'updated_at', 'user_id', 'owner_id'])
const TYPE = '(uuid|text|jsonb|boolean|integer|bigint|numeric|timestamptz|int|smallint|real|double)'

export function columnsFrom(files) {
  const cols = new Set()
  for (const [, body] of files) {
    for (const m of body.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      for (const line of m[2].split('\n')) {
        const mm = line.trim().match(new RegExp(`^(\\w+)\\s+${TYPE}`))
        if (mm && !SKIP.has(mm[1])) cols.add(`${m[1]}.${mm[1]}`)
      }
    }
    for (const m of body.matchAll(/alter table (?:if exists )?public\.(\w+)\s+add column if not exists (\w+)/g)) {
      if (!SKIP.has(m[2])) cols.add(`${m[1]}.${m[2]}`)
    }
  }
  return [...cols].sort()
}

/** ⚠️ A DEFINITIONAL MENTION IS NOT A READ. This predicate is the guard. */
export function isDefinitional(line, col) {
  const t = line.trim()
  return t.startsWith('--')
    || new RegExp(`add column if not exists\\s+${col}\\b`).test(t)
    || /^create (unique )?index/.test(t)
    || new RegExp(`^${col}\\s+${TYPE}`).test(t)
    || /^(constraint|check|primary key|unique)\b/.test(t)
}

export function sqlReads(files, col) {
  let n = 0
  for (const [, body] of files) {
    for (const line of body.split('\n')) {
      if (line.includes(col) && !isDefinitional(line, col)) n++
    }
  }
  return n
}

// ⚠️ THE GUARD EXCLUDES ITSELF, AND THAT IS NOT A DETAIL. The registry below
// names all seven columns, this grep covers *.mjs, and scripts/ci is not
// excluded -- so on its first real run the guard read its own documentation as
// a reader and declared all seven debts paid. A guard that is exonerated by
// explaining itself measures nothing.
const SELF = 'scripts/ci/check_column_readers.mjs'
function codeReads(col) {
  try {
    const hits = execSync(
      `grep -rlF "${col}" --include=*.ts --include=*.tsx --include=*.mjs . `
      + `--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=migrations 2>/dev/null || true`,
      { cwd: REPO, encoding: 'utf8' })
      .split('\n').map((l) => l.replace(/^\.\//, '')).filter((l) => l !== '' && l !== SELF)
    return hits.length
  } catch { return 0 }
}

export function check(files, registry, reads) {
  const problems = []
  const unread = []
  for (const qualified of columnsFrom(files)) {
    const col = qualified.split('.')[1]
    if (reads(col, files) > 0) continue
    unread.push(qualified)
    if (!registry[qualified]) {
      problems.push(`${qualified} is written and read by nothing — say why it exists, or drop it. `
        + `A column nobody reads is a decision nobody made.`)
    } else if ((registry[qualified].why ?? '').length < 40) {
      problems.push(`${qualified}: registered with no real reason.`)
    }
  }
  for (const k of Object.keys(registry)) {
    if (!unread.includes(k)) {
      problems.push(`${k} is registered as unread and now HAS a reader — remove the entry, `
        + `the debt is paid.`)
    }
  }
  return { problems, unread }
}

// ── SELFTEST ──────────────────────────────────────────────────────────────
// ⚠️ THE INSTRUMENT IS TESTED, NOT JUST THE BOOKKEEPING. The false-positive
// case below is the one that killed the first version of this guard.
if (process.argv.includes('--selftest')) {
  const mk = (body) => [['f.sql', body]]
  const table = 'create table if not exists public.t (\n  id uuid primary key,\n  a text,\n  b text\n);\n'
  const none = () => 0
  let failures = 0
  const expect = (name, got, want) => {
    if (got !== want) { console.error(`selftest: ${name} — got ${got}, want ${want}`); failures++ }
  }
  expect('an unregistered unread column fails',
    check(mk(table), {}, none).problems.length, 2)
  expect('registered with a real reason passes',
    check(mk(table), { 't.a': { why: 'x'.repeat(50) }, 't.b': { why: 'y'.repeat(50) } }, none).problems.length, 0)
  expect('registered with a stub reason fails',
    check(mk(table), { 't.a': { why: 'meh' }, 't.b': { why: 'y'.repeat(50) } }, none).problems.length, 1)
  expect('a stale entry whose column now has a reader fails',
    check(mk(table), { 't.a': { why: 'x'.repeat(50) }, 't.b': { why: 'y'.repeat(50) } },
      (c) => (c === 'a' ? 1 : 0)).problems.length, 1)

  // ⚠️ THE FALSE-POSITIVE CASE. A column read ONLY from a SQL function body is
  // NOT an orphan. The first version of this guard called 22 such columns dead.
  const withFn = `${table}\ncreate function f() returns void as $$ begin update public.t set a = now() where b is null; end $$ language plpgsql;\n`
  expect('a column read only from SQL is not reported',
    check(mk(withFn), {}, (c, f) => sqlReads(f, c)).problems.length, 0)
  expect('isDefinitional ignores the creating line', isDefinitional('  a text,', 'a'), true)
  expect('isDefinitional ignores an index', isDefinitional('create index x on t (a);', 'a'), true)
  expect('isDefinitional does NOT ignore a real read', isDefinitional('  where a is null', 'a'), false)

  if (failures > 0) { console.error(`column-readers guard selftest: ${failures} FAILED`); process.exit(1) }
  console.log('column-readers guard selftest: OK (8 cases, incl. the SQL false-positive)')
  process.exit(0)
}

const files = readdirSync(MIG).filter((f) => f.endsWith('.sql'))
  .map((f) => [f, readFileSync(join(MIG, f), 'utf8')])
const { problems, unread } = check(files, REGISTRY,
  (col, fs) => codeReads(col) + sqlReads(fs, col))
console.log(`  ${columnsFrom(files).length} columns · ${unread.length} read by nothing · ${Object.keys(REGISTRY).length} registered`)
if (problems.length > 0) {
  for (const p of problems) console.log(`::error::column readers: ${p}`)
  process.exit(1)
}
console.log('column-readers guard: OK')
