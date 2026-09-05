// @vitest-environment jsdom
//
// "I AM NOT SURE YET" WAS NOT ON THE FORM, AND WOULD HAVE BEEN STORED AS "NO".
//
// ⚠️ THE DEFECT, IN TWO PARTS. The product card offered FOUR showability states;
// both add flows offered three — Usually / Sometimes / No — hand-written twice
// in the page, and neither form would submit until one was picked. A creator who
// did not yet know whether they could have the thing on camera had to guess, and
// the guess was stored as an answer.
//
// ⚠️ AND THE MISSING OPTION COULD NOT SIMPLY BE ADDED. `answeredShowability`
// returns every answer verbatim EXCEPT UNKNOWN, which it hands to
// `inferShowability(type, flags)`. The forms built those flags as
// `showability === 'ALWAYS'` — so an added "not sure" would have arrived as
// `canFilmObjects: false`, which `inferShowability` reads as NEVER. The honest
// answer would have become a silent denial, forbidding every scene that shows
// the product. This asserts the full chain, not the radio button.
import { describe, it, expect } from 'vitest'
// ⚖️ THE REAL HELPER, IMPORTED, NOT RE-TYPED. A local copy of the rule under
// test asserts that the copy is right and says nothing about the page.
import { answeredShowability, inferShowability, capabilityFlag } from '@twinai/shared'
import type { Showability } from '@twinai/shared'

/** What the form sends, end to end, for one picked option. */
function stored(answer: Showability | null): Showability {
  return answeredShowability('PHYSICAL_PRODUCT', answer,
    { canFilmObjects: capabilityFlag(answer) })
}

describe('every option the capability question offers survives being stored', () => {
  it('keeps "not sure" as UNKNOWN rather than turning it into NEVER', async () => {
    expect(stored('UNKNOWN')).toBe('UNKNOWN')
  })

  it('would have stored it as NEVER under the flag expression the forms used', () => {
    // ⚠️ THE DEFECT, EXECUTED. Not an argument that it was possible — the old
    // expression, run, producing the denial.
    const oldFlag = ('UNKNOWN' as Showability) === 'ALWAYS'
    expect(oldFlag).toBe(false)
    expect(answeredShowability('PHYSICAL_PRODUCT', 'UNKNOWN', { canFilmObjects: oldFlag }))
      .toBe('NEVER')
  })

  it('carries the three answers that were already offered, unchanged', () => {
    expect(stored('ALWAYS')).toBe('ALWAYS')
    // ⚠️ SOMETIMES IS THE ANSWER A BOOLEAN CANNOT CARRY, and it reaches storage
    // intact because `answeredShowability` never consults the flags for it —
    // the flag it is handed is `false`, which would have said NEVER.
    expect(stored('SOMETIMES')).toBe('SOMETIMES')
    expect(stored('NEVER')).toBe('NEVER')
  })

  it('leaves a screen product answer alone too', () => {
    expect(answeredShowability('SAAS', 'UNKNOWN', { canRecordScreen: capabilityFlag('UNKNOWN') }))
      .toBe('UNKNOWN')
  })

  it('agrees with inferShowability about what null means', () => {
    // The property the fix rests on, asserted rather than assumed.
    expect(inferShowability('PHYSICAL_PRODUCT', { canFilmObjects: null })).toBe('UNKNOWN')
    expect(inferShowability('PHYSICAL_PRODUCT', { canFilmObjects: false })).toBe('NEVER')
  })
})
