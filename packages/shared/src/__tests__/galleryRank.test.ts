// The rules this file holds:
//
//   1. All seven signals come back, always, in a stable order. A shorter list
//      would let one niche comparison look like a seven-signal judgement.
//   2. Nothing produces a number a creator could read as a rating (§1.2).
//   3. A cross-niche reference is NOT a mismatch — it is unchecked.
//   4. An absent reach figure is not the smallest reach.
import { describe, expect, it } from 'vitest'
import {
  blockedSignals, cardReasons, compareByFit, GALLERY_SIGNALS, rankSignals, signalsAnswered,
  type GalleryFacts, type NicheRelation,
} from '../galleryRank'

const facts = (over: Partial<GalleryFacts> = {}): GalleryFacts => ({
  nicheRelation: 'same_niche', reach: 1000, likes: 100, ...over,
})

describe('all seven, always, in order', () => {
  it('returns every signal whatever the facts', () => {
    for (const rel of ['same_sub_niche', 'same_niche', 'related', 'unrelated', 'unknown'] as NicheRelation[]) {
      const s = rankSignals(facts({ nicheRelation: rel }))
      expect(s.map((x) => x.id)).toEqual([...GALLERY_SIGNALS])
    }
  })

  it('six are not_checked and each says what it needs', () => {
    const s = rankSignals(facts())
    const blocked = blockedSignals(s)
    expect(blocked).toHaveLength(6)
    // A blocked signal with no `needs` is an open question pretending to be a
    // task. Every one of these names the field that unblocks it.
    for (const b of blocked) expect(b.needs!.length).toBeGreaterThan(20)
  })

  it('production-mode match names the REFERENCE half as the missing one', () => {
    // §7a says "the flags already carry it". They carry the creator's half.
    const s = rankSignals(facts())
    const pm = s.find((x) => x.id === 'production_mode_match')!
    expect(pm.status).toBe('not_checked')
    expect(pm.needs).toMatch(/reference/i)
  })

  it('freshness refuses the scrape date as a substitute', () => {
    const f = rankSignals(facts()).find((x) => x.id === 'freshness')!
    expect(f.needs).toMatch(/scrape date is not it/i)
  })

  it('counts what was answered, and does not score', () => {
    expect(signalsAnswered(rankSignals(facts({ nicheRelation: 'same_niche' })))).toBe(1)
    expect(signalsAnswered(rankSignals(facts({ nicheRelation: 'unknown' })))).toBe(0)
  })
})

describe('§1.2 — the reason, never the score', () => {
  it('no reason or needs text reads as a rating', () => {
    // A percentage, an "x/100", or a "9.6" is the failure §1.2 is named for.
    const bad = /\d+\s*%|\d\s*\/\s*(10|100)\b|\b\d+\.\d\s*(out of|\/)/i
    for (const rel of ['same_sub_niche', 'same_niche', 'related', 'unrelated', 'unknown'] as NicheRelation[]) {
      for (const s of rankSignals(facts({ nicheRelation: rel }))) {
        expect(s.reason).not.toMatch(bad)
        expect(s.reason).not.toMatch(/\bscore\b/i)
        if (s.needs) expect(s.needs).not.toMatch(bad)
      }
    }
  })

  it('a card shows only what was established, and nothing when nothing was', () => {
    expect(cardReasons(rankSignals(facts({ nicheRelation: 'same_niche' })))).toHaveLength(1)
    // Six "we have not checked" lines on a card would say nothing at all.
    expect(cardReasons(rankSignals(facts({ nicheRelation: 'unknown' })))).toEqual([])
  })
})

describe('a different niche is not a wrong answer', () => {
  it('unrelated is NOT_CHECKED, never a mismatch', () => {
    // A cross-niche format is often the one worth stealing from; marking it
    // wrong would hide exactly that.
    const d = rankSignals(facts({ nicheRelation: 'unrelated' })).find((s) => s.id === 'dna_match')!
    expect(d.status).toBe('not_checked')
  })

  it('an unknown niche says so rather than blaming the reference', () => {
    const d = rankSignals(facts({ nicheRelation: 'unknown' })).find((s) => s.id === 'dna_match')!
    expect(d.reason).toMatch(/we do not know your niche/i)
  })
})

describe('ordering', () => {
  const order = (list: GalleryFacts[]) => [...list].sort(compareByFit)

  it('niche fit leads, and reach only breaks a tie', () => {
    const huge = facts({ nicheRelation: 'unrelated', reach: 30_000_000 })
    const mine = facts({ nicheRelation: 'same_sub_niche', reach: 1_000 })
    // A video with thirty million views is not thereby a better fit for this
    // creator; letting reach lead turns the gallery into a list of the biggest.
    expect(order([huge, mine])[0]).toBe(mine)
  })

  it('within one relation, the bigger measured reach comes first', () => {
    const a = facts({ nicheRelation: 'same_niche', reach: 100 })
    const b = facts({ nicheRelation: 'same_niche', reach: 900 })
    expect(order([a, b])[0]).toBe(b)
  })

  it('an ABSENT reach is not the smallest reach', () => {
    const measured = facts({ nicheRelation: 'same_niche', reach: 1 })
    const unmeasured = facts({ nicheRelation: 'same_niche', reach: null })
    // It sorts after a measured card, but because it is unmeasured — not
    // because it was measured at zero.
    expect(order([unmeasured, measured])[0]).toBe(measured)
    expect(order([unmeasured, measured])[1]).toBe(unmeasured)
  })

  it('unrelated sorts BELOW unknown — a known mismatch is weaker than no answer', () => {
    const unknown = facts({ nicheRelation: 'unknown', reach: 1 })
    const unrelated = facts({ nicheRelation: 'unrelated', reach: 1_000_000 })
    expect(order([unrelated, unknown])[0]).toBe(unknown)
  })
})
