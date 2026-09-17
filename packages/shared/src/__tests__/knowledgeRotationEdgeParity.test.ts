// THE SAME TEN ITEMS REACHED EVERY SCRIPT, AND NOTHING COULD HAVE SAID SO.
//
// ⚠️ THE RANKING IS DETERMINISTIC AND THE STORE IS STATIC BETWEEN SCANS. Lexical
// overlap with the video's topic produced the same winners every time, so a
// creator who returns to a subject was handed the same handful of their own
// material repeatedly — while the median voice holds 10 items and nothing
// recorded that any of them had already been supplied.
//
// ⚖️ BOTH COPIES ARE EXECUTED, NEVER COMPARED AS TEXT. A stable sort whose
// tiebreak is off by one produces a DIFFERENT script from an identical-looking
// line, and this file's whole purpose is that the edge mirror and the shared rule
// choose the same item.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { orderForSupply, rotateWithinBucket, spend } from '../knowledgeRotation'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

const START = '// ── WHICH OF THE EQUALLY RELEVANT ITEMS GOES FIRST, INLINED ─'
const END = '// ── END ROTATION ─'

interface Row { id: string; used_count?: number | null; last_used_at?: string | null }

function loadInline() {
  const a = EDGE.indexOf(START)
  expect(a, 'rotation block start marker missing — restore it, do not delete it').toBeGreaterThan(-1)
  const b = EDGE.indexOf(END, a)
  expect(b, 'rotation block END marker missing — restore it').toBeGreaterThan(a)
  const js = transformSync(EDGE.slice(a, b), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { orderForSupplyInline, rotateWithinBucketInline, spendInline }`)() as {
    orderForSupplyInline: (s: ReadonlyArray<{ item: Row; hit: number }>) => Row[]
    rotateWithinBucketInline: (b: readonly Row[]) => Row[]
    spendInline: (i: Row) => { count: number; at: number }
  }
}

const DAY = 86_400_000
const NOW = Date.parse('2026-09-17T12:00:00Z')
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()

/** ⚠️ EVERY SHAPE A REAL ROW ARRIVES IN, including the ones 0215 cannot have
 *  stamped yet. A table that only held well-formed rows would agree with a mirror
 *  that ignored the absent cases entirely — which is the whole store on the day
 *  this ships. */
const POOL: Array<{ item: Row; hit: number }> = [
  { item: { id: 'never', used_count: 0, last_used_at: null }, hit: 2 },
  { item: { item_missing: true, id: 'unstamped' } as unknown as Row, hit: 2 },
  { item: { id: 'once-old', used_count: 1, last_used_at: ago(90) }, hit: 2 },
  { item: { id: 'once-new', used_count: 1, last_used_at: ago(1) }, hit: 2 },
  { item: { id: 'five', used_count: 5, last_used_at: ago(200) }, hit: 2 },
  { item: { id: 'more-relevant', used_count: 9, last_used_at: ago(1) }, hit: 7 },
  { item: { id: 'nulls', used_count: null, last_used_at: 'not a date' }, hit: 0 },
  { item: { id: 'cold', used_count: 3, last_used_at: ago(10) }, hit: 0 },
  { item: { id: 'negative', used_count: -4, last_used_at: null }, hit: 0 },
]

describe('the edge copy of the rotation rule matches the shared one', () => {
  const inline = loadInline()

  it('orders the whole pool identically', () => {
    const a = orderForSupply(POOL).map((r) => r.id)
    const b = inline.orderForSupplyInline(POOL).map((r) => r.id)
    expect(b).toEqual(a)
    // Guards the guard: an ordering that never moved anything would agree with
    // any mirror at all.
    expect(a).not.toEqual(POOL.map((x) => x.item.id))
  })

  it('agrees on what counts as spent, including every malformed value', () => {
    for (const row of POOL.map((x) => x.item)) {
      expect(inline.spendInline(row), `drift on ${row.id}`).toEqual(spend(row))
    }
  })

  it('agrees on a bucket in isolation', () => {
    const bucket = POOL.filter((x) => x.hit === 2).map((x) => x.item)
    expect(inline.rotateWithinBucketInline(bucket).map((r) => r.id))
      .toEqual(rotateWithinBucket(bucket).map((r) => r.id))
  })
})

describe('relevance still decides, and rotation only breaks ties', () => {
  it('a more relevant item leads even when it is the most spent one', () => {
    // ⚠️ THE FAILURE THIS FORBIDS. Sorting the pool by spend would hand a phone
    // review a generic business claim ahead of the phone — the same objection
    // SUBSTANCE_FLOOR's note records, restated because this is the second rule
    // that could cause it.
    expect(orderForSupply(POOL)[0].id).toBe('more-relevant')
  })

  it('within one relevance score, the least-spent item leads', () => {
    const ids = orderForSupply(POOL).map((r) => r.id)
    const tier = ids.slice(1, 6)
    // never / unstamped are both "never supplied"; incoming order breaks that tie.
    expect(tier.slice(0, 2).sort()).toEqual(['never', 'unstamped'])
    expect(tier.slice(2)).toEqual(['once-old', 'once-new', 'five'])
  })

  it('count outranks recency: five-times-long-ago never leads once-yesterday', () => {
    const ids = rotateWithinBucket([
      { id: 'five', used_count: 5, last_used_at: ago(400) },
      { id: 'once', used_count: 1, last_used_at: ago(1) },
    ]).map((r) => r.id)
    expect(ids).toEqual(['once', 'five'])
  })

  it('an unstamped row reads as never supplied, so the whole store still rotates', () => {
    // ⚠️ THE DIRECTION THAT MATTERS. Defaulting an absent count the other way
    // would bury every row written before 0215 — which is all of them on the day
    // this ships.
    expect(spend({}).count).toBe(0)
    expect(spend({ used_count: null, last_used_at: null }).at).toBe(0)
    expect(spend({ used_count: -4 }).count).toBe(0)
    expect(spend({ last_used_at: 'not a date' }).at).toBe(0)
  })

  it('equal spend keeps the incoming order, because the sort must be stable', () => {
    const bucket = [
      { id: 'a', used_count: 2, last_used_at: ago(5) },
      { id: 'b', used_count: 2, last_used_at: ago(5) },
      { id: 'c', used_count: 2, last_used_at: ago(5) },
    ]
    expect(rotateWithinBucket(bucket).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('an empty pool is an empty answer, not a throw', () => {
    expect(orderForSupply([])).toEqual([])
    expect(rotateWithinBucket([])).toEqual([])
  })
})
