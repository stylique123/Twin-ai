// "I NEED TO KNOW WHICH PRODUCT EACH SCRIPT USED, OR I'LL SEND A CLIENT THE
// WRONG ONE."
//
// ⚠️ THE AGENCY'S REPORT, AND IT IS AN AUDIT LINE RATHER THAN A NICETY. A
// finished script named no product and stated no rules, so the one fact a person
// needs before forwarding it to a brand was the one fact the page did not carry.
//
// ⚖️ THE RULES SENTENCE IS THE PICKER'S OWN, reached through
// `productChoiceConstraint`. The creator reads the SAME words before choosing
// and after the script exists, because a second wording here would be two
// derivations of one policy — the defect the capability question and the
// fidelity slider both paid for.
import { describe, expect, it } from 'vitest'
import { scriptOrigin, hasReferenceUrl } from '../scriptOrigin'
import { productChoiceConstraint } from '../productSelection'

// ⚠️ `SPONSOR`, NOT `SPONSORED`, AND `CONFIRMED`, NOT `USES_IT`. The first
// version of this file invented both, and `claimRulesFor` returned undefined
// rather than throwing — so the failure surfaced five tests later as "cannot
// read properties of undefined". The unions are the authority:
// ENTITY_RELATIONSHIPS is ['OWN_PRODUCT','OWN_SERVICE','AFFILIATE','SPONSOR',
// 'REVIEW_ONLY','NONE'] and PERSONAL_USE_STATES is ['CONFIRMED','NOT_CONFIRMED'].
const SPONSORED = {
  name: 'Medicube Zero Pore Pad',
  relationship: 'SPONSOR' as const,
  personalUse: 'NOT_CONFIRMED' as const,
}
const OWN_AND_USED = {
  name: 'The Skin Diary',
  relationship: 'OWN_PRODUCT' as const,
  personalUse: 'CONFIRMED' as const,
}

describe('the script says what it was built from', () => {
  it('names the reference when there was one', () => {
    expect(scriptOrigin({ referenceUrl: 'https://tiktok.com/@x/video/1', product: null }).source)
      .toMatch(/reference link/i)
  })

  it('and refuses to call a product build "your idea"', () => {
    // ⚠️ THE SPEC ASKED FOR "From your idea", AND THAT WOULD BE A GUESS. A
    // product build and a browse build also arrive with no URL, and `door` is
    // not stored on any row — migration 0191 records why. So the honest
    // statement is that no reference was read, which is true of all three.
    const s = scriptOrigin({ referenceUrl: null, product: SPONSORED }).source
    expect(s).toMatch(/No reference was read/i)
    expect(s).not.toMatch(/your idea/i)
  })

  it('treats a blank URL as no reference', () => {
    expect(hasReferenceUrl('   ')).toBe(false)
    expect(hasReferenceUrl(null)).toBe(false)
    expect(hasReferenceUrl('https://x.test/1')).toBe(true)
  })
})

describe('the product line is the audit line', () => {
  it('names the product and states its rules', () => {
    const o = scriptOrigin({ referenceUrl: null, product: SPONSORED })
    expect(o.product).toContain('Medicube Zero Pore Pad')
    expect(o.product).toMatch(/disclosed as paid/i)
    expect(o.product).toMatch(/cannot say what it did for you/i)
  })

  it('and the rules are the picker\'s own sentence, not a second wording', () => {
    // ⚖️ ASSERTED THROUGH THE AUTHORITY. This cannot pass on a hand-written
    // copy of the same words, which is exactly what it exists to prevent.
    const o = scriptOrigin({ referenceUrl: null, product: SPONSORED })
    expect(o.product).toContain(productChoiceConstraint('SPONSOR', 'NOT_CONFIRMED'))
  })

  it('says so plainly when the product is the creator\'s own and used', () => {
    const o = scriptOrigin({ referenceUrl: null, product: OWN_AND_USED })
    expect(o.product).toContain('The Skin Diary')
    expect(o.product).toMatch(/speak from experience/i)
  })

  it('is absent when no product was chosen, never a claim that there was none', () => {
    // ⚠️ SILENCE, NOT "no product". Every generation before 0137 has no choice
    // row, and "we do not know" is a different fact from "there wasn't one" —
    // only the second is a statement about the video.
    expect(scriptOrigin({ referenceUrl: null, product: null }).product).toBeNull()
  })

  it('keeps the rules when the product has no name', () => {
    // ⚠️ DROPPING THE LINE WOULD DROP THE DISCLOSURE WITH IT. A product
    // registered without a name is rare and legitimate; a missing label must
    // not remove the notice that the script has to disclose a paid tie.
    const o = scriptOrigin({ referenceUrl: null, product: { ...SPONSORED, name: null } })
    expect(o.product).toMatch(/disclosed as paid/i)
    expect(o.product).toContain('the product you chose')
  })
})
