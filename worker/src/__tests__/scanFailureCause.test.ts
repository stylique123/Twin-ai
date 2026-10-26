import { describe, it, expect } from 'vitest'
import { scanFailureCause } from '../scanFailureCause.js'
import { SCAN_FAILURE_CAUSES } from '../../../packages/shared/src/scanFailure.js'

// Fictional fixtures only. The real case (2026-10-26): the channel read fine,
// then voice synthesis got a Gemini quota refusal, and the screen said
// "we are not sure why yet" because no cause reached it.
describe('scanFailureCause', () => {
  it('a Gemini quota refusal at synthesis is SERVICE_QUOTA, not UNKNOWN', () => {
    const err = new Error('Gemini 429 class=unknown status=RESOURCE_EXHAUSTED — quota refusal with no named quota')
    expect(scanFailureCause('synth', err)).toBe('SERVICE_QUOTA')
  })
  it('a plain 429 is RATE_LIMITED', () => {
    expect(scanFailureCause('read', new Error('apify fictional~actor returned 429'))).toBe('RATE_LIMITED')
  })
  it('a 402 from the reader is SERVICE_QUOTA', () => {
    expect(scanFailureCause('read', new Error('apify fictional~actor returned 402'))).toBe('SERVICE_QUOTA')
  })
  it('a read timeout is PLATFORM_ACCESS_FAILED', () => {
    expect(scanFailureCause('read', new Error('fetch failed: timed out'))).toBe('PLATFORM_ACCESS_FAILED')
  })
  it('unsupported and empty map without guessing private', () => {
    expect(scanFailureCause('unsupported')).toBe('UNSUPPORTED_PLATFORM')
    expect(scanFailureCause('empty')).toBe('UNKNOWN')
  })
  it('every code it emits is one the screen recognises', () => {
    const errs = [undefined, new Error('x'), new Error('RESOURCE_EXHAUSTED'), new Error('429'), new Error('402'), new Error('timeout')]
    for (const s of ['read', 'empty', 'unsupported', 'synth'] as const)
      for (const e of errs) expect(SCAN_FAILURE_CAUSES).toContain(scanFailureCause(s, e))
  })
})
