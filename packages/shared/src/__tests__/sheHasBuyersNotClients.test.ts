// "WHEN A FOUNDER COMES TO YOU STUCK, WHAT DO YOU ASK THEM FIRST?"
//
// ⚠️ REPORTED LIVE, AND THE BUCKET WAS RIGHT WHILE THE QUESTION WAS WRONG. A
// creator selling Canva templates on Etsy buckets as `business` — her niche is
// "Social Media Marketing" — and was asked the coach's question. She has BUYERS,
// NOT CLIENTS. Nobody comes to her stuck.
//
// ⚠️ SO IT CANNOT BE ANSWERED HONESTLY, and "Not this one" is the only true
// response. A question a creator can only decline is a question that taught us
// nothing — and on her account, answered questions are the ENTIRE supply of what
// Twin knows: zero experience or opinion rows from captions or transcripts.
//
// ⚖️ THE SAME LIMIT AS THE BEAUTY REPORT, ONE LEVEL DOWN. Buckets fixed "health
// vs business"; inside `business` a coach, an agency and a product seller are
// different jobs.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { creatorQuestionsFor, sellsKindOf, SELLS_KINDS } from '../nicheQuestions'
import { CREATOR_QUESTIONS } from '../creatorQuestions'

const askFor = (niche: string, sells: Parameters<typeof creatorQuestionsFor>[2]) =>
  creatorQuestionsFor(niche, undefined, sells).find((q) => q.id === 'first_thing_asked')!.ask

/** Her account, as stored. */
const HER_NICHE = 'Social Media Marketing'
const HER_PRODUCTS = [
  { type: 'DIGITAL_PRODUCT', relationship: 'OWN_PRODUCT' },
  { type: 'DIGITAL_PRODUCT', relationship: 'OWN_PRODUCT' },
]

describe('the reported account', () => {
  it('still buckets as business, which was never the error', () => {
    expect(askFor(HER_NICHE, null)).toMatch(/founder comes to you stuck/i)
  })

  it('is asked about buyers once her products are read', () => {
    expect(sellsKindOf(HER_PRODUCTS)).toBe('digital')
    const ask = askFor(HER_NICHE, sellsKindOf(HER_PRODUCTS))
    expect(ask).toMatch(/buyers expect to find inside/i)
    // ⚠️ THE WORD THAT MADE IT UNANSWERABLE.
    expect(ask).not.toMatch(/founder|client/i)
  })
})

describe('each kind is asked about the relationship it actually has', () => {
  it('a service seller keeps the coach question, because it was right for them', () => {
    expect(askFor('business coaching', 'service')).toMatch(/comes to you stuck/i)
  })

  it('a physical seller is asked what people assume before opening it', () => {
    expect(askFor('micro-bakery', 'physical')).toMatch(/before they open it/i)
  })

  // ⚖️ AND NO TWO SHARE A SENTENCE — a variant that changes nothing is a bucket
  // with no consequence, which is the bar `PRODUCT_OBJECTIVES` already holds.
  it('no two kinds are handed the same question', () => {
    const asked = SELLS_KINDS.map((k) => askFor(HER_NICHE, k))
    expect(new Set(asked).size).toBe(SELLS_KINDS.length)
  })
})

describe('what it refuses to guess', () => {
  // ⚠️ A MIXED LIBRARY GENUINELY HAS BOTH KINDS OF BUYER. Choosing one would be
  // a coin-flip printed as a question about her work.
  it('a creator selling a service AND a product gets no override', () => {
    expect(sellsKindOf([
      { type: 'SERVICE', relationship: 'OWN_PRODUCT' },
      { type: 'PHYSICAL_PRODUCT', relationship: 'OWN_PRODUCT' },
    ])).toBeNull()
  })

  // ⚖️ `MARKETPLACE`, `COMMUNITY` and `OTHER` ARE DELIBERATELY UNMAPPED.
  // `productQuestions` already refuses to invent a taxonomy for these; guessing
  // here would contradict it and hand somebody a question about a relationship
  // they do not have — the exact defect this fixes.
  it('an unclassified type falls back rather than guessing', () => {
    for (const t of ['MARKETPLACE', 'COMMUNITY', 'OTHER']) {
      expect(sellsKindOf([{ type: t, relationship: 'OWN_PRODUCT' }]), t).toBeNull()
    }
  })

  // ⚠️ AN AFFILIATE ROW SAYS WHAT SHE TALKS ABOUT, NOT WHAT HER OWN BUYERS COME
  // TO HER FOR. Keying her own-expertise question on somebody else's product is
  // how she gets asked about a relationship she does not have.
  it('ignores products she does not own', () => {
    for (const rel of ['AFFILIATE', 'SPONSOR', 'REVIEW_ONLY', 'NONE']) {
      expect(sellsKindOf([{ type: 'DIGITAL_PRODUCT', relationship: rel }]), rel).toBeNull()
    }
  })

  it('an empty or unreadable library changes nothing', () => {
    for (const p of [null, undefined, []]) {
      expect(sellsKindOf(p)).toBeNull()
    }
    expect(askFor(HER_NICHE, sellsKindOf([]))).toMatch(/founder comes to you stuck/i)
  })

  // ⚖️ `OWN_SERVICE` IS A SERVICE WHATEVER THE TYPE COLUMN HOLDS.
  it('lets the relationship win for a service', () => {
    expect(sellsKindOf([{ type: 'OTHER', relationship: 'OWN_SERVICE' }])).toBe('service')
  })
})

describe('it changes one question and leaves the rest alone', () => {
  // ⚠️ THE NEGATIVE CONTROL. A facet that rewrote the whole bank would be a
  // second vocabulary, and every positive case above would still pass.
  it('only first_thing_asked differs', () => {
    const base = creatorQuestionsFor(HER_NICHE, undefined, null)
    const sold = creatorQuestionsFor(HER_NICHE, undefined, 'digital')
    const changed = base.filter((q, i) => q.ask !== sold[i]!.ask).map((q) => q.id)
    expect(changed).toEqual(['first_thing_asked'])
  })

  it('keeps every id, so an answered question stays answered', () => {
    const sold = creatorQuestionsFor(HER_NICHE, undefined, 'digital')
    expect(sold.map((q) => q.id)).toEqual(CREATOR_QUESTIONS.map((q) => q.id))
  })

  // ⚖️ AND IT WORKS OUTSIDE A BUCKET TOO. A creator whose niche matches nothing
  // still sells something, and that is the whole point of keying on `sells`
  // RATHER THAN on niche.
  it('applies even when the niche buckets to nothing', () => {
    expect(askFor('', 'physical')).toMatch(/before they open it/i)
  })
})

describe('the card actually supplies it, or none of this reaches her', () => {
  // ⚠️ A FACET NOTHING SUPPLIES IS THIS REPO'S STANDING DEFECT, and asserting
  // only the pure function would pass against a system that never reads her
  // products. `creatorQuestionsFor` was already correct-and-uncalled-with-a-
  // third-argument the moment it gained one.
  const web = join(import.meta.dirname, '..', '..', '..', '..', 'apps', 'web', 'src')
  const CARD = readFileSync(join(web, 'components', 'CreatorQuestionCard.tsx'), 'utf8')
  const LIB = readFileSync(join(web, 'lib', 'ownSellsLoad.ts'), 'utf8')

  it('reads what she sells and passes it through', () => {
    expect(CARD).toMatch(/loadOwnSells\(\)/)
    expect(CARD).toMatch(/creatorQuestionsFor\(niche, undefined, sells\)/)
  })

  // ⚠️ THROUGH A LOCAL LIB, NOT A SHARED NETWORK CALL IN THE COMPONENT, and this
  // assertion is here because the first version did the latter AND THE CARD
  // STOPPED RENDERING ENTIRELY. Every other read it makes goes through a lib
  // beside this one; an unmocked client left the promise pending, `loadNext`
  // never finished, and the section was empty. The seam is the fix.
  it('goes through the same seam as its other reads', () => {
    expect(CARD).not.toMatch(/loadProductEntities/)
    expect(LIB).toMatch(/loadProductEntities\(\)/)
  })

  // ⚖️ AND A FAILED READ FALLS BACK RATHER THAN BLOCKING THE CARD. Not knowing
  // what she sells is the state every creator was in before this existed, and
  // it is served by a real question.
  it('never lets a failed product read empty the card', () => {
    expect(LIB).toMatch(/catch \{/)
    expect(LIB).toMatch(/return null/)
  })
})
