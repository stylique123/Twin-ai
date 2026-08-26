/**
 * A COST CEILING PER ACCOUNT, NOT JUST A RATE LIMIT PER HOUR.
 *
 * ⚠️ MEASURED BEFORE BUILDING: `start-dna` caps voice scans at 8 per hour and
 * nothing else — ~5,760 a month for one account, each able to spend Apify and
 * Gemini budget. `rate_events`, the table the hourly limit counts, holds ZERO
 * rows in production because `check_rate_limit` deletes anything older than its
 * window on every call. The evidence a ceiling needs did not survive the hour.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { monthlyScanCeiling, scanAllowance, DEFAULT_MONTHLY_SCANS } from '../scanCeiling'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

describe('the ceiling a plan names', () => {
  it('uses the plan value when it names one', () => {
    expect(monthlyScanCeiling({ monthly_scan_ceiling: 25 })).toBe(25)
    expect(monthlyScanCeiling({ monthly_scan_ceiling: 0 })).toBe(0)
  })

  it('an unknown plan gets the default, NOT Infinity', () => {
    // ⚠️ THE DELIBERATE DEPARTURE FROM productLibraryLimit. That returns Infinity
    // for an unknown plan because failing open costs storage. Here failing open
    // IS the vulnerability — an unbounded spend ceiling is what this removes.
    expect(monthlyScanCeiling(null)).toBe(DEFAULT_MONTHLY_SCANS)
    expect(monthlyScanCeiling(undefined)).toBe(DEFAULT_MONTHLY_SCANS)
    expect(monthlyScanCeiling({})).toBe(DEFAULT_MONTHLY_SCANS)
    expect(monthlyScanCeiling(null)).not.toBe(Infinity)
  })

  it('an unknown plan is NOT locked out either', () => {
    // Zero would lock every paying creator out of the product's first step the
    // moment a plan key is renamed.
    expect(monthlyScanCeiling({})).toBeGreaterThan(0)
  })

  it('THE NULL CHECK PRECEDES THE COERCION', () => {
    // ⚠️ Number(null) is 0 and Number.isFinite(0) is true. Coercing first turns
    // "this plan does not name a ceiling" into "this plan allows zero scans".
    expect(monthlyScanCeiling({ monthly_scan_ceiling: null })).toBe(DEFAULT_MONTHLY_SCANS)
    expect(monthlyScanCeiling({ monthly_scan_ceiling: undefined })).toBe(DEFAULT_MONTHLY_SCANS)
  })

  it('a non-number is not a ceiling', () => {
    expect(monthlyScanCeiling({ monthly_scan_ceiling: '25' })).toBe(DEFAULT_MONTHLY_SCANS)
    expect(monthlyScanCeiling({ monthly_scan_ceiling: NaN })).toBe(DEFAULT_MONTHLY_SCANS)
    expect(monthlyScanCeiling({ monthly_scan_ceiling: Infinity })).toBe(DEFAULT_MONTHLY_SCANS)
    expect(monthlyScanCeiling({ monthly_scan_ceiling: -5 })).toBe(DEFAULT_MONTHLY_SCANS)
  })

  it('the default is far above legitimate use and far below the abuse capacity', () => {
    // 40 voices exist in the whole production estate; the hourly limit leaves
    // ~5,760/month open. The default has to sit between those, decisively.
    expect(DEFAULT_MONTHLY_SCANS).toBeGreaterThan(40)
    expect(DEFAULT_MONTHLY_SCANS).toBeLessThan(1000)
  })
})

describe('the verdict a creator reads', () => {
  it('allows while under the ceiling', () => {
    expect(scanAllowance(0, 100).allowed).toBe(true)
    expect(scanAllowance(99, 100).allowed).toBe(true)
    expect(scanAllowance(0, 100).message).toBe('')
  })

  it('refuses AT the ceiling, not one past it', () => {
    // Off-by-one here is a free extra paid scan for every account, every month.
    expect(scanAllowance(100, 100).allowed).toBe(false)
    expect(scanAllowance(101, 100).allowed).toBe(false)
  })

  it('the refusal names both numbers', () => {
    const v = scanAllowance(100, 100)
    expect(v.message).toContain('100')
    expect(v.used).toBe(100)
    expect(v.ceiling).toBe(100)
  })

  it('the refusal is plain English and says what still works', () => {
    const m = scanAllowance(100, 100).message
    expect(m).toMatch(/reset/)
    expect(m).toMatch(/keep working/)
    // ⚠️ NEVER MAKE THE CREATOR THINK ABOUT TWIN'S ARCHITECTURE.
    expect(m).not.toMatch(/quota|entitlement|rate.?limit|Apify|ceiling/i)
  })
})

describe('the ledger is append-only and the edge enforces it', () => {
  const MIG = readFileSync(
    join(REPO, 'supabase/migrations/0172_a_scan_leaves_a_durable_trace.sql'), 'utf8')
  const EDGE = readFileSync(join(REPO, 'supabase/functions/start-dna/index.ts'), 'utf8')

  it('no browser may write the ledger', () => {
    expect(MIG).toMatch(/revoke insert, update, delete on public\.scan_events/)
  })

  it('RLS is on and the creator can read their own', () => {
    expect(MIG).toMatch(/enable row level security/)
    expect(MIG).toMatch(/auth\.uid\(\) = user_id/)
  })

  it('the edge consults the shared rule rather than its own arithmetic', () => {
    expect(EDGE).toMatch(/monthlyScanCeiling\(/)
    expect(EDGE).toMatch(/scanAllowance\(/)
  })

  it('it counts only billable scans since the start of the month', () => {
    expect(EDGE).toMatch(/\.eq\('billable', true\)/)
    expect(EDGE).toMatch(/monthStart/)
  })

  it('a count that could not be read is not treated as zero', () => {
    // ⚠️ Treating a failed read as "0 used" makes every database hiccup an
    // unlimited budget. The guard requires BOTH no-error and a real number.
    expect(EDGE).toMatch(/!countErr && typeof usedRaw === 'number'/)
  })

  it('the hourly limit is untouched — this is a ceiling beside it, not instead', () => {
    expect(EDGE).toMatch(/p_action: 'dna_build'/)
    expect(EDGE).toMatch(/p_max: 8/)
  })
})
