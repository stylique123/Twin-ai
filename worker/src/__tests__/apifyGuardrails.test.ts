import { describe, it, expect, vi } from 'vitest'

process.env.SUPABASE_URL ||= 'http://localhost'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test'
import { apifyLimits, budgetDecision, cappedRunUrl, guardedApifyFetch, apifyOwnerScope, ApifyRefusedError, type GuardDeps } from '../apifyGuard.js'
import {
  redditScanV2Enabled, runRedditScanV2, buildPainMap, dueForScan, batchedScanInput, newerThanLastScan, livePatterns,
  type ScannedThread,
} from '../nicheBrain/redditScanV2.js'

const L = { dailyUsd: 2, monthlyUsd: 10, alertUsd: 5, runMaxUsd: 0.4 }

/** A fictional in-memory ledger with the same rule as 0294 apify_reserve. */
function fakeLedger() {
  const rows: number[] = []
  const reserve: GuardDeps['reserve'] = async ({ usd, l }) => {
    const total = rows.reduce((a, b) => a + b, 0)
    const d = budgetDecision(total, total, usd, l)
    if (!d.ok) return { ok: false, reason: d.reason }
    rows.push(usd)
    return { ok: true, month_usd: total + usd }
  }
  return { rows, reserve }
}
const okFetch = () => vi.fn(async () => new Response(JSON.stringify([{ id: 'fixture-1' }]), { status: 200 })) as unknown as typeof fetch

describe('apify limits', () => {
  it('defaults are $10/month, alert $5, $0.40/run, $2/day; env overrides', () => {
    expect(apifyLimits({})).toEqual(L)
    expect(apifyLimits({ APIFY_MONTHLY_USD: '25' }).monthlyUsd).toBe(25)
    expect(apifyLimits({ APIFY_MONTHLY_USD: 'lots' }).monthlyUsd).toBe(10)
  })
  it('every run URL carries maxTotalChargeUsd', () => {
    expect(cappedRunUrl('fictional~actor', 'tok', 0.4)).toContain('maxTotalChargeUsd=0.40')
  })
})

describe('ledger hard stop', () => {
  it('stops at the daily limit: 5 runs of $0.40 fit in $2, the 6th never calls Apify', async () => {
    const led = fakeLedger(); const f = okFetch()
    const deps: GuardDeps = { token: 't', reserve: led.reserve, fetch: f, limits: L, testMode: false }
    for (let i = 0; i < 5; i++) await guardedApifyFetch(deps, 'test', 'fictional~actor', {})
    await expect(guardedApifyFetch(deps, 'test', 'fictional~actor', {})).rejects.toBeInstanceOf(ApifyRefusedError)
    expect(f).toHaveBeenCalledTimes(5)
    expect(led.rows.reduce((a, b) => a + b, 0)).toBeCloseTo(2)
  })
  it('stops at the monthly limit and alerts at $5', async () => {
    const led = fakeLedger(); const f = okFetch(); const log = vi.fn()
    const lim = { ...L, dailyUsd: 100 }
    const deps: GuardDeps = { token: 't', reserve: led.reserve, fetch: f, limits: lim, testMode: false, log }
    let n = 0
    await expect((async () => { for (;;) { await guardedApifyFetch(deps, 'test', 'a', {}); n++ } })()).rejects.toThrow(/monthly_limit/)
    expect(n).toBe(25)
    expect(log).toHaveBeenCalledWith('warn', 'apify_spend_alert', expect.anything())
  })
  it('fails closed when the ledger is unreachable', async () => {
    const f = okFetch()
    const deps: GuardDeps = { token: 't', reserve: async () => { throw new Error('function apify_reserve does not exist') }, fetch: f, limits: L, testMode: false }
    await expect(guardedApifyFetch(deps, 'x', 'a', {})).rejects.toThrow(/ledger_unavailable/)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('test and panel accounts never trigger Apify', () => {
  it('test mode returns empty without reserving or fetching', async () => {
    const led = fakeLedger(); const f = okFetch()
    expect(await guardedApifyFetch({ token: 't', reserve: led.reserve, fetch: f, limits: L, testMode: true }, 'x', 'a', {})).toEqual([])
    expect(f).not.toHaveBeenCalled(); expect(led.rows).toHaveLength(0)
  })
  it('a panel owner in scope returns empty', async () => {
    const led = fakeLedger(); const f = okFetch()
    const out = await apifyOwnerScope.run({ ownerId: '00000000-0000-0000-0000-00000000f1c7', testOwner: true },
      () => guardedApifyFetch({ token: 't', reserve: led.reserve, fetch: f, limits: L, testMode: false }, 'x', 'a', {}))
    expect(out).toEqual([]); expect(f).not.toHaveBeenCalled()
  })
})

describe('one read per niche per 30 days', () => {
  it('v1 TTL is 30 days', async () => {
    const { REDDIT_TTL_DAYS } = await import('../nicheBrain/nicheReddit.js')
    expect(REDDIT_TTL_DAYS).toBe(30)
  })
})

const now = Date.parse('2026-11-01T00:00:00Z')
const th = (i: number, community: string, topic = 'fixture pain'): ScannedThread => ({
  niche_key: 'fictional-niche', community, url: `https://www.reddit.com/r/${community}/comments/f${i}/`,
  created_at: new Date(now - i * 3_600_000).toISOString(), title: `${topic} #${i}`,
})

describe('reddit scan v2', () => {
  it('is off by default and never runs while off', async () => {
    expect(redditScanV2Enabled(undefined)).toBe(false)
    expect(redditScanV2Enabled('1')).toBe(false)
    const run = vi.fn()
    expect(await runRedditScanV2({ niches: vi.fn(), run, topicOf: () => 'x', save: vi.fn() }, false)).toEqual({ ran: false, patterns: 0 })
    expect(run).not.toHaveBeenCalled()
  })
  it('batches every due niche into one run, ~25 each, only due ones', () => {
    const due = dueForScan([
      { niche_key: 'a', communities: ['fa'], last_scan_at: null },
      { niche_key: 'b', communities: ['fb'], last_scan_at: new Date(now - 40 * 86_400_000).toISOString() },
      { niche_key: 'c', communities: ['fc'], last_scan_at: new Date(now - 5 * 86_400_000).toISOString() },
    ], now)
    expect(due.map((d) => d.niche_key)).toEqual(['a', 'b'])
    expect(batchedScanInput(due)).toMatchObject({ maxItems: 50, maxPostCount: 25, skipComments: true })
  })
  it('keeps only items newer than the last scan', () => {
    const t = [th(1, 'fa'), th(100, 'fa')]
    expect(newerThanLastScan(t, [{ niche_key: 'fictional-niche', communities: [], last_scan_at: new Date(now - 10 * 3_600_000).toISOString() }])).toHaveLength(1)
  })
  it('pain map: >=5 threads from >=2 communities, no text, 90-day expiry', () => {
    const one = buildPainMap([1, 2, 3, 4, 5].map((i) => th(i, 'fa')), (s) => s.split(' #')[0], now)
    expect(one).toEqual([])
    const map = buildPainMap([1, 2, 3, 4, 5].map((i) => th(i, i % 2 ? 'fa' : 'fb')), (s) => s.split(' #')[0], now)
    expect(map).toHaveLength(1)
    expect(map[0]).toMatchObject({ topic: 'fixture pain', threads: 5, communities: ['fa', 'fb'] })
    expect(Object.keys(map[0]).sort()).toEqual(['communities', 'expires_at', 'first_seen', 'last_seen', 'links', 'niche_key', 'threads', 'topic'])
    expect(JSON.stringify(map)).not.toContain('#')
    expect(map[0].expires_at).toBe(new Date(now + 90 * 86_400_000).toISOString())
    expect(livePatterns(map, now + 91 * 86_400_000)).toEqual([])
  })
})
