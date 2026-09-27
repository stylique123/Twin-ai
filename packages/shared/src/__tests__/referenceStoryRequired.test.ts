import { describe, it, expect } from 'vitest'
import { choiceFollowUp, followUpLines, REQUIRED_FOLLOW_UPS, FOLLOWUP_PREFIX, NOTHING_SPECIFIC_SUFFIX, NOTHING_SPECIFIC_LINE } from '../videoIntent'

describe('every reference option asks for her real version', () => {
  it('all three fidelity options ask (two skipped it and invented scores)', () => {
    for (const v of ['structure', 'pacing', 'stay_close']) expect(choiceFollowUp('reference_use', v)).toMatch(/your version/)
    expect(REQUIRED_FOLLOW_UPS.has('reference_use')).toBe(true)
  })
  it('"nothing specific" reaches the writer as a do-not-invent line', () => {
    const lines = followUpLines({ reference_use: 'pacing', [FOLLOWUP_PREFIX + 'reference_use' + NOTHING_SPECIFIC_SUFFIX]: '1' })
    expect(lines).toContain(NOTHING_SPECIFIC_LINE)
  })
  it('her own words win over the decline', () => {
    const lines = followUpLines({ reference_use: 'stay_close', [FOLLOWUP_PREFIX + 'reference_use']: 'I roast on Sundays.', [FOLLOWUP_PREFIX + 'reference_use' + NOTHING_SPECIFIC_SUFFIX]: '1' })
    expect(lines).toContain('I roast on Sundays.')
    expect(lines).not.toContain(NOTHING_SPECIFIC_LINE)
  })
})
