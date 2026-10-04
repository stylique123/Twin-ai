// THE REDDIT RESEARCHER — what real people in each sub-niche ask, complain
// about, argue over and want to buy (owner, 2026-10-04). See nicheRedditParse.ts.
//
// ⚖️ ONE NICHE AT A TIME, WEEKLY, AND PAID ONLY THROUGH THE VENDOR WE HAVE.
// Apify (already the scan's vendor) runs the search; one sub-niche per 10
// minutes at most, each refreshed every 7 days, new ones first. A failed or
// empty read is stamped so it does not retry in a loop.

import { db } from '../db.js'
import { env } from '../env.js'
import { geminiJson } from '../gemini.js'
import { modelForTask } from '../modelRouting.js'
import { apifyDataset } from '../media.js'
import { nicheKey } from './nicheResearchParse.js'
import { REDDIT_SYSTEM, REDDIT_SCHEMA, redditPrompt, cleanRedditItems, threadsFromDataset, redditSearches } from './nicheRedditParse.js'

type Log = (level: string, msg: string, extra?: Record<string, unknown>) => void
export const REDDIT_CHECK_MS = 10 * 60 * 1000
export const REDDIT_TTL_DAYS = 7
let lastCheck = 0

export async function runNicheReddit(log: Log): Promise<void> {
  if (!env.apifyToken || Date.now() - lastCheck < REDDIT_CHECK_MS) return
  lastCheck = Date.now()
  // The sub-niches the researcher already knows are the ones creators brought.
  const { data: known, error } = await db.from('niche_research').select('niche_key, sub_niche, niche').limit(500)
  if (error) { log('error', 'niche_reddit_due_failed', { error: error.message }); return }
  const { data: done } = await db.from('niche_reddit').select('niche_key, researched_at').limit(1000)
  const at = new Map((done ?? []).map((r) => [String(r.niche_key), Date.parse(String(r.researched_at))]))
  const stale = Date.now() - REDDIT_TTL_DAYS * 86_400_000
  const due = (known ?? [])
    .filter((r) => !at.has(String(r.niche_key)) || (at.get(String(r.niche_key)) ?? 0) < stale)
    .sort((a, b) => (at.get(String(a.niche_key)) ?? 0) - (at.get(String(b.niche_key)) ?? 0))[0] as { niche_key: string; sub_niche: string; niche: string | null } | undefined
  if (!due) return
  const key = nicheKey(due.sub_niche) || due.niche_key
  const stamp = (patch: Record<string, unknown>) => db.from('niche_reddit').upsert({
    niche_key: key, sub_niche: due.sub_niche.slice(0, 120), researched_at: new Date().toISOString(), ...patch,
  }, { onConflict: 'niche_key' })
  try {
    const rows = await apifyDataset(env.apifyRedditActor, {
      searches: redditSearches(due.sub_niche, due.niche),
      sort: 'top', time: 'year', type: 'posts',
      maxItems: 120, maxPostCount: 40, maxComments: 4,
      includeNSFW: false, skipComments: false,
    }, 240_000)
    const threads = threadsFromDataset(rows)
    if (threads.length < 3) {
      await stamp({ items: [], threads: [], failure: `only ${threads.length} threads` })
      log('info', 'niche_reddit', { event: 'niche_reddit', niche: key, rows: rows.length, threads: threads.length, items: 0 })
      return
    }
    const model = modelForTask('search')
    const raw = await geminiJson(REDDIT_SYSTEM, redditPrompt(due.sub_niche, threads), REDDIT_SCHEMA, 90_000, 1024, model)
    const items = cleanRedditItems(raw)
    await stamp({
      items, model, failure: null,
      threads: threads.slice(0, 15).map((t) => ({ title: t.title, url: t.url, upvotes: t.upvotes, community: t.community })),
    })
    log('info', 'niche_reddit', { event: 'niche_reddit', niche: key, rows: rows.length, threads: threads.length, items: items.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err)
    await stamp({ failure: msg })
    log('error', 'niche_reddit_failed', { niche: key, error: msg })
  }
}
