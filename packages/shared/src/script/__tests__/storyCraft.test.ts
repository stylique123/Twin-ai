import { describe, it, expect } from 'vitest'
import { storyCraft } from '../storyCraft.js'

const MOM = 'Someone told me they could taste the difference between my roast and the grocery store bag their mom always bought, and it was the first time I felt like I actually knew what I was doing.'
const SUPPLIER = 'I bought a batch of green beans from a new supplier without testing a small sample first, and the whole lot roasted uneven and had to be tossed.'

describe('storyCraft (owner brief 2026-10-05)', () => {
  it('blind set 2 #3: two stories stitched, the customer story told twice', () => {
    const r = storyCraft([
      'Someone told me this ruined regular grocery store coffee.',
      'Early on, I bought a batch of green beans from a new supplier without testing a tiny sample first, and the entire lot roasted unevenly and had to be tossed.',
      'Someone told me they could taste the difference between my roast and the grocery store bag their mom always bought, and it was the first time I felt like I actually knew what I was doing.',
    ], [MOM, SUPPLIER])
    expect(r.storiesUsed).toBe(2)
    expect(r.tellings).toBeGreaterThanOrEqual(1)
  })
  it('one story kept in her words, with a close that follows from it', () => {
    const r = storyCraft([
      'I learned the hard way to test every sample.',
      'I bought a batch of green beans from a new supplier without testing a small sample first, and the whole lot roasted uneven and had to be tossed.',
      'Now every new supplier sends a sample first.',
      'What did you learn the hard way about a new supplier? Tell me below.',
    ], [MOM, SUPPLIER])
    expect(r.storiesUsed).toBe(1)
    expect(r.retention).toBeGreaterThan(0.8)
    expect(r.askFollows).toBe(true)
  })
  it('no story: nothing to judge', () => {
    expect(storyCraft(['Fresh beans taste better.'], [MOM])).toEqual({ storiesUsed: 0, retention: null, tellings: 0, askFollows: null })
  })
})
