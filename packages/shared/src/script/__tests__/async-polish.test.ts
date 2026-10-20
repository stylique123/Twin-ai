// Async polish (owner decision 2): fake timings only, fictional lines.
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  asyncPolishOn, asyncDeadlineTimeout, isDeferredStep, applyPolishRewrites, editedWins, newNumbersIn,
  ASYNC_WRITER_PRIMARY_MS, ASYNC_WRITER_END_MS, ASYNC_REQUEST_TARGET_MS, runHedged, writerHedgeOn, WRITER_HEDGE_AT_MS,
} from '../asyncPolish'
import { deadlineTimeout } from '../writerDeadline'

const T0 = 1_000_000
const PRIMARY_BASE = 75_000
const FALLBACK_BASE = 55_000

/** Simulates the two-attempt ladder: each attempt runs `ms[i]` or times out at its cap. */
function ladder(ms: number[], setupMs: number, timeoutFor: (i: number, base: number, now: number) => number | null) {
  let now = T0 + setupMs
  for (let i = 0; i < 2; i++) {
    const t = timeoutFor(i, i === 0 ? PRIMARY_BASE : FALLBACK_BASE, now)
    if (t === null) continue
    if (ms[i]! <= t) return { ok: true, writerEnd: now + ms[i]! - T0 }
    now += t
  }
  return { ok: false, writerEnd: now - T0 }
}

describe('async polish switch', () => {
  it('trial only, ASYNC_POLISH=off kills it', () => {
    expect(asyncPolishOn(true, undefined)).toBe(true)
    expect(asyncPolishOn(true, 'off')).toBe(false)
    expect(asyncPolishOn(true, ' OFF ')).toBe(false)
    expect(asyncPolishOn(false, 'on')).toBe(false)
  })
  it('defers the quality passes, never the mandatory ones', () => {
    for (const s of ['late_extend', 'extension', 'payoff_repair', 'advisory_read', 'self_review']) expect(isDeferredStep(s)).toBe(true)
    expect(isDeferredStep('role_claims')).toBe(false)
  })
})

describe('async writer deadline (fake timings)', () => {
  const asyncT = (i: number, base: number, now: number) => asyncDeadlineTimeout(i, base, T0, now)
  it('a fast primary (43 s, the p50) returns well inside the target', () => {
    const r = ladder([43_000, 0], 4_000, asyncT)
    expect(r.ok).toBe(true)
    expect(r.writerEnd).toBe(47_000)
  })
  it('a slow primary is cut at 60 s and the fallback still ends by 84 s', () => {
    const r = ladder([100_000, 15_000], 4_000, asyncT)
    expect(r.ok).toBe(true)
    expect(r.writerEnd).toBeLessThanOrEqual(ASYNC_WRITER_END_MS)
  })
  it('a dead writer gives up by 84 s; the old arithmetic ran to ~121 s', () => {
    const r = ladder([200_000, 200_000], 4_000, asyncT)
    expect(r.ok).toBe(false)
    expect(r.writerEnd).toBeLessThanOrEqual(ASYNC_WRITER_END_MS)
    const old = ladder([200_000, 200_000], 4_000, (i, b, now) => deadlineTimeout(i, b, T0, now))
    expect(old.writerEnd).toBeGreaterThan(115_000)
  })
  it('attempt caps and the request target', () => {
    expect(asyncDeadlineTimeout(0, PRIMARY_BASE, T0, T0)).toBe(ASYNC_WRITER_PRIMARY_MS)
    expect(asyncDeadlineTimeout(1, FALLBACK_BASE, T0, T0 + 72_000)).toBeNull()
    expect(ASYNC_WRITER_END_MS + 6_000).toBeLessThanOrEqual(ASYNC_REQUEST_TARGET_MS)
  })
})

// ---------------------------------------------------------------------------
// The parallel hedge, driven on a fake clock with the panel-7 distributions:
// attempt 0 ok p50 43 s / p90 62 s, 26 of 76 attempts hang (timeout share);
// fallback p50 42 s / p90 51 s. Lognormal fits; ~4 s of setup before the writer.
const SETUP_MS = 4_000
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const normal = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
const lognormal = (r: () => number, p50: number, p90: number) => p50 * Math.exp(normal(r) * Math.log(p90 / p50) / 1.2816)
const HANG = 26 / 76

/** A fake model call: resolves after `ms`, or rejects at its timeout / when aborted. */
function fakeCall(ms: number | null, text = '{"ok":true}') {
  return (timeoutMs: number, signal: AbortSignal) => new Promise<string>((res, rej) => {
    const done = ms !== null && ms <= timeoutMs
    const t = setTimeout(() => (done ? res(text) : rej(new Error('timeout'))), done ? ms! : timeoutMs)
    signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')) }, { once: true })
  })
}

async function oneRequest(primaryMs: number | null, fallbackMs: number, hedgeAtMs = WRITER_HEDGE_AT_MS) {
  const startedAt = Date.now() - SETUP_MS
  const p = runHedged([{ base: ASYNC_WRITER_END_MS, run: fakeCall(primaryMs) }, { base: 55_000, run: fakeCall(fallbackMs) }], () => true, { startedAt, hedgeAtMs })
  await vi.runAllTimersAsync()
  const r = await p
  return { ...r, endMs: Date.now() - startedAt }
}

async function simulate(seed: number, n: number, hedgeAtMs = WRITER_HEDGE_AT_MS) {
  const r = rng(seed)
  let fails = 0, hedged = 0, calls = 0, maxEnd = 0
  for (let k = 0; k < n; k++) {
    const prim = r() < HANG ? null : lognormal(r, 43_000, 62_000)
    const fall = lognormal(r, 42_000, 51_000)
    const out = await oneRequest(prim, fall, hedgeAtMs)
    if (out.text === null) fails++
    if (out.hedged) hedged++
    calls += out.calls
    maxEnd = Math.max(maxEnd, out.endMs)
  }
  return { fails, hedged, calls, maxEnd }
}

describe('parallel writer hedge (fake clock)', () => {
  afterEach(() => { vi.useRealTimers() })
  it('kill switch', () => {
    expect(writerHedgeOn(true, undefined)).toBe(true)
    expect(writerHedgeOn(true, 'off')).toBe(false)
    expect(writerHedgeOn(false, 'on')).toBe(false)
  })
  it('a fast primary never starts the fallback', async () => {
    vi.useFakeTimers()
    const out = await oneRequest(20_000, 40_000)
    expect(out).toMatchObject({ winner: 0, hedged: false, calls: 1, aborted: 0 })
  })
  it('a hung primary: the fallback, started at 30 s, wins and the primary is aborted', async () => {
    vi.useFakeTimers()
    const out = await oneRequest(null, 42_000)
    expect(out).toMatchObject({ winner: 1, hedged: true, calls: 2, aborted: 1 })
    expect(out.endMs).toBe(WRITER_HEDGE_AT_MS + 42_000)
  })
  it('a slow primary that still beats the fallback wins; the fallback is aborted', async () => {
    vi.useFakeTimers()
    const out = await oneRequest(50_000, 42_000)
    expect(out).toMatchObject({ winner: 0, hedged: true, calls: 2, aborted: 1 })
  })
  it('an invalid primary result hands over to the fallback', async () => {
    vi.useFakeTimers()
    const startedAt = Date.now() - SETUP_MS
    const p = runHedged([{ base: ASYNC_WRITER_END_MS, run: fakeCall(10_000, 'partial') }, { base: 55_000, run: fakeCall(30_000, 'full') }], (t) => t === 'full', { startedAt })
    await vi.runAllTimersAsync()
    const out = await p
    expect(out).toMatchObject({ text: 'full', winner: 1, partial: 'partial', calls: 2 })
  })
  it('both hang: gives up by 84 s of the request', async () => {
    vi.useFakeTimers()
    const out = await oneRequest(null, 999_000)
    expect(out.text).toBeNull()
    expect(out.endMs).toBeLessThanOrEqual(ASYNC_WRITER_END_MS)
  })
  it('24 requests at the panel-7 distributions: failure rate, hedge share, every writer done by 84 s', async () => {
    vi.useFakeTimers()
    const sample = await simulate(7, 24)
    const big = await simulate(11, 2_400)
    const per24 = (big.fails / 2_400) * 24
    console.log(JSON.stringify({ event: 'hedge_sim', sample24_fails: sample.fails, sample24_hedged: sample.hedged, per24_expected_fails: Number(per24.toFixed(2)), hedge_share: Number((big.hedged / 2_400).toFixed(2)), calls_per_request: Number((big.calls / 2_400).toFixed(2)) }))
    expect(sample.maxEnd).toBeLessThanOrEqual(ASYNC_WRITER_END_MS)
    expect(big.maxEnd).toBeLessThanOrEqual(ASYNC_WRITER_END_MS)
    expect(sample.fails).toBeLessThanOrEqual(1)
    expect(per24).toBeLessThanOrEqual(1)
  }, 60_000)
})

describe('polish rewrites', () => {
  const beats = [
    { section: 'Hook', line: 'The one step most people skip when they roast at home.' },
    { section: 'Body', line: 'Roasting is a craft for coffee lovers everywhere.' },
    { section: 'Body', line: 'I always rest the beans for two days.' },
    { section: 'Close', line: 'Try it and tell me how it went.' },
  ]
  const material = 'I rest Harbor Blend beans for 2 days before I grind them; cooling them fast keeps the orange note.'
  it('keeps a middle rewrite, refuses the hook, the close and a new number', () => {
    const raw = JSON.stringify({ rewrites: [{ index: '1', line: 'The step I never skip is cooling the beans fast.' }, { index: '0', line: 'A brand new hook line here.' }] })
    const r = applyPolishRewrites(beats, raw, material)
    expect(r.kept).toBe(1)
    expect(r.rejected).toEqual(['hook_or_close'])
    expect(r.next[1]!.line).toMatch(/cooling/)
    const n = applyPolishRewrites(beats, JSON.stringify({ rewrites: [{ index: '2', line: 'I rest the beans for 9 days.' }] }), material)
    expect(n.rejected).toEqual(['new_number'])
    expect(applyPolishRewrites(beats, 'not json', material).rejected).toEqual(['bad_json'])
  })
  it('the edit wins only when the blind read picks it', () => {
    expect(editedWins('{"best":"B"}', false)).toBe(true)
    expect(editedWins('{"best":"A"}', true)).toBe(true)
    expect(editedWins('{"best":"A"}', false)).toBe(false)
    expect(editedWins('oops', false)).toBe(false)
    expect(newNumbersIn('for 2 days', '', material)).toEqual([])
  })
})
