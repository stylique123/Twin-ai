import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { isReadCapacityExhausted, REFERENCE_UNREAD_TEXT } from '../referenceAnalysis'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../..')

/** The REAL string on 52 failed assess_reference jobs, 2026-09-01. */
const PROD_DAILY =
  'Gemini 429 class=daily status=RESOURCE_EXHAUSTED quotaId=GenerateRequestsPerDayPerProjectPerModel ' +
  'metric=generativelanguage.googleapis.com/generate_requests_per'

describe('a spent reading budget is not a slow video', () => {
  it('recognises the exact production refusal', () => {
    expect(isReadCapacityExhausted(PROD_DAILY)).toBe(true)
  })

  it('a per-MINUTE 429 is NOT capacity exhaustion — the retry may well work', () => {
    // Calling a transient limit "unavailable" would refuse a build that was
    // about to succeed. `class=daily` is the worker's word for the one that
    // does not clear on a retry.
    expect(isReadCapacityExhausted(
      'Gemini 429 class=minute status=RESOURCE_EXHAUSTED quotaId=GenerateRequestsPerMinutePerProject',
    )).toBe(false)
  })

  it('absent is not exhausted', () => {
    for (const v of [null, undefined, '']) expect(isReadCapacityExhausted(v)).toBe(false)
  })

  it('an unrelated failure is never mistaken for it', () => {
    expect(isReadCapacityExhausted('This video has no captions we can read.')).toBe(false)
    expect(isReadCapacityExhausted('YouTube transcript service error 400')).toBe(false)
  })

  it('the sentence blames us, never the creator’s link', () => {
    const t = REFERENCE_UNREAD_TEXT.read_unavailable
    expect(t).toMatch(/not about your link/i)
    // The old copy's claim. If it comes back, so has the wrong diagnosis.
    expect(t).not.toMatch(/taking longer/i)
  })
})

describe('the screen stops giving advice that cannot work', () => {
  const src = readFileSync(resolve(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

  it('the poll classifies capacity exhaustion BEFORE it can time out', () => {
    const check = src.indexOf('isReadCapacityExhausted(job.error)')
    const done = src.indexOf("if (job.status === 'done')")
    expect(check).toBeGreaterThan(-1)
    expect(done).toBeGreaterThan(check)
  })

  it('the refusal screen branches on the cause, not only the sentence', () => {
    expect(src).toMatch(/unreadCause === 'read_unavailable'/)
  })

  it('it does not tell them to try another reference when none can work', () => {
    const i = src.indexOf("unreadCause === 'read_unavailable'")
    const seg = src.slice(i, i + 900)
    expect(seg).toMatch(/another link will not help/i)
    expect(seg).toMatch(/Build from my own idea/)
  })
})
