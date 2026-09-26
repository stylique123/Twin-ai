// VIEWS BACK FROM THE PLATFORMS — the pure part (matching and windows).
//
// ⚖️ WHY: the learning loop credits brain notes with `generation_outcomes`
// views, and test viewers can only be checked against reality once real views
// exist. The social function already publishes; this reads the numbers back.

export interface PostStats { views: number | null; likes: number | null; comments: number | null }

/** YouTube video id from a watch / shorts / youtu.be url. */
export function youtubeId(url: string | null | undefined): string | null {
  const m = String(url ?? '').match(/(?:v=|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
  return m ? m[1] : null
}

/** Same Instagram post, whatever the trailing slash or query. */
export function samePermalink(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (u: string | null | undefined) => String(u ?? '').split('?')[0].replace(/\/+$/, '').toLowerCase()
  return n(a) !== '' && n(a) === n(b)
}

/**
 * TikTok returns no post url when Twin publishes, so the video is matched by
 * time: the one created closest AFTER Twin posted it, within 3 hours. Anything
 * further is not trusted to be ours.
 */
export function matchTikTokByTime<T extends { create_time?: number }>(
  videos: readonly T[], postedAtIso: string | null | undefined, windowSec = 3 * 3600,
): T | null {
  const posted = Date.parse(String(postedAtIso ?? '')) / 1000
  if (!Number.isFinite(posted)) return null
  let best: T | null = null
  let bestGap = Infinity
  for (const v of videos) {
    const t = Number(v.create_time)
    if (!Number.isFinite(t)) continue
    const gap = t - posted
    if (gap < -300 || gap > windowSec) continue // 5 min clock slack before
    if (Math.abs(gap) < bestGap) { best = v; bestGap = Math.abs(gap) }
  }
  return best
}

/** Which outcome columns a reading fills, by the post's age. */
export function outcomeWindow(postedAtIso: string, nowMs = Date.now()): { views_24h: boolean; views_7d: boolean } {
  const ageH = (nowMs - Date.parse(postedAtIso)) / 3_600_000
  return { views_24h: ageH >= 24, views_7d: ageH >= 24 * 7 }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
export function statsFrom(v: Record<string, unknown> | null | undefined, keys: { views: string; likes: string; comments: string }): PostStats | null {
  if (!v) return null
  const s = { views: num(v[keys.views]), likes: num(v[keys.likes]), comments: num(v[keys.comments]) }
  return s.views === null && s.likes === null && s.comments === null ? null : s
}
