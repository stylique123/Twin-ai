// THE COLUMNS TIER 0 WRITES, AND THE THREE THINGS THEY MUST NEVER SAY.
//
// ⚠️ THE EXPENSIVE FAILURE HERE IS A CONSTRAINT VIOLATION, not a wrong number.
// The write happens at the END of a reference job, after the download, the
// bridge and the model call. A row shaped wrongly fails then — losing all of
// that work to a mistake that was decidable before anything was sent.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TierZeroProfile } from '../referenceTierZero.js'

// The pass reaches `env` through editorInspect -> db, so the module graph needs
// credentials it never uses here. Same stub pattern as arms-differ-only-by-model.
beforeAll(() => {
  process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'
})
const loadPass = async () => await import('../referenceTierZeroPass.js')
const loadInspect = async () => await import('../jobs/editorInspect.js')

const REPO = join(import.meta.dirname, '..', '..', '..')
const MIGRATION = readFileSync(
  join(REPO, 'supabase/migrations/0180_the_numbers_that_cannot_be_rate_limited.sql'), 'utf8')
const PASS = readFileSync(join(REPO, 'worker/src/referenceTierZeroPass.ts'), 'utf8')

const AT = '2026-09-02T15:00:00.000Z'
const PROFILE: TierZeroProfile = {
  cuts: 12, cutsPerMinute: 7.2, medianShotSec: 1.8, faceCoveragePct: 91.3, speechPct: null,
}

describe('a reading and a failure are not both true', () => {
  it('a success carries the numbers, clears the code, and earns its stamp', async () => {
    const { tierZeroColumns } = await loadPass()
    const c = tierZeroColumns({ ran: true, profile: PROFILE, failureCode: null }, AT)
    expect(c['tier_zero_profile']).toEqual(PROFILE)
    expect(c['tier_zero_failure_code']).toBeNull()
    expect(c['tier_zero_measured_at']).toBe(AT)
  })

  it('a failure carries the code and NO stamp', async () => {
    const { tierZeroColumns } = await loadPass()
    // ⚠️ THE STAMP IS WHAT A LATER RUN TRUSTS TO SKIP A REFERENCE. Stamping a
    // failure would permanently retire a video nobody ever measured.
    const c = tierZeroColumns({ ran: false, profile: null, failureCode: 'BRIDGE_FAILED' }, AT)
    expect(c['tier_zero_profile']).toBeNull()
    expect(c['tier_zero_failure_code']).toBe('BRIDGE_FAILED')
    expect(c['tier_zero_measured_at']).toBeNull()
  })

  it('an ABSENT result writes nothing at all', async () => {
    const { tierZeroColumns } = await loadPass()
    // ⚠️ ABSENT IS NOT A FAILURE. A job that never reached the pass has nothing
    // to say; clearing the columns would erase a real earlier reading on behalf
    // of a run that never looked.
    expect(Object.keys(tierZeroColumns(null, AT))).toHaveLength(0)
    expect(Object.keys(tierZeroColumns(undefined, AT))).toHaveLength(0)
  })

  it('never emits a profile and a code together, for any shape', async () => {
    const { tierZeroColumns } = await loadPass()
    const shapes = [
      { ran: true, profile: PROFILE, failureCode: null },
      { ran: false, profile: null, failureCode: 'TIMED_OUT' },
      // A contradictory result from a future edit must still write a legal row.
      { ran: false, profile: PROFILE, failureCode: 'NO_SIGNAL' },
      { ran: true, profile: null, failureCode: null },
    ] as const
    for (const s of shapes) {
      const c = tierZeroColumns(s, AT)
      const both = c['tier_zero_profile'] != null && c['tier_zero_failure_code'] != null
      expect(both).toBe(false)
      if (c['tier_zero_measured_at'] != null) expect(c['tier_zero_profile']).not.toBeNull()
    }
  })
})

describe('the check constraint and the type must not drift apart', () => {
  it('every failure code the worker can emit is accepted by the database', () => {
    // ⚠️ THIS IS THE TEST THAT EARNS ITS PLACE. A code added in TypeScript and
    // not in the constraint fails the write at the very end of a reference job,
    // in production, having already spent the download and the model call.
    const declared = [...PASS.matchAll(/^\s*\|\s*'([A-Z_]+)'$/gm)].map((m) => m[1]!)
    expect(declared.length).toBeGreaterThanOrEqual(5)
    const allowed = MIGRATION.slice(
      MIGRATION.indexOf('tier_zero_failure_code in ('),
      MIGRATION.indexOf('_tier_zero_coherent'),
    )
    for (const code of declared) expect(allowed).toContain(`'${code}'`)
  })

  it('and the database accepts nothing the worker cannot emit', () => {
    const declared = new Set([...PASS.matchAll(/^\s*\|\s*'([A-Z_]+)'$/gm)].map((m) => m[1]!))
    const inCheck = [...MIGRATION.slice(
      MIGRATION.indexOf('tier_zero_failure_code in ('),
      MIGRATION.indexOf('_tier_zero_coherent'),
    ).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!)
    expect(inCheck.length).toBeGreaterThanOrEqual(5)
    for (const code of inCheck) expect(declared.has(code)).toBe(true)
  })

  it('the migration survives being applied twice', () => {
    // The ratchet rule from #74: every statement is guarded.
    expect(MIGRATION).toMatch(/add column if not exists tier_zero_profile/)
    expect(MIGRATION).toMatch(/add column if not exists tier_zero_failure_code/)
    expect(MIGRATION).toMatch(/add column if not exists tier_zero_measured_at/)
    expect(MIGRATION).toMatch(/create index if not exists/)
    // Three constraints, each behind its own pg_constraint existence check.
    expect([...MIGRATION.matchAll(/from pg_constraint/g)]).toHaveLength(3)
  })

  it('the database itself refuses the two incoherent rows', () => {
    // Not only the writer: a future writer that forgets is caught by the table.
    expect(MIGRATION).toMatch(/check \(tier_zero_profile is null or tier_zero_failure_code is null\)/)
    expect(MIGRATION).toMatch(/check \(tier_zero_measured_at is null or tier_zero_profile is not null\)/)
  })
})

describe('a reference is not an asset, but rotation must agree anyway', () => {
  // ⚠️ `buildInspection` CANNOT BE REUSED — it is keyed to an asset row and
  // throws when a frame rate is missing. So the display swap is re-stated in
  // the pass, and this is the test that stops the two from disagreeing.
  const swapRule = (normalizeRotation: (r: number) => number) => (w: number, h: number, rot: number) => {
    const r = normalizeRotation(rot)
    const swap = r === 90 || r === 270
    return { displayWidth: swap ? h : w, displayHeight: swap ? w : h }
  }

  it('agrees with editorInspect for every rotation, portrait and landscape', async () => {
    const { displayDims } = await loadPass()
    const { normalizeRotation } = await loadInspect()
    const swap = swapRule(normalizeRotation)
    for (const [w, h] of [[1920, 1080], [1080, 1920], [720, 720]] as const) {
      for (const rot of [0, 90, 180, 270, 360, -90, 450] as const) {
        const r = normalizeRotation(rot)
        expect(displayDims({ durationMs: 1000, width: w, height: h, rotation: r }))
          .toEqual(swap(w, h, rot))
      }
    }
  })

  it('a portrait phone video reports portrait display dimensions', async () => {
    const { displayDims } = await loadPass()
    // The case that matters: a 1920x1080 file tagged rotate=90 IS a vertical
    // video, and handing the bridge 1920x1080 would fail its dimension check.
    expect(displayDims({ durationMs: 1, width: 1920, height: 1080, rotation: 90 }))
      .toEqual({ displayWidth: 1080, displayHeight: 1920 })
  })
})
