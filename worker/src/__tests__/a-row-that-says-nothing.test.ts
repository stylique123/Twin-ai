import { describe, expect, it } from 'vitest'
import { tierZeroSilence } from '../tierZeroSilence.js'

/**
 * ⚠️ THE RATE IS REAL: 2 of 5 visual passes that RAN wrote neither Tier 0
 * column, in production, on 2026-09-03. This function is the witness that says
 * which of the two silent shapes it was — the database cannot, because both
 * leave every column null.
 */
const PROFILE = { cuts: 0, cutsPerMinute: 0, medianShotSec: null, faceCoveragePct: 100, speechPct: 89.6 }

describe('tierZeroSilence', () => {
  it('is silent about a pass that never ran — that silence is honest', () => {
    expect(tierZeroSilence({ ran: false, tier_zero: null })).toBeNull()
    expect(tierZeroSilence(null)).toBeNull()
    expect(tierZeroSilence(undefined)).toBeNull()
  })

  // The 121 UNKNOWN_DOWNLOAD_FAILURE rows in the same window must not drown it.
  it('ignores a download failure, which never reaches Tier 0', () => {
    expect(tierZeroSilence({ ran: false, tier_zero: null })).toBeNull()
  })

  it('says nothing when real numbers were written', () => {
    expect(tierZeroSilence({ ran: true, tier_zero: { ran: true, profile: PROFILE, failureCode: null } }))
      .toBeNull()
  })

  it('says nothing when a reason was named', () => {
    expect(tierZeroSilence({ ran: true, tier_zero: { ran: false, profile: null, failureCode: 'NO_SIGNAL' } }))
      .toBeNull()
  })

  // SHAPE ONE: the pass ran and carried no Tier 0 object at all.
  it('names a pass that ran with no result attached', () => {
    expect(tierZeroSilence({ ran: true, tier_zero: null })).toBe('NO_RESULT_ON_A_PASS_THAT_RAN')
    expect(tierZeroSilence({ ran: true })).toBe('NO_RESULT_ON_A_PASS_THAT_RAN')
  })

  // SHAPE TWO: a result with neither numbers nor a reason — the row 0180 forbids.
  it('names a result that produced no profile and no code', () => {
    expect(tierZeroSilence({ ran: true, tier_zero: { ran: false, profile: null, failureCode: null } }))
      .toBe('RESULT_WITHOUT_PROFILE_OR_CODE')
  })

  it('treats an empty or whitespace code as no code', () => {
    expect(tierZeroSilence({ ran: true, tier_zero: { ran: false, profile: null, failureCode: '' } }))
      .toBe('RESULT_WITHOUT_PROFILE_OR_CODE')
    expect(tierZeroSilence({ ran: true, tier_zero: { ran: false, profile: null, failureCode: '   ' } }))
      .toBe('RESULT_WITHOUT_PROFILE_OR_CODE')
  })

  // A profile present with a code is contradictory but NOT silent — the row
  // carries numbers, so it is not this function's finding to report.
  it('stays quiet when a profile exists even beside a code', () => {
    expect(tierZeroSilence({ ran: true, tier_zero: { ran: true, profile: PROFILE, failureCode: 'TIMED_OUT' } }))
      .toBeNull()
  })
})
