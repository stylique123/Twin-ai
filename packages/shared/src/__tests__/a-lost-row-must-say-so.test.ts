// A ROW THAT DID NOT LAND SAID SO ONLY IN A LOG THAT EXPIRES.
//
// ⚠️⚠️ THIS IS THE C8 DEFECT, VERBATIM, AND `check_counter_durability`'s OWN
// HEADER NAMES IT: "we durably recorded the failure of the failure handler and
// not the failure." Both writes in `recordWhatWasChosen` ended in
// `console.warn`. Edge logs expire within days, so a month of production
// traffic would leave nothing at all to count.
//
// ⚠️⚠️ AND THE FAILURE IS NOT HYPOTHETICAL. On 2026-09-13 migration 0203 was
// believed applied to production and was not: `generation_outcomes` had no
// `creator_stage_band` column while the handler had already started writing
// one. PostgREST rejects the WHOLE insert for a single unknown column
// (PGRST204), so the outcome row for EVERY generation would have been lost —
// not the one field — with a `console.warn` as its only trace. The same
// mechanism cost two days once already (0190 unapplied, `is_heartbeat`).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { transformSync } from 'esbuild'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(
  resolve(ROOT, 'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

type Row = Record<string, unknown>

/** Runs the REAL `recordWhatWasChosen` out of the edge file against a fake
 *  client, so these assertions are about behaviour and not about source text. */
function loadRecorder(): (admin: unknown, input: Row) => Promise<void> {
  const start = EDGE.indexOf('async function recordWhatWasChosen')
  const end = EDGE.indexOf('\nfunction clip(')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const js = transformSync(
    EDGE.slice(start, end) + '\nreturn recordWhatWasChosen',
    { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(js)() as (admin: unknown, input: Row) => Promise<void>
}
const record = loadRecorder()

const INPUT: Row = {
  generationId: 'gen-1', ownerId: 'owner-1',
  rawGoal: 'sell', rawFocus: null, rawReferenceUse: null,
  selectedProductId: null, niche: 'fitness', subNiche: null,
  substanceBudgetBeats: 3, referenceDurationSec: 41, hadReference: true,
  creatorStageBand: '1k_10k', entryDoor: 'reference',
}

/** A client that rejects the named tables and accepts the rest, recording every
 *  row it was handed. */
function fakeAdmin(reject: Record<string, { message: string; code?: string }>) {
  const wrote: Array<{ table: string; row: Row }> = []
  const admin = {
    from(table: string) {
      return {
        insert(row: Row) {
          wrote.push({ table, row })
          const error = reject[table] ?? null
          // ⚠️ A REAL PROMISE. The first draft returned a hand-rolled thenable
          // whose own `.then` never resolved, so `await` on the insert hung and
          // eight tests timed out. That was the TEST being wrong, not the code —
          // supabase-js returns a real promise here.
          return Promise.resolve({ error })
        },
      }
    },
  }
  return { admin, wrote }
}

describe('a rejected write leaves a durable row, not just a log', () => {
  it('a rejected OUTCOME insert writes an ops_events row', async () => {
    const { admin, wrote } = fakeAdmin({
      generation_outcomes: { message: 'column does not exist', code: 'PGRST204' },
    })
    await record(admin, INPUT)
    const ops = wrote.filter((w) => w.table === 'ops_events')
    expect(ops).toHaveLength(1)
    expect(ops[0].row.kind).toBe('generation_record_not_written')
    expect((ops[0].row.detail as Row).table).toBe('generation_outcomes')
    expect((ops[0].row.detail as Row).generation_id).toBe('gen-1')
  })

  it('a rejected CHOICES insert does too — both writes, not just the second', async () => {
    const { admin, wrote } = fakeAdmin({
      generation_choices: { message: 'nope', code: '23505' },
    })
    await record(admin, INPUT)
    const ops = wrote.filter((w) => w.table === 'ops_events')
    expect(ops).toHaveLength(1)
    expect((ops[0].row.detail as Row).table).toBe('generation_choices')
  })

  it('BOTH failing produces TWO rows — one loss must not mask the other', async () => {
    const { admin, wrote } = fakeAdmin({
      generation_choices: { message: 'a' },
      generation_outcomes: { message: 'b' },
    })
    await record(admin, INPUT)
    expect(wrote.filter((w) => w.table === 'ops_events')).toHaveLength(2)
  })

  it('and a clean run writes NOTHING to ops_events', async () => {
    const { admin, wrote } = fakeAdmin({})
    await record(admin, INPUT)
    expect(wrote.filter((w) => w.table === 'ops_events')).toHaveLength(0)
    // The two real rows still went in.
    expect(wrote.map((w) => w.table)).toEqual(['generation_choices', 'generation_outcomes'])
  })
})

describe('schema drift is louder than one bad row, because it is not one bad row', () => {
  it('PGRST204 is an error — it loses the SAME row for every generation after it', async () => {
    const { admin, wrote } = fakeAdmin({
      generation_outcomes: { message: 'unknown column', code: 'PGRST204' },
    })
    await record(admin, INPUT)
    expect(wrote.find((w) => w.table === 'ops_events')!.row.severity).toBe('error')
  })

  it('anything else is a warning — one row, one creator', async () => {
    const { admin, wrote } = fakeAdmin({
      generation_outcomes: { message: 'conflict', code: '23505' },
    })
    await record(admin, INPUT)
    expect(wrote.find((w) => w.table === 'ops_events')!.row.severity).toBe('warning')
  })

  it('a missing code is a warning, never an error by accident', async () => {
    const { admin, wrote } = fakeAdmin({ generation_outcomes: { message: 'who knows' } })
    await record(admin, INPUT)
    expect(wrote.find((w) => w.table === 'ops_events')!.row.severity).toBe('warning')
  })
})

describe('it is non-fatal, because the creator already paid for the build', () => {
  it('an ops_events insert that THROWS does not reject the recorder', async () => {
    const admin = {
      from(table: string) {
        return {
          insert() {
            if (table === 'ops_events') throw new Error('ops_events is gone too')
            return Promise.resolve({ error: { message: 'x' } })
          },
        }
      },
    }
    // ⚠️ THE FAILURE OF THE FAILURE HANDLER MUST NOT BECOME THE OUTAGE. This is
    // the assertion that keeps the fix from recreating the defect it fixes.
    await expect(record(admin, INPUT)).resolves.toBeUndefined()
  })
})

describe('the guard can now see the table these land in', () => {
  const GUARD = readFileSync(
    resolve(ROOT, 'scripts', 'ci', 'check_counter_durability.mjs'), 'utf8')

  it('the scanner reads ops_events inserts, not only `event:`', () => {
    expect(GUARD).toMatch(/from\\\('ops_events'\\\)/)
  })

  it('it matches inside the insert, never on a bare `kind:`', () => {
    // ⚠️ A BARE `kind:` GREP FINDS 49 NAMES IN THIS TREE and most are ordinary
    // discriminated unions — `card`, `clip`, `crossfade`, `phone`. A guard that
    // accused forty of those on its first run is one people learn to ignore.
    expect(GUARD).not.toMatch(/matchAll\(\/kind:\\s\*'/)
  })

  it('every ops_events kind in the tree is registered', () => {
    const kinds = new Set<string>()
    for (const f of [EDGE,
      readFileSync(resolve(ROOT, 'worker', 'src', 'index.ts'), 'utf8'),
      readFileSync(resolve(ROOT, 'supabase', 'functions', 'billing-webhook', 'index.ts'), 'utf8')]) {
      for (const m of f.matchAll(/from\('ops_events'\)\s*\n?\s*\.insert\(/g)) {
        const k = /kind:\s*'([a-z0-9_]+)'/.exec(f.slice(m.index!, m.index! + 400))
        if (k) kinds.add(k[1])
      }
    }
    expect(kinds.size).toBeGreaterThan(5)
    for (const k of kinds) expect(GUARD).toMatch(new RegExp(`\\n  ${k}: \\{`))
  })
})
