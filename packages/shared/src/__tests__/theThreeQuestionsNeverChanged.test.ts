// A LEATHERWORKER WAS ASKED THE COMMENTATOR'S QUESTION, ON EVERY ACCOUNT.
//
// ⚠️ THE OWNER REPORTED THIS REPEATEDLY AND IT WAS REAL. The three onboarding
// questions were identical for every creator, and a screenshot of
// @woodsyleather's own onboarding shows the `none` bucket verbatim — the wording
// reserved for a creator who sells NOTHING:
//
//   "What did you get wrong publicly, and what changed after?"
//   "Which video or post outperformed everything — and what was different about it?"
//   "What does everyone in your corner of the internet repeat that you think is wrong?"
//
// THREE SEPARATE DEFECTS STACKED, and fixing any one alone changes nothing:
//
//  1. `sellsFacetOf([])` returned the FACT 'none'. Onboarding asks these at the
//     `stories` step and mints the product entity at `confirm`, AFTER it — so at
//     the only moment they are asked the library is ALWAYS empty. Every creator
//     was classified as selling nothing.
//  2. The niche table did not word these three AT ALL. `OVERRIDES` covered
//     `first_thing_asked` and `OPENING_THREE` is expensive_lesson / best_result
//     / contrarian — the file's own comment calls them "A DISJOINT SET". There
//     was no niche wording for a fix to select.
//  3. `nicheBucket` matched NONE of the four maker niches, so even a niche table
//     would have missed this creator.
//
// ⚠️ MEASURED 2026-09-15 over the 47 distinct stored niches: exactly FOUR
// returned null, and all four make or repair a physical thing by hand —
// Leathercraft, Handmade Soy Candles, Mobile Auto Repair, Women's Empowerment &
// Trades. Bucket populations: business 21, entertainment 9, tech 6, making 4,
// health 4, food 2, creator 1. Tables are written for the five with four or
// more, which is 44 of 47 niches, and NOT for food or creator — the bar this
// file already sets for itself.

import { describe, it, expect } from 'vitest'
import { creatorQuestionsFor, openingQuestionsFor, sellsFacetOf, nicheBucket } from '../nicheQuestions'
import { CREATOR_QUESTIONS, OPENING_THREE, type CreatorQuestion } from '../creatorQuestions'

/** The exact two calls `StoryInterview` makes, in its order. */
function onScreen(
  niche: string | null,
  products: ReadonlyArray<{ relationship?: string; type?: string }> | null,
  band: string | null,
): CreatorQuestion[] {
  const sells = sellsFacetOf(products)
  const byNiche = creatorQuestionsFor(niche, CREATOR_QUESTIONS, sells === 'none' ? null : sells)
  const worded = openingQuestionsFor(byNiche, sells, band)
  return OPENING_THREE
    .map((id) => worded.find((x) => x.id === id))
    .filter((q): q is CreatorQuestion => !!q)
}

const LEATHER = 'Leathercraft & Custom Bible Rebinding'
/** The three sentences from the owner's screenshot, verbatim. */
const THE_SCREENSHOT = [
  'What did you get wrong publicly, and what changed after?',
  'Which video or post outperformed everything — and what was different about it?',
  'What does everyone in your corner of the internet repeat that you think is wrong?',
]

describe('the four niches nothing classified', () => {
  it('buckets every maker and trade niche in production', () => {
    expect(nicheBucket(LEATHER)).toBe('making')
    expect(nicheBucket('Handmade Soy Candles & Personal Lifestyle Storytelling')).toBe('making')
    expect(nicheBucket('Mobile Auto Repair & Mechanic Storytime')).toBe('making')
    expect(nicheBucket("Women's Empowerment & Trades")).toBe('making')
  })

  // ⚠️ THE NEW PATTERN IS LAST FOR A REASON. Both of these involve making
  // something, and both were already bucketed correctly; re-bucketing them would
  // break creators whose questions were already right.
  it('does not steal niches that commerce and food already owned', () => {
    expect(nicheBucket('Luxury resale, viral marketing, female entrepreneurship')).toBe('business')
    expect(nicheBucket('Baking & Micro-Bakery Process')).toBe('food')
  })
})

describe('an empty library is not the fact that she sells nothing', () => {
  it('returns null for an empty library, not none', () => {
    // THE DEFECT. At the `stories` step this is the only possible input.
    expect(sellsFacetOf([])).toBeNull()
  })

  it('still returns none when rows EXIST and none are hers', () => {
    // A real fact she supplied: a library of somebody else's products.
    expect(sellsFacetOf([{ relationship: 'AFFILIATE' }])).toBe('none')
  })

  it('a failed read stays null', () => {
    expect(sellsFacetOf(null)).toBeNull()
    expect(sellsFacetOf(undefined)).toBeNull()
  })
})

describe('what the leatherworker is asked at onboarding', () => {
  const asks = onScreen(LEATHER, [], 'under_1k').map((q) => q.ask)

  it('is not one of the three sentences from the screenshot', () => {
    for (const wrong of THE_SCREENSHOT) expect(asks).not.toContain(wrong)
  })

  it('asks about the bench, the piece and the trade', () => {
    expect(asks[0]).toMatch(/remake or throw away/i)
    expect(asks[2]).toMatch(/your trade insist on/i)
  })

  // ⚠️ 995 SUBSCRIBERS. Asking which video "outperformed everything" is the
  // accusation `UNDER_1K_BEST_RESULT` exists to prevent, and it was skipped
  // whenever `sells` was unknown — which at this step is always.
  it('uses the under-1k result question, which sells no longer gates', () => {
    expect(asks[1]).toMatch(/best thing that has happened/i)
  })

  it('keeps the ids, so an answered question never reappears reworded', () => {
    expect(onScreen(LEATHER, [], 'under_1k').map((q) => q.id)).toEqual([...OPENING_THREE])
  })
})

describe('the questions differ by who the creator is', () => {
  it('a business creator gets business questions', () => {
    const asks = onScreen('Business & Entrepreneurship', [], null).map((q) => q.ask)
    expect(asks[0]).toMatch(/spend money on that did not work/i)
    expect(asks[1]).toMatch(/best result a client/i)
  })

  it('four buckets produce four different opening questions', () => {
    const first = (n: string) => onScreen(n, [], null)[0].ask
    const seen = new Set([
      first(LEATHER),
      first('Business & Entrepreneurship'),
      // ⚠️ NOT "AI Software Development and B2B SaaS", WHICH IS MY OWN BAD
      // EXAMPLE AND NOT A CODE DEFECT. It carries `b2b` and `saas`, so it
      // buckets as BUSINESS — deliberately, per the pattern order: "commerce
      // comes first, reading it as tech loses the fact that the audience is
      // founders". This is a genuinely tech niche from the same corpus.
      first('Android tech tips, phone customization, hidden settings, and app tutorials'),
      first('Entertainment, challenges, and giveaways'),
    ])
    // The whole complaint was that these never differed.
    expect(seen.size).toBe(4)
  })

  // ⚖️ THE COMMENTATOR WORDING IS NOT DELETED — it was never wrong, only
  // wrongly applied. A creator with rows that are all somebody else's still
  // gets it, because that is what it was written for.
  it('a genuine commentator still gets the commentator wording', () => {
    const asks = onScreen('Entertainment, challenges, and giveaways', [{ relationship: 'AFFILIATE' }], null)
      .map((q) => q.ask)
    expect(asks).toEqual(THE_SCREENSHOT)
  })

  it('an unknown niche falls back to the plain bank, not to the commentator', () => {
    const asks = onScreen('Something nobody has a table for', [], null).map((q) => q.ask)
    for (const wrong of THE_SCREENSHOT) expect(asks).not.toContain(wrong)
    expect(asks[0]).toMatch(/learned the expensive way/i)
  })

  it('a known sells still outranks the niche once she has told us', () => {
    // She owns a physical product: the physical wording wins on these ids.
    const asks = onScreen(LEATHER, [{ relationship: 'OWN_PRODUCT', type: 'PHYSICAL_PRODUCT' }], null)
      .map((q) => q.ask)
    expect(asks[2]).toMatch(/how it is made, or what it costs/i)
  })
})
