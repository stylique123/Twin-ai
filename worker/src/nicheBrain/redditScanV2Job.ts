// REDDIT SCAN v2 — THE CALLER (plan v7.1 WP5). `runRedditScanV2` existed and
// nothing called it, so the pain map stayed hand-written. This is the caller,
// on the brain sweep, OFF unless REDDIT_SCAN_V2=true (the owner's switch).
//
// ⚖️ RESEARCH ONLY. What is saved is the pain map: a topic in Twin's own words,
// how many threads, which communities, links and dates. No post text, no
// usernames, no quotes: a title is read here to name the topic and dropped.
// Apify runs on the batch tier (hard per-cycle cap, anomaly breaker, 0295).
// Logs carry counts only.
import { db } from '../db.js'
import { env } from '../env.js'
import { apifyDataset } from '../media.js'
import { geminiJson } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { SUBREDDIT_SCHEMA, SUBREDDIT_SYSTEM, cleanSubreddits } from './nicheRedditParse.js'
import { runRedditScanV2, redditScanV2Enabled, type NicheScanState } from './redditScanV2.js'
import { newProfileNiches, nichesFromRedditRows, painSentence, pickedCommunitiesRow, threadsFromRows, topicOf } from './redditScanV2Parse.js'

type Log = (level: 'info' | 'error', msg: string, data?: Record<string, unknown>) => void

const CHECK_MS = 6 * 3_600_000
// Model picks per cycle for new creator niches: picked once, then stored.
const PICKS_PER_CYCLE = 5
let lastCheck = 0

export async function runRedditScanV2Job(log: Log): Promise<void> {
  if (!redditScanV2Enabled() || !env.apifyToken || Date.now() - lastCheck < CHECK_MS) return
  lastCheck = Date.now()
  let nicheOfCommunity = new Map<string, string>()
  try {
    const res = await runRedditScanV2({
      niches: async () => {
        const [{ data: v1Rows }, { data: done }, { data: profiles }] = await Promise.all([
          db.from('niche_reddit').select('niche_key, threads').limit(500),
          db.from('audience_pain_map').select('niche, last_checked').limit(2000),
          db.from('brand_voices').select('profile').not('profile->>niche', 'is', null).limit(2000),
        ])
        const v1 = [...(v1Rows ?? [])] as Array<Record<string, unknown>>
        const fresh = newProfileNiches((profiles ?? []) as Array<{ profile?: unknown }>, new Set(v1.map((r) => String(r.niche_key ?? ''))), PICKS_PER_CYCLE)
        let picked = 0
        for (const n of fresh) {
          const subs = cleanSubreddits(await geminiJson(SUBREDDIT_SYSTEM, `Niche: ${n.niche}`, SUBREDDIT_SCHEMA, 30_000, 0, modelForTask('search')).catch(() => null))
          if (subs.length < 2) continue
          const row = pickedCommunitiesRow(n, subs)
          const { error } = await db.from('niche_reddit').upsert(row, { onConflict: 'niche_key' })
          if (!error) { v1.push(row); picked++ }
        }
        if (fresh.length) log('info', 'reddit_scan_v2_niches', { event: 'reddit_scan_v2_niches', new: fresh.length, picked })
        const last = new Map<string, string>()
        for (const d of (done ?? []) as Array<{ niche?: unknown; last_checked?: unknown }>) {
          const k = String(d.niche ?? ''); const at = String(d.last_checked ?? '')
          if (k && at && (!last.has(k) || at > (last.get(k) as string))) last.set(k, at)
        }
        const niches = nichesFromRedditRows(v1, last)
        nicheOfCommunity = new Map(niches.flatMap((n) => n.communities.map((c) => [c, n.niche_key] as [string, string])))
        return niches
      },
      run: async (input) => threadsFromRows(await apifyDataset(env.apifyRedditActor, input, 295_000, 'reddit_scan_v2', 'batch'), nicheOfCommunity),
      topicOf,
      save: async (patterns, scanned) => {
        const today = new Date().toISOString().slice(0, 10)
        if (patterns.length) {
          await db.from('audience_pain_map').upsert(patterns.map((p) => ({
            niche: p.niche_key, pain_sentence: painSentence(p), pillar_bucket: p.niche_key,
            communities: p.communities, thread_count: p.threads, community_count: p.communities.length,
            kind: 'pattern', example_links: p.links.slice(0, 5), first_seen: p.first_seen.slice(0, 10),
            last_checked: today, verification: 'V1', expiry: p.expires_at.slice(0, 10), status: 'active', origin: 'audience_pain',
          })), { onConflict: 'niche,pain_sentence' })
        }
        log('info', 'reddit_scan_v2', { event: 'reddit_scan_v2', niches: scanned.length, patterns: patterns.length })
      },
    })
    if (!res.ran) log('info', 'reddit_scan_v2', { event: 'reddit_scan_v2', ran: false })
  } catch (err) {
    log('error', 'reddit_scan_v2_failed', { error: err instanceof Error ? err.message.slice(0, 200) : String(err) })
  }
}
