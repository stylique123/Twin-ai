import { describe, it, expect } from 'vitest'
import { firstPersonFailures } from '../script/firstPersonFloor'
import { middleBeats } from '../script/craftContracts'

/**
 * ⚠️⚠️ THE DEFECT THIS FREEZES, MEASURED 2026-09-07 ACROSS THE 33 STORED
 * PRODUCTION SCRIPTS:
 *
 *     first-person HOOK, second-person middle, middle has text ....  5
 *     no first person anywhere, middle has text ................... 13
 *     first person somewhere in the middle (correctly clear) ......  5
 *     middle carries no text at all (a DIFFERENT defect) .......... 10
 *
 * Those five said "I" once, in the opening line, and never again. The old floor
 * cleared on ANY first-person beat, so one word in the hook bought a wholly
 * second-person body. Every test below fails on the previous source.
 */

const K = (section: string, line: string) =>
  ({ section, line, substance: 'creator_knowledge' })

describe('a first-person hook does not clear a second-person middle', () => {
  it('flags the shape five production scripts actually have', () => {
    const script = [
      K('Hook', 'I lost money on my first hundred loaves.'),
      K('Setup', 'Most people think flat loaves happen because you lack a proofer.'),
      K('Re-hook', 'You end up blaming the oven when the dough was never the problem.'),
      K('CTA', 'Follow for the rest of this.'),
    ]
    const out = firstPersonFailures(script, 6)
    expect(out).toHaveLength(1)
    // ⚠️ AND IT MUST NOT OFFER TO REWRITE THE HOOK. Scoping the check to the
    // middle and then repairing any matching beat would clear a floor that is
    // no longer looking at the hook — the same defect one layer down.
    expect(out[0].index).not.toBe(0)
    expect(script[out[0].index].section).toBe('Setup')
  })

  it('a first-person RE-HOOK still clears it — a re-hook is a middle beat', () => {
    expect(firstPersonFailures([
      K('Hook', 'Flat loaves are not an oven problem.'),
      K('Setup', 'Most people think it is the proofer.'),
      K('Re-hook', 'I spent six months blaming mine before I checked the flour.'),
      K('CTA', 'Follow for the rest.'),
    ], 6)).toEqual([])
  })

  it('a first-person CTA does NOT clear it — the CTA is not the body either', () => {
    expect(firstPersonFailures([
      K('Hook', 'Flat loaves are not an oven problem.'),
      K('Setup', 'Most people think it is the proofer.'),
      K('CTA', 'Follow me for the rest of this.'),
    ], 6)).toHaveLength(1)
  })
})

// ⚠️ THE OTHER DEFECT, AND THIS RULE MUST STAY SILENT ON IT. Ten of the 33
// emit a fully-labelled three-or-four-beat middle in which not one beat carries
// a line. There is no sentence there to make first person, and flagging it
// would describe the wrong defect to the creator.
describe('an empty middle is a different defect and is not flagged here', () => {
  it('says nothing when every middle beat is textless', () => {
    expect(firstPersonFailures([
      K('Hook', 'Flat loaves are not an oven problem.'),
      { section: 'Reason 1', line: '', substance: 'creator_knowledge' },
      { section: 'Pitfall 2: operational inefficiency', line: '', substance: 'creator_knowledge' },
      K('CTA', 'Follow for the rest.'),
    ], 6)).toEqual([])
  })
})

describe('the supply check still precedes everything', () => {
  it('an empty store is never flagged, however second-person the middle is', () => {
    expect(firstPersonFailures([
      K('Hook', 'I lost money on my first hundred loaves.'),
      K('Setup', 'You think this is about the oven.'),
    ], 0)).toEqual([])
  })
})

// ⚖️ `middleBeats` IS NOT `bodyBeats`, AND THE DIFFERENCE IS DELIBERATE.
// `bodyBeats` asks "where must substance be specific" and drops the re-hook on
// purpose. This asks "where must the CREATOR appear", and a re-hook is a fine
// place for them to appear.
describe('middleBeats keeps the beats bodyBeats deliberately drops', () => {
  it('keeps a re-hook, and the composite labels production actually emits', () => {
    const kept = middleBeats([
      { section: 'Hook', line: 'a' },
      { section: 'Re-hook', line: 'b' },
      { section: 'mistake 2 / re-hook', line: 'c' },
      { section: 're-hook: shift in mindset', line: 'd' },
      { section: 'Payoff', line: 'e' },
      { section: 'CTA', line: 'f' },
    ]).map((b) => b.section)
    expect(kept).toEqual(['Re-hook', 'mistake 2 / re-hook', 're-hook: shift in mindset'])
  })
})
