// Async polish (owner decision 2): fake timings only, fictional lines.
import { describe, it, expect } from 'vitest'
import {
  asyncPolishOn, asyncDeadlineTimeout, isDeferredStep, applyPolishRewrites, editedWins, newNumbersIn,
  ASYNC_WRITER_PRIMARY_MS, ASYNC_WRITER_END_MS, ASYNC_REQUEST_TARGET_MS,
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
  it('24 fake requests at panel-7 timings: at most 1 fails, every draft by 90 s', () => {
    // Primary ms drawn from the observed spread; 7 of 24 primaries hang.
    const prim = [38, 41, 43, 44, 47, 52, 55, 58, 61, 62, 36, 40, 45, 49, 51, 57, 999, 999, 999, 999, 999, 999, 999, 42].map((s) => s * 1000)
    const fall = [18, 14, 12, 16, 15, 13, 19, 40].map((s) => s * 1000)
    let fails = 0
    let k = 0
    for (const p of prim) {
      const r = ladder([p, p > 70_000 ? fall[k++]! : 0], 4_000, asyncT)
      if (!r.ok) fails++
      expect(r.writerEnd + 6_000).toBeLessThanOrEqual(ASYNC_REQUEST_TARGET_MS)
    }
    expect(fails).toBeLessThanOrEqual(1)
  })
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
