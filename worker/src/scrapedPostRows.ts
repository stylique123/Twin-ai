// TURN WHAT THE SCAN FETCHED INTO ROWS WORTH KEEPING.
//
// ⚖️ SEPARATE FROM THE JOB SO IT CAN BE TESTED. Built inline in `scrapeDna` this
// would be four lines nothing could exercise, and the interesting behaviour is
// entirely in the edge cases: a null count that must stay null, a duplicate url
// that must not become two rows, a caption the database will refuse.

import type { ScrapedPost } from './media.js'

export interface ScrapedPostRow {
  owner_id: string
  voice_id: string | null
  platform: string
  handle: string
  url: string
  caption: string
  hashtags: string[]
  cover_url: string | null
  plays: number | null
  likes: number | null
}

/** A count as it should be STORED.
 *
 *  ⚠️ NULL SURVIVES AS NULL. The whole point of the column is that "we were not
 *  told" and "nobody watched" are different, so this must never fall back to 0 —
 *  and it must never drop a genuine 0 either. */
const count = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : null

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Build the rows for one scan.
 *
 * ⚠️ POSTS WITHOUT A URL OR A CAPTION ARE DROPPED, because the table refuses
 * them and a rejected batch would lose the good rows alongside the bad. The
 * extractor already filters empty captions; this is the second line of the same
 * defence, at the layer that knows what the database will accept.
 *
 * ⚠️ AND DUPLICATE URLS ARE COLLAPSED, LAST ONE WINNING. The unique index is on
 * (owner_id, url), so a batch containing the same url twice fails the whole
 * upsert in Postgres — "ON CONFLICT DO UPDATE command cannot affect row a second
 * time". A scrape genuinely can return one video twice (a pinned post also
 * appearing in the feed), so this is a real case and not a theoretical one.
 */
export function scrapedPostRows(input: {
  ownerId: string
  voiceId?: string | null
  platform: string
  handle: string
  posts: readonly ScrapedPost[]
}): ScrapedPostRow[] {
  const owner = text(input.ownerId)
  if (owner === '') return []

  const byUrl = new Map<string, ScrapedPostRow>()
  for (const p of input.posts ?? []) {
    const url = text(p?.url)
    const caption = text(p?.text)
    if (url === '' || caption === '') continue
    byUrl.set(url, {
      owner_id: owner,
      voice_id: text(input.voiceId) === '' ? null : text(input.voiceId),
      platform: text(input.platform),
      handle: text(input.handle),
      url,
      caption,
      hashtags: Array.isArray(p.hashtags) ? p.hashtags.filter((h): h is string => typeof h === 'string') : [],
      cover_url: text(p.cover) === '' ? null : text(p.cover),
      plays: count(p.plays),
      likes: count(p.likes),
    })
  }
  return [...byUrl.values()]
}
