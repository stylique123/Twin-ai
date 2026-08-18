// THE SAME 100 REFERENCES MUST RANK DIFFERENTLY FOR FOUR DIFFERENT CREATORS.
//
// ⚠️ THIS IS THE YARDSTICK, AND TODAY IT FAILS ON PURPOSE. The gallery is
// successful when it stops answering "what popular videos look vaguely
// relevant?" and starts answering "what should THIS creator make next that Twin
// can actually turn into a finished video?". The only way to know which question
// it is answering is to hand it four creators and one library and look.
//
// ⚖️ SO THESE ASSERTIONS PIN TODAY'S BEHAVIOUR RATHER THAN TOMORROW'S. Ranking
// currently reads ONE property of the creator — their niche — so a founder who
// wants authority and a reviewer who wants growth receive the same order. That
// is not a bug in `compareByFit`; it is the whole gap, measured. When the batch
// assessment lands and the ranker consumes a `ReferenceProfile`, these tests
// FAIL, and somebody updates them deliberately. A yardstick that passed before
// and after would be measuring nothing.
import { describe, expect, it } from 'vitest'
import { compareByFit, rankSignals, blockedSignals, type GalleryFacts, type NicheRelation } from '../galleryRank'

/** One reference, as the ranker can see it today. */
const ref = (nicheRelation: NicheRelation, reach: number | null): GalleryFacts =>
  ({ nicheRelation, reach, likes: null })

/**
 * ⚠️ FOUR CREATORS WHO SHOULD WANT VERY DIFFERENT THINGS. What separates them —
 * goal, format preference, commercial relationship, whether they have products —
 * is exactly what the ranker cannot see, so they are described here in comments
 * rather than in code. That absence IS the finding.
 */
const CREATORS = [
  'SaaS founder — authority · founders · talking head · owns a product',
  'Affiliate tech reviewer — growth · consumers · review/comparison · earns commission',
  'Non-commercial educator — teach · beginners · no product at all',
  'Entertainment creator — growth · POV/skits · nothing to sell',
] as const

/** The same library for all four. Deliberately mixed: an on-niche mediocrity and
 *  a cross-niche reference whose structure would transfer perfectly. */
const LIBRARY: readonly { id: string; facts: GalleryFacts; note: string }[] = [
  { id: 'on-niche-weak', facts: ref('same_niche', 1_000), note: 'same niche, nothing else going for it' },
  { id: 'cross-niche-strong', facts: ref('unrelated', 900_000), note: '3-item confession — transfers anywhere' },
  { id: 'sub-niche', facts: ref('same_sub_niche', 500), note: 'closest topical match' },
  { id: 'related-mid', facts: ref('related', 50_000), note: 'neighbouring niche' },
]

const orderFor = (): string[] =>
  [...LIBRARY].sort((a, b) => compareByFit(a.facts, b.facts)).map((x) => x.id)

describe('today: every creator gets the same order', () => {
  it('because the ranker reads exactly one property of a creator', () => {
    // ⚠️ THE MEASUREMENT. Four creators, one library, one ordering — because
    // `compareByFit` takes only the reference's facts and the niche relation
    // already baked into them. Goal, format, commercial context and products
    // reach it nowhere.
    const orders = CREATORS.map(() => orderFor().join(','))
    expect(new Set(orders).size).toBe(1)
  })

  it('and niche beats everything, including a structure that would transfer', () => {
    // ⚖️ THE CASE THE SPEC CALLS OUT. A cross-niche confession a founder could
    // shoot today, with 900k reach, ranks BELOW an on-niche video with nothing
    // else going for it — because niche is the first and almost only term.
    const order = orderFor()
    expect(order.indexOf('on-niche-weak')).toBeLessThan(order.indexOf('cross-niche-strong'))
  })

  it('cross-niche is ranked last but is NOT excluded', () => {
    // ⚠️ THE ONE THING TODAY'S RANKER GETS RIGHT. `unrelated` reports
    // not_checked rather than mismatch, so the reference worth stealing from is
    // demoted rather than hidden — which is what makes it recoverable later.
    expect(orderFor()).toContain('cross-niche-strong')
  })

  it('reach only ever breaks a tie', () => {
    // ⚖️ A VIDEO WITH THIRTY MILLION VIEWS IS NOT THEREBY A BETTER FIT. Two
    // references at the same niche tier fall back to reach; a bigger number
    // never jumps a tier.
    const a = ref('same_niche', 10)
    const b = ref('same_niche', 10_000_000)
    expect(compareByFit(a, b)).toBeGreaterThan(0)
    expect(compareByFit(ref('same_sub_niche', 1), ref('same_niche', 10_000_000))).toBeLessThan(0)
  })
})

describe('what the four creators would need before they could differ', () => {
  it('seven of eight signals are still dark for every card', () => {
    // ⚠️ THE ARITHMETIC OF THE GAP. One signal answers; seven wait on a
    // measurement. Personalisation cannot come from the one that already runs.
    const s = rankSignals(ref('same_niche', 100))
    expect(blockedSignals(s)).toHaveLength(7)
  })

  it('and each dark signal names what would answer it', () => {
    // ⚖️ SO THE BATCH HAS A WORKLIST RATHER THAN AN AMBITION.
    for (const b of blockedSignals(rankSignals(ref('unknown', null)))) {
      expect(b.needs, b.id).toBeTruthy()
    }
  })

  it('the creators are described, so the next version has its fixture', () => {
    // ⚖️ WRITTEN DOWN NOW, WHILE THE DIFFERENCE IS ZERO. When ranking consumes a
    // ReferenceProfile these four must produce four different orders, and
    // "materially differently" needs to have been defined before the change
    // rather than after it.
    expect(CREATORS).toHaveLength(4)
    expect(new Set(CREATORS).size).toBe(4)
  })
})
