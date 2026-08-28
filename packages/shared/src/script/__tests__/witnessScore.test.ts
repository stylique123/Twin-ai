import { describe, expect, it } from 'vitest'
import { witnessScore } from '../witnessScore'

describe('first-person beats', () => {
  it('counts a creator_knowledge beat spoken in first person', () => {
    const beats = [{ substance: 'creator_knowledge', line: 'I tried this for six months before it worked.' }]
    expect(witnessScore(beats).firstPersonBeats).toBe(1)
  })

  it('does not count creator_knowledge without a first-person marker', () => {
    const beats = [{ substance: 'creator_knowledge', line: 'This approach works for most people.' }]
    expect(witnessScore(beats).firstPersonBeats).toBe(0)
  })

  it('does not count first-person text with a different substance', () => {
    const beats = [{ substance: 'reference', line: 'I built this from scratch over a weekend.' }]
    expect(witnessScore(beats).firstPersonBeats).toBe(0)
  })

  it('catches "my", "we" and "our", not only "i"', () => {
    const beats = [
      { substance: 'creator_knowledge', line: 'My first attempt failed completely.' },
      { substance: 'creator_knowledge', line: 'We built this together over a year.' },
      { substance: 'creator_knowledge', line: 'Our results were nothing like the ads promised.' },
    ]
    expect(witnessScore(beats).firstPersonBeats).toBe(3)
  })
})

describe('figures spoken', () => {
  it('counts a beat asserting a real number regardless of substance', () => {
    const beats = [{ substance: 'reference', line: 'This grew revenue by 40% in three months.' }]
    expect(witnessScore(beats).figuresSpoken).toBe(1)
  })

  it('a line with no figure does not count', () => {
    const beats = [{ substance: 'creator_knowledge', line: 'It just felt different, honestly.' }]
    expect(witnessScore(beats).figuresSpoken).toBe(0)
  })

  it('counts multiple beats independently', () => {
    const beats = [
      { substance: 'reference', line: 'We tripled followers in 2 months.' },
      { substance: 'creator_knowledge', line: 'I spent $500 on the first batch.' },
      { substance: 'general', line: 'Nothing numeric here at all.' },
    ]
    expect(witnessScore(beats).figuresSpoken).toBe(2)
  })
})

describe('the sermon-without-witness shape this exists to name', () => {
  it('a script can carry figures from a reference and zero first-person beats', () => {
    const beats = [
      { substance: 'reference', line: 'This creator grew to 100K followers in a year.' },
      { substance: 'reference', line: 'They posted every day for 6 months straight.' },
    ]
    const score = witnessScore(beats)
    expect(score.firstPersonBeats).toBe(0)
    expect(score.figuresSpoken).toBe(2)
  })
})

describe('malformed input', () => {
  it('a non-array script scores zero on both, not a crash', () => {
    for (const v of [null, undefined, 'x', 3, {}]) {
      expect(witnessScore(v)).toEqual({ firstPersonBeats: 0, figuresSpoken: 0 })
    }
  })

  it('a beat with no line or non-string line is skipped, not a crash', () => {
    const beats = [
      { substance: 'creator_knowledge' },
      { substance: 'creator_knowledge', line: null },
      { substance: 'creator_knowledge', line: 42 },
    ]
    expect(() => witnessScore(beats)).not.toThrow()
    expect(witnessScore(beats)).toEqual({ firstPersonBeats: 0, figuresSpoken: 0 })
  })
})
