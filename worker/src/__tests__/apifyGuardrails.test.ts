import { describe, it, expect, vi } from 'vitest'

process.env.SUPABASE_URL ||= 'http://localhost'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test'
import {
  apifyLimits, budgetDecision, cappedRunUrl, guardedApifyFetch, apifyOwnerScope, ApifyRefusedError, spendAnomaly,
  billingCycleStart, creatorReadLimit, type GuardDeps, type ApifyTier,
} from '../apifyGuard.js'
import { planCreatorRead, mergeByVideoId, videoIdOf } from '../creatorReadCache.js'
import {
  redditScanV2Enabled, runRedditScanV2, buildPainMap, dueForScan, batchedScanInput, newerThanLastScan, livePatterns,
  type ScannedThread,
} from '../nicheBrain/redditScanV2.js'

const L = { creatorRunMaxUsd: 0.25, batchRunMaxUsd: 0.4, batchDailyUsd: 2, batchCycleUsd: 2, anomalyX: 3 }

/** A fictional in-memory ledger with the same rule as 0295 apify_reserve_tiered. */
function fakeLedger(history: { avgUsd?: number } = {}) {
  const rows: { usd: number; tier: ApifyTier }[] = []
  const sum = (t?: ApifyTier) => rows.filter((r) => !t || r.tier === t).reduce((a, r) => a + r.usd, 0)
  const reserve: GuardDeps['reserve'] = async ({ usd, tier, l }) => {
    const s = { todayUsd: sum(), avgUsd: history.avgUsd ?? 0, batchDayUsd: sum('batch'), batchCycleUsd: sum('batch') }
    const d = budgetDecision(s, tier, usd, l)
    if (!d.ok) return { ok: false, reason: d.reason, today_usd: s.todayUsd, avg_usd: s.avgUsd }
    rows.push({ usd, tier })
    return { ok: true, today_usd: s.todayUsd + usd, avg_usd: s.avgUsd }
  }
  return { rows, reserve }
}
const okFetch = () => vi.fn(async () => new Response(JSON.stringify([{ id: 'fixture-1' }]), { status: 200 })) as unknown as typeof fetch
const deps = (led: ReturnType<typeof fakeLedger>, f: typeof fetch, extra: Partial<GuardDeps> = {}): GuardDeps =>
  ({ token: 't', reserve: led.reserve, fetch: f, limits: L, testMode: false, batchPaused: false, ...extra })

describe('apify limits (v6.4)', () => {
  it('defaults: creator run $0.25, batch run $0.40, batch $2/day and $2/cycle, alert at 3x', () => {
    expect(apifyLimits({})).toEqual(L)
    expect(apifyLimits({ APIFY_BATCH_CYCLE_USD: '5' }).batchCycleUsd).toBe(5)
    expect(apifyLimits({ APIFY_BATCH_CYCLE_USD: 'lots' }).batchCycleUsd).toBe(2)
  })
  it('every run URL carries maxTotalChargeUsd', () => {
    expect(cappedRunUrl('fictional~actor', 'tok', 0.25)).toContain('maxTotalChargeUsd=0.25')
  })
  it('a creator read asks for at most 20 results (default 20, never 50/90)', () => {
    expect(creatorReadLimit(90, {})).toBe(20)
    expect(creatorReadLimit(50, {})).toBe(20)
    expect(creatorReadLimit(12, {})).toBe(12)
    expect(creatorReadLimit(50, { APIFY_CREATOR_READ_LIMIT: '10' })).toBe(10)
    expect(creatorReadLimit(50, { APIFY_CREATOR_READ_LIMIT: '500' })).toBe(20)
  })
  it('billing cycle starts on the 22nd (UTC), not the 1st', () => {
    expect(billingCycleStart(new Date('2026-10-26T10:00:00Z')).toISOString()).toBe('2026-10-22T00:00:00.000Z')
    expect(billingCycleStart(new Date('2026-11-05T10:00:00Z')).toISOString()).toBe('2026-10-22T00:00:00.000Z')
    expect(billingCycleStart(new Date('2026-01-21T23:59:59Z')).toISOString()).toBe('2025-12-22T00:00:00.000Z')
    expect(billingCycleStart(new Date('2026-11-22T00:00:00Z')).toISOString()).toBe('2026-11-22T00:00:00.000Z')
  })
  it('anomaly = today > 3x trailing average (no average, no anomaly)', () => {
    expect(spendAnomaly(3.1, 1)).toBe(true)
    expect(spendAnomaly(3, 1)).toBe(false)
    expect(spendAnomaly(50, 0)).toBe(false)
  })
})

describe('creator reads: record-only, never refused', () => {
  it('30 creator reads all run and are all recorded — no daily or monthly cap', async () => {
    const led = fakeLedger(); const f = okFetch()
    for (let i = 0; i < 30; i++) await guardedApifyFetch(deps(led, f), 'profile_read', 'a', {}, { tier: 'creator' })
    expect(f).toHaveBeenCalledTimes(30)
    expect(led.rows).toHaveLength(30)
    expect(led.rows.every((r) => r.tier === 'creator' && r.usd === 0.25)).toBe(true)
  })
  it('a ledger that cannot be reached is logged, and the read still happens', async () => {
    const f = okFetch(); const log = vi.fn()
    const d: GuardDeps = { token: 't', reserve: async () => { throw new Error('function does not exist') }, fetch: f, limits: L, testMode: false, log }
    expect(await guardedApifyFetch(d, 'profile_read', 'a', {}, { tier: 'creator' })).toHaveLength(1)
    expect(f).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('warn', 'apify_record_failed', expect.objectContaining({ tier: 'creator' }))
  })
  it('the anomaly breaker NEVER pauses a creator\'s own onboarding read (it alerts instead)', async () => {
    const led = fakeLedger({ avgUsd: 0.01 }); const f = okFetch(); const log = vi.fn()
    // Spend far above 3x the average, and the batch pause switch on as well.
    for (let i = 0; i < 10; i++) {
      await guardedApifyFetch(deps(led, f, { log, batchPaused: true }), 'dna_scan', 'a', {}, { tier: 'creator' })
    }
    expect(f).toHaveBeenCalledTimes(10)
    expect(log).toHaveBeenCalledWith('warn', 'apify_spend_anomaly', expect.objectContaining({ tier: 'creator' }))
    expect(log).not.toHaveBeenCalledWith('error', 'apify_refused', expect.anything())
  })
  it('alert payload is dollars and ids only — no creator material', async () => {
    const led = fakeLedger({ avgUsd: 0.01 }); const log = vi.fn()
    await guardedApifyFetch(deps(led, okFetch(), { log }), 'dna_scan', 'a', { profiles: ['fictional-handle'] }, { tier: 'creator' })
    expect(JSON.stringify(log.mock.calls)).not.toContain('fictional-handle')
  })
})

describe('batch (tier-B) jobs: hard caps', () => {
  it('stops at the cycle cap: 5 runs of $0.40 fit in $2, the 6th never calls Apify', async () => {
    const led = fakeLedger(); const f = okFetch()
    for (let i = 0; i < 5; i++) await guardedApifyFetch(deps(led, f), 'comments', 'a', {}, { tier: 'batch' })
    await expect(guardedApifyFetch(deps(led, f), 'comments', 'a', {}, { tier: 'batch' })).rejects.toBeInstanceOf(ApifyRefusedError)
    expect(f).toHaveBeenCalledTimes(5)
  })
  it('creator spend does not eat the batch cap', async () => {
    const led = fakeLedger(); const f = okFetch()
    for (let i = 0; i < 20; i++) await guardedApifyFetch(deps(led, f), 'profile_read', 'a', {}, { tier: 'creator' })
    await guardedApifyFetch(deps(led, f), 'comments', 'a', {}, { tier: 'batch' })
    expect(f).toHaveBeenCalledTimes(21)
  })
  it('the anomaly breaker pauses batch jobs', async () => {
    const led = fakeLedger({ avgUsd: 0.01 }); const f = okFetch()
    await guardedApifyFetch(deps(led, f), 'dna_scan', 'a', {}, { tier: 'creator' }) // today 0.25 > 3 x 0.01
    await expect(guardedApifyFetch(deps(led, f), 'niche_reddit', 'a', {}, { tier: 'batch' })).rejects.toThrow(/anomaly_paused/)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('the manual batch pause refuses batch runs', async () => {
    const led = fakeLedger(); const f = okFetch()
    await expect(guardedApifyFetch(deps(led, f, { batchPaused: true }), 'comments', 'a', {}, { tier: 'batch' })).rejects.toThrow(/batch_paused/)
    expect(f).not.toHaveBeenCalled()
  })
  it('batch fails closed when the ledger is unreachable', async () => {
    const f = okFetch()
    const d: GuardDeps = { token: 't', reserve: async () => { throw new Error('function does not exist') }, fetch: f, limits: L, testMode: false, batchPaused: false }
    await expect(guardedApifyFetch(d, 'x', 'a', {}, { tier: 'batch' })).rejects.toThrow(/ledger_unavailable/)
    expect(f).not.toHaveBeenCalled()
  })
})

describe('test and panel accounts never trigger Apify', () => {
  for (const tier of ['creator', 'batch'] as const) {
    it(`test mode returns empty without recording or fetching (${tier})`, async () => {
      const led = fakeLedger(); const f = okFetch()
      expect(await guardedApifyFetch(deps(led, f, { testMode: true }), 'x', 'a', {}, { tier })).toEqual([])
      expect(f).not.toHaveBeenCalled(); expect(led.rows).toHaveLength(0)
    })
    it(`a panel owner in scope returns empty (${tier})`, async () => {
      const led = fakeLedger(); const f = okFetch()
      const out = await apifyOwnerScope.run({ ownerId: '00000000-0000-0000-0000-00000000f1c7', testOwner: true },
        () => guardedApifyFetch(deps(led, f), 'x', 'a', {}, { tier }))
      expect(out).toEqual([]); expect(f).not.toHaveBeenCalled()
    })
  }
})

describe('creator read cache: 30 days, dedupe by video id', () => {
  const now = Date.parse('2026-10-26T00:00:00Z')
  const at = (days: number) => new Date(now - days * 86_400_000).toISOString()
  it('a channel read in the last 30 days asks only for the newest 10', () => {
    expect(planCreatorRead(Array.from({ length: 12 }, () => ({ observed_at: at(3) })), 20, now)).toEqual({ mode: 'incremental', limit: 10, cached: 12 })
    expect(planCreatorRead(Array.from({ length: 12 }, () => ({ observed_at: at(31) })), 20, now).mode).toBe('full')
    expect(planCreatorRead([], 20, now)).toEqual({ mode: 'full', limit: 20, cached: 0 })
  })
  it('video ids are stable across URL shapes', () => {
    expect(videoIdOf('https://www.youtube.com/shorts/abcDEF123_x')).toBe('abcDEF123_x')
    expect(videoIdOf('https://www.youtube.com/watch?v=abcDEF123_x&t=3')).toBe('abcDEF123_x')
    expect(videoIdOf('https://www.tiktok.com/@fictional/video/7300000000000000001?lang=en')).toBe('7300000000000000001')
    expect(videoIdOf('https://www.instagram.com/reel/Cfixture1/')).toBe('Cfixture1')
    expect(videoIdOf('https://www.instagram.com/p/Cfixture1/')).toBe('Cfixture1')
  })
  it('merges fresh + cached, one entry per video, counts only what is new', () => {
    const fresh = [{ url: 'https://www.youtube.com/shorts/vid000001' }, { url: 'https://www.youtube.com/watch?v=vid000002' }]
    const cached = [{ url: 'https://youtube.com/shorts/vid000002' }, { url: 'https://youtube.com/shorts/vid000003' }]
    const m = mergeByVideoId(fresh, cached)
    expect(m.posts.map((p) => videoIdOf(p.url))).toEqual(['vid000001', 'vid000002', 'vid000003'])
    expect(m.newCount).toBe(1)
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
