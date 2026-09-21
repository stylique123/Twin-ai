// THE HONESTY CHECK AND "WHY IT WORKS" CONTRADICTED EACH OTHER ON ONE SCREEN.
//
// ⚠️⚠️ OBSERVED BY THE OWNER IN A SINGLE SCREENSHOT:
//   honesty check: "This video promises a number it does not deliver. The
//                   script promises 2 and delivers 0."
//   why it works:  "Your hook names a number, so people know exactly how much
//                   you are promising them."
//
// ⚖️ THE PRAISE YIELDS, AND NOT BECAUSE IT IS WRONG IN GENERAL. A number in the
// hook IS a size the viewer can hold — that is why the claim exists. It stops
// being true the moment the script does not deliver it.
import { describe, expect, it } from 'vitest'
import { honestWhyItWorks } from '../script/whyItWorksHonesty'

const NUMBER_CLAIM = 'Your hook names a number, so people know exactly how much you are promising them.'
const OTHERS = [
  'There is a second hook partway through, at the point where attention usually drifts.',
  'You end on one action in 20 words, so nobody has to work out what to do next.',
  'It runs 5 spoken beats, each doing one job.',
]
const ALL = [NUMBER_CLAIM, ...OTHERS]

describe('a broken promise is never also praised', () => {
  it('drops the number claim when the check has contradicted it', () => {
    expect(honestWhyItWorks(ALL, true)).toEqual(OTHERS)
  })

  it('and keeps every other claim, because only one was contradicted', () => {
    // ⚠️ A panel that empties itself on one bad claim would trade a
    // contradiction for a blank — the creator learns nothing either way.
    expect(honestWhyItWorks(ALL, true)).toHaveLength(OTHERS.length)
  })
})

describe('it does not suppress on a guess', () => {
  it('keeps the claim when the promise holds', () => {
    expect(honestWhyItWorks(ALL, false)).toEqual(ALL)
  })

  it('keeps it when NOBODY CHECKED, which is a different thing from "fine"', () => {
    // ⚠️ `false` means the check ran and the promise holds; `undefined` means
    // no verdict exists. A caller that cannot compute one must show exactly
    // what it shows today rather than hiding claims on an assumption.
    expect(honestWhyItWorks(ALL)).toEqual(ALL)
    expect(honestWhyItWorks(ALL, undefined)).toEqual(ALL)
  })
})

describe('it is a filter over STORED claims, so old blueprints are repaired too', () => {
  it('survives junk in the stored array without throwing', () => {
    expect(honestWhyItWorks([NUMBER_CLAIM, '', '   ', null, 42, OTHERS[0]], true))
      .toEqual([OTHERS[0]])
  })

  it('absent or malformed input yields an empty list, never a crash', () => {
    for (const v of [null, undefined, 'not an array' as unknown as string[]]) {
      expect(honestWhyItWorks(v as never, true)).toEqual([])
    }
  })

  it('matches on the claim opening, so a copy tweak does not silently stop it', () => {
    expect(honestWhyItWorks(['Your hook names a number and that is good.'], true)).toEqual([])
    // A different claim that merely mentions a number is NOT the one to drop.
    expect(honestWhyItWorks(['It runs 5 spoken beats, each doing one job.'], true))
      .toEqual(['It runs 5 spoken beats, each doing one job.'])
  })
})
