// §7b's contract: performance feedback, and the five claim types it refuses to
// let anyone conflate.
//
// The load-bearing test in this file is the n=1 one. §7b calls a confident
// causal claim from one successful video the same failure as "Attention Score
// 9.6" wearing a different costume — and that failure never ships as a
// decision, it ships as an absent check. So it is a refusal here and a CHECK
// constraint in the database, not a paragraph anyone has to remember.
import { describe, expect, it } from 'vitest'
import {
  BUSINESS_METRICS, MIN_CORRELATION_SAMPLE, OUTCOME_CLAIM_TYPES, PLATFORM_METRICS,
  claimQualifier, isBusinessMetric, validateClaim, validateObservation,
} from '../outcomes'

const obs = (over: Record<string, unknown> = {}) => validateObservation({
  metric: 'views', value: 1200, observedAt: '2026-08-04T12:00:00Z', source: 'platform_api', ...over,
})

describe('an observation is a MEASUREMENT with a time, or it is refused', () => {
  it('accepts a well-formed platform reading', () => {
    expect(obs()).toEqual({
      metric: 'views', value: 1200, observedAt: '2026-08-04T12:00:00Z', source: 'platform_api',
    })
  })

  it('refuses a metric outside the closed list', () => {
    // A free-text metric name is how "engagement" appears and stops being
    // comparable to anything.
    expect(obs({ metric: 'engagement' })).toEqual({ rejected: 'unknown_metric' })
    expect(obs({ metric: '' })).toEqual({ rejected: 'unknown_metric' })
  })

  it('refuses a non-integer or negative value rather than rounding it', () => {
    expect(obs({ value: 12.5 })).toEqual({ rejected: 'not_an_integer' })
    expect(obs({ value: '1200' })).toEqual({ rejected: 'not_an_integer' })
    // A negative view count is a broken reader, not a fact about a video.
    // Refusing gets the reader fixed; averaging it in hides the bug forever.
    expect(obs({ value: -1 })).toEqual({ rejected: 'negative' })
  })

  it('refuses an unparseable observation time', () => {
    // The time is WHEN THE NUMBER WAS TRUE. Without it a measurement cannot be
    // ordered against another, which is most of the signal §7b is after.
    expect(obs({ observedAt: 'yesterday' })).toEqual({ rejected: 'bad_timestamp' })
    expect(obs({ observedAt: 123 })).toEqual({ rejected: 'bad_timestamp' })
  })

  it('records HOW the number arrived — a creator typing it is not an API read', () => {
    expect(obs({ source: 'manual' })).toMatchObject({ source: 'manual' })
    expect(obs({ source: 'guess' })).toEqual({ rejected: 'unknown_source' })
  })

  it('keeps platform and business metrics distinguishable', () => {
    // §7b separates them because a platform outcome is MEASURED and a business
    // outcome must be ATTRIBUTED. One list would be the first step to inferring
    // one from the other.
    for (const m of PLATFORM_METRICS) expect(isBusinessMetric(m)).toBe(false)
    for (const m of BUSINESS_METRICS) expect(isBusinessMetric(m)).toBe(true)
  })
})

describe('THE ABSOLUTE RULE: n=1 is never a correlation', () => {
  it('refuses a correlation with no sample size at all', () => {
    expect(validateClaim({ type: 'correlation', statement: 'list formats do better' }))
      .toEqual({ rejected: 'correlation_needs_sample' })
  })

  it('refuses a correlation drawn from ONE video', () => {
    // The failure §7b names outright: a confident causal claim from a single
    // successful video. It cannot be constructed here.
    expect(validateClaim({ type: 'correlation', statement: 'x', sampleSize: 1 }))
      .toEqual({ rejected: 'correlation_sample_too_small' })
    expect(validateClaim({ type: 'correlation', statement: 'x', sampleSize: 0 }))
      .toEqual({ rejected: 'correlation_sample_too_small' })
  })

  it('accepts one at the floor, and the N TRAVELS WITH IT', () => {
    // "≥N videos, stated N" — so anything rendering the claim can say "across 6
    // videos" instead of "we noticed".
    const c = validateClaim({ type: 'correlation', statement: 'x', sampleSize: MIN_CORRELATION_SAMPLE })
    expect(c).toEqual({ type: 'correlation', statement: 'x', sampleSize: MIN_CORRELATION_SAMPLE })
  })

  it('the floor is the only number this module asserts', () => {
    // 2 is not a claim that two videos are enough — it is the point below which
    // the word "correlation" is definitionally wrong. A larger threshold
    // invented here would be the confident-number-from-nothing §7b exists to
    // prevent.
    expect(MIN_CORRELATION_SAMPLE).toBe(2)
  })
})

describe('the five types need DIFFERENT evidence', () => {
  it('names exactly §7b\'s five', () => {
    expect([...OUTCOME_CLAIM_TYPES]).toEqual([
      'correlation', 'hypothesis', 'confirmed_preference', 'business_outcome', 'platform_outcome',
    ])
  })

  it('a hypothesis may NOT carry a sample size — it is untested by definition', () => {
    // Otherwise it renders beside a correlation with the same furniture and the
    // reader cannot tell which one is evidence.
    expect(validateClaim({ type: 'hypothesis', statement: 'the hook may help', sampleSize: 9 }))
      .toEqual({ rejected: 'hypothesis_cannot_have_sample' })
    expect(validateClaim({ type: 'hypothesis', statement: 'the hook may help' }))
      .toEqual({ type: 'hypothesis', statement: 'the hook may help' })
  })

  it('a business outcome must be ATTRIBUTED, never inferred', () => {
    // An unattributed sale next to a video is a coincidence with a timestamp.
    expect(validateClaim({ type: 'business_outcome', statement: '3 leads' }))
      .toEqual({ rejected: 'business_needs_attribution' })
    expect(validateClaim({ type: 'business_outcome', statement: '3 leads', attribution: 'utm=aug4' }))
      .toEqual({ type: 'business_outcome', statement: '3 leads', attribution: 'utm=aug4' })
  })

  it('refuses an unknown type and an empty statement', () => {
    expect(validateClaim({ type: 'causation', statement: 'the hook caused this' }))
      .toEqual({ rejected: 'unknown_type' })
    expect(validateClaim({ type: 'hypothesis', statement: '   ' }))
      .toEqual({ rejected: 'empty_statement' })
  })
})

describe('a claim carries its qualification wherever it is shown', () => {
  it('gives each type the words that keep it honest', () => {
    // Returned as DATA rather than baked into a component: the same claim shown
    // in the gallery, an email and an export must carry the same qualification,
    // and three components will not independently remember to add it.
    expect(claimQualifier({ type: 'correlation', statement: 'x', sampleSize: 6 }))
      .toBe('across 6 videos — a pattern, not a cause')
    expect(claimQualifier({ type: 'hypothesis', statement: 'x' })).toBe('untested')
    expect(claimQualifier({ type: 'confirmed_preference', statement: 'x' })).toBe('your repeated choice')
    expect(claimQualifier({ type: 'business_outcome', statement: 'x', attribution: 'utm=a' }))
      .toBe('attributed via utm=a')
    expect(claimQualifier({ type: 'platform_outcome', statement: 'x' })).toBe('measured')
  })

  it('a correlation NEVER renders as a cause', () => {
    const q = claimQualifier({ type: 'correlation', statement: 'x', sampleSize: 40 })
    expect(q).toContain('not a cause')
  })
})
