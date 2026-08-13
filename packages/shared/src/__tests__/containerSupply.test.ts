// THE COUNT CONTRACT CHECKS THE OUTPUT. NOTHING CHECKED THE INPUT.
//
// ⚠️ THE GAP. `blueprintCountIssues` verifies a finished script delivered the
// promised number of items. It cannot tell three real tools from one real tool
// and two invented ones — both count as three, and the invented two are worded
// exactly like the real one.
//
// §18a: "an unresolved container handed to a writer does not come back empty; it
// comes back INVENTED, phrased with the same confidence as the resolved ones.
// That is how a tech reviewer ends up promoting three products that do not
// exist."
//
// ⚖️ AND IT IS KNOWABLE BEFORE WRITING. Demand comes from the reference, supply
// from the creator's own material; both exist before a generation is spent.
import { describe, expect, it } from 'vitest'
import { checkSupply, describeShortfall, ENUMERABLE_KINDS } from '../containerSupply'

const p = (text: string) => ({ kind: 'product', text })

describe('a reference that promises more than the creator has', () => {
  it('reports what would be invented', () => {
    const got = checkSupply({ isEnumerated: true, count: 3, unit: 'AI tools' },
      [p('Cursor')])
    expect(got).toEqual({ demand: 3, supply: 1, shortfall: 2, wouldInvent: true })
  })

  it('is clean when the creator can fill it', () => {
    const got = checkSupply({ isEnumerated: true, count: 3, unit: 'AI tools' },
      [p('Cursor'), p('Claude Code'), p('Linear')])
    expect(got.wouldInvent).toBe(false)
    expect(got.shortfall).toBe(0)
  })

  it('does not count the same thing twice', () => {
    // ⚠️ A CREATOR WHO MENTIONED ONE PHONE IN FOUR CAPTIONS HAS ONE PHONE.
    // Counting repetitions would report a container as fillable when it is not,
    // which is the failure mode this check exists to prevent, inverted.
    const got = checkSupply({ isEnumerated: true, count: 3, unit: 'phones' },
      [p('Z Fold 8'), p('z fold 8'), p('Z-Fold 8!'), p('  Z Fold 8  ')])
    expect(got.supply).toBe(1)
    expect(got.wouldInvent).toBe(true)
  })
})

describe('what can be an ITEM is narrower than what can carry a beat', () => {
  it('excludes opinion and topic, which cannot be item two of a list', () => {
    // ⚖️ DELIBERATELY DIFFERENT FROM `SUBSTANCE_KINDS`. "Megapixels are oversold"
    // is substance — it can carry a beat — and it is not one of five phones.
    expect(ENUMERABLE_KINDS.has('opinion')).toBe(false)
    expect(ENUMERABLE_KINDS.has('topic')).toBe(false)
  })

  it('INCLUDES product, which the substance set excludes', () => {
    // The two lists answer different questions, and that is the point: a bare
    // product mention asserts nothing but is absolutely a countable item.
    expect(ENUMERABLE_KINDS.has('product')).toBe(true)
  })

  it('does not let opinions fill an enumerated slot', () => {
    const got = checkSupply({ isEnumerated: true, count: 3, unit: 'tools' },
      [{ kind: 'opinion', text: 'AI hype is overblown' },
       { kind: 'topic', text: 'AI tooling' }, p('Cursor')])
    expect(got.supply).toBe(1)
    expect(got.shortfall).toBe(2)
  })
})

describe('a reference with no promise cannot be short', () => {
  it('reports demand as null rather than zero', () => {
    // ⚖️ THREE-STATE: "the question does not apply" is not "it applies and the
    // answer is none". A shortfall of 0 against a demand of 0 would read as a
    // container that was checked and passed.
    const got = checkSupply({ isEnumerated: false, count: null, unit: null }, [])
    expect(got.demand).toBeNull()
    expect(got.wouldInvent).toBe(false)
  })

  it('handles a missing mechanism without inventing a demand', () => {
    expect(checkSupply(null, [p('x')]).demand).toBeNull()
    expect(checkSupply(undefined, []).wouldInvent).toBe(false)
  })

  it('ignores a nonsense count rather than treating it as a promise', () => {
    for (const count of [0, -3]) {
      expect(checkSupply({ isEnumerated: true, count, unit: 'x' }, []).demand).toBeNull()
    }
  })
})

describe('the message names the trade rather than refusing flatly', () => {
  it('says what the format wants and what exists', () => {
    const c = checkSupply({ isEnumerated: true, count: 5, unit: 'phones' }, [p('a'), p('b')])
    expect(describeShortfall(c, 'phones'))
      .toBe('This format promises 5 phones and we can support 2. Writing it now would invent 3.')
  })

  it('says nothing when there is nothing to say', () => {
    const ok = checkSupply({ isEnumerated: true, count: 1, unit: 'x' }, [p('a')])
    expect(describeShortfall(ok, 'x')).toBe('')
  })

  it('falls back to a neutral noun when the reference named no unit', () => {
    // ⚠️ THE REFERENCE'S UNIT IS A READING OF THEIR VIDEO, not a word for this
    // creator's script — the count contract warns about carrying it across. An
    // absent unit must not become a blank in a sentence shown to a creator.
    const c = checkSupply({ isEnumerated: true, count: 3, unit: null }, [])
    expect(describeShortfall(c, null)).toMatch(/3 items/)
  })
})
