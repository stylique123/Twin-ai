import { describe, it, expect, vi } from 'vitest'
import { withQuotaRetry, isQuotaRefusal, SYNTH_QUOTA_DELAYS_MS } from '../synthRetry.js'
import { usableKeptScan, keepScan, KEPT_SCAN_MAX_AGE_MS } from '../keptScan.js'

describe('bounded quota retry for voice building', () => {
  it('waits 20 s then 40 s: two retries, about a minute, inside the job budget', () => {
    expect([...SYNTH_QUOTA_DELAYS_MS]).toEqual([20_000, 40_000])
    expect(SYNTH_QUOTA_DELAYS_MS.reduce((a, b) => a + b, 0)).toBeLessThan(2_100_000)
  })

  it('recognises the measured Gemini refusal', () => {
    expect(isQuotaRefusal(new Error('Gemini 429 status=RESOURCE_EXHAUSTED — quota refusal with no named quota — not retried'))).toBe(true)
    expect(isQuotaRefusal(new Error('socket hang up'))).toBe(false)
  })

  it('stops after the last delay — never loops', async () => {
    const sleep = vi.fn(async () => {})
    const fn = vi.fn(async () => { throw new Error('RESOURCE_EXHAUSTED') })
    await expect(withQuotaRetry(fn, { sleep })).rejects.toThrow('RESOURCE_EXHAUSTED')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([20_000, 40_000])
  })

  it('recovers when a retry succeeds', async () => {
    let n = 0
    const r = await withQuotaRetry(async () => { if (n++ === 0) throw new Error('429'); return 'ok' }, { sleep: async () => {} })
    expect(r).toBe('ok')
  })

  it('does not retry a non-quota error here', async () => {
    const fn = vi.fn(async () => { throw new Error('bad json') })
    await expect(withQuotaRetry(fn, { sleep: async () => {} })).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('a kept scan is reused only when it is really this scan', () => {
  const posts = [{ text: 'fictional', likes: null, plays: null, hashtags: [], url: 'https://example.invalid/1' }]
  it('round-trips', () => {
    const k = keepScan('fict', 'youtube', posts, null)
    expect(usableKeptScan(JSON.parse(JSON.stringify(k)), 'fict', 'youtube')?.posts).toHaveLength(1)
  })
  it('rejects another handle, another platform, stale, or empty', () => {
    const k = keepScan('fict', 'youtube', posts, null)
    expect(usableKeptScan(k, 'other', 'youtube')).toBeNull()
    expect(usableKeptScan(k, 'fict', 'tiktok')).toBeNull()
    expect(usableKeptScan(k, 'fict', 'youtube', Date.now() + KEPT_SCAN_MAX_AGE_MS + 1000)).toBeNull()
    expect(usableKeptScan({ ...k, posts: [] }, 'fict', 'youtube')).toBeNull()
    expect(usableKeptScan(null, 'fict', 'youtube')).toBeNull()
  })
})
