// THE TAXONOMY MUST NOT COLLAPSE THE ONE DISTINCTION IT EXISTS FOR.
import { describe, it, expect } from 'vitest'
import { classifyPilotFailure, describePilotFailure } from '../callFailure'

const NEVER_LANDED = 'Failed to send a request to the Edge Function'

describe('classifying a failed pilot-review call', () => {
  it('a fetch that never got a response is TRANSPORT_FAILED, not a refusal', () => {
    // ⚠️ THE REAL CASE. This is exactly what the owner saw, twice.
    const f = classifyPilotFailure('finish', NEVER_LANDED, null)
    expect(f.kind).toBe('TRANSPORT_FAILED')
    expect(f.hadHttpResponse).toBe(false)
    expect(f.retryable).toBe(true)
  })

  it('an absent status is NULL, never 0', () => {
    // Number(null) is 0 and Number.isFinite(0) is true, so a coercion done
    // before the null check would report a confident status of 0.
    expect(classifyPilotFailure('packet', NEVER_LANDED, null).status).toBeNull()
    expect(classifyPilotFailure('packet', NEVER_LANDED, undefined).status).toBeNull()
    expect(classifyPilotFailure('packet', NEVER_LANDED, {}).status).toBeNull()
    expect(classifyPilotFailure('packet', NEVER_LANDED, { status: null }).status).toBeNull()
  })

  it('a real zero-ish status is still not invented from nothing', () => {
    expect(classifyPilotFailure('packet', 'x', { status: NaN }).status).toBeNull()
    expect(classifyPilotFailure('packet', 'x', { status: '500' }).status).toBeNull()
  })

  it('401 and 403 are the session, not the request, and retrying will not help', () => {
    for (const status of [401, 403]) {
      const f = classifyPilotFailure('packet', 'Not authenticated', { status })
      expect(f.kind).toBe('UNAUTHENTICATED')
      expect(f.retryable).toBe(false)
    }
  })

  it('a 4xx refusal keeps the server’s own words and is not retryable', () => {
    const said = '3 claim(s) are still unanswered.'
    const f = classifyPilotFailure('finish', said, { status: 409 })
    expect(f.kind).toBe('REFUSED')
    expect(f.message).toBe(said)
    expect(f.retryable).toBe(false)
  })

  it('a 5xx is retryable, because the server may simply have stumbled', () => {
    expect(classifyPilotFailure('finish', 'boom', { status: 502 }).retryable).toBe(true)
  })

  it('the description says whether a reply arrived at all', () => {
    // ⚖️ THIS IS THE FACT THE OWNER NEEDED AND DID NOT HAVE.
    const transport = describePilotFailure(classifyPilotFailure('finish', NEVER_LANDED, null))
    expect(transport).toContain('never reached the server')
    expect(transport).toContain('not affected')
    expect(transport).not.toContain('null')
    expect(transport).not.toContain('0')

    const refused = describePilotFailure(classifyPilotFailure('finish', 'nope', { status: 409 }))
    expect(refused).toContain('409')
    expect(refused).toContain('nope')
  })

  it('a transport failure never claims the server said anything', () => {
    const f = classifyPilotFailure('label', NEVER_LANDED, null)
    expect(describePilotFailure(f)).not.toContain('replied')
  })
})
