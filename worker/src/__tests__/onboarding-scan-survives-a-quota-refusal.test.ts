// AN ONBOARDING SCAN THAT READ THE ACCOUNT MUST NOT THROW THE READ AWAY.
//
// ⚠️ 2026-10-26: YouTube, TikTok and Instagram scans all finished their three
// progress steps, then failed at the voice-building step on Gemini 429
// RESOURCE_EXHAUSTED. The screen said "not sure why", and every retry paid
// Apify again for the same posts.
//
// ⚖️ FICTIONAL FIXTURES ONLY. No network, no paid call: `fetch` and the
// subprocess are stubbed, the model is mocked, the database is in memory.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { readScanFailure } from '../../../packages/shared/src/scanFailure.js'

vi.hoisted(() => {
  process.env.SUPABASE_URL ??= 'http://fictional.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'fictional'
})

type Op = { table: string; op: string; values?: unknown; filters: Array<[string, unknown[]]> }
const ops: Op[] = []
let keptJobRow: { result: unknown } | null = null
let voiceSaveError: { message: string } | null = null

function chain(table: string) {
  const o: Op = { table, op: 'select', filters: [] }
  ops.push(o)
  const settle = () => {
    if (table === 'brand_voices' && o.op === 'update') {
      const v = o.values as { status?: string }
      return { data: null, error: v.status === 'ready' ? voiceSaveError : null }
    }
    if (table === 'brand_voices') return { data: { profile: null, brand_kit: null }, error: null }
    if (table === 'jobs' && o.op === 'select') return { data: keptJobRow, error: null }
    return { data: null, error: null }
  }
  const c: Record<string, unknown> = {}
  for (const f of ['select', 'eq', 'in', 'contains', 'not', 'order', 'limit', 'gte'])
    c[f] = (...a: unknown[]) => { o.filters.push([f, a]); return c }
  for (const f of ['update', 'insert', 'upsert'])
    c[f] = (v: unknown) => { o.op = f; o.values = v; return c }
  c.maybeSingle = async () => settle()
  c.single = async () => settle()
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(settle()).then(res, rej)
  return c
}

vi.mock('../db.js', () => ({
  db: { from: (t: string) => chain(t), rpc: async () => ({ data: 0, error: null }) },
}))
vi.mock('../env.js', async (orig) => {
  const real = (await orig()) as { env: Record<string, unknown> }
  return { env: { ...real.env, apifyToken: 'fictional-token', apifyProxyPassword: '' } }
})
const { synth } = vi.hoisted(() => ({ synth: vi.fn() }))
vi.mock('../voice.js', () => ({
  synthesizeVoiceFromPosts: (...a: unknown[]) => synth(...a),
  extractKnowledgeFromCaptions: async () => [],
}))
vi.mock('../voiceOwnMaterial.js', () => ({ voiceHasOwnMaterial: async () => false }))
vi.mock('../knowledgeInsert.js', () => ({ insertKnowledge: async () => ({ error: null }), KNOWLEDGE_ROWS_PER_SCAN: 40 }))
// The bounded backoff is real in production (20 s, 40 s); the test does not wait.
vi.mock('../synthRetry.js', async (orig) => ({ ...((await orig()) as object), SYNTH_QUOTA_DELAYS_MS: [0, 0] }))
// TikTok tries yt-dlp first; here it is simply not installed, so the Apify
// shape (with videoMeta.duration) is what gets read.
vi.mock('node:child_process', () => ({
  spawn: () => {
    const ch = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void }
    ch.stdout = new EventEmitter(); ch.stderr = new EventEmitter(); ch.kill = () => {}
    setImmediate(() => ch.emit('error', Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' })))
    return ch
  },
}))

const { handleScrapeDna } = await import('../jobs/scrapeDna.js')

// ── FICTIONAL SCAN RESULTS ────────────────────────────────────────────────
const FIXTURES: Record<string, Record<string, unknown>[]> = {
  // YouTube Shorts: the channel actor returns `duration: null` for Shorts.
  youtube: [
    { title: 'Fictional short about pottery glazes', viewCount: 1200, url: 'https://www.youtube.com/shorts/fictA1', duration: null,
      thumbnailUrl: 'https://i.ytimg.com/vi/fictA1/0.jpg', channelUsername: 'fictionalclay', channelName: 'Fictional Clay', numberOfSubscribers: 480, channelTotalVideos: 2 },
    { title: 'Second fictional short: kiln myths', viewCount: null, url: 'https://www.youtube.com/shorts/fictA2', duration: null },
  ],
  // TikTok via Apify: duration lives under videoMeta.
  tiktok: [
    { text: 'Fictional bread tip #baking', diggCount: 12, playCount: 340, webVideoUrl: 'https://www.tiktok.com/@fictbake/video/1',
      videoMeta: { duration: 23, coverUrl: 'https://p16.tiktokcdn.com/fict1.jpg' }, authorMeta: { name: 'fictbake', nickName: 'Fict Bake', fans: 90, video: 2 } },
    { text: 'Another fictional loaf', diggCount: 3, playCount: 80, webVideoUrl: 'https://www.tiktok.com/@fictbake/video/2', videoMeta: { duration: 41 } },
  ],
  // Instagram: duration is videoDuration.
  instagram: [
    { caption: 'Fictional reel on watercolour washes', likesCount: 7, videoPlayCount: 210, url: 'https://www.instagram.com/p/FICT1/',
      videoDuration: 14.2, displayUrl: 'https://scontent.cdninstagram.com/fict1.jpg', ownerUsername: 'fictpaint', ownerFullName: 'Fict Paint' },
    { caption: 'Second fictional reel', likesCount: 2, videoViewCount: 55, url: 'https://www.instagram.com/p/FICT2/', videoDuration: 9.8 },
  ],
}
const HANDLE: Record<string, string> = { youtube: 'fictionalclay', tiktok: 'fictbake', instagram: 'fictpaint' }
const QUOTA = 'Gemini 429 class=unknown status=RESOURCE_EXHAUSTED — quota refusal with no named quota — not retried, evidence preserved'
const PROFILE = { niche: 'fictional craft', tone: 'warm', summary: 'A fictional creator.' }

let apifyCalls = 0
let currentPlatform = 'youtube'
beforeEach(() => {
  ops.length = 0
  keptJobRow = null
  voiceSaveError = null
  apifyCalls = 0
  synth.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', async (url: string) => {
    if (String(url).startsWith('https://api.apify.com/')) {
      apifyCalls++
      return new Response(JSON.stringify(FIXTURES[currentPlatform]), { status: 200 })
    }
    return new Response('', { status: 404 }) // cover images: best-effort
  })
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

const job = (platform: string, extra: Record<string, unknown> = {}) => ({
  id: `job-${platform}`, owner_id: 'owner-1', type: 'scrape_dna', status: 'running', attempts: 1, max_attempts: 3,
  payload: { brand_voice_id: `voice-${platform}`, handle: HANDLE[platform], platform, owner_id: 'owner-1' },
  ...extra,
})
const voiceUpdates = () => ops.filter((o) => o.table === 'brand_voices' && o.op === 'update').map((o) => o.values as Record<string, unknown>)

describe.each(['youtube', 'tiktok', 'instagram'])('%s onboarding scan (fictional)', (platform) => {
  beforeEach(() => { currentPlatform = platform })

  it('success: builds and saves the voice from the read posts', async () => {
    synth.mockResolvedValue(PROFILE)
    const r = await handleScrapeDna(job(platform) as never)
    expect(r.ok).toBe(true)
    expect(r.posts_used).toBe(2)
    expect(apifyCalls).toBe(1)
    expect(synth).toHaveBeenCalledTimes(1)
    expect(voiceUpdates().some((v) => v.status === 'ready' && (v.profile as { niche?: string }).niche === 'fictional craft')).toBe(true)
  })

  it('quota: retries twice, then fails as SERVICE_QUOTA, keeps the scan, and offers manual', async () => {
    synth.mockRejectedValue(new Error(QUOTA))
    const r = await handleScrapeDna(job(platform) as never)
    expect(synth).toHaveBeenCalledTimes(3) // 1 + 2 bounded retries, never a loop
    expect(r.ok).toBe(false)
    expect(r.scan_cause).toBe('SERVICE_QUOTA')
    const kept = r.kept_scan as { posts: unknown[]; handle: string; platform: string }
    expect(kept.handle).toBe(HANDLE[platform])
    expect(kept.platform).toBe(platform)
    expect(kept.posts).toHaveLength(2)
    expect(voiceUpdates().at(-1)?.status).toBe('failed')
    const f = readScanFailure(r.scan_cause)
    expect(f.cause).toBe('SERVICE_QUOTA')
    expect(f.offerManual).toBe(true)
    expect(f.message.toLowerCase()).not.toMatch(/privat/)

    // ⚖️ AND THE RETRY REBUILDS WITHOUT READING THE ACCOUNT AGAIN.
    keptJobRow = { result: r }
    apifyCalls = 0
    synth.mockReset()
    synth.mockResolvedValue(PROFILE)
    const again = await handleScrapeDna(job(platform, { id: `job-${platform}-2` }) as never)
    expect(again.ok).toBe(true)
    expect(apifyCalls).toBe(0)
    expect(synth).toHaveBeenCalledTimes(1)
    expect(voiceUpdates().at(-1)?.status).toBe('ready')
  })
})

describe('every other step after the scan names its own cause', () => {
  beforeEach(() => { currentPlatform = 'youtube' })
  const last = (extra: Record<string, unknown> = {}) => job('youtube', { attempts: 3, max_attempts: 3, ...extra })

  it('a model that answers with nothing is VOICE_INCOMPLETE', async () => {
    synth.mockResolvedValue({})
    const r = await handleScrapeDna(last() as never)
    expect(r.scan_cause).toBe('VOICE_INCOMPLETE')
    expect(r.kept_scan).toBeTruthy()
  })

  it('a refused brand voice write is VOICE_SAVE_FAILED, not a silent `done`', async () => {
    synth.mockResolvedValue(PROFILE)
    voiceSaveError = { message: 'new row violates row-level security policy' }
    const r = await handleScrapeDna(last() as never)
    expect(r.ok).toBe(false)
    expect(r.scan_cause).toBe('VOICE_SAVE_FAILED')
  })

  it('a model timeout is SCAN_TIMED_OUT', async () => {
    synth.mockRejectedValue(new Error('gemini request timed out after 90000ms'))
    const r = await handleScrapeDna(last() as never)
    expect(r.scan_cause).toBe('SCAN_TIMED_OUT')
  })

  it('posts with no caption text are NO_USABLE_TEXT', async () => {
    FIXTURES.blank = [{ title: '   ', url: 'https://www.youtube.com/shorts/blank', duration: null }]
    currentPlatform = 'blank'
    const r = await handleScrapeDna(last() as never)
    expect(r.scan_cause).toBe('NO_USABLE_TEXT')
    expect(synth).not.toHaveBeenCalled()
  })

  it('no posts at all is NO_RECENT_CONTENT, never "private"', async () => {
    FIXTURES.none = []
    currentPlatform = 'none'
    const r = await handleScrapeDna(last() as never)
    expect(r.scan_cause).toBe('NO_RECENT_CONTENT')
    expect(readScanFailure(r.scan_cause).message.toLowerCase()).not.toMatch(/privat/)
  })

  it('a stale or mismatched kept scan is ignored and the account is read fresh', async () => {
    synth.mockResolvedValue(PROFILE)
    keptJobRow = { result: { kept_scan: { handle: 'someoneelse', platform: 'youtube', read_at: new Date().toISOString(), posts: [{ text: 'x' }] } } }
    await handleScrapeDna(last() as never)
    expect(apifyCalls).toBe(1)
  })
})
