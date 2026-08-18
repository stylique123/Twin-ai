// The rules this file holds:
//
//   1. All EIGHT signals come back, always, in a stable order. A shorter list
//      would let one niche comparison look like a full judgement.
//      (`commercial_fit` was added when it became clear it had been living
//      inside content_availability: whether Twin CAN fill a format and whether
//      this creator is ALLOWED to make it are different questions.)
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

describe('all eight, always, in order', () => {
  it('returns every signal whatever the facts', () => {
    for (const rel of ['same_sub_niche', 'same_niche', 'related', 'unrelated', 'unknown'] as NicheRelation[]) {
      const s = rankSignals(facts({ nicheRelation: rel }))
      expect(s.map((x) => x.id)).toEqual([...GALLERY_SIGNALS])
    }
  })

  it('seven are not_checked and each says what it needs', () => {
    const s = rankSignals(facts())
    const blocked = blockedSignals(s)
    // ⚠️ THE COUNT IS THE POINT. It went 6 -> 7 when commercial_fit was named,
    // and it must fall as each one is genuinely built. A test that stopped
    // counting would let the dark signals accumulate quietly.
    expect(blocked).toHaveLength(7)
    // A blocked signal with no `needs` is an open question pretending to be a
    // task. Every one of these names the field that unblocks it.
    for (const b of blocked) expect(b.needs!.length).toBeGreaterThan(20)
  })

  it('production-mode match is unanswered until the card is assessed', () => {
    // 0106 gave it somewhere to store an answer. Every one of the 6,608 cards
    // is NULL until something looks, so this stays the ordinary case.
    const s = rankSignals(facts())
    const pm = s.find((x) => x.id === 'production_mode_match')!
    expect(pm.status).toBe('not_checked')
    expect(pm.needs).toMatch(/assessment of this card/i)
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

// ---------------------------------------------------------------------------
// §7a's most valuable signal, now that 0106 gives it a place to read from.
// ---------------------------------------------------------------------------
const CAN_NOTHING = { canFilmObjects: false, canRecordScreen: false }
const CAN_BOTH = { canFilmObjects: true, canRecordScreen: true }
const NEEDS_OBJECTS = { requiresFilmingObjects: true, requiresScreenRecording: false }
const NEEDS_NOTHING = { requiresFilmingObjects: false, requiresScreenRecording: false }
const pm = (over: Partial<GalleryFacts>) =>
  rankSignals(facts(over)).find((s) => s.id === 'production_mode_match')!

describe('production-mode match: both halves, or nothing', () => {
  it('a real mismatch needs BOTH sides explicit', () => {
    const s = pm({ requirements: NEEDS_OBJECTS, creator: CAN_NOTHING })
    expect(s.status).toBe('mismatch')
    expect(s.reason).toMatch(/needs objects on camera/i)
    // Arguable, per §7c: it says what they told us, so a changed answer is a
    // thing they can change rather than a verdict they cannot argue with.
    expect(s.reason).toMatch(/you said/i)
  })

  it('and a real match does too', () => {
    expect(pm({ requirements: NEEDS_NOTHING, creator: CAN_NOTHING }).status).toBe('match')
    expect(pm({ requirements: NEEDS_OBJECTS, creator: CAN_BOTH }).status).toBe('match')
  })

  it('UNSET IS NEVER FALSE on the creator side', () => {
    // Someone who skipped the question has not said they cannot film. Reading
    // that as "cannot" would hide most of the gallery from them.
    const s = pm({
      requirements: NEEDS_OBJECTS,
      creator: { canFilmObjects: null, canRecordScreen: null },
    })
    expect(s.status).not.toBe('mismatch')
  })

  it('and never on the REFERENCE side either', () => {
    // 6,608 unassessed cards. If NULL read as "requires objects", every one of
    // them would be refused to a creator who cannot film.
    const s = pm({
      requirements: { requiresFilmingObjects: null, requiresScreenRecording: null },
      creator: CAN_NOTHING,
    })
    expect(s.status).toBe('not_checked')
  })

  it('an unassessed card says so, not "you cannot shoot this"', () => {
    expect(pm({ creator: CAN_NOTHING }).status).toBe('not_checked')
    expect(pm({ creator: CAN_NOTHING }).reason).toMatch(/nobody has checked/i)
  })

  it('an unasked creator says THAT instead — a different sentence', () => {
    const s = pm({ requirements: NEEDS_OBJECTS })
    expect(s.status).toBe('not_checked')
    expect(s.reason).toMatch(/have not asked what you can film/i)
  })

  it('assessed for one thing, asked about the other, answers neither', () => {
    // The card was assessed only for screen recording; the creator was asked
    // only about objects. Nothing lines up, so nothing is claimed.
    const s = pm({
      requirements: { requiresFilmingObjects: null, requiresScreenRecording: true },
      creator: { canFilmObjects: false, canRecordScreen: null },
    })
    expect(s.status).toBe('not_checked')
    expect(s.needs).toMatch(/both sides/i)
  })

  it('a screen-recording blocker reads as one', () => {
    const s = pm({
      requirements: { requiresFilmingObjects: false, requiresScreenRecording: true },
      creator: { canFilmObjects: true, canRecordScreen: false },
    })
    expect(s.status).toBe('mismatch')
    expect(s.reason).toMatch(/screen recording/i)
  })

  it('and it still never reads as a rating', () => {
    const bad = /\d+\s*%|\bscore\b/i
    for (const f of [
      { requirements: NEEDS_OBJECTS, creator: CAN_NOTHING },
      { requirements: NEEDS_NOTHING, creator: CAN_BOTH },
      {},
    ]) expect(pm(f).reason).not.toMatch(bad)
  })
})
