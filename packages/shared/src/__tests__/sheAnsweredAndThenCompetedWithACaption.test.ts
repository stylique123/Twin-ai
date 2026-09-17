// SHE ANSWERED THE QUESTION AND THEN COMPETED WITH A CAPTION FOR THE SLOT.
//
// ⚠️ MEASURED. 21 `asked` rows exist; 21 of them are substance (100%, against
// 17% for captions), they average 166 characters against 59, and 14 carry a
// first-person episode. They are the highest-yield material in the store by every
// measure taken — and they were ranked by LEXICAL OVERLAP with the video's topic,
// which is the one axis they are worst at: an answer about what she wasted money
// on shares no words with a video about rebinding a Bible, scores zero, and loses
// its slot to "she made a video about leather".
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { transformSync } from 'esbuild'
import { ASKED_RESERVED_MAX, reserveAsked, wasAsked } from '../askedReservation'
import { SUBSTANCE_KINDS, selectSpeakable } from '../knowledgeSelection'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

const START = '// ── THE ANSWERS SHE TYPED HOLD SLOTS, INLINED ─'
const END = '// ── END ASKED RESERVATION ─'

interface Row { id: string; kind: string; source: string | null }

function loadInline() {
  const a = EDGE.indexOf(START)
  expect(a, 'asked-reservation start marker missing — restore it').toBeGreaterThan(-1)
  const b = EDGE.indexOf(END, a)
  expect(b, 'asked-reservation END marker missing — restore it').toBeGreaterThan(a)
  const js = transformSync(EDGE.slice(a, b), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return { reserveAskedInline, wasAskedInline, ASKED_RESERVED_MAX_INLINE }`)() as {
    reserveAskedInline: (r: readonly Row[], cap: number, max?: number) => { reserved: Row[]; pool: Row[] }
    wasAskedInline: (i: { source?: string | null }) => boolean
    ASKED_RESERVED_MAX_INLINE: number
  }
}

const asked = (id: string, kind = 'experience'): Row => ({ id, kind, source: 'asked' })
const caption = (id: string): Row => ({ id, kind: 'topic', source: 'caption' })
const spoken = (id: string, kind = 'claim'): Row => ({ id, kind, source: 'transcript' })

describe('the edge copy of the reservation matches the shared one', () => {
  const inline = loadInline()

  it('holds the same number, which is the whole behaviour', () => {
    expect(inline.ASKED_RESERVED_MAX_INLINE).toBe(ASKED_RESERVED_MAX)
  })

  it('splits every pool identically', () => {
    const pools: Row[][] = [
      [],
      [caption('c1')],
      [asked('a1')],
      [caption('c1'), asked('a1'), spoken('s1'), asked('a2')],
      [asked('a1'), asked('a2'), asked('a3'), asked('a4'), asked('a5'), asked('a6'), caption('c1')],
      [{ id: 'nosource', kind: 'claim', source: null }, asked('a1')],
    ]
    let compared = 0
    for (const pool of pools) {
      for (const cap of [0, 1, 3, 10]) {
        const a = reserveAsked(pool, cap)
        const b = inline.reserveAskedInline(pool, cap)
        expect(b.reserved.map((r) => r.id), `reserved drift, cap ${cap}`).toEqual(a.reserved.map((r) => r.id))
        expect(b.pool.map((r) => r.id), `pool drift, cap ${cap}`).toEqual(a.pool.map((r) => r.id))
        compared += 1
      }
    }
    expect(compared).toBe(pools.length * 4)
  })

  it('agrees on what an answer is: source, never basis', () => {
    // ⚠️ A TYPED ANSWER IS `stated`, AND SO IS A TRANSCRIBED CLAIM. Only `source`
    // says who put it there — 0189 made 'asked' an allowed source for this.
    for (const v of ['asked', 'transcript', 'caption', '', null, undefined]) {
      expect(inline.wasAskedInline({ source: v as string | null }))
        .toBe(wasAsked({ source: v as string | null }))
    }
    expect(wasAsked({ source: 'asked' })).toBe(true)
    expect(wasAsked({ kind: 'claim' })).toBe(false)
  })
})

describe('a reservation, not a promotion', () => {
  it('an answer with zero topical overlap still reaches the writer', () => {
    // The defect, stated as a case: nine caption rows that all match the topic,
    // and one answer that matches nothing.
    const pool = [...Array.from({ length: 9 }, (_, i) => caption(`c${i}`)), asked('a1')]
    const { reserved, pool: rest } = reserveAsked(pool, 10)
    const out = [...reserved, ...selectSpeakable(rest, 10 - reserved.length, 0)]
    expect(out.map((r) => r.id)).toContain('a1')
    expect(out).toHaveLength(10)
  })

  it('but it cannot take the whole prompt', () => {
    // ⚠️ THE OPPOSITE FAILURE IS REAL. A creator who answered ten questions must
    // not get a prompt of ten answers and nothing about the video she asked for.
    const pool = [...Array.from({ length: 10 }, (_, i) => asked(`a${i}`)), caption('c1')]
    const { reserved, pool: rest } = reserveAsked(pool, 10)
    expect(reserved).toHaveLength(ASKED_RESERVED_MAX)
    // ⚖️ AND THE UNRESERVED ANSWERS ARE STILL IN THE RUNNING — being passed over
    // must not make a fifth answer worth less than a caption.
    expect(rest.filter(wasAsked)).toHaveLength(6)
    expect(rest.map((r) => r.id)).toContain('c1')
  })

  it('preserves the caller\'s order on both sides, so rotation still decides which', () => {
    const pool = [asked('a1'), caption('c1'), asked('a2'), caption('c2'), asked('a3')]
    const { reserved, pool: rest } = reserveAsked(pool, 10, 2)
    expect(reserved.map((r) => r.id)).toEqual(['a1', 'a2'])
    expect(rest.map((r) => r.id)).toEqual(['c1', 'c2', 'a3'])
  })

  it('a store with no answers is byte-identical to before', () => {
    const pool = [caption('c1'), spoken('s1'), caption('c2')]
    const { reserved, pool: rest } = reserveAsked(pool, 10)
    expect(reserved).toEqual([])
    expect(rest).toEqual(pool)
  })

  it('every asked row in production is substance, so the floor debit is real', () => {
    // ⚖️ WHY THE EDGE DEBITS THE SUBSTANCE FLOOR BY THE RESERVED SUBSTANCE. A
    // reserved answer that is itself substance already satisfies the guarantee;
    // counting it twice would reserve substance for the second time and starve
    // the slots the video's subject needs.
    for (const kind of ['experience', 'claim', 'opinion', 'framework']) {
      expect(SUBSTANCE_KINDS.has(kind)).toBe(true)
    }
    expect(SUBSTANCE_KINDS.has('topic')).toBe(false)
  })
})

describe('the reservation is wired, not merely written', () => {
  const code = EDGE.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

  it('the selection calls it and prepends what it held', () => {
    expect(code).toMatch(/const askedHold = reserveAskedInline\(focusOrdered, 10\)/)
    expect(code).toMatch(/\.\.\.askedHold\.reserved,/)
    expect(code).toMatch(/selectSpeakable\(\s*\n?\s*askedHold\.pool,/)
  })

  it('the cap is spent once, never twice', () => {
    // A reservation that did not reduce the cap would supply up to fourteen items
    // to a prompt built for ten.
    expect(code).toMatch(/10 - askedHold\.reserved\.length/)
    expect(code).toMatch(/Math\.max\(0, intent\.substanceFloor - askedSubstance\)/)
  })
})
