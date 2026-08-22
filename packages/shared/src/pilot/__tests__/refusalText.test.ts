// THE OPERATOR MUST SEE WHAT THE SERVER SAID, NOT THAT IT SAID SOMETHING.
//
// Measured in production on 2026-08-22: pilot-start returned 409 with a
// paragraph naming the live run, its status, and what to do about it. The page
// showed "Edge Function returned a non-2xx status code" — because supabase-js
// puts that fixed string on error.message, sets data to null, and leaves the
// body on error.context. Every case below is that shape.
import { describe, it, expect } from 'vitest'
import { refusalText } from '../refusalText'

const NON_2XX = 'Edge Function returned a non-2xx status code'
const httpError = (status: number, body: unknown) => {
  const e = new Error(NON_2XX) as Error & { context: Response }
  e.context = new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  return e
}

describe('refusalText', () => {
  it('reads the refusal out of a 409 body instead of the fixed string', async () => {
    const said = 'pilot run live-1 is still enqueued. One pilot at a time.'
    expect(await refusalText(httpError(409, { error: said }), 'fallback')).toBe(said)
  })

  it('never returns the generic message when a body explains the refusal', async () => {
    const out = await refusalText(httpError(409, { error: 'the real reason' }), 'fallback')
    expect(out).not.toBe(NON_2XX)
  })

  it('surfaces packet_error when that is what the server named', async () => {
    const said = 'no reference produced claims — nothing to label'
    expect(await refusalText(httpError(200, { packet_error: said }), 'fallback')).toBe(said)
  })

  it('prefers error over packet_error when both are present', async () => {
    const out = await refusalText(httpError(409, { error: 'E', packet_error: 'P' }), 'fallback')
    expect(out).toBe('E')
  })

  // ⚠️ A BODY CAN BE READ ONCE. If this helper spent the body, anything that
  // later wanted to read the response would get an empty one.
  it('does not consume the response body', async () => {
    const e = httpError(409, { error: 'said once' })
    expect(await refusalText(e, 'fallback')).toBe('said once')
    expect(await e.context.json()).toEqual({ error: 'said once' })
  })

  it('falls back to plain text when the body is not JSON', async () => {
    expect(await refusalText(httpError(502, 'upstream exploded'), 'fallback')).toBe('upstream exploded')
  })

  // ⚠️ ABSENT IS NOT AN EXPLANATION. An empty or field-less body must not
  // produce an empty error card — the generic message is better than nothing.
  it('uses the message when the body carries no explanation', async () => {
    expect(await refusalText(httpError(500, {}), 'fallback')).toBe(NON_2XX)
  })

  it('uses the message when the body is empty', async () => {
    expect(await refusalText(httpError(500, ''), 'fallback')).toBe(NON_2XX)
  })

  it('ignores a non-string error field rather than rendering [object Object]', async () => {
    expect(await refusalText(httpError(409, { error: { nested: true } }), 'fallback')).toBe(NON_2XX)
  })

  it('ignores a whitespace-only refusal', async () => {
    expect(await refusalText(httpError(409, { error: '   ' }), 'fallback')).toBe(NON_2XX)
  })

  it('falls back when there is no context at all', async () => {
    expect(await refusalText(new Error('plain'), 'fallback')).toBe('plain')
  })

  it('uses the caller fallback when there is neither context nor message', async () => {
    expect(await refusalText({}, 'the pilot service refused')).toBe('the pilot service refused')
  })

  it('uses the caller fallback when the error is null', async () => {
    expect(await refusalText(null, 'the pilot service refused')).toBe('the pilot service refused')
  })
})
