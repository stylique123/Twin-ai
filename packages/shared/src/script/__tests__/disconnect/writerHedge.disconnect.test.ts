// DISCONNECT TEST, ledger row 24: parallel writer hedge (#1293). Kill switch WRITER_HEDGE=off
// (and ASYNC_POLISH=off, which it sits under). Fake timers and fake model calls; nothing is paid.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { asyncPolishOn, writerHedgeOn, runHedged, asyncDeadlineTimeout, ASYNC_WRITER_END_MS } from '../../asyncPolish'
import { EDGE } from './edge'

afterEach(() => { vi.useRealTimers() })

const SETUP_MS = 4_000
/** A fake model call: resolves after `ms`, or rejects at its timeout / when aborted. */
function fakeCall(ms: number | null, text = '{"ok":true}') {
  return (timeoutMs: number, signal: AbortSignal) => new Promise<string>((res, rej) => {
    const done = ms !== null && ms <= timeoutMs
    const t = setTimeout(() => (done ? res(text) : rej(new Error('timeout'))), done ? ms! : timeoutMs)
    signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')) }, { once: true })
  })
}

/**
 * The edge writer (index.ts ~6438): with the hedge, `runHedged`; without it, the
 * sequential async ladder (`asyncDeadlineTimeout` per attempt). Attempt 0 hangs,
 * the fallback needs 70 s (it runs to the 125 s end under the hedge; the
 * sequential ladder caps it at its 55 s base).
 */
async function writerFor(env: Record<string, string>): Promise<{ text: string | null; calls: number }> {
  vi.useFakeTimers()
  const asyncOn = asyncPolishOn(true, env.ASYNC_POLISH)
  const hedge = writerHedgeOn(asyncOn, env.WRITER_HEDGE)
  const startedAt = Date.now() - SETUP_MS
  const attempts = [{ base: ASYNC_WRITER_END_MS, run: fakeCall(null) }, { base: 55_000, run: fakeCall(70_000) }] as const
  if (hedge) {
    const p = runHedged([attempts[0], { ...attempts[1], base: ASYNC_WRITER_END_MS }], () => true, { startedAt })
    await vi.runAllTimersAsync()
    const r = await p
    return { text: r.text, calls: r.calls }
  }
  let calls = 0
  for (let i = 0; i < 2; i++) {
    const t = asyncDeadlineTimeout(i, attempts[i]!.base, startedAt, Date.now())
    if (t === null) continue
    calls++
    const p = attempts[i]!.run(t, new AbortController().signal).then((x) => x, () => null)
    await vi.runAllTimersAsync()
    const text = await p
    if (text) return { text, calls }
  }
  return { text: null, calls }
}

describe('WRITER_HEDGE disconnect', () => {
  it('the switch: on under async polish, off with WRITER_HEDGE=off or ASYNC_POLISH=off', () => {
    expect(writerHedgeOn(asyncPolishOn(true, undefined), undefined)).toBe(true)
    expect(writerHedgeOn(asyncPolishOn(true, undefined), 'off')).toBe(false)
    expect(writerHedgeOn(asyncPolishOn(true, 'off'), undefined)).toBe(false)
    expect(writerHedgeOn(asyncPolishOn(false, undefined), undefined)).toBe(false)
  })
  it('on: a hung primary is rescued by the hedged fallback; WRITER_HEDGE=off: the writer returns nothing', async () => {
    const on = await writerFor({})
    const off = await writerFor({ WRITER_HEDGE: 'off' })
    expect(on).not.toEqual(off)
    expect(on.text).toBe('{"ok":true}')
    expect(on.calls).toBe(2)
    expect(off.text).toBeNull()
  })
  it('the edge still sets the hedge from WRITER_HEDGE and calls runHedged only when it is on', () => {
    expect(EDGE).toContain("hedge: writerHedgeOn(asyncPolish, Deno.env.get('WRITER_HEDGE'))")
    expect(EDGE).toContain('if (ladder?.hedge === true && ladder.async === true && ladder.startedAt != null')
    expect(EDGE).toContain('const h = await runHedged([mk(0), mk(1)], valid, { startedAt: ladder.startedAt, ...(ladder.bestOfN === true ? { pick: pickByCraft } : {}) }, {')
  })
})
