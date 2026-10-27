// Pure parts of the Reddit scan v2 caller (plan v7.1 WP5): no I/O, no env.
// The title is read only to name a topic; nothing here keeps post text or usernames.
import type { NicheScanState, PainPattern, ScannedThread } from './redditScanV2.js'

const STOP = new Set(('a an the and or but so to of in on at for with from by is are was were be been it its this that these those i me my we our you your ' +
  'he she they them their what why how when who which do does did have has had just any anyone anybody help need question advice tips best ' +
  'good bad new first get got make making made can could would should will really very much more most some about into vs one two my im ive dont cant keep keeps kept again still always never even every').split(' '))

/** A thread's topic: its two most specific words, lowercased. The title never leaves this function. */
export function topicOf(title: string): string | null {
  const w = String(title ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((x) => x.length > 3 && !STOP.has(x))
  if (w.length < 2) return null
  return [...new Set(w)].slice(0, 2).sort().join(' ')
}

/** Twin's own sentence for a pattern. Never a quote. */
export function painSentence(p: PainPattern): string {
  return `People in this niche keep running into ${p.topic}`
}

/** Dataset rows → scanned threads, mapped to the niche whose community they came from. */
export function threadsFromRows(rows: ReadonlyArray<Record<string, unknown>>, nicheOfCommunity: ReadonlyMap<string, string>): ScannedThread[] {
  const out: ScannedThread[] = []
  for (const r of rows) {
    if (String(r.dataType ?? 'post') !== 'post' || r.over18 === true) continue
    const community = String(r.parsedCommunityName ?? r.communityName ?? '').replace(/^r\//i, '').toLowerCase()
    const niche = nicheOfCommunity.get(community)
    const url = String(r.url ?? '')
    const title = String(r.title ?? '')
    const created = String(r.createdAt ?? r.created_at ?? '')
    if (!niche || !url || !title || !created || Number.isNaN(Date.parse(created))) continue
    out.push({ niche_key: niche, community, url, created_at: created, title })
  }
  return out
}

/** Niches with known communities: from the v1 rows' stored thread communities (top 3). */
export function nichesFromRedditRows(rows: ReadonlyArray<Record<string, unknown>>, lastScan: ReadonlyMap<string, string>): NicheScanState[] {
  const out: NicheScanState[] = []
  for (const r of rows) {
    const key = String(r.niche_key ?? '')
    const threads = Array.isArray(r.threads) ? r.threads as Array<{ community?: unknown }> : []
    const counts = new Map<string, number>()
    for (const t of threads) {
      const c = String(t.community ?? '').replace(/^r\//i, '').toLowerCase()
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    const communities = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 3)
    if (key && communities.length >= 2) out.push({ niche_key: key, communities, last_scan_at: lastScan.get(key) ?? null })
  }
  return out
}

