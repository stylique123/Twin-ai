// THE FIXTURES ARE GOOGLE-SHAPED, NOT CONVENIENT-SHAPED.
//
// ⚠️ A TEST BUILT FROM AN INVENTED OBJECT PROVES THE PARSER READS THE OBJECT THE
// TEST AUTHOR IMAGINED. The bug being fixed here is precisely that we never
// looked at the real envelope — we truncated it at 200 characters and threw the
// discriminating half away. So every fixture below is the actual google.rpc
// shape: `error.details[]` with `@type` URLs, QuotaFailure.violations carrying
// quotaId/quotaMetric/quotaValue, RetryInfo.retryDelay as a duration string.

import { describe, it, expect } from 'vitest'
import {
  parseGeminiError, classifyQuota, planRetry, parseRetryDelayMs, quotaSummary,
  QUOTA_CLASSES, MAX_INLINE_RETRY_MS,
} from '../geminiQuota.js'

/** Free-tier requests-per-day exhausted, with a RetryInfo. */
const DAILY_WITH_RETRY = JSON.stringify({
  error: {
    code: 429,
    message: 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [{
          quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
          quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
          quotaDimensions: { model: 'gemini-3.1-pro', location: 'global' },
          quotaValue: '250',
        }],
      },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '43s' },
    ],
  },
})

/** Per-minute request quota, no RetryInfo. */
const PER_MINUTE_NO_RETRY = JSON.stringify({
  error: {
    code: 429,
    message: 'You exceeded your current quota, please check your plan and billing details.',
    status: 'RESOURCE_EXHAUSTED',
    details: [{
      '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
      violations: [{
        quotaMetric: 'generativelanguage.googleapis.com/generate_content_requests',
        quotaId: 'GenerateRequestsPerMinutePerProjectPerModel',
        quotaValue: '10',
      }],
    }],
  },
})

/** RESOURCE_EXHAUSTED with NO quota detail at all — the shape we cannot classify. */
const EXHAUSTED_NO_DETAIL = JSON.stringify({
  error: {
    code: 429,
    message: 'Resource has been exhausted (e.g. check quota).',
    status: 'RESOURCE_EXHAUSTED',
  },
})

const NON_429 = JSON.stringify({
  error: { code: 400, message: 'Invalid JSON payload received.', status: 'INVALID_ARGUMENT' },
})

const MALFORMED = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head></html>'

describe('reading Google\'s error envelope', () => {
  it('keeps the fields that were being truncated away', () => {
    // ⚠️ THE WHOLE POINT. Every one of these sits past character 200 of the real
    // body — which is why 131 failures could not be told apart.
    const e = parseGeminiError(429, DAILY_WITH_RETRY)
    expect(e.status).toBe('RESOURCE_EXHAUSTED')
    expect(e.quotaId).toBe('GenerateRequestsPerDayPerProjectPerModel-FreeTier')
    expect(e.quotaMetric).toBe('generativelanguage.googleapis.com/generate_content_free_tier_requests')
    expect(e.quotaValue).toBe('250')
    expect(e.retryDelayMs).toBe(43_000)
    expect(e.rawDetailsType).toEqual([
      'type.googleapis.com/google.rpc.QuotaFailure',
      'type.googleapis.com/google.rpc.RetryInfo',
    ])
  })

  it('proves the old 200-char slice would have lost them', () => {
    // Not a hypothetical: this is the exact operation that shipped.
    const truncated = DAILY_WITH_RETRY.slice(0, 200)
    expect(truncated).not.toContain('quotaId')
    expect(truncated).not.toContain('RetryInfo')
    expect(truncated).not.toContain('RESOURCE_EXHAUSTED')
  })

  it('survives a body that is not JSON at all', () => {
    // ⚖️ A parser that throws on the failure path replaces a diagnosable refusal
    // with an undiagnosable one. A gateway HTML page is a real thing to receive.
    const e = parseGeminiError(502, MALFORMED)
    expect(e.httpStatus).toBe(502)
    expect(e.quotaId).toBeUndefined()
    expect(() => parseGeminiError(502, MALFORMED)).not.toThrow()
  })

  it('bounds the human-readable message rather than storing it whole', () => {
    const long = JSON.stringify({ error: { message: 'x'.repeat(5000), status: 'RESOURCE_EXHAUSTED' } })
    expect((parseGeminiError(429, long).message ?? '').length).toBeLessThanOrEqual(300)
  })
})

describe('parsing RetryInfo durations', () => {
  it('reads the forms Google actually sends', () => {
    expect(parseRetryDelayMs('43s')).toBe(43_000)
    expect(parseRetryDelayMs('1.5s')).toBe(1_500)
    // ⚠️ `0s` MEANS RETRY NOW and must not read as absence.
    expect(parseRetryDelayMs('0s')).toBe(0)
    expect(parseRetryDelayMs(undefined)).toBeUndefined()
    expect(parseRetryDelayMs('soon')).toBeUndefined()
    expect(parseRetryDelayMs('-5s')).toBeUndefined()
  })

  it('caps an absurd delay instead of sleeping a worker for a week', () => {
    expect(parseRetryDelayMs('999999s')).toBe(24 * 60 * 60 * 1000)
  })
})

describe('classifying, from metadata only', () => {
  it('names a per-day quota daily', () => {
    expect(classifyQuota(parseGeminiError(429, DAILY_WITH_RETRY))).toBe('daily')
  })

  it('names a per-minute quota short_window', () => {
    expect(classifyQuota(parseGeminiError(429, PER_MINUTE_NO_RETRY))).toBe('short_window')
  })

  it('refuses to classify a refusal that names no quota', () => {
    // ⚠️ THE MESSAGE SAYS "check your plan and billing details" IN EVERY CASE.
    // Reading billing out of that sentence is how a guess becomes a spend
    // decision.
    expect(classifyQuota(parseGeminiError(429, EXHAUSTED_NO_DETAIL))).toBe('unknown')
  })

  it('never returns billing from an inference', () => {
    // `billing` exists in the vocabulary because a human may set it from the
    // console. Nothing in this module may produce it from a body.
    for (const body of [DAILY_WITH_RETRY, PER_MINUTE_NO_RETRY, EXHAUSTED_NO_DETAIL, NON_429, MALFORMED]) {
      expect(classifyQuota(parseGeminiError(429, body))).not.toBe('billing')
    }
    expect([...QUOTA_CLASSES]).toContain('billing')
  })
})

describe('deciding whether to ask again', () => {
  it('does not retry a daily quota, even when RetryInfo suggests seconds', () => {
    // ⚖️ THE ORDERING THAT SAVES THE MOST. Google attaches a 43s RetryInfo to a
    // per-DAY exhaustion; obeying it would re-download the video and re-run
    // whisper to be refused again 43 seconds later. The quota class outranks the
    // hint.
    const plan = planRetry(parseGeminiError(429, DAILY_WITH_RETRY), 0)
    expect(plan.retry).toBe(false)
    expect(plan.reason).toContain('daily quota exhausted')
  })

  it('treats RetryInfo as ADVISORY and the quota class as AUTHORITATIVE', () => {
    // ⚠️ THE PRECEDENCE, ASSERTED AS A RULE RATHER THAN AS A SIDE EFFECT. The
    // same 43s hint produces OPPOSITE decisions depending only on the class:
    // refused on a per-day quota, obeyed on a per-minute one. A future
    // simplification to "Google told us when to retry" makes these two cases
    // agree, and this test is what will fail.
    const hint = { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '43s' }
    const withClass = (quotaId: string) => parseGeminiError(429, JSON.stringify({
      error: {
        code: 429, status: 'RESOURCE_EXHAUSTED',
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] },
          hint,
        ],
      },
    }))

    const daily = withClass('GenerateRequestsPerDayPerProjectPerModel-FreeTier')
    const minute = withClass('GenerateRequestsPerMinutePerProjectPerModel')

    // Identical hint, identical delay parsed, opposite policy.
    expect(daily.retryDelayMs).toBe(43_000)
    expect(minute.retryDelayMs).toBe(43_000)
    expect(planRetry(daily, 0).retry).toBe(false)
    expect(planRetry(minute, 0).retry).toBe(true)
    expect(planRetry(minute, 0).delayMs).toBe(43_000)
  })

  it('obeys RetryInfo when the quota is not daily', () => {
    const e = parseGeminiError(429, JSON.stringify({
      error: {
        code: 429, status: 'RESOURCE_EXHAUSTED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12s' }],
      },
    }))
    const plan = planRetry(e, 0)
    expect(plan.retry).toBe(true)
    expect(plan.delayMs).toBe(12_000)
  })

  it('refuses to hold a job open for a very long RetryInfo', () => {
    const e = parseGeminiError(429, JSON.stringify({
      error: {
        code: 429, status: 'RESOURCE_EXHAUSTED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1800s' }],
      },
    }))
    const plan = planRetry(e, 0)
    expect(plan.retry).toBe(false)
    expect(plan.delayMs).toBe(0)
    expect(e.retryDelayMs).toBe(1_800_000)
  })

  it('backs off a short-window quota that gave no hint, and stops', () => {
    const e = parseGeminiError(429, PER_MINUTE_NO_RETRY)
    expect(planRetry(e, 0).retry).toBe(true)
    expect(planRetry(e, 0).delayMs).toBeLessThanOrEqual(MAX_INLINE_RETRY_MS)
    // ⚠️ BOUNDED. Three attempts is a pause; five is a way of spending
    // acquisition to rediscover a wall.
    expect(planRetry(e, 2).retry).toBe(false)
  })

  it('does not hammer a refusal it cannot explain', () => {
    const plan = planRetry(parseGeminiError(429, EXHAUSTED_NO_DETAIL), 0)
    expect(plan.retry).toBe(false)
    expect(plan.reason).toContain('no named quota')
  })
})

describe('what lands in the row', () => {
  it('puts the discriminating fields FIRST, so truncation keeps them', () => {
    // ⚠️ THE LESSON FROM THE BUG. Something downstream will slice this string;
    // the class and the quota id must be at the front, not after a paragraph of
    // boilerplate.
    const s = quotaSummary(parseGeminiError(429, DAILY_WITH_RETRY))
    expect(s.slice(0, 60)).toContain('class=daily')
    expect(s).toContain('quotaId=GenerateRequestsPerDayPerProjectPerModel-FreeTier')
    expect(s).toContain('retryAfterMs=43000')
    // And it stays short enough to survive the existing 200-char persistence.
    expect(s.length).toBeLessThan(400)
  })

  it('says what it does not know, rather than nothing', () => {
    const s = quotaSummary(parseGeminiError(429, EXHAUSTED_NO_DETAIL))
    expect(s).toContain('class=unknown')
    expect(s).toContain('status=RESOURCE_EXHAUSTED')
  })

  it('carries a non-429 error without pretending it is a quota', () => {
    const e = parseGeminiError(400, NON_429)
    expect(e.status).toBe('INVALID_ARGUMENT')
    expect(classifyQuota(e)).toBe('unknown')
    expect(quotaSummary(e)).toContain('Gemini 400')
  })
})
