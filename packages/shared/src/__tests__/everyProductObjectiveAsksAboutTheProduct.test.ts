// "SAY WHY I MADE IT" ASKED NOTHING ABOUT THE PRODUCT.
//
// ⚠️⚠️ MEASURED ACROSS TEN LIVE PRODUCT RUNS: the offer questions appeared on 2
// of the 5 product objectives — "Launch it" and "Get people to try it" — and not
// on "Explain what it actually does", "Answer what people keep asking" or "Say
// why I made it". Which is backwards. "Say why I made it" is the ORIGIN STORY OF
// THE PRODUCT, the most product-dependent objective on the sheet.
//
// ⚠️ AND NEITHER EXISTING SIGNAL COULD FIRE THERE. `wantsSale` is true only for
// SELLING_GOALS. `wantsProductSubstance` reads `focus`, and `intentQuestionsFor`
// deliberately does NOT ask `content_focus` on a build with no reference — so on
// a product build the focus signal is STRUCTURALLY ABSENT and only the goal was
// left. This is not a tuning problem; it is a missing input.
//
// ⚖️ AND IT GRANTS NOTHING. `wantsSale` is untouched, so the commercial CTA gate
// is untouched — a creator explaining her band still gets no purchase ask.
import { describe, expect, it } from 'vitest'
import {
  showsCommercialBlock, compileVideoIntent, PRODUCT_OBJECTIVES, intentQuestionsFor,
} from '../videoIntent'

const intentFor = (goal: string) => compileVideoIntent({ goal })

describe('every product objective asks about the product', () => {
  for (const o of PRODUCT_OBJECTIVES) {
    it(`"${o.label}" shows the offer questions on a product build`, () => {
      expect(showsCommercialBlock(intentFor(o.value), { isProductSubject: true })).toBe(true)
    })
  }

  it('and three of the five did NOT before, which is the defect', () => {
    // ⚠️ THE BASELINE, ASSERTED. Without the product signal these are false —
    // so this list is the exact set of objectives that asked nothing.
    const silent = PRODUCT_OBJECTIVES
      .filter((o) => !showsCommercialBlock(intentFor(o.value)))
      .map((o) => o.value)
    expect(silent).toEqual(['educate', 'conversations', 'personal_brand'])
  })

  it('the focus signal cannot rescue them, because focus is never asked', () => {
    // ⚠️⚠️ WHY A CALL-SITE TWEAK WOULD NOT HAVE BEEN ENOUGH. A product build with
    // no reference has `content_focus` filtered out of the question list, so
    // `wantsProductSubstance` can never become true by the creator answering.
    const asked = intentQuestionsFor({ hasReference: false, isProductSubject: true })
      .map((q) => q.field)
    expect(asked).not.toContain('content_focus')
  })
})

describe('it grants nothing, and that is the load-bearing half', () => {
  it('wantsSale is unchanged for a non-selling objective', () => {
    // ⚖️ THE COMMERCIAL CTA GATE READS `wantsSale`, NOT THIS FUNCTION.
    // `sellIntent` is `commercialCta === 'only_if_intended' && goalWantsSale`, so
    // a creator explaining her band still gets no purchase ask. If this
    // assertion ever fails, the change has widened entitlement and not merely
    // what is asked.
    for (const goal of ['educate', 'conversations', 'personal_brand']) {
      expect(intentFor(goal).wantsSale).toBe(false)
    }
    for (const goal of ['sell', 'leads']) {
      expect(intentFor(goal).wantsSale).toBe(true)
    }
  })

  it('and wantsProductSubstance is still only about focus', () => {
    // ⚖️ THE COMPILER IS UNTOUCHED, so the edge mirror stays in parity. The new
    // signal lives in `showsCommercialBlock` — which no edge function calls —
    // rather than in `compileVideoIntent`, which has an inline copy in
    // generate-blueprint that a signature change would have silently desynced.
    expect(intentFor('personal_brand').wantsProductSubstance).toBe(false)
    expect(compileVideoIntent({ goal: 'educate', focus: 'product' }).wantsProductSubstance).toBe(true)
  })
})

describe('a non-product build is unaffected', () => {
  it('the generic sheet still decides by goal and focus alone', () => {
    // ⚖️ NOT A WIDENING TO EVERY VIDEO. An idea build about her own opinion must
    // not be asked what she sells — that is the questionnaire this block exists
    // to avoid, and the remix card's original defect.
    expect(showsCommercialBlock(intentFor('educate'))).toBe(false)
    expect(showsCommercialBlock(intentFor('educate'), { isProductSubject: false })).toBe(false)
    expect(showsCommercialBlock(intentFor('educate'), {})).toBe(false)
    expect(showsCommercialBlock(intentFor('sell'))).toBe(true)
  })

  it('an absent flag is the same as false, which is what every old caller sends', () => {
    // ⚖️ THE COMPATIBILITY PROPERTY: three call sites existed before the
    // parameter did, and a build that does not pass it must behave exactly as it
    // did. `undefined` and an omitted object are both asserted above and here.
    expect(showsCommercialBlock(intentFor('educate'),
      { isProductSubject: undefined })).toBe(false)
  })

  // ⚠️⚠️ A TEST WAS DELETED HERE AND IT IS WORTH SAYING WHY, because deleting an
  // assertion is normally the wrong move. It read "only an explicit true counts,
  // so a stray truthy value cannot widen it" and asserted `=== true` rather than
  // `!!`. A mutant proved it could never fail: the parameter is typed
  // `boolean | undefined`, so the two spellings are IDENTICAL for every input the
  // compiler permits. It was asserting an implementation detail as a property,
  // and a test that cannot fail for the thing it claims to protect is decoration
  // — it would have read as coverage while checking nothing. The compatibility
  // property above is the real one, and it does fail if the default flips.
})
