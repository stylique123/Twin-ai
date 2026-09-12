// THE QUESTION SAID THE WORD "OFFER", AND THE CODE THAT WOULD HAVE SAID HER
// PRODUCT'S NAME WAS CORRECT THE WHOLE TIME.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-12: 0 of 53 rows in `brand_voices` carry
// `pre_script_brief.offer`. Nothing writes that key. `V2Building.tsx` sourced
// `assessReadiness`'s `offer` from it and from nothing else, so the input was
// ALWAYS undefined and `claimsQuestionFor` — whose entire job is to put the
// real product name in the sentence — fell to its generic branch on every
// single build. 16 products sat in Product Library, every one with its
// relationship answered, while the screen said "the OFFER".
//
// ⚖️ THIS IS THE REPO'S RECURRING SHAPE, ONE MORE TIME: a field built
// correctly and fed by nothing. The fix is not new wording; it is an input.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assessReadiness, claimsQuestionFor } from '../generationReadiness'

/** A build that sells, with nothing named — the state every production caller
 *  was actually in. */
const SELLING = { goal: 'sell', angle: 'a hot take', hasCreatorKnowledge: true } as const

const claimsQ = (extra: Record<string, unknown>): string | null =>
  assessReadiness({ ...SELLING, ...extra }).fields.find((f) => f.field === 'claims')?.question ?? null

describe('the claims question names the product when anything knows its name', () => {
  it('said the literal word OFFER when only pre_script_brief could name it', () => {
    // The production state, reproduced: no offer, no name. This is what every
    // creator read, and it is the case the new input exists to end.
    expect(claimsQ({})).toContain('the OFFER')
  })

  it('names it from the library name alone', () => {
    expect(claimsQ({ offerNameForWording: 'Candle & Home Fragrance Kit' }))
      .toContain('Candle & Home Fragrance Kit')
  })

  it('still prefers the creator’s own words when she has actually named one', () => {
    // ⚖️ THE ORDER IS LOAD-BEARING. A caller that genuinely knows what this
    // video promotes outranks a name inferred from a library of one.
    expect(claimsQ({ offer: 'Bookkeeper Kit', offerNameForWording: 'Candle Kit' }))
      .toContain('Bookkeeper Kit')
  })
})

describe('a name may improve a sentence and may never settle a field', () => {
  // ⚠️ THE NEGATIVE CONTROL, AND THE REASON THE INPUT IS SEPARATE FROM `offer`
  // RATHER THAN FOLDED INTO IT. The note beside `promoting` records what
  // happened the last time a name was passed as the answer: a scan's guessed
  // offer set `promoting`, and the card demanded a commercial relationship for
  // a product that did not exist. Knowing what her product is CALLED is not
  // evidence that this video promotes it.
  it('does not mark the offer resolved, so she is still asked which one', () => {
    const v = assessReadiness({ ...SELLING, offerNameForWording: 'Candle Kit' })
    expect(v.fields.find((f) => f.field === 'offer')?.state).toBe('MISSING_REQUIRED')
  })

  it('does not make a non-commercial video promoting', () => {
    // `promoting` must stay driven by the creator's own offer or a commercial
    // goal. A library name is neither.
    const v = assessReadiness({
      goal: 'build authority', angle: 'a hot take', hasCreatorKnowledge: true,
      offerNameForWording: 'Candle Kit',
    })
    for (const f of ['offer', 'relationship', 'claims'] as const) {
      expect(v.fields.find((x) => x.field === f)?.state, f).toBe('RESOLVED')
    }
  })

  it('does not resolve the relationship, which is never inferred', () => {
    const v = assessReadiness({ ...SELLING, offerNameForWording: 'Candle Kit' })
    expect(v.fields.find((f) => f.field === 'relationship')?.state).toBe('MISSING_REQUIRED')
  })
})

describe('the wording a creator reads', () => {
  // ⚠️ "ALLOWED TO STATE" IS THE GUARD'S VOCABULARY, NOT HERS. It reads as a
  // permission form. She is being asked for material, so it asks for material.
  it('no longer asks her to apply for permission', () => {
    expect(claimsQuestionFor('Candle Kit')).not.toMatch(/allowed to state/i)
    expect(claimsQ({})).not.toMatch(/allowed to state/i)
  })

  it('asks for the concrete things she actually has', () => {
    expect(claimsQuestionFor('Candle Kit')).toMatch(/a price, a number, what is included/)
  })
})

describe('the caller actually supplies the name', () => {
  // ⚠️ THE HALF THAT WAS MISSING FOR MONTHS. `claimsQuestionFor` was right and
  // uncalled-with-anything; asserting only the pure function would have passed
  // against the broken system. This reads the caller.
  const src = readFileSync(
    join(import.meta.dirname, '..', '..', '..', '..',
      'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx'), 'utf8')

  it('passes offerNameForWording into assessReadiness', () => {
    expect(src).toMatch(/offerNameForWording:\s*libraryOfferName\(/)
  })

  it('resolves it from Product Library, not from pre_script_brief alone', () => {
    expect(src).toMatch(/function libraryOfferName\(/)
    expect(src).toMatch(/libraryOfferName\(libraryProducts,/)
  })

  // ⚖️ AND NOT INTO `offer`. A rename that pointed the new resolver at the old
  // field would restore the exact defect the negative controls above forbid,
  // while every other check in this file still passed.
  it('never passes a library name as the offer itself', () => {
    expect(src).not.toMatch(/\boffer:\s*libraryOfferName\(/)
  })
})
