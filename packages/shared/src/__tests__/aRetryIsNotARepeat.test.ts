// ⚖️ THE FIXTURES ARE THE MEASURED POPULATION, NOT INVENTED PAIRS. Every gap
// below is one of the fourteen real near-duplicate pairs found on 2026-09-13,
// and the two premises are the pair `contentHistory.ts` quoted on 09-07 as
// "plainly the same video written twice". A test built from made-up premises
// would prove the threshold agrees with itself.
import { describe, it, expect } from 'vitest'
import {
  classifyRecurrence, classifyOne, premiseOverlap, recurrenceNotice,
  recurrenceDirective, RETRY_WINDOW_MINUTES, REPEAT_WINDOW_DAYS,
  NEAR_DUPLICATE_OVERLAP, type PriorPremise,
} from '../subjectRecurrence.js'

const A = 'waiting for commercial gear holds back beginner microbakers'
const B = 'waiting for commercial kitchen equipment holds back beginner microbakers'
const UNRELATED = 'pricing a sourdough loaf for local pickup orders'

const at = (minutesAgo: number): Date => new Date(Date.UTC(2026, 8, 13, 20, 0) - minutesAgo * 60000)
const NOW = new Date(Date.UTC(2026, 8, 13, 20, 0))
const prior = (premise: string, minutesAgo: number): PriorPremise => ({ premise, at: at(minutesAgo) })

describe('the pair the codebase already called the same video written twice', () => {
  it('scores above the threshold both measurements used', () => {
    expect(premiseOverlap(A, B)).toBeGreaterThanOrEqual(NEAR_DUPLICATE_OVERLAP)
  })

  it('scores an unrelated premise below it', () => {
    expect(premiseOverlap(A, UNRELATED)).toBeLessThan(NEAR_DUPLICATE_OVERLAP)
  })

  it('does not let a fragment score 1.0 against the paragraph containing it', () => {
    // The denominator defect named in the module header.
    expect(premiseOverlap('microbakers', A)).toBeLessThan(NEAR_DUPLICATE_OVERLAP)
  })
})

describe('every near-duplicate pair on record classifies as a retry, not a repeat', () => {
  // The fourteen measured gaps, in minutes. The widest is 224.
  const MEASURED_GAPS = [28, 18, 6, 6, 2, 3, 5, 7, 14, 23, 30, 214, 219, 224]

  it.each(MEASURED_GAPS)('a pair %i minutes apart is a retry', (gap) => {
    expect(classifyOne(prior(A, gap), B, NOW)).toBe('retry')
  })

  it('so the production population yields ZERO repeats, which is the point', () => {
    const kinds = MEASURED_GAPS.map((g) => classifyOne(prior(A, g), B, NOW))
    expect(kinds.filter((k) => k === 'repeat')).toEqual([])
    expect(new Set(kinds)).toEqual(new Set(['retry']))
  })
})

describe('the population that has never occurred is the only one that speaks', () => {
  const DAYS_APART = RETRY_WINDOW_MINUTES + 60

  it('a near-duplicate past the sitting is a repeat', () => {
    expect(classifyOne(prior(A, DAYS_APART), B, NOW)).toBe('repeat')
  })

  it('and past the repeat window it is fresh again, not policed forever', () => {
    const tooOld = (REPEAT_WINDOW_DAYS + 1) * 24 * 60
    expect(classifyOne(prior(A, tooOld), B, NOW)).toBe('fresh')
  })

  it('a repeat outranks a nearer retry, or the only real case hides behind noise', () => {
    const v = classifyRecurrence([prior(A, 10), prior(A, DAYS_APART)], B, NOW)
    expect(v.kind).toBe('repeat')
    expect(v.scriptsAgo).toBe(2)
  })
})

describe('what reaches the creator and the writer', () => {
  it('says nothing to either on a retry', () => {
    const v = classifyRecurrence([prior(A, 10)], B, NOW)
    expect(v.kind).toBe('retry')
    expect(recurrenceNotice(v)).toBeNull()
    expect(recurrenceDirective(v)).toBe('')
  })

  it('names the subject on the panel on a repeat, and says it still wrote one', () => {
    const v = classifyRecurrence([prior(A, RETRY_WINDOW_MINUTES + 60)], B, NOW)
    const notice = recurrenceNotice(v)
    expect(notice).toContain('You covered this')
    expect(notice).toContain('different angle')
  })

  it('tells the writer to change the ANGLE and never to refuse the subject', () => {
    const d = recurrenceDirective(classifyRecurrence([prior(A, RETRY_WINDOW_MINUTES + 60)], B, NOW))
    expect(d).toContain('SAME SUBJECT')
    expect(d).toContain('do NOT refuse the subject')
    expect(d).not.toMatch(/\bskip\b|\brefuse to write\b|\bpick another\b/i)
  })

  it('is silent on fresh', () => {
    const v = classifyRecurrence([prior(UNRELATED, 10)], B, NOW)
    expect(v).toEqual({ kind: 'fresh', matched: null, scriptsAgo: null })
    expect(recurrenceDirective(v)).toBe('')
  })
})
