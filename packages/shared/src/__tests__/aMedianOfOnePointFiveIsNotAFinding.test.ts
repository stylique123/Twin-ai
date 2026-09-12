// "YOUR BEST POST DID 127 VIEWS — ABOUT 85× YOUR USUAL 1.5."
//
// ⚠️ A MEDIAN OF 1.5 VIEWS. The multiple is real arithmetic and completely
// meaningless: at a median of 1.5 a single extra viewer moves it by two thirds,
// so the card reports the difference between one person and two as an 85-fold
// finding. A creator with 1.5 median views already knows her account is small.
//
// ⚠️ AND `MIN_MEASURED_FOR_A_CLAIM` DOES NOT CATCH IT. That floor asks whether
// we measured ENOUGH POSTS; this asks whether what we measured is a SIGNAL. Ten
// posts of 1, 2 and 0 views pass the first test easily — the sample is complete,
// and it is a complete sample of nothing. Two different questions, and neither
// implies the other.
import { describe, it, expect } from 'vitest'
import {
  messageForWhatWorks, timesTheirNormal,
  MIN_MEASURED_FOR_A_CLAIM, MIN_MEDIAN_FOR_A_CLAIM,
  type WhatWorks,
} from '../ownPerformance'

const post = (plays: number) => ({ plays, url: `https://x/${plays}`, caption: 'c' })

/** The reported account: plenty of measured posts, a median of 1.5. */
const tinyAccount: WhatWorks = {
  median: 1.5, counted: 12, breakouts: [post(127)],
} as WhatWorks

/** A real account, same shape. */
const realAccount: WhatWorks = {
  median: 588, counted: 40, breakouts: [post(543300), post(70600)],
} as WhatWorks

describe('the card says nothing when there is nothing to say', () => {
  it('is silent on a median of 1.5, however many posts were measured', () => {
    expect(messageForWhatWorks(tinyAccount).kind).toBe('silent')
  })

  // ⚠️ THE PROOF THAT THE EXISTING FLOOR NEVER CAUGHT THIS. If it had, this
  // whole change would be unnecessary — and a test that passes for the wrong
  // reason is how that mistake gets made.
  it('and the post-count floor alone would have let it through', () => {
    expect(tinyAccount.counted).toBeGreaterThanOrEqual(MIN_MEASURED_FOR_A_CLAIM)
  })

  it('the arithmetic it suppressed really was 85×', () => {
    // ⚖️ THE NUMBER WAS NEVER WRONG. It was true and meaningless, which is a
    // harder failure to notice than a miscalculation.
    expect(timesTheirNormal(127, 1.5)).toBe(85)
  })
})

describe('a real account still gets its finding', () => {
  // ⚠️ THE NEGATIVE CONTROL. A floor that silenced everybody would "fix" the
  // complaint by deleting the feature, and every other case here would pass.
  it('speaks for the physiotherapist the card was built from', () => {
    const m = messageForWhatWorks(realAccount)
    expect(m.kind).toBe('breakouts')
    if (m.kind !== 'breakouts') return
    expect(m.median).toBe(588)
    expect(m.best.plays).toBe(543300)
    expect(m.alsoRan).toBe(1)
  })

  it('speaks at exactly the floor, not one above it', () => {
    // ⚖️ OFF-BY-ONE AT A THRESHOLD IS A REAL CREATOR SILENCED FOR NOTHING.
    const at: WhatWorks = { median: MIN_MEDIAN_FOR_A_CLAIM, counted: 10, breakouts: [post(900)] } as WhatWorks
    expect(messageForWhatWorks(at).kind).toBe('breakouts')
    const below: WhatWorks = { median: MIN_MEDIAN_FOR_A_CLAIM - 1, counted: 10, breakouts: [post(900)] } as WhatWorks
    expect(messageForWhatWorks(below).kind).toBe('silent')
  })
})

describe('the two floors are different questions', () => {
  // ⚖️ ENOUGH POSTS AND ENOUGH SIGNAL. Each must be able to silence the card on
  // its own, or one is decorative.
  it('a big median with too few posts is still silent', () => {
    const few: WhatWorks = { median: 5000, counted: 3, breakouts: [post(90000)] } as WhatWorks
    expect(messageForWhatWorks(few).kind).toBe('silent')
  })

  it('a small median with plenty of posts is still silent', () => {
    const flat: WhatWorks = { median: 2, counted: 500, breakouts: [post(90)] } as WhatWorks
    expect(messageForWhatWorks(flat).kind).toBe('silent')
  })

  // ⚠️ AND AN UNMEASURED ACCOUNT IS NOT A SMALL ONE. `median === null` means we
  // do not know, which was already silent and must stay distinct from "small".
  it('an unknown median is silent for its own reason', () => {
    const unknown: WhatWorks = { median: null, counted: 40, breakouts: [post(900)] } as WhatWorks
    expect(messageForWhatWorks(unknown).kind).toBe('silent')
  })
})

describe('the threshold is a judgement, and it is labelled as one', () => {
  // ⚠️ MEASURED 2026-09-12: of 5 owners with 10+ measured posts, ONE has a
  // median under 10 (1.5) and FOUR are above 200 — max 37,000. NOTHING lies
  // between. Every threshold from 2 to 200 behaves identically on that
  // population, so this number cannot be fitted to the data and is not claimed
  // to be. This case pins it inside the range the measurement actually supports,
  // so a future edit to 0 or to 5,000 has to argue rather than drift.
  it('sits inside the empty gap the population left', () => {
    expect(MIN_MEDIAN_FOR_A_CLAIM).toBeGreaterThan(1.5)
    expect(MIN_MEDIAN_FOR_A_CLAIM).toBeLessThan(200)
  })
})
