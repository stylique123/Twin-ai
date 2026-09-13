// AN UNCONSTRAINED ENUM COLUMN DRIFTS EVEN WHEN EVERY WRITER IS REASONABLE.
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-13: `ops_events.severity` carried `warn`
// (303), `warning` (17), `critical` (11) and `error` (1), with no CHECK. Two of
// those four are the same word.
//
// ⚠️⚠️ AND I ADDED TWO OF THEM THIS WEEK. The `warning` rows begin 2026-09-10 —
// #849's `generation_record_not_written` and #850's escalation pair each chose a
// spelling by copying a different neighbour. Neither author was wrong locally,
// which is the whole point: without a constraint the column drifts anyway.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SQL = readFileSync(join(ROOT, 'supabase', 'migrations',
  '0208_four_spellings_two_of_them_the_same_word.sql'), 'utf8')

const CANON = ['info', 'warn', 'error', 'critical'] as const

/** Every severity literal written into an ops_events insert anywhere that ships. */
function severitiesInTree(): { file: string; severity: string }[] {
  const out: { file: string; severity: string }[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'dist' || name === '__tests__') continue
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.(ts|mjs)$/.test(p) || p.endsWith('.test.ts')) continue
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(/from\('ops_events'\)\s*\n?\s*\.insert\(/g)) {
        const seg = src.slice(m.index!, m.index! + 500)
        for (const s of seg.matchAll(/severity:\s*(?:[^,\n]*?\?\s*)?'([a-z]+)'(?:\s*:\s*'([a-z]+)')?/g)) {
          if (s[1]) out.push({ file: p.slice(ROOT.length + 1), severity: s[1] })
          if (s[2]) out.push({ file: p.slice(ROOT.length + 1), severity: s[2] })
        }
      }
    }
  }
  for (const d of ['supabase', 'worker', 'scripts']) walk(join(ROOT, d))
  return out
}

describe('every writer in the tree uses a canonical level', () => {
  const found = severitiesInTree()

  it('the scan found writers at all — an empty scan would pass vacuously', () => {
    expect(found.length).toBeGreaterThan(4)
  })

  it('no writer spells it `warning`', () => {
    const bad = found.filter((f) => f.severity === 'warning')
    expect(bad, `still writing 'warning': ${bad.map((b) => b.file).join(', ')}`).toEqual([])
  })

  it('and every level written is one the CHECK admits', () => {
    for (const f of found) {
      expect(CANON, `${f.file} writes '${f.severity}'`).toContain(f.severity)
    }
  })
})

describe('the migration constrains the column and rewrites the smaller side', () => {
  it('the CHECK admits EXACTLY the four levels', () => {
    const clause = SQL.slice(SQL.indexOf('severity is null'))
    const admitted = new Set(
      [...clause.slice(0, clause.indexOf(')')).matchAll(/'([a-z]+)'/g)].map((m) => m[1]))
    expect(admitted).toEqual(new Set(CANON))
  })

  it('it backfills warning -> warn, not the other way round', () => {
    // ⚠️ DIRECTION MATTERS: `warn` holds 303 rows and `warning` 17. Rewriting
    // the larger side would touch 303 rows to achieve the same thing.
    expect(SQL).toMatch(/update public\.ops_events set severity = 'warn' where severity = 'warning'/)
    expect(SQL).not.toMatch(/set severity = 'warning'/)
  })

  it('the backfill runs BEFORE the constraint, or the constraint rejects the rows', () => {
    expect(SQL.indexOf("set severity = 'warn'"))
      .toBeLessThan(SQL.indexOf('add constraint ops_events_severity_known'))
  })

  it('NULL stays legal — one writer sends no severity at all', () => {
    // ⚠️ NOT NULL WOULD TURN `heartbeat_digest` INTO A REJECTED INSERT, which is
    // the telemetry-write failure #849 exists to prevent.
    expect(SQL).toMatch(/severity is null/)
    expect(SQL).not.toMatch(/set not null/i)
  })

  it('it drops the constraint before adding it, so the migration re-runs', () => {
    expect(SQL.indexOf('drop constraint if exists ops_events_severity_known'))
      .toBeLessThan(SQL.indexOf('add constraint ops_events_severity_known'))
  })
})

describe('the migration is applied by staging, never excluded', () => {
  const wf = readFileSync(join(ROOT, '.github', 'workflows', 'staging-integration.yml'), 'utf8')
  it('it is in the APPLIED list after 0207', () => {
    expect(wf).toContain('0208_four_spellings_two_of_them_the_same_word')
    expect(wf.indexOf('0207_absent_six_times_in_seven_or_never_called'))
      .toBeLessThan(wf.indexOf('0208_four_spellings_two_of_them_the_same_word'))
  })
})
