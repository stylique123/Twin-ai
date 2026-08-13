// THE REFERENCE'S OWN NUMBER, SPOKEN BY SOMEBODY WHO NEVER EARNED IT.
//
// ⚠️ THE DEFECT, ON REAL DATA. A matrix case carries a hand-written note:
// "'3x more productive' is self-reported creator experience and MUST NOT
// transfer". It transferred 9 times across 16 runs to five creators — a tech
// reviewer, a founder-story channel and a business creator all told their
// audience they would be 3x more productive, using Ali Abdaal's number.
//
// ⚠️ AND EVERY SAFETY COUNTER READ CLEAN. UNSUPPORTED 0, unearned-1P 0. Those
// ask whether a beat's CITED knowledge traces to something supplied; these beats
// cite nothing, declaring `general` — "common knowledge, nobody's claim". A
// named creator's measured multiplier is not general knowledge. The declaration
// was false and nothing checked it.
import { describe, expect, it } from 'vitest'
import { findLeakedClaims, measuredClaims, describeLeak } from '../referenceClaimLeak'

const REF = "REFERENCE (Ali Abdaal): mechanism = result-led hook. Claim risk:"
  + " '3x more productive' is self-reported creator experience and MUST NOT transfer"

describe('the leak that actually happened', () => {
  it('catches the reference multiplier in a creator line', () => {
    const got = findLeakedClaims(REF, [
      { line: 'Here are 3 simple ways to make your mobile phone 3x more productive.', substance: 'none' },
    ], 3)
    expect(got).toHaveLength(1)
    expect(got[0].claim).toBe('3x')
    expect(got[0].beat).toBe(1)
  })

  it('catches it however it is declared, including creator_knowledge', () => {
    // ⚖️ A LEAK CALLED `creator_knowledge` IS NOT AUTOMATICALLY FINE. The writer
    // may be citing the creator for a number the creator never gave, which is a
    // fabrication wearing the strongest available citation.
    const got = findLeakedClaims(REF,
      [{ line: "This technique 3x'd my productivity.", substance: 'creator_knowledge' }], 3)
    expect(got).toHaveLength(1)
    expect(got[0].substance).toBe('creator_knowledge')
  })
})

describe('THE COUNT TRANSFERS, THE MEASUREMENT DOES NOT', () => {
  it('spares the bare enumeration count', () => {
    // ⚠️ BOTH ARE THE DIGIT 3 FROM THE SAME REFERENCE. A format promising three
    // things promises three for everyone — the count contract says so outright.
    const got = findLeakedClaims('a format with 3 items and 3x results',
      [{ line: 'Here are 3 things I actually use.', substance: 'creator_knowledge' }], 3)
    expect(got).toHaveLength(0)
  })

  it('still catches the multiplier in the same sentence as the count', () => {
    const got = findLeakedClaims('3 ways to be 3x more productive',
      [{ line: 'Here are 3 ways to be 3x more productive.', substance: 'general' }], 3)
    expect(got.map((l) => l.claim)).toEqual(['3x'])
  })

  it('does not spare a count that never was the enumeration', () => {
    const got = findLeakedClaims('grew it 5x in a year',
      [{ line: 'I grew it 5x.', substance: 'general' }], 3)
    expect(got).toHaveLength(1)
  })
})

describe('what counts as a measurement', () => {
  it.each([
    ['3x more productive', '3x'], ['up 40% year on year', '40%'],
    ['made $10,000', '$10000'], ['saves 10 hours a week', '10hours'],
    ['120k subscribers', '120k'],
  ])('reads %j as a claim', (text, expected) => {
    expect(measuredClaims(text)).toContain(expected)
  })

  it('treats 3x and 3X and "3 x" as one claim', () => {
    for (const v of ['3x', '3X', '3 x']) expect(measuredClaims(v)).toContain('3x')
  })

  it('does not turn a bare integer into a claim', () => {
    // A number with no unit is a count, and counts are allowed to travel.
    expect(measuredClaims('here are 3 things')).toEqual([])
  })
})

describe('a number the reference never made is not a leak', () => {
  it('ignores a creator number absent from the reference', () => {
    // ⚖️ THIS CHECK IS ABOUT ATTRIBUTION, NOT ABOUT NUMBERS. A creator's own
    // measured claim is exactly what we WANT them saying; it is policed by the
    // evidence ladder, not by this.
    const got = findLeakedClaims('a reference with no numbers',
      [{ line: 'I grew mine 7x last year.', substance: 'creator_knowledge' }], null)
    expect(got).toHaveLength(0)
  })

  it('is silent when the reference asserts nothing measured', () => {
    expect(findLeakedClaims('', [{ line: '3x better', substance: 'general' }])).toEqual([])
  })
})

describe('the report names the attribution, not just the string', () => {
  it('says whose measurement it is and why rewording will not help', () => {
    const [l] = findLeakedClaims(REF, [{ line: 'be 3x more productive', substance: 'general' }], 3)
    const msg = describeLeak(l)
    expect(msg).toMatch(/REFERENCE creator's own measurement/)
    expect(msg).toMatch(/never made it and cannot support it/)
    expect(msg).toMatch(/declares it general/)
  })
})
