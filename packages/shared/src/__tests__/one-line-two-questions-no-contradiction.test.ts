// ONE LINE, TWO QUESTIONS, AND THEY MUST NOT CONTRADICT EACH OTHER.

// ── AND THE FOUR READERS NOW AGREE ────────────────────────────────────────
//
// ⚠️ THE OWNER'S CASE, END TO END: "A hook says 'six month deal' — one checker
// calls it a broken promise of six items, another panel praises it for naming a
// number." Both readings came from the same six characters, and nothing forced
// them to be compatible.
//
// ⚖️ THEY ARE NOW BOTH RIGHT AND NOT IN CONFLICT: it is a figure (true — the
// script does state a real number) and it is NOT an item count (true — nothing
// was promised). This test exists so that stays true, because the two live in
// different modules and only a cross-module assertion can hold them together.
import { describe, expect, it } from 'vitest'
import { statesCountOfItems, itemCounts } from '../script/numberRole'
import { claimedValues } from '../claimEntailment'
import { witnessScore } from '../script/witnessScore'

describe('one line, two questions, no contradiction', () => {
  const LINE = 'I just closed a six month deal.'

  it('the count contract sees no promise', () => {
    expect(statesCountOfItems(LINE, 6)).toBe(false)
    expect(itemCounts(LINE)).toEqual([])
  })

  it('the witness panel still sees a real figure — that reading was never wrong', () => {
    // ⚖️ THE FIX WAS NOT TO SILENCE THIS ONE. A duration IS a number the creator
    // spoke, and a script grounded in real figures is what this panel exists to
    // notice. What was wrong was the OTHER reader calling it a list.
    expect(claimedValues(LINE).size).toBeGreaterThan(0)
    expect(witnessScore([{ line: LINE, substance: 'creator_experience' }]).figuresSpoken).toBe(1)
  })

  it('a genuine enumeration is seen by BOTH, also without conflict', () => {
    const listy = 'Here are the 3 mistakes I made.'
    expect(itemCounts(listy)).toEqual([3])
    // ⚠️ AND `claimedValues` SAYS NOTHING ABOUT IT, because a bare count carries
    // no unit from its list. Two readers, two questions, neither contradicting.
    expect(claimedValues(listy).size).toBe(0)
  })

  it('the duration lists differ, and the difference is known rather than assumed', () => {
    // ⚠️ AN EARLIER COMMENT OF MINE CLAIMED THESE WERE THE SAME SET. They are
    // not: `numberRole` recognises seconds and `claimEntailment` does not. The
    // asymmetry is safe in this direction — a wider list here can only refuse to
    // call something a count — and it is pinned so nobody re-derives it wrongly.
    expect(itemCounts('5 seconds in, they leave')).toEqual([])
    expect(claimedValues('5 seconds in, they leave').size).toBe(0)
    expect(itemCounts('5 minutes in, they leave')).toEqual([])
    expect(claimedValues('5 minutes in, they leave').size).toBeGreaterThan(0)
  })
})
