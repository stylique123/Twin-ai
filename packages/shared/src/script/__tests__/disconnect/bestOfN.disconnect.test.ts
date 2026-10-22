// DISCONNECT TEST, ledger row 41: best-of-N craft judge on the writer hedge's drafts.
// Kill switch BEST_OF_N_JUDGE (default OFF; test accounts only). Fake timers and fake
// model calls; nothing is paid.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runHedged, ASYNC_WRITER_END_MS, WRITER_HEDGE_AT_MS, type HedgeResult } from '../../asyncPolish'
import { bestOfNOn, pickByCraft } from '../../craftJudge'
import { EDGE } from './edge'

afterEach(() => { vi.useRealTimers() })

const WEAK = JSON.stringify({ script: [{ line: 'Do you like coffee?' }, { line: 'Comment below.' }] })
const STRONG = JSON.stringify({ script: [
  { line: 'A regular told me her beans tasted flat after a week.' },
  { line: 'When I asked, she was keeping them in the fridge next to the onions, and coffee beans pull in moisture and smells.' },
  { line: 'I roast on Tuesdays, write the roast date on every twelve ounce bag by hand, and ship within two days.' },
  { line: 'Keep your beans sealed in a cool cupboard instead, and grab a fresh bag of Harbor Blend with the link in my bio.' },
] })

function call(ms: number, text: string) {
  return (timeoutMs: number, signal: AbortSignal) => new Promise<string>((res, rej) => {
    const t = setTimeout(() => (ms <= timeoutMs ? res(text) : rej(new Error('timeout'))), Math.min(ms, timeoutMs))
    signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')) }, { once: true })
  })
}

/** The edge hedge with the switch read the way the edge reads it. */
async function hedge(env: Record<string, string>, t0: number, t1: number, o: { texts?: [string, string]; settleMs?: number } = {}): Promise<{ r: HedgeResult; elapsed: number }> {
  vi.useFakeTimers()
  const startedAt = Date.now()
  const on = bestOfNOn(true, env.BEST_OF_N_JUDGE)
  const [x0, x1] = o.texts ?? [WEAK, STRONG]
  // The edge's onSettle writes the script_attempts row; settleMs stands in for that write.
  const hooks = o.settleMs ? { onSettle: () => new Promise<void>((res) => setTimeout(res, o.settleMs)) } : {}
  const p = runHedged([{ base: ASYNC_WRITER_END_MS, run: call(t0, x0) }, { base: ASYNC_WRITER_END_MS, run: call(t1, x1) }], () => true, { startedAt, ...(on ? { pick: pickByCraft } : {}) }, hooks)
  await vi.runAllTimersAsync()
  const r = await p
  return { r, elapsed: Date.now() - startedAt }
}

describe('BEST_OF_N_JUDGE disconnect', () => {
  it('the switch: off by default, off with BEST_OF_N_JUDGE=off, never for a real account', () => {
    expect(bestOfNOn(true, undefined)).toBe(false)
    expect(bestOfNOn(true, 'off')).toBe(false)
    expect(bestOfNOn(false, 'on')).toBe(false)
    expect(bestOfNOn(true, 'on')).toBe(true)
  })
  it('flag off is byte-identical to the hedge without best-of-N (same result, same time)', async () => {
    for (const [t0, t1] of [[40_000, 20_000 + WRITER_HEDGE_AT_MS], [50_000, 50_000 - WRITER_HEDGE_AT_MS], [10_000, 60_000]] as const) {
      const off = await hedge({}, t0, t1); vi.useRealTimers()
      const offExplicit = await hedge({ BEST_OF_N_JUDGE: 'off' }, t0, t1); vi.useRealTimers()
      expect(JSON.stringify(offExplicit)).toBe(JSON.stringify(off))
      expect(off.r.bestOfN).toBeUndefined()
    }
  })
  it('on: the other draft finished while the winner was being recorded -> the higher craft score ships', async () => {
    // Attempt 0 (strong) returns at 50 s; attempt 1 (weak) returns 100 ms later, during
    // the 300 ms row write for attempt 0. Today the later valid draft overwrites the
    // first; best-of-N keeps the stronger one. Same end time either way.
    const args = [50_000, 50_100 - WRITER_HEDGE_AT_MS, { texts: [STRONG, WEAK] as [string, string], settleMs: 300 }] as const
    const off = await hedge({}, ...args); vi.useRealTimers()
    const on = await hedge({ BEST_OF_N_JUDGE: 'on' }, ...args); vi.useRealTimers()
    expect(off.r.text).toBe(WEAK)
    expect(on.r.bestOfN?.chosen).toBe(0)
    expect(on.r.text).toBe(STRONG)
    expect(on.r.bestOfN!.scores[0]).toBeGreaterThan(on.r.bestOfN!.scores[1])
    expect(on.elapsed).toBe(off.elapsed) // no added latency
  })
  it('on: never waits for an unfinished draft (result and timing equal to off)', async () => {
    const off = await hedge({}, 40_000, 60_000); vi.useRealTimers()
    const on = await hedge({ BEST_OF_N_JUDGE: 'on' }, 40_000, 60_000); vi.useRealTimers()
    expect(on.r.bestOfN).toBeUndefined()
    expect(on.r.text).toBe(off.r.text)
    expect(on.elapsed).toBe(off.elapsed)
  })
  it('the edge reads BEST_OF_N_JUDGE, passes the picker to runHedged, scores Plan B and records best_of_n', () => {
    expect(EDGE).toContain("bestOfNOn(isHeartbeat && trialOn, Deno.env.get('BEST_OF_N_JUDGE'))")
    expect(EDGE).toContain('...(ladder.bestOfN === true ? { pick: pickByCraft } : {})')
    expect(EDGE).toContain("writerLadderForFailure?.bestOfN === true && panelArmReq == null")
    expect(EDGE).toContain('if (!keepWriter) {')
    expect(EDGE).toContain('bpg.best_of_n = writerLadderForFailure.bestOfNRecord')
  })
})
