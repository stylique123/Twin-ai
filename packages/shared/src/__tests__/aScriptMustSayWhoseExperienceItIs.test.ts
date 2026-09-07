import { describe, it, expect } from 'vitest'
import { firstPersonFailures } from '../script/firstPersonFloor'
import { witnessScore } from '../script/witnessScore'

// ⚠️ THE SERMON SHAPE, TAKEN FROM THE NINE PRODUCTION CASES: every beat draws on
// the creator's own supplied knowledge and not one of them says "I".
const SERMON = [
  { line: 'Most home bakers underprice a loaf because they only count flour.', substance: 'creator_knowledge' },
  { line: 'The real cost is the eight hours the dough sits.', substance: 'creator_knowledge' },
  { line: 'Follow if you want the rest of this.', substance: 'none' },
]

describe('the floor fires on the measured failure', () => {
  it('flags a sermon written for a creator who supplied material', () => {
    const out = firstPersonFailures(SERMON, 12)
    expect(out).toHaveLength(1)
    expect(out[0].index).toBe(0)
    expect(out[0].line).toContain('underprice')
  })

  // ⚠️ THE COUNTER AND THE FLOOR MUST AGREE. A script the floor flags is a
  // script witnessScore scored at zero — if these ever disagree, one of them is
  // measuring something other than "is this in their voice".
  it('the script it flags is exactly the one witnessScore scored at zero', () => {
    expect(witnessScore(SERMON).firstPersonBeats).toBe(0)
    expect(firstPersonFailures(SERMON, 12)).toHaveLength(1)
  })

  it('names only the creator_knowledge beat, never the sign-off', () => {
    expect(firstPersonFailures(SERMON, 12)[0].index).not.toBe(2)
  })

  // ⚖️ THE REPAIR MUST NOT INVITE AN INVENTION. It changes who is speaking and
  // nothing else.
  it('the repair forbids adding a detail, a number or an event', () => {
    const r = firstPersonFailures(SERMON, 12)[0].repair
    expect(r).toContain('Change only who is speaking')
    expect(r).toMatch(/not add a detail, a number, or an event/)
  })
})

describe('the six cases it must leave alone', () => {
  // ⚠️ THE NEGATIVE CONTROL THAT MAKES THE FLOOR SAFE. Six of the fifteen
  // zero-witness scripts belong to creators with an EMPTY store. Zero witness is
  // the correct output for them and flagging it would demand a story that never
  // happened.
  it('an empty knowledge store is never a failure', () => {
    expect(firstPersonFailures(SERMON, 0)).toEqual([])
  })

  it('a negative or nonsense supply count is treated as no supply', () => {
    expect(firstPersonFailures(SERMON, -1)).toEqual([])
    expect(firstPersonFailures(SERMON, Number.NaN)).toEqual([])
  })

  it('one first-person beat anywhere clears the whole script', () => {
    const withVoice = [...SERMON, { line: 'I lost money on my first hundred loaves.', substance: 'creator_knowledge' }]
    expect(firstPersonFailures(withVoice, 12)).toEqual([])
  })

  it('a first-person beat clears it even when it is the LAST beat', () => {
    expect(firstPersonFailures(
      [SERMON[0], { line: 'That is how we price ours now.', substance: 'creator_knowledge' }], 12,
    )).toEqual([])
  })

  // ⚠️ NOTHING TO RESTORE IS NOT A FAILURE. If the creator's material never
  // reached the script (zero production cases, but possible), rewriting a
  // reference's fact into their mouth would manufacture the testimony this
  // whole file exists to refuse.
  it('stays silent when no beat carries the creator\'s own knowledge', () => {
    expect(firstPersonFailures(
      [{ line: 'Most bakers underprice a loaf.', substance: 'reference' }], 12,
    )).toEqual([])
  })

  it('an empty or malformed script is not a failure', () => {
    expect(firstPersonFailures([], 12)).toEqual([])
    expect(firstPersonFailures(null, 12)).toEqual([])
    expect(firstPersonFailures(undefined, 12)).toEqual([])
  })

  it('a creator_knowledge beat with a blank line is not a rewrite target', () => {
    expect(firstPersonFailures([{ line: '   ', substance: 'creator_knowledge' }], 12)).toEqual([])
  })
})

describe('the marker list', () => {
  for (const [word, line] of [
    ['I', 'I priced it wrong for a year.'],
    ['we', 'we still bake on the same two racks.'],
    ['my', 'my first batch went in the bin.'],
    ['our', 'our flour bill doubled.'],
    ["I've", "I've done this since 2019."],
  ] as const) {
    it(`"${word}" clears the floor`, () => {
      expect(firstPersonFailures([{ line, substance: 'creator_knowledge' }], 12)).toEqual([])
    })
  }

  // ⚖️ A WORD THAT MERELY CONTAINS A MARKER IS NOT A MARKER. "in", "wet" and
  // "iron" all contain letters from the list; a substring match would clear a
  // sermon and the floor would never fire again.
  for (const line of [
    'in a wet dough the iron content matters',
    'this is the important part',
    'imagine a bakery that never opens',
  ]) {
    it(`does not clear on: ${line}`, () => {
      expect(firstPersonFailures([{ line, substance: 'creator_knowledge' }], 12)).toHaveLength(1)
    })
  }
})
