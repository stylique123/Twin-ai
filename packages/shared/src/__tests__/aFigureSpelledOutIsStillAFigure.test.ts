import { describe, expect, it } from 'vitest'
import { canonicalValue, claimedValues, findEntailmentGaps, wordsToNumber } from '../claimEntailment'

// ⚠️ EVERY `line` BELOW IS A VERBATIM PRODUCTION SENTENCE, read out of
// `generations.blueprint->'script'` on 2026-09-06. Before this change
// `claimedValues` returned the EMPTY SET for all of them, which is why
// `entailment_gaps` read 0 on all 33 audited rows while B1 was inventing a
// pricing chain that contradicted the creator's own prices.

describe('a figure spelled out is still a figure', () => {
  it('reads the number words a script actually uses', () => {
    expect(wordsToNumber('two')).toBe(2)
    expect(wordsToNumber('seventy five')).toBe(75)
    expect(wordsToNumber('five thousand')).toBe(5000)
    expect(wordsToNumber('one hundred and fifty')).toBe(150)
  })

  it('refuses a run it cannot fully account for, rather than guessing', () => {
    expect(wordsToNumber('simple')).toBeNull()
    expect(wordsToNumber('two lovely')).toBeNull()
    expect(wordsToNumber('')).toBeNull()
  })

  it('gives a spelled figure the SAME canonical form as its digits', () => {
    for (const [words, digits] of [
      ['two dollars', '$2'],
      ['five thousand dollar oven', '$5,000'],
      ['fifty cents', '$0.50'],
      ['ninety percent', '90%'],
    ] as const) {
      expect([...claimedValues(words)]).toEqual([...claimedValues(digits)])
      expect([...claimedValues(words)]).not.toEqual([])
    }
  })

  it('B1: the invented pricing chain is now visible', () => {
    const line = 'Multiplying your two dollar base cost by three gives you an absolute'
      + ' minimum of seven dollars, which positions a standard artisan loaf perfectly'
      + ' at nine to ten dollars for local pickup orders.'
    const v = claimedValues(line)
    expect(v.has(canonicalValue('$2'))).toBe(true)
    expect(v.has(canonicalValue('$7'))).toBe(true)
    // ⚖️ THE RANGE NAMES TWO FIGURES AND ONLY THE SECOND CARRIES THE UNIT.
    expect(v.has(canonicalValue('$9'))).toBe(true)
    expect(v.has(canonicalValue('$10'))).toBe(true)
  })

  it('the recurring fabricated oven, seen twice across the eight runs', () => {
    const v = claimedValues('You do not need a five thousand dollar oven to launch a microbakery.')
    expect(v.has(canonicalValue('$5000'))).toBe(true)
  })

  it('the packaging range, whose lower bound would otherwise be lost', () => {
    const v = claimedValues('add another fifty to seventy five cents per loaf')
    expect(v.has(canonicalValue('$0.50'))).toBe(true)
    expect(v.has(canonicalValue('$0.75'))).toBe(true)
  })

  // ── CONTROLS. THESE MUST STAY EMPTY, AND THEY ARE THE POINT ──────────────

  it('a number word with no unit is not a figure', () => {
    // ⚠️ THE LEDGER G8 LINE ITSELF. "one simple filming technique" must not
    // become the value 1, or the check starts accusing every script of arithmetic.
    expect(claimedValues('This one simple filming technique changed everything.').size).toBe(0)
    expect(claimedValues('Baking is about repetitive physical steps, not fancy gear.').size).toBe(0)
  })

  it('MULTIPLES ARE STILL NOT MATCHED — that question belongs to comparativeClaim', () => {
    // ⚠️ `comparativeClaim.ts` states in writing that widening THIS matcher to
    // see multiples would change what that detector owns. It still would.
    expect(claimedValues('lasts six times longer than store alternatives').size).toBe(0)
    expect(claimedValues('that makes it half the price per burn hour').size).toBe(0)
  })

  it('the existing digit behaviour is unchanged', () => {
    expect([...claimedValues('$50K a month')]).toEqual([...claimedValues('$50,000 a month')])
    expect(claimedValues('3x my productivity').has('3x')).toBe(true)
  })

  it('an entailment gap is now FOUND where the citation carries no such figure', () => {
    const gaps = findEntailmentGaps([{
      substance: 'creator_knowledge',
      line: 'You do not need a five thousand dollar oven.',
      substance_evidence: 'Sold forty loaves in under two hours at her first market.',
    }])
    expect(gaps).toHaveLength(1)
    expect(gaps[0].value).toBe(canonicalValue('$5000'))
  })

  it('and is NOT found when the citation does carry it, in either spelling', () => {
    expect(findEntailmentGaps([{
      substance: 'creator_knowledge',
      line: 'I raised it to twelve dollars a loaf.',
      substance_evidence: 'She raised her price to $12 and lost three customers.',
    }])).toHaveLength(0)
  })
})

describe('a compound price is one figure, not two', () => {
  it('"two dollars and twenty five cents" is $2.25 — the exact false accusation avoided', () => {
    const v = claimedValues('bringing your true base cost to roughly two dollars and twenty five cents.')
    expect(v.has(canonicalValue('$2.25'))).toBe(true)
    // ⚠️ AND NOT the two halves, which would match no citation stating $2.25.
    expect(v.has(canonicalValue('$2'))).toBe(false)
    expect(v.has(canonicalValue('$0.25'))).toBe(false)
  })

  it('"one dollar and fifty cents" is $1.50', () => {
    expect(claimedValues('those four ingredients usually add up to about one dollar and fifty cents total.')
      .has(canonicalValue('$1.50'))).toBe(true)
  })

  it('a beat citing $2.25 is NOT reported as inventing a figure', () => {
    expect(findEntailmentGaps([{
      substance: 'creator_knowledge',
      line: 'Your true base cost is two dollars and twenty five cents.',
      substance_evidence: 'Her true base cost per loaf works out at $2.25.',
    }])).toHaveLength(0)
  })
})
