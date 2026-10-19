import { describe, it, expect } from 'vitest'
import { deadlineTimeout, optionalPassAllowed, failureReason, EDGE_WALL_MS, WRITER_LAST_RESERVE_MS } from '../writerDeadline'

// Fictional timings shaped like the panel-current-7 failures: ~7 s setup,
// attempt 0 aborted at its 65 s cap, then the fallback.
const T0 = 1_000_000
describe('writer deadline', () => {
  it('reproduces the 120 s ceiling with the old arithmetic', () => {
    const now = T0 + 72_000
    const t = deadlineTimeout(1, 55_000, T0, now)
    expect(t).toBe(48_000)
    expect(now - T0 + (t ?? 0)).toBe(120_000)
  })
  it('degraded last attempt gets the full fallback budget and still ends with margin', () => {
    const now = T0 + 72_000
    const t = deadlineTimeout(1, 55_000, T0, now, { last: true, degrade: true })
    expect(t).toBe(55_000)
    expect(now - T0 + (t ?? 0)).toBeLessThanOrEqual(EDGE_WALL_MS - WRITER_LAST_RESERVE_MS)
  })
  it('degraded last attempt is clipped to the reserve when setup was slow', () => {
    const t = deadlineTimeout(1, 55_000, T0, T0 + 100_000, { last: true, degrade: true })
    expect(t).toBe(EDGE_WALL_MS - WRITER_LAST_RESERVE_MS - 100_000)
  })
  it('primary attempt is unchanged by degrade', () => {
    expect(deadlineTimeout(0, 75_000, T0, T0 + 6_000, { last: false, degrade: true })).toBe(65_000)
    expect(deadlineTimeout(0, 75_000, undefined, T0)).toBe(75_000)
  })
  it('skips an attempt with too little time', () => {
    expect(deadlineTimeout(1, 55_000, T0, T0 + 130_000, { last: true, degrade: true })).toBeNull()
  })
  it('optional passes stop after the cutoff only on the degraded path', () => {
    expect(optionalPassAllowed(T0, T0 + 90_000, true)).toBe(true)
    expect(optionalPassAllowed(T0, T0 + 100_000, true)).toBe(false)
    expect(optionalPassAllowed(T0, T0 + 140_000, false)).toBe(true)
  })
  it('every failure maps to a code', () => {
    expect(failureReason({ writerReturned: false, attemptsFailed: 2, attemptsSkipped: 0, lastCode: 'timeout' })).toBe('writer_timeout')
    expect(failureReason({ writerReturned: false, attemptsFailed: 0, attemptsSkipped: 2, lastCode: null })).toBe('writer_deadline_skipped')
    expect(failureReason({ writerReturned: false, attemptsFailed: 1, attemptsSkipped: 0, lastCode: 'provider_quota' })).toBe('writer_provider')
    expect(failureReason({ writerReturned: false, attemptsFailed: 1, attemptsSkipped: 0, lastCode: 'invalid_json' })).toBe('writer_output')
    expect(failureReason({ writerReturned: true, attemptsFailed: 0, attemptsSkipped: 0, lastCode: null })).toBe('post_writer')
    expect(failureReason({ writerReturned: false, attemptsFailed: 1, attemptsSkipped: 0, lastCode: 'weird' })).toBe('unknown')
  })
})
