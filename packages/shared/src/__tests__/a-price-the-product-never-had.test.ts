// THE PRODUCT LIBRARY EXISTS SO SCRIPTS STOP GUESSING, AND NOTHING CHECKED.
//
// ⚠️ A SCRIPT COULD SAY "twenty-nine dollars a month" ABOUT A PRODUCT WHOSE
// STORED PRICE IS THIRTY-NINE and every existing guard read clean: the beat
// cites the product, the product exists, the relationship permits commercial
// language. Nothing asked whether the FIGURE came from the product record.
//
// ⚖️ MEASURED VALUES ONLY, for the reason `claimEntailment` already argued: a
// benefit paraphrases and a price does not. "$29/mo" and "29 dollars a month"
// are one figure and neither is "$39", so this stops being a judgement and
// becomes decidable — and a prose matcher would refuse good scripts, which is
// worse than the defect it set out to catch.
import { describe, expect, it } from 'vitest'
import {
  findProductClaimGaps, supportedValues, describeProductClaimGap,
} from '../productClaimCheck'

const FACTS = [
  { value: '$39 per month', trust: 'usable' },
  // ⚠️ "users", NOT "creators". The shared matcher recognises a bounded list of
  // units — currency, %, multiples, durations, and audience nouns like users and
  // followers. A bare count of an unlisted noun is NOT checked, and widening
  // that regex here would silently change what the creator-knowledge guard
  // catches too. The limit is real and stated rather than papered over.
  { value: 'Used by 12,000 users', trust: 'usable' },
]

const beat = (line: string, substance = 'product') => ({ line, substance })

describe('a figure must come from the product record', () => {
  it('catches a price the record does not carry', () => {
    const gaps = findProductClaimGaps([beat('It is $29 a month.')], FACTS)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].value).toContain('29')
  })

  it('accepts the figure the record does carry, however it is written', () => {
    // ⚖️ THE NORMALISATION IS THE LOAD-BEARING PART. This is why the module
    // reuses `canonicalValue` rather than restating it.
    for (const line of ['It is $39 a month.', 'Thirty-nine? No — $39/mo.', 'It costs 39 dollars monthly.']) {
      expect(findProductClaimGaps([beat(line)], FACTS), line).toEqual([])
    }
  })

  it('treats 12k and 12,000 as the same number', () => {
    expect(findProductClaimGaps([beat('12k users use it.')], FACTS)).toEqual([])
    expect(findProductClaimGaps([beat('20k users use it.')], FACTS)).toHaveLength(1)
  })

  it('names the figure and the ways out', () => {
    const [gap] = findProductClaimGaps([beat('It is $29 a month.')], FACTS)
    const text = describeProductClaimGap(gap)
    expect(text).toMatch(/no stored product fact carries that figure/)
    expect(text).toMatch(/drop the number|confirm it/)
  })
})

describe('what it must not fire on', () => {
  it('ignores beats that are not sourced from the product', () => {
    // ⚠️ THREE COUNTERS, ONE QUESTION EACH. A creator-knowledge beat belongs to
    // claimEntailment and a beat citing nothing belongs to the leak check;
    // reporting all three here would name one failure by another's name.
    expect(findProductClaimGaps([beat('I made $80,000 last year.', 'creator_knowledge')], FACTS)).toEqual([])
    expect(findProductClaimGaps([beat('Roughly 500 people asked me this.', 'general')], FACTS)).toEqual([])
  })

  it('says nothing about a product Twin has never read', () => {
    // ⚖️ A COUNTER THAT FIRES LOUDEST WHERE IT KNOWS LEAST TRAINS PEOPLE TO
    // IGNORE IT. No stored facts means nothing to contradict.
    expect(findProductClaimGaps([beat('It is $29 a month.')], [])).toEqual([])
    expect(findProductClaimGaps([beat('It is $29 a month.')], [{ value: 'A tool for creators' }])).toEqual([])
  })

  it('ignores prose with no figures in it', () => {
    expect(findProductClaimGaps([beat('It saves you a whole afternoon.')], FACTS)).toEqual([])
  })

  it('never throws on the shapes a blueprint really produces', () => {
    for (const bad of [{}, { line: null }, { line: 42, substance: 'product' }, { substance: 'product' }]) {
      expect(() => findProductClaimGaps([bad as never], FACTS)).not.toThrow()
    }
    expect(findProductClaimGaps([], FACTS)).toEqual([])
  })
})

describe('unconfirmed facts still count as a source', () => {
  it('accepts a figure matching a needs_confirmation fact', () => {
    // ⚠️ THAT FLAG IS A DIFFERENT GATE. It decides whether a fact may be SPOKEN
    // without a person approving it — which already exists. This asks whether
    // the figure came from the product at all, or from nowhere, and a number
    // matching an unconfirmed stored fact came from the product. Counting it
    // here too would report one problem twice under the wrong name.
    const gaps = findProductClaimGaps(
      [beat('It cut support tickets by 40%.')],
      [{ value: 'Cuts support tickets by 40%', trust: 'needs_confirmation' }],
    )
    expect(gaps).toEqual([])
  })

  it('collects every value the facts carry', () => {
    expect(supportedValues(FACTS).size).toBe(2)
  })

  it('does not pretend to check units the matcher does not recognise', () => {
    // ⚖️ AN HONEST LIMIT, PINNED. "12,000 creators" carries a noun outside the
    // shared unit list, so no figure is extracted and nothing is claimed about
    // it. Stating this in a test stops a future reader assuming coverage the
    // check does not have — and widening the regex to gain it would change the
    // creator-knowledge guard that shares it.
    expect(supportedValues([{ value: 'Used by 12,000 creators' }]).size).toBe(0)
    expect(findProductClaimGaps([beat('90,000 creators use it.')], FACTS)).toEqual([])
  })
})
