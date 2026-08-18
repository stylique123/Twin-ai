// THE TRAP THIS FILE EXISTS TO AVOID.
//
// ⚠️ A CREATOR WITH FORTY TALKING-HEADS MAY BE HERE TO STOP MAKING THEM. Reading
// their archive as their preference would keep recommending the thing they came
// to escape — while looking exactly like personalisation.
import { describe, expect, it } from 'vitest'
import { formatStance, type FormatProfile } from '../formatProfile'
import type { ProductionMode } from '../referenceProfile'

const AT = '2026-01-01T00:00:00.000Z'
const observed = (v: ProductionMode[]) =>
  ({ value: v, source: 'observed' as const, evidence: { count: v.length } as never, updatedAt: AT })
const answered = (v: ProductionMode[]) =>
  ({ value: v, rawValue: v, source: 'user_answer' as const, updatedAt: AT })

const HISTORY_ONLY: FormatProfile = {
  observedFormats: observed(['talking_head']),
  preferredFormats: null,
}

describe('an archive is evidence, not intent', () => {
  it('a format they already make is FAMILIAR, never preferred', () => {
    const v = formatStance('talking_head', HISTORY_ONLY)
    expect(v.stance).toBe('familiar')
    expect(v.because).toBe('You already make videos like this one.')
  })

  it('and a format they asked for beats one they merely have a history of', () => {
    // ⚖️ THE ORDER IS THE POINT. The history is the thing they may be trying to
    // change, so a stated preference outranks it.
    const both: FormatProfile = {
      observedFormats: observed(['talking_head']),
      preferredFormats: answered(['pov_skit', 'talking_head']),
    }
    expect(formatStance('talking_head', both).stance).toBe('preferred')
    expect(formatStance('pov_skit', both).stance).toBe('preferred')
  })
})

describe('nobody asked is not the same as no', () => {
  it('an unasked creator with nothing observed gets not_checked, not expansion', () => {
    // ⚠️ CALLING THIS "EXPANSION" WOULD INVENT AN INTENT. A new direction is only
    // a new direction relative to something known.
    const blank: FormatProfile = { observedFormats: observed([]), preferredFormats: null }
    const v = formatStance('pov_skit', blank)
    expect(v.stance).toBe('not_checked')
    expect(v.because).toMatch(/Nobody has asked/)
  })

  it('and an unassessed reference is not_checked whatever the creator said', () => {
    expect(formatStance(null, HISTORY_ONLY).stance).toBe('not_checked')
  })

  it('never reports a preference the creator did not state', () => {
    // ⚠️ THE ASSERTION THAT WOULD CATCH THE COLLAPSE. If `observed` ever became
    // preference authority, this is the test that fails.
    for (const mode of ['talking_head', 'pov_skit', 'podcast_interview'] as ProductionMode[]) {
      expect(formatStance(mode, HISTORY_ONLY).stance).not.toBe('preferred')
    }
  })
})

describe('a deliberate suggestion outside the usual', () => {
  it('is expansion once something IS known', () => {
    expect(formatStance('pov_skit', HISTORY_ONLY).stance).toBe('expansion')
    expect(formatStance('pov_skit', HISTORY_ONLY).because)
      .toBe('This is different from what you usually make.')
  })
})
