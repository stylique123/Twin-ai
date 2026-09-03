import { describe, expect, it } from 'vitest'
import { widenForYou } from './Gallery'

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
