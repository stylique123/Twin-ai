import { describe, it, expect } from 'vitest'
import { reachOf, byReachDesc, averagePlays } from '../reach'

describe('reachOf — absent is not zero', () => {
  it('reads a play count', () => {
    expect(reachOf({ plays: 5000, likes: 20 })).toBe(5000)
  })

  // ⚠️ THE VALUE THE OLD `||` DESTROYED.
  it('ZERO plays is a real answer and does not fall through to likes', () => {
    expect(reachOf({ plays: 0, likes: 42 })).toBe(0)
  })

  it('falls back to likes only when plays was not read', () => {
    expect(reachOf({ plays: null, likes: 42 })).toBe(42)
    expect(reachOf({ likes: 42 })).toBe(42)
  })

  it('returns null when neither was read — never 0', () => {
    expect(reachOf({ plays: null, likes: null })).toBeNull()
    expect(reachOf({})).toBeNull()
  })

  it('a zero-likes post with no plays reaches on zero, not on nothing', () => {
    expect(reachOf({ plays: null, likes: 0 })).toBe(0)
  })

  it('a non-finite number is not read', () => {
    expect(reachOf({ plays: NaN, likes: null })).toBeNull()
    expect(reachOf({ plays: Infinity, likes: 7 })).toBe(7)
  })
})

describe('byReachDesc — an unread post sorts last WITHOUT being called a flop', () => {
  const sorted = (ps: { id: string; plays?: number | null; likes?: number | null }[]) =>
    [...ps].sort(byReachDesc).map((p) => p.id)

  it('orders by reach, best first', () => {
    expect(sorted([
      { id: 'low', plays: 10 }, { id: 'high', plays: 9000 }, { id: 'mid', plays: 500 },
    ])).toEqual(['high', 'mid', 'low'])
  })

  // ⚠️ THE RANKING BUG. The old comparator put an unread post BELOW a post with
  // one view, and the scan then studied the survivors as the creator's winners.
  it('an unread post goes last, but reachOf still says it is unknown', () => {
    const posts = [
      { id: 'unread', plays: null, likes: null },
      { id: 'one_view', plays: 1 },
    ]
    expect(sorted(posts)).toEqual(['one_view', 'unread'])
    expect(reachOf(posts[0])).toBeNull()
    expect(reachOf(posts[1])).toBe(1)
  })

  it('a genuine zero outranks an unread post', () => {
    expect(sorted([{ id: 'unread', plays: null }, { id: 'flopped', plays: 0 }]))
      .toEqual(['flopped', 'unread'])
  })

  it('two unread posts keep their relative order', () => {
    expect(sorted([{ id: 'a', plays: null }, { id: 'b', plays: null }])).toEqual(['a', 'b'])
  })

  it('a whole catalogue with no counts does not throw and does not reorder', () => {
    expect(sorted([{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toEqual(['a', 'b', 'c'])
  })
})

describe('averagePlays — divide by what was counted, and say how much that was', () => {
  it('averages the posts that carry a number', () => {
    expect(averagePlays([{ plays: 100 }, { plays: 200 }, { plays: 300 }]))
      .toEqual({ average: 200, counted: 3, total: 3 })
  })

  // ⚠️ THE SILENT UNDERSTATEMENT. Old: (100+200)/3 = 100. The two posts we could
  // read average 150, and one in three being unreadable is a fact worth having.
  it('an unread post does not drag the average down', () => {
    expect(averagePlays([{ plays: 100 }, { plays: 200 }, { plays: null }]))
      .toEqual({ average: 150, counted: 2, total: 3 })
  })

  it('a genuine zero DOES count toward the average', () => {
    expect(averagePlays([{ plays: 0 }, { plays: 100 }]))
      .toEqual({ average: 50, counted: 2, total: 2 })
  })

  // ⚠️ NULL, NOT 0. A creator whose platform withheld every count has not been
  // measured as having no audience.
  it('nothing readable yields null, never zero', () => {
    expect(averagePlays([{ plays: null }, { plays: null }]).average).toBeNull()
    expect(averagePlays([]).average).toBeNull()
  })

  it('reports its own coverage so a reader can tell a sample from a census', () => {
    const r = averagePlays([{ plays: 9 }, { plays: null }, { plays: null }, { plays: null }])
    expect(r.counted).toBe(1)
    expect(r.total).toBe(4)
    // 1 of 4 and 4 of 4 are different claims and this is what makes them tellable.
    expect(r.counted).not.toBe(r.total)
  })

  it('rounds rather than emitting a fraction of a view', () => {
    expect(averagePlays([{ plays: 1 }, { plays: 2 }]).average).toBe(2)
  })
})
