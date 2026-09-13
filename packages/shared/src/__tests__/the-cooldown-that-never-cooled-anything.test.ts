// A COOLDOWN THAT ASKED FOR A STATUS THE JOB NEVER TAKES.
//
// ⚠️⚠️ 0199 DIAGNOSED THE RETRY LOOP CORRECTLY AND THEN GUARDED ON A STATE THAT
// DOES NOT OCCUR. Its third check asks for a recent job with `status = 'failed'`,
// and its header says why it believed that: "by the next morning its last job has
// already dead-lettered."
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-13 — 425 assess_reference jobs finished
// carrying `result.error`, 425 of them with status `done` and ZERO with `failed`.
// The job type records a fetch failure INTO the result and completes, because a
// reference that cannot be read is a property of the library rather than a crash.
// That is correct, and it is what made 0199's predicate unreachable.
//
// ⚖️ AND THE FIX WAS PROVED ON THE REAL ROWS BEFORE IT SHIPPED. Of the 238 urls
// that have errored, 0199's predicate suppresses 0; this one suppresses 63 — the
// rest errored longer ago than the seven-day window, which is the window doing
// its job rather than a miss.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const MIG = join(ROOT, 'supabase', 'migrations')
const SQL = readFileSync(
  join(MIG, '0205_the_cooldown_looked_for_a_status_the_job_never_takes.sql'), 'utf8')

/** The body of the cooldown check, which is the only part under test. */
function cooldownClause(sql: string): string {
  const at = sql.indexOf('THE THIRD STATE')
  expect(at, 'the cooldown check must be identifiable').toBeGreaterThan(-1)
  const open = sql.indexOf('if exists (', at)
  const close = sql.indexOf('then', open)
  expect(open).toBeGreaterThan(-1)
  expect(close).toBeGreaterThan(open)
  return sql.slice(open, close)
}

describe('the cooldown asks the question it meant to ask', () => {
  const clause = cooldownClause(SQL)

  it('it matches a job that ended in an error, not merely one marked failed', () => {
    expect(clause).toMatch(/result\s*->>\s*'error'\s+is\s+not\s+null/)
  })

  it('and `failed` is still admitted, so a future dead-letter needs no migration', () => {
    expect(clause).toMatch(/status\s*=\s*'failed'/)
  })

  it('the two are OR-ed — an AND would match nothing, which is the bug it replaces', () => {
    // ⚠️ THE WHOLE DEFECT IN ONE OPERATOR. `status='failed' AND result.error is
    // not null` matched 0 of 425 real failures. This is the assertion that would
    // fail if the fix were written the obvious wrong way round.
    const inner = clause.slice(clause.indexOf("status = 'failed'") - 40)
    expect(inner).toMatch(/status\s*=\s*'failed'\s*or\s*j\.result/)
    expect(inner).not.toMatch(/status\s*=\s*'failed'\s*and\s*j\.result/)
  })

  it('the seven-day window is kept — a cooldown, never a blacklist', () => {
    expect(clause).toMatch(/created_at\s*>\s*now\(\)\s*-\s*interval\s*'7 days'/)
  })
})

describe('everything 0199 decided on purpose survives', () => {
  it('the success check still runs FIRST, so a working video is never suppressed', () => {
    const success = SQL.indexOf('visual_profile is not null')
    const cooldown = SQL.indexOf('THE THIRD STATE')
    expect(success).toBeGreaterThan(-1)
    expect(success).toBeLessThan(cooldown)
  })

  it('the in-flight check is still there — no double-queueing', () => {
    expect(SQL).toMatch(/status in \('queued', 'running'\)/)
  })

  it('it still enqueues when nothing suppresses it, or the trigger does nothing at all', () => {
    expect(SQL).toMatch(/insert into public\.jobs \(type, payload\)/)
    expect(SQL).toMatch(/'assess_reference'/)
  })

  it('it replaces the function rather than creating a second trigger', () => {
    expect(SQL).toMatch(/create or replace function public\.enqueue_gallery_visual_analysis\(\)/)
  })
})

describe('the migration is applied by staging, never excluded', () => {
  const wf = readFileSync(
    join(ROOT, '.github', 'workflows', 'staging-integration.yml'), 'utf8')
  it('it is in the APPLIED list', () => {
    expect(wf).toContain('0205_the_cooldown_looked_for_a_status_the_job_never_takes')
  })
  it('and the file it replaces is still applied before it — order matters', () => {
    expect(wf.indexOf('0199_a_video_that_cannot_be_read_is_asked_every_morning'))
      .toBeLessThan(wf.indexOf('0205_the_cooldown_looked_for_a_status_the_job_never_takes'))
  })
})

describe('no later migration silently re-replaces this function', () => {
  it('0205 is the last word on enqueue_gallery_visual_analysis', () => {
    const owners = readdirSync(MIG).filter((f) => f.endsWith('.sql')).filter((f) =>
      readFileSync(join(MIG, f), 'utf8').includes(
        'function public.enqueue_gallery_visual_analysis()')).sort()
    expect(owners.length).toBeGreaterThan(1)
    expect(owners[owners.length - 1])
      .toBe('0205_the_cooldown_looked_for_a_status_the_job_never_takes.sql')
  })
})
