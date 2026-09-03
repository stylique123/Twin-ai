import { describe, expect, it } from 'vitest'
import { isDisclaimer, splitDisclaimersFromCtas, claimsPrefillFrom } from '../claimDisclaimers.js'

/**
 * ⚠️ THE FIRST STRING BELOW IS REAL. The scan of a Senior MSK Physiotherapist
 * filed it as a recurring CTA. It is a safety disclaimer, and the two filings
 * produce opposite behaviour: a CTA is something scripts may end on, a claim
 * restriction is something scripts must obey.
 */
const REAL = 'Always discuss this with your physiotherapist or surgeon.'
const REAL_2 = "I can't provide individual rehabilitation advice through social media"

describe('isDisclaimer', () => {
  it('catches the production line that was misfiled', () => {
    expect(isDisclaimer(REAL)).toBe(true)
  })

  it('catches his second one', () => {
    expect(isDisclaimer(REAL_2)).toBe(true)
  })

  for (const line of [
    'Not medical advice.',
    'This is not financial advice',
    'Please consult with your doctor before starting',
    'Get cleared by your physio first',
    'Seek professional advice before acting on this',
    'For educational purposes only',
    'Results may vary',
    'Not a substitute for professional care',
  ]) {
    it(`catches: ${line}`, () => expect(isDisclaimer(line)).toBe(true))
  }

  // ⚖️ THE FALSE POSITIVE IS THE EXPENSIVE ONE. Swallowing a real CTA costs the
  // creator their closing line — the same failure this fix exists to prevent,
  // pointed the other way. "Consult" alone would catch the first two.
  for (const line of [
    'Consult my free guide in the bio',
    'Talk to me in the comments',
    'Drop an injury in the comments',
    'Save this post for later',
    'Tag someone who needs this',
    'Follow for more rehab tips',
    'Link in bio for the full programme',
    'Share this with your training partner',
  ]) {
    it(`leaves alone: ${line}`, () => expect(isDisclaimer(line)).toBe(false))
  }

  it('is false for a non-string and for empty', () => {
    expect(isDisclaimer(null)).toBe(false)
    expect(isDisclaimer(42)).toBe(false)
    expect(isDisclaimer('   ')).toBe(false)
  })
})

describe('splitDisclaimersFromCtas', () => {
  it('splits his real four-item CTA list the way the scan should have', () => {
    const r = splitDisclaimersFromCtas([
      'Drop an injury in the comments',
      REAL,
      'Save this post',
      'Tag, share, appreciate',
    ])
    expect(r.ctas).toEqual(['Drop an injury in the comments', 'Save this post', 'Tag, share, appreciate'])
    expect(r.disclaimers).toEqual([REAL])
  })

  // The creator's own wording is what a compliance field must show back.
  it('preserves wording and order in both lists', () => {
    const r = splitDisclaimersFromCtas(['Not medical advice.', 'Follow for more', 'Results may vary'])
    expect(r.disclaimers).toEqual(['Not medical advice.', 'Results may vary'])
    expect(r.ctas).toEqual(['Follow for more'])
  })

  // A phrase repeated across twenty captions is one restriction.
  it('collapses duplicates case-insensitively', () => {
    const r = splitDisclaimersFromCtas([REAL, REAL.toUpperCase(), 'Save this', 'save this'])
    expect(r.disclaimers).toHaveLength(1)
    expect(r.ctas).toHaveLength(1)
  })

  it('drops blanks and non-strings without throwing', () => {
    const r = splitDisclaimersFromCtas(['', '   ', null, 7, 'Follow me'] as unknown[])
    expect(r.ctas).toEqual(['Follow me'])
    expect(r.disclaimers).toEqual([])
  })

  it('is empty for a non-array', () => {
    expect(splitDisclaimersFromCtas(null)).toEqual({ ctas: [], disclaimers: [] })
  })
})

describe('claimsPrefillFrom', () => {
  it('is null when nothing was found — absent is not empty', () => {
    expect(claimsPrefillFrom([])).toBeNull()
  })

  it('joins what was found in the creator own words', () => {
    expect(claimsPrefillFrom([REAL, 'Not medical advice.']))
      .toBe(`${REAL} · Not medical advice.`)
  })

  it('is null when everything is blank', () => {
    expect(claimsPrefillFrom(['  ', ''])).toBeNull()
  })
})
