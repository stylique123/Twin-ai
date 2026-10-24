// DISCONNECT TEST, ledger row 41: best-of-N craft judge on the writer hedge's drafts.
// Kill switch BEST_OF_N_JUDGE (default OFF; test accounts only). Fake timers and fake
// model calls; nothing is paid.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runHedged, ASYNC_WRITER_END_MS, WRITER_HEDGE_AT_MS, type HedgeResult } from '../../asyncPolish'
<<<<<<< HEAD
import { bestOfNOn, pickByCraft } from '../../craftJudge'
=======
import { bestOfNOn, pickByCraft, pickEligible, checkCandidate, keepWriterOverPlanB, graceMs, BEST_OF_N_GRACE_MS, type BestOfNFlagCtx } from '../../craftJudge'
>>>>>>> origin/main
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
<<<<<<< HEAD
  it('on: never waits for an unfinished draft (result and timing equal to off)', async () => {
=======
  it('on, no grace given: never waits for an unfinished draft (result and timing equal to off)', async () => {
>>>>>>> origin/main
    const off = await hedge({}, 40_000, 60_000); vi.useRealTimers()
    const on = await hedge({ BEST_OF_N_JUDGE: 'on' }, 40_000, 60_000); vi.useRealTimers()
    expect(on.r.bestOfN).toBeUndefined()
    expect(on.r.text).toBe(off.r.text)
    expect(on.elapsed).toBe(off.elapsed)
  })
  it('the edge reads BEST_OF_N_JUDGE, passes the picker to runHedged, scores Plan B and records best_of_n', () => {
    expect(EDGE).toContain("bestOfNOn(isHeartbeat && trialOn, Deno.env.get('BEST_OF_N_JUDGE'))")
<<<<<<< HEAD
    expect(EDGE).toContain('...(ladder.bestOfN === true ? { pick: pickByCraft } : {})')
    expect(EDGE).toContain("writerLadderForFailure?.bestOfN === true && panelArmReq == null")
=======
    expect(EDGE).toContain('pick: (t: [string, string], fb: 0 | 1) => pickEligible(t, ladder.bestOfNCtx!, fb), graceMs: BEST_OF_N_GRACE_MS')
    expect(EDGE).toContain("v2: Deno.env.get('TARGETED_FLAGS_V2') !== 'false', wrongProduct: Deno.env.get('WRONG_PRODUCT_BLOCK') !== 'false'")
    expect(EDGE).toContain("writerLadderForFailure?.bestOfN === true && panelArmReq == null && bonCtx")
    expect(EDGE).toContain('keepWriterOverPlanB(bonB.writer, bonB.plan_b)')
>>>>>>> origin/main
    expect(EDGE).toContain('if (!keepWriter) {')
    expect(EDGE).toContain('bpg.best_of_n = writerLadderForFailure.bestOfNRecord')
  })
})
<<<<<<< HEAD
=======

// Owner rule (22 Oct): flags v2 + wrong product on every candidate first; only
// zero-flag candidates are eligible; Plan B kept unless the writer wins AND is clean;
// the grace for the second draft never passes the writer deadline. Fictional data.
const CTX: BestOfNFlagCtx = {
  items: [
    { text: 'I roast on Tuesdays and ship within two days.', first_party: true, live: false },
    { text: 'A regular told me her beans tasted flat because she kept them in the fridge next to the onions.', first_party: true, live: false },
    { text: 'I write the roast date on every bag by hand.', first_party: true, live: false },
    { text: 'Harbor Blend is roasted dark with cocoa notes and a smoky finish.', first_party: false, live: false, product_id: 'p_harbor', origin: 'product_fact' },
  ],
  products: [{ id: 'p_harbor', name: 'Harbor Blend' }, { id: 'p_ridge', name: 'Ridge Roast' }],
  v2: true, wrongProduct: true,
}
const CLEAN = JSON.stringify({ script: ['A regular told me her beans tasted flat.', 'She kept them in the fridge next to the onions, and the beans pulled in the smell.',
  'I roast on Tuesdays, write the roast date on every bag by hand, and ship within two days.', 'Keep your beans sealed in a cool cupboard, and grab a fresh bag of Harbor Blend with the link in my bio.'].map((line) => ({ line })) })
// Invented line: an absolute claim no fact backs, in an otherwise stronger script.
const INVENTED = JSON.stringify({ script: [
  ...JSON.parse(CLEAN).script,
  { line: 'This blend fixes bitter coffee completely, guaranteed, every single time.' },
] })
const PLAIN = JSON.stringify({ script: [{ line: 'I roast on Tuesdays and ship within two days.' }, { line: 'Link in my bio.' }] })
const WRONG = JSON.stringify({ script: [{ line: 'Ridge Roast is roasted dark with cocoa notes and a smoky finish.' }, { line: 'Link in my bio.' }] })

describe('BEST_OF_N_JUDGE eligibility rule', () => {
  it('an invented-line candidate with the higher craft score is never chosen', () => {
    const inv = checkCandidate(JSON.parse(INVENTED).script.map((x: { line: string }) => x.line), CTX)
    const pl = checkCandidate(JSON.parse(PLAIN).script.map((x: { line: string }) => x.line), CTX)
    expect(inv.eligible).toBe(false)
    expect(inv.flags.length).toBeGreaterThan(0)
    expect(pl.eligible).toBe(true)
    expect(inv.score).toBeGreaterThan(pl.score)
    for (const fb of [0, 1] as const) {
      const p = pickEligible([INVENTED, PLAIN], CTX, fb)
      expect(p.compared).toBe(false)
      expect(p.chosen).toBe(fb) // no comparison: today's choice
      const q = pickEligible([PLAIN, INVENTED], CTX, 0)
      expect(q.chosen).toBe(0)
    }
  })
  it('wrong-product draft is flagged and not eligible', () => {
    const w = checkCandidate(JSON.parse(WRONG).script.map((x: { line: string }) => x.line), CTX)
    expect(w.eligible).toBe(false)
    expect(w.flags.some((f) => f.startsWith('wrong_product'))).toBe(true)
  })
  it('both eligible -> the judge decides; flags recorded per candidate', () => {
    const p = pickEligible([PLAIN, CLEAN], CTX, 0)
    expect(p.checks.map((c) => c.eligible)).toEqual([true, true])
    expect(p.compared).toBe(true)
    expect(p.chosen).toBe(p.scores[1] > p.scores[0] ? 1 : 0)
  })
  it('Plan B is kept when the writer has a blocking flag, even with a higher score', () => {
    const writer = checkCandidate(JSON.parse(INVENTED).script.map((x: { line: string }) => x.line), CTX)
    const planB = checkCandidate(JSON.parse(PLAIN).script.map((x: { line: string }) => x.line), CTX)
    expect(writer.score).toBeGreaterThan(planB.score)
    expect(keepWriterOverPlanB(writer, planB)).toBe(false)
    // Plan B flagged too: no comparison, Plan B stays.
    expect(keepWriterOverPlanB(planB, writer)).toBe(false)
    // Clean writer that wins: swap allowed.
    const clean = checkCandidate(JSON.parse(CLEAN).script.map((x: { line: string }) => x.line), CTX)
    expect(keepWriterOverPlanB(clean, planB)).toBe(clean.score > planB.score)
  })
  it('grace never exceeds the time left before the writer deadline', () => {
    for (const left of [-1, 0, 1, 1_000, BEST_OF_N_GRACE_MS - 1, BEST_OF_N_GRACE_MS, 60_000]) {
      const g = graceMs(left)
      expect(g).toBeLessThanOrEqual(Math.max(0, left))
      expect(g).toBeLessThanOrEqual(BEST_OF_N_GRACE_MS)
    }
    expect(graceMs(BEST_OF_N_GRACE_MS - 1)).toBe(0)
  })
  async function graced(t0: number, t1: number, texts: [string, string]) {
    vi.useFakeTimers()
    const startedAt = Date.now()
    const p = runHedged([{ base: ASYNC_WRITER_END_MS, run: call(t0, texts[0]) }, { base: ASYNC_WRITER_END_MS, run: call(t1, texts[1]) }], () => true,
      { startedAt, pick: (t, fb) => pickEligible(t, CTX, fb), graceMs: BEST_OF_N_GRACE_MS })
    await vi.runAllTimersAsync()
    const r = await p
    const elapsed = Date.now() - startedAt
    vi.useRealTimers()
    return { r, elapsed }
  }
  it('runHedged grace: the second draft finishing inside the grace is compared', async () => {
    // Attempt 0 (plain) at 50 s; attempt 1 (strong) at 52 s (started at 30 s, runs 22 s).
    const { r, elapsed } = await graced(50_000, 22_000, [PLAIN, CLEAN])
    expect(r.bestOfN?.compared).toBe(true)
    expect(r.bestOfN?.graceMs).toBe(2_000)
    expect(elapsed).toBe(52_000)
  })
  it('runHedged grace: an invented second draft is never chosen', async () => {
    const { r } = await graced(50_000, 21_000, [PLAIN, INVENTED])
    expect(r.text).toBe(PLAIN)
    expect(r.bestOfN?.compared).toBe(false)
  })
  it('runHedged grace: a draft that cannot finish in the grace is cancelled at grace end, never past the deadline', async () => {
    const { r, elapsed } = await graced(50_000, 60_000, [PLAIN, CLEAN])
    expect(r.text).toBe(PLAIN)
    expect(r.bestOfN).toBeUndefined()
    expect(elapsed).toBe(50_000 + BEST_OF_N_GRACE_MS)
    // Near the deadline: no grace at all, cancelled as today.
    const late = await graced(ASYNC_WRITER_END_MS - 2_000, ASYNC_WRITER_END_MS, [PLAIN, CLEAN])
    expect(late.elapsed).toBe(ASYNC_WRITER_END_MS - 2_000)
    expect(late.elapsed).toBeLessThanOrEqual(ASYNC_WRITER_END_MS)
  })
})
>>>>>>> origin/main
