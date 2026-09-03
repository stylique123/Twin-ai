import { describe, expect, it } from 'vitest'
import { dedupeByUrl, widenForYou } from './Gallery'

// "For you" widened silently: fewer than six cards in the creator's own niche
// tiers and we swapped in the whole shelf without changing a word on screen.
// The creator then read other people's niches as a recommendation. These tests
// pin the decision AND the fact that has to reach them.
const all = Array.from({ length: 20 }, (_, i) => i)

describe('widenForYou', () => {
  it('keeps the narrow page when it can fill the shelf', () => {
    const relevant = [1, 2, 3, 4, 5, 6]
    const r = widenForYou(relevant, all)
    expect(r.cards).toEqual(relevant)
    expect(r.widened).toBe(false)
  })

  it('does not widen at exactly the minimum', () => {
    expect(widenForYou([1, 2, 3, 4, 5, 6], all).widened).toBe(false)
  })

  it('widens to the whole shelf when the niche is too thin', () => {
    const r = widenForYou([1, 2, 3], all)
    expect(r.cards).toEqual(all)
    expect(r.widened).toBe(true)
  })

  it('SAYS SO when it widens — the silence was the bug', () => {
    expect(widenForYou([1], all).widened).toBe(true)
  })

  // An empty niche is not a widening. There was no narrower page to replace, so
  // "not enough in your niche" would be a claim about an assessment we never ran.
  it('is silent when there was nothing to narrow to', () => {
    const r = widenForYou([], all)
    expect(r.cards).toEqual(all)
    expect(r.widened).toBe(false)
  })

  it('honours a different minimum', () => {
    expect(widenForYou([1, 2, 3], all, 3).widened).toBe(false)
    expect(widenForYou([1, 2, 3], all, 4).widened).toBe(true)
  })
})

// ── The same video, up to 51 times ────────────────────────────────────────────
// Measured in production 2026-09-03: 13,765 gallery_items rows over 5,318
// distinct URLs. No unique index on `url`; the daily ingest re-inserts what it
// re-discovers. Per-day rows and URLs match exactly, so the duplication is
// entirely across days.
const card = (over: Partial<Parameters<typeof dedupeByUrl<Row>>[0][number]> & { url: string }) => ({
  label: 'Community pick', hook: over.url, creator: 'creator', reach: '·', loves: '·', ...over,
})
type Row = { url: string; label: string; hook: string; creator: string; reach: string; loves: string }

describe('dedupeByUrl', () => {
  it('leaves a already-unique list untouched, in order', () => {
    const rows = [card({ url: 'a' }), card({ url: 'b' }), card({ url: 'c' })]
    expect(dedupeByUrl(rows).map((r) => r.url)).toEqual(['a', 'b', 'c'])
  })

  it('collapses the same URL however many times it repeats', () => {
    const rows = Array.from({ length: 51 }, () => card({ url: 'a' }))
    expect(dedupeByUrl(rows)).toHaveLength(1)
  })

  it('keeps the richest row, not merely the first', () => {
    const thin = card({ url: 'a' })
    const rich = card({ url: 'a', label: 'The real title', creator: 'Alex', reach: '2.1M' })
    expect(dedupeByUrl([thin, rich])[0]).toBe(rich)
    expect(dedupeByUrl([rich, thin])[0]).toBe(rich)
  })

  // A tie must not reshuffle the page: the query's order is the only ordering
  // signal we have before the assessment lands, and 87% of the shelf has none.
  it('keeps the first row on a tie, preserving query order', () => {
    const first = card({ url: 'a', label: 'Same' })
    const second = card({ url: 'a', label: 'Same' })
    expect(dedupeByUrl([first, second])[0]).toBe(first)
  })

  it('holds the position of the first sighting, not the winner', () => {
    const rows = [card({ url: 'a' }), card({ url: 'b' }), card({ url: 'a', reach: '9M' })]
    expect(dedupeByUrl(rows).map((r) => r.url)).toEqual(['a', 'b'])
    expect(dedupeByUrl(rows)[0]!.reach).toBe('9M')
  })

  it('does not treat a fallback as content', () => {
    // `fromDb` fills every field, so "Community pick" and "·" are absence.
    const fallbacks = card({ url: 'a' })
    const real = card({ url: 'a', hook: 'I quit my job at 3am' })
    expect(dedupeByUrl([fallbacks, real])[0]).toBe(real)
  })

  it('is empty for an empty shelf', () => {
    expect(dedupeByUrl([])).toEqual([])
  })
})
