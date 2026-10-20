// DISCONNECT TEST, ledger row 28: writer timeout fallback (panel-current-9).
// Kill switch WRITER_TIMEOUT_FALLBACK=off (and ASYNC_POLISH=off, which it sits
// under). Fictional fixtures; no model is called.
import { describe, it, expect } from 'vitest'
import { asyncPolishOn } from '../../asyncPolish'
import { writerTimeoutFallbackOn, degradedBlueprint } from '../../writerTimeout'
import { EDGE } from './edge'

/** The edge's catch around the writer: on, a degraded blueprint; off, the error stands. */
function writerOrFallback(env: Record<string, string>): { raw: string | null; error: boolean } {
  const asyncOn = asyncPolishOn(true, env.ASYNC_POLISH)
  try {
    throw new Error('timeout')
  } catch (e) {
    if (!writerTimeoutFallbackOn(asyncOn, env.WRITER_TIMEOUT_FALLBACK)) return { raw: null, error: !!e }
    return { raw: JSON.stringify(degradedBlueprint({ subject: 'Kiln Notes' }).blueprint), error: false }
  }
}

describe('WRITER_TIMEOUT_FALLBACK disconnect', () => {
  it('on: a degraded blueprint; off: the writer error stands (GENERATION_FAILED as before)', () => {
    const on = writerOrFallback({})
    const off = writerOrFallback({ WRITER_TIMEOUT_FALLBACK: 'off' })
    const asyncOff = writerOrFallback({ ASYNC_POLISH: 'off' })
    expect(on).not.toEqual(off)
    expect(JSON.parse(on.raw!).degraded.reason).toBe('writer_timeout')
    expect(off).toEqual({ raw: null, error: true })
    expect(asyncOff).toEqual({ raw: null, error: true })
  })
  it('the edge reads WRITER_TIMEOUT_FALLBACK around the writer call', () => {
    expect(EDGE).toContain("if (!writerTimeoutFallbackOn(asyncPolish, Deno.env.get('WRITER_TIMEOUT_FALLBACK'))) throw writerErr")
    expect(EDGE).toContain("event: 'writer_degraded'")
  })
})
