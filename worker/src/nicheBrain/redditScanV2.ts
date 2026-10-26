// REDDIT SCAN v2 — THE PAIN MAP (owner, 23 Oct). OFF unless REDDIT_SCAN_V2 is
// exactly 'true', and it must never be turned on without counsel's written OK
// and the owner's go. Nothing schedules it (the weekly job stays off).
// v6.4: it is a tier-B (batch) job — its Apify run goes through apifyGuard with
// tier 'batch': hard $2 per billing cycle (22nd→22nd UTC), anomaly breaker.
//
// ⚖️ What changes from v1: ONE batched Apify run for every due niche (~25
// results each), only items newer than that niche's last scan, each niche at
// most once per 30 days. What it KEEPS is only the pain map: topic, how many
// threads, from which communities, links and dates. No post text, no
// usernames, no quotes; a title is read transiently to name the topic and then
// dropped. A pattern needs >= 5 threads from >= 2 communities, and expires
// after 90 days.

export const SCAN_V2_PER_NICHE = 25
export const SCAN_V2_TTL_DAYS = 30
export const PAIN_MIN_THREADS = 5
export const PAIN_MIN_COMMUNITIES = 2
export const PAIN_EXPIRY_DAYS = 90
const DAY = 86_400_000

export function redditScanV2Enabled(v: string | undefined = process.env.REDDIT_SCAN_V2): boolean {
  return String(v ?? '').trim().toLowerCase() === 'true'
}

export interface NicheScanState { niche_key: string; communities: string[]; last_scan_at: string | null }

/** Niches due: never scanned, or last scanned 30+ days ago. */
export function dueForScan(niches: NicheScanState[], now = Date.now()): NicheScanState[] {
  return niches.filter((n) => !n.last_scan_at || Date.parse(n.last_scan_at) <= now - SCAN_V2_TTL_DAYS * DAY)
}

/** One actor input covering every due niche. */
export function batchedScanInput(due: NicheScanState[]): Record<string, unknown> | null {
  const urls = due.flatMap((n) => n.communities.slice(0, 3).map((c) => ({ url: `https://www.reddit.com/r/${c}/new/` })))
  if (!urls.length) return null
  return {
    startUrls: urls, maxItems: SCAN_V2_PER_NICHE * due.length, maxPostCount: SCAN_V2_PER_NICHE,
    skipComments: true, maxComments: 0, includeNSFW: false,
  }
}

export interface ScannedThread { niche_key: string; community: string; url: string; created_at: string; title: string }

/** Only threads newer than the niche's last scan. */
export function newerThanLastScan(threads: ScannedThread[], niches: NicheScanState[]): ScannedThread[] {
  const last = new Map(niches.map((n) => [n.niche_key, n.last_scan_at ? Date.parse(n.last_scan_at) : 0]))
  return threads.filter((t) => Date.parse(t.created_at) > (last.get(t.niche_key) ?? 0))
}

export interface PainPattern {
  niche_key: string; topic: string; threads: number; communities: string[]
  links: string[]; first_seen: string; last_seen: string; expires_at: string
}

/** The pain map. `topicOf` names a thread's topic from its title; the title
 *  itself never leaves this function. */
export function buildPainMap(threads: ScannedThread[], topicOf: (title: string) => string | null, now = Date.now()): PainPattern[] {
  const groups = new Map<string, { niche: string; topic: string; urls: Set<string>; comms: Set<string>; dates: number[] }>()
  for (const t of threads) {
    const topic = topicOf(t.title)?.trim().toLowerCase().slice(0, 80)
    if (!topic || !/^https:\/\/(www\.)?reddit\.com\//.test(t.url)) continue
    const k = `${t.niche_key}\u0000${topic}`
    const g = groups.get(k) ?? { niche: t.niche_key, topic, urls: new Set(), comms: new Set(), dates: [] }
    if (!g.urls.has(t.url)) { g.urls.add(t.url); g.comms.add(t.community.toLowerCase()); g.dates.push(Date.parse(t.created_at)) }
    groups.set(k, g)
  }
  return [...groups.values()]
    .filter((g) => g.urls.size >= PAIN_MIN_THREADS && g.comms.size >= PAIN_MIN_COMMUNITIES)
    .map((g) => ({
      niche_key: g.niche, topic: g.topic, threads: g.urls.size, communities: [...g.comms].sort(),
      links: [...g.urls].slice(0, 10),
      first_seen: new Date(Math.min(...g.dates)).toISOString(), last_seen: new Date(Math.max(...g.dates)).toISOString(),
      expires_at: new Date(now + PAIN_EXPIRY_DAYS * DAY).toISOString(),
    }))
}

/** Drops expired patterns. */
export function livePatterns(p: PainPattern[], now = Date.now()): PainPattern[] {
  return p.filter((x) => Date.parse(x.expires_at) > now)
}

export interface ScanV2Deps {
  niches: () => Promise<NicheScanState[]>
  run: (input: Record<string, unknown>) => Promise<ScannedThread[]>
  topicOf: (title: string) => string | null
  save: (patterns: PainPattern[], scanned: string[]) => Promise<void>
}

/** One monthly pass. Returns immediately while the flag is off. */
export async function runRedditScanV2(deps: ScanV2Deps, enabled = redditScanV2Enabled()): Promise<{ ran: boolean; patterns: number }> {
  if (!enabled) return { ran: false, patterns: 0 }
  const niches = await deps.niches()
  const due = dueForScan(niches)
  const input = batchedScanInput(due)
  if (!input) return { ran: false, patterns: 0 }
  const threads = newerThanLastScan(await deps.run(input), due)
  const patterns = buildPainMap(threads, deps.topicOf)
  await deps.save(patterns, due.map((n) => n.niche_key))
  return { ran: true, patterns: patterns.length }
}
