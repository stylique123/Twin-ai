import { describe, it, expect } from 'vitest'
import { findComparativeClaims, unsupportedComparatives, describeComparativeClaim } from '../comparativeClaim'
import { claimedValues } from '../claimEntailment'

const N1 = 'A thirty-dollar hand-poured candle with a wooden wick lasts six times longer than standard box store alternatives. That makes it half the price per burn hour.'

describe('the claim the existing guard could not see', () => {
  // ⚠️⚠️ THE MEASUREMENT THAT REDIRECTED THE WHOLE FIX. Removing the
  // empty-fact-set suppression would have caught NOTHING, because the shared
  // matcher never extracted the claim in the first place.
  //
  // ⚠️ UPDATED 2026-09-06, AND THE REASON FOR THE DETECTOR IS UNCHANGED. This
  // used to assert `claimedValues(N1)` was EMPTY, pinning the first of the four
  // holes: "number WORDS are not matched". That hole is now deliberately closed
  // — production writes every figure in words, so a matcher blind to them was
  // blind to 8 of 8 money claims — and "thirty-dollar" is read as $30.
  //
  // ⚖️ WHAT JUSTIFIES A SEPARATE DETECTOR SURVIVES INTACT, and is now asserted
  // more sharply than before: the PRICE is visible in both spellings, the
  // MULTIPLE is visible in neither. "six times longer" is the claim that makes
  // N1 a liability, and `claimedValues` still cannot see it in any notation.
  it('sees the price in words — and STILL not the multiple, which is why a new detector exists', () => {
    const v = [...claimedValues(N1)]
    expect(v).toContain('30$')
    // ⚠️ THE LOAD-BEARING HALF. A multiple must not appear in any spelling.
    expect(v.join(' ')).not.toMatch(/6/)
  })

  it('the word and digit spellings of N1 now agree exactly', () => {
    expect([...claimedValues(N1)]).toEqual(
      [...claimedValues('A $30 candle lasts 6 times longer than standard box store alternatives.')])
  })

  it('and only the price from the digit form — never the multiple', () => {
    const v = [...claimedValues('A $30 candle lasts 6 times longer, half the price per burn hour.')]
    expect(v).toContain('30$')
    expect(v.join(' ')).not.toMatch(/6/)
  })

  it('the new detector DOES see it', () => {
    const found = findComparativeClaims([{ line: N1 }])
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('magnitude')
    expect(found[0].phrase.toLowerCase()).toContain('six times longer')
  })
})

describe('magnitude claims, in words and digits', () => {
  for (const line of [
    'lasts six times longer than the alternatives',
    'it lasts 6x longer than store bought',
    'twice as long as a supermarket candle',
    'half the price per burn hour',
    'lasts 40 hours',
    'double the life of a cheap one',
  ]) {
    it(`catches: ${line}`, () => {
      expect(findComparativeClaims([{ line }])[0]?.kind).toBe('magnitude')
    })
  }
})

describe('comparatives with no figure — still unsupportable', () => {
  for (const line of [
    'it burns cleaner than store bought candles',
    'better than anything you will find in a shop',
    'compared to the big brands, this is different',
    'the longest-lasting candle I make',
  ]) {
    it(`catches: ${line}`, () => {
      expect(findComparativeClaims([{ line }]).length).toBe(1)
    })
  }

  // ⚖️ THE FALSE-POSITIVE GUARD. Honest marketing language is not a comparison.
  for (const line of [
    'a long burning soy candle poured by hand',
    'I kept pouring until the scent held',
    'these are made in small batches in my kitchen',
    'the scent fills the room and it feels like a sanctuary',
  ]) {
    it(`leaves alone: ${line}`, () => {
      expect(findComparativeClaims([{ line }])).toEqual([])
    })
  }
})

describe('the rule — commercial creator, empty product record', () => {
  const script = [{ line: 'setting the scene here' }, { line: N1 }]

  // ⚠️ THE N1 CASE EXACTLY: she sells candles, the claims field was empty.
  it('refuses on a commercial creator with no stored product facts', () => {
    const out = unsupportedComparatives({ script, commercial: true, productFactCount: 0 })
    expect(out).toHaveLength(1)
    expect(out[0].beat).toBe(2)
  })

  // ⚖️ WITH FACTS ON RECORD THIS DEFERS to findProductClaimGaps, which is the
  // check that can actually compare a figure against a stored one.
  it('defers to the figure check when the product record is not empty', () => {
    expect(unsupportedComparatives({ script, commercial: true, productFactCount: 3 })).toEqual([])
  })

  // ⚖️ A NON-COMMERCIAL CREATOR IS NOT MAKING A PRODUCT CLAIM.
  it('says nothing for a creator who sells nothing', () => {
    expect(unsupportedComparatives({ script, commercial: false, productFactCount: 0 })).toEqual([])
  })

  it('an empty script is not a violation', () => {
    expect(unsupportedComparatives({ script: [], commercial: true, productFactCount: 0 })).toEqual([])
  })

  it('a beat with no line is skipped rather than throwing', () => {
    expect(unsupportedComparatives({ script: [{}, { line: null }], commercial: true, productFactCount: 0 })).toEqual([])
  })
})

describe('the message a writer gets', () => {
  it('names the phrase and the two honest ways out', () => {
    const msg = describeComparativeClaim({ beat: 3, phrase: 'six times longer', kind: 'magnitude' })
    expect(msg).toContain('Beat 3')
    expect(msg).toContain('six times longer')
    expect(msg).toMatch(/Remove the comparison|confirm the figure/)
  })
})
