import { describe, it, expect } from 'vitest'
import { medianPlays, bandFor, whatWorks, messageForWhatWorks, timesTheirNormal, MIN_MEASURED_FOR_A_CLAIM } from '../ownPerformance'

const p = (plays: number | null, url = `u${Math.random()}`) => ({ plays, url })

describe('the median, not the mean', () => {
  it('takes the middle of the distribution', () => {
    expect(medianPlays([p(1), p(2), p(3)])).toBe(2)
    expect(medianPlays([p(1), p(2), p(3), p(4)])).toBe(2.5)
  })

  // ⚠️ THE PHYSIO'S SHAPE: one 543,300 parody against a median of 588. The mean
  // would be ~23x the median and would call his ordinary posts failures.
  it('one outlier does not move it', () => {
    const posts = [...Array.from({ length: 49 }, () => p(588)), p(543_300)]
    expect(medianPlays(posts)).toBe(588)
  })

  // ⚠️ UNREAD IS EXCLUDED, NOT ZEROED — zeroing would drag the median down and
  // relabel a whole catalogue as quiet.
  it('an unread count is excluded from the median', () => {
    expect(medianPlays([p(100), p(200), p(null), p(null)])).toBe(150)
  })

  it('nothing readable yields null, never 0', () => {
    expect(medianPlays([p(null), p(null)])).toBeNull()
    expect(medianPlays([])).toBeNull()
  })
})

describe('a hit is relative to your own account', () => {
  // ⚠️⚠️ THE MEASURED CASE. The mechanic's MEDIAN (37,000) is 63x the physio's
  // (588). An absolute threshold calls every physio post a failure.
  it('3,000 views is a breakout for the physio and quiet for the mechanic', () => {
    expect(bandFor(3_000, 588)).toBe('breakout')
    expect(bandFor(3_000, 37_000)).toBe('quiet')
  })

  it('the physio parody is a breakout at 924x his median', () => {
    expect(bandFor(543_300, 588)).toBe('breakout')
  })

  it('bands split at 5x, 2x and 0.5x', () => {
    expect(bandFor(5_000, 1_000)).toBe('breakout')
    expect(bandFor(2_000, 1_000)).toBe('strong')
    expect(bandFor(1_000, 1_000)).toBe('typical')
    expect(bandFor(499, 1_000)).toBe('quiet')
  })

  // ⚠️ A BAND IS A CLAIM ABOUT PERFORMANCE. We have not measured one for a post
  // whose number never arrived.
  it('an unread count has NO band — not "quiet"', () => {
    expect(bandFor(null, 1_000)).toBeNull()
    expect(bandFor(undefined, 1_000)).toBeNull()
  })

  it('no median means no band, rather than dividing by zero', () => {
    expect(bandFor(5_000, null)).toBeNull()
    expect(bandFor(5_000, 0)).toBeNull()
  })

  it('a genuine zero is quiet, not unmeasured', () => {
    expect(bandFor(0, 1_000)).toBe('quiet')
  })
})

describe('whatWorks reports its own coverage', () => {
  it('separates unmeasured posts from quiet ones', () => {
    const r = whatWorks([p(10_000), p(1_000), p(null), p(null)])
    expect(r.unmeasured).toBe(2)
    expect(r.counted).toBe(2)
    expect(r.total).toBe(4)
    // ⚖️ Median of the two READ posts is 5,500, so 1,000 is 0.18x — genuinely
    // quiet. The point of the assertion is that `unmeasured` is 2 and did NOT
    // get folded in here: quiet counts one post, not three.
    expect(r.bands.quiet).toBe(1)
  })

  it('returns breakouts best-first', () => {
    // Median of [1000, 1000, 1000, 20000, 50000] is 1,000, so both outliers
    // clear 5x comfortably.
    const r = whatWorks([p(1_000), p(50_000), p(20_000), p(1_000), p(1_000)])
    expect(r.breakouts.map((b) => b.plays)).toEqual([50_000, 20_000])
  })

  // ⚠️ THE WIDE BAND EARNING ITS KEEP. A 4.76x post is NOT a breakout, and the
  // first version of this test assumed it was — the threshold is what stops
  // "breakout" from meaning "above average", which would be half the catalogue.
  it('4.76x is strong, not a breakout', () => {
    const r = whatWorks([p(1_000), p(50_000), p(20_000), p(1_000)])
    expect(r.median).toBe(10_500)
    expect(r.breakouts).toEqual([])
    expect(r.bands.strong).toBe(1)
  })

  // ⚠️ THE PHYSIO'S REAL SHAPE, from scraped_posts: median 588, 9 posts at or
  // above 2x, and the parody at 543,300.
  it('reproduces the physio shape', () => {
    const posts = [
      p(543_300), p(70_600), p(23_100), p(8_438), p(7_147), p(4_975), p(4_363), p(2_589), p(1_783),
      ...Array.from({ length: 41 }, () => p(588)),
    ]
    const r = whatWorks(posts)
    expect(r.median).toBe(588)
    expect(r.bands.breakout + r.bands.strong).toBe(9)
    expect(r.breakouts[0].plays).toBe(543_300)
    expect(r.unmeasured).toBe(0)
  })

  it('a catalogue with no counts reports nothing rather than everything', () => {
    const r = whatWorks([p(null), p(null)])
    expect(r.median).toBeNull()
    expect(r.counted).toBe(0)
    expect(r.unmeasured).toBe(2)
    expect(r.breakouts).toEqual([])
  })

  it('an empty catalogue does not throw', () => {
    expect(whatWorks([])).toMatchObject({ median: null, counted: 0, total: 0, unmeasured: 0 })
  })
})

describe('whether there is anything honest to say', () => {
  const posts = (n: number, plays: number) => Array.from({ length: n }, () => p(plays))

  // ⚠️ SILENCE IS THE DEFAULT AND NOT A FAILURE. A flat account is a fine thing
  // to have and a terrible thing to be told about in a "what works" card.
  it('says nothing when no post stands out', () => {
    expect(messageForWhatWorks(whatWorks(posts(20, 1_000))).kind).toBe('silent')
  })

  it('says nothing when too few posts carry a count', () => {
    const thin = [...posts(5, 1_000), p(50_000), ...Array.from({ length: 30 }, () => p(null))]
    const w = whatWorks(thin)
    expect(w.counted).toBeLessThan(MIN_MEASURED_FOR_A_CLAIM)
    expect(messageForWhatWorks(w).kind).toBe('silent')
  })

  it('says nothing when nothing was measured at all', () => {
    expect(messageForWhatWorks(whatWorks(Array.from({ length: 40 }, () => p(null)))).kind).toBe('silent')
  })

  // ⚠️ THE PHYSIO CASE: 50 measured posts, median 588, a 543,300 parody.
  it('speaks when a real outlier exists over enough measured posts', () => {
    const w = whatWorks([...posts(48, 588), p(543_300), p(70_600)])
    const m = messageForWhatWorks(w)
    expect(m.kind).toBe('breakouts')
    if (m.kind !== 'breakouts') return
    expect(m.median).toBe(588)
    expect(m.best.plays).toBe(543_300)
    expect(m.alsoRan).toBe(1)
    expect(m.counted).toBe(50)
  })

  it('reports the multiple the way a person reads it', () => {
    expect(timesTheirNormal(543_300, 588)).toBe(924)
    expect(timesTheirNormal(3_000, 588)).toBe(5)
  })

  it('a zero or missing median cannot produce a multiple', () => {
    expect(timesTheirNormal(1_000, 0)).toBe(0)
    expect(timesTheirNormal(Number.NaN, 588)).toBe(0)
  })
})
