// CREATOR READ CACHE (plan v6.4 §30). A creator's own profile read is never
// capped for money, so it is made cheap instead:
//   * a channel read in the last 30 days (posts already in `scraped_posts`)
//     asks Apify only for the newest few (INCREMENTAL_LIMIT) — what is new;
//   * the fresh posts are merged with the cached ones, deduped by video id, so
//     a video read twice is kept once and never counted twice.
// Pure functions; the job does the I/O. No creator material is logged here.

export const CREATOR_CACHE_DAYS = 30
export const INCREMENTAL_LIMIT = 10
/** Fewer cached posts than this and the cache is not worth trusting. */
export const MIN_CACHED_POSTS = 5
const DAY = 86_400_000

export interface CachedPostRow {
  url: string; caption: string; hashtags: string[] | null; cover_url: string | null
  plays: number | null; likes: number | null; observed_at: string
}

export type CreatorReadPlan = { mode: 'full' | 'incremental'; limit: number; cached: number }

/** How much to ask Apify for, given what this channel's cache holds. */
export function planCreatorRead(cached: Pick<CachedPostRow, 'observed_at'>[], fullLimit: number, now = Date.now()): CreatorReadPlan {
  const fresh = cached.filter((r) => Date.parse(r.observed_at) > now - CREATOR_CACHE_DAYS * DAY)
  if (fresh.length >= MIN_CACHED_POSTS) {
    return { mode: 'incremental', limit: Math.min(INCREMENTAL_LIMIT, fullLimit), cached: fresh.length }
  }
  return { mode: 'full', limit: fullLimit, cached: fresh.length }
}

/** A stable id for a video URL on YouTube / TikTok / Instagram; else the URL. */
export function videoIdOf(url: string): string {
  const u = String(url ?? '').trim()
  const m =
    u.match(/youtube\.com\/shorts\/([\w-]{6,})/i) ??
    u.match(/[?&]v=([\w-]{6,})/i) ??
    u.match(/youtu\.be\/([\w-]{6,})/i) ??
    u.match(/tiktok\.com\/.*\/video\/(\d+)/i) ??
    u.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i)
  return m ? m[1] : u.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '')
}

/** Fresh posts first (they carry today's counts), then cached ones not seen
 *  again; one entry per video id. */
export function mergeByVideoId<T extends { url: string }>(fresh: readonly T[], cached: readonly T[]): { posts: T[]; newCount: number } {
  const seen = new Set<string>()
  const posts: T[] = []
  for (const p of fresh) { const id = videoIdOf(p.url); if (!id || seen.has(id)) continue; seen.add(id); posts.push(p) }
  const cachedIds = new Set(cached.map((c) => videoIdOf(c.url)))
  const newCount = posts.filter((p) => !cachedIds.has(videoIdOf(p.url))).length
  for (const p of cached) { const id = videoIdOf(p.url); if (!id || seen.has(id)) continue; seen.add(id); posts.push(p) }
  return { posts, newCount }
}
