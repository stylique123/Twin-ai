// A VIEW COUNT WE DID NOT GET IS NOT A VIDEO NOBODY WATCHED.
//
// ⚠️ EVERY SCRAPER COERCED IT TO ZERO. `media.ts` had a local
// `num = v => Number.isFinite(v) ? v : 0` and used it for `plays` and `likes` in
// all four extractors. yt-dlp and Apify both omit these fields on some accounts
// and some posts, so a post whose count simply did not come back was stored as 0
// — and 0 is a real, meaningful value here. The two became one number.
//
// ⚖️ THE FILE ALREADY KNEW. Twenty lines under the type it says, about the
// FOLLOWER count: "`null` MEANS NOT READ, AND IS NOT ZERO ... rounding that
// absence to 0 is the same three-state defect this repo keeps finding". The
// reader for it, `nullableInt`, was already sitting in the same file. It was
// simply never applied to the per-post numbers.
//
// ── WHAT IT COST, AT THE PLACES THAT READ IT ──────────────────────────────
//
// `(b.plays || b.likes) - (a.plays || a.likes)` sorts an unread post BELOW a
// post with one view. The scan's "top posts" — which pick the videos we pay to
// transcribe, and which the voice synthesis reads for hook patterns — therefore
// dropped unread posts to the bottom as if they had flopped. A creator whose
// platform withheld counts got their whole catalogue ranked upside down and
// nothing said so.
//
// ⚖️ AND THE AVERAGE WAS WORSE, BECAUSE IT WAS SILENT AND WRONG IN ONE
// DIRECTION. `avg_views` summed `plays || 0` over readable posts and divided by
// ALL posts, so every unread post pulled the reported average down. The fix is
// not to widen the sum — it is to divide by what was actually counted, and to
// say when nothing was.

/** A number we read, or `null` because nobody gave us one. */
export type Reach = number | null

/**
 * How well a post did, for RANKING.
 *
 * ⚠️ RETURNS null WHEN NEITHER NUMBER WAS READ, and callers must sort those
 * separately rather than letting them fall to the bottom. Falling back from
 * plays to likes is the existing behaviour and is kept: they are different
 * quantities, but for "which of these posts did best" a like count is the better
 * of the two available answers when plays is missing.
 *
 * ⚠️ ZERO IS A REAL ANSWER AND IS NOT SKIPPED. A post with 0 plays and 42 likes
 * reaches on 0 — `?? ` and not `||`, because `||` would silently promote the
 * likes and report a reach the post does not have.
 */
export function reachOf(p: { plays?: Reach; likes?: Reach }): Reach {
  const plays = typeof p.plays === 'number' && Number.isFinite(p.plays) ? p.plays : null
  if (plays !== null) return plays
  const likes = typeof p.likes === 'number' && Number.isFinite(p.likes) ? p.likes : null
  return likes
}

/**
 * Sort comparator: best first, and UNREAD POSTS LAST WITHOUT CLAIMING THEY
 * FLOPPED.
 *
 * ⚖️ THE ORDERING IS THE SAME; THE MEANING IS NOT. An unread post still sorts to
 * the end, because a ranking has to put it somewhere and we cannot claim it did
 * well either. What changes is that `reachOf` now returns null for it, so a
 * caller that wants to EXCLUDE the unmeasured — the average below does — can,
 * and a caller that only needs an order still gets one.
 */
export function byReachDesc(a: { plays?: Reach; likes?: Reach }, b: { plays?: Reach; likes?: Reach }): number {
  const ra = reachOf(a)
  const rb = reachOf(b)
  if (ra === null && rb === null) return 0
  if (ra === null) return 1
  if (rb === null) return -1
  return rb - ra
}

/** What an average view count is computed over, and how much of the catalogue
 *  it actually saw. */
export interface AverageReach {
  /** null when NOTHING was readable — never 0, which would report a creator
   *  whose platform withheld every count as having no audience. */
  average: number | null
  /** Posts that carried a number. */
  counted: number
  /** Posts considered. `counted < total` means the average is a sample. */
  total: number
}

/**
 * Mean plays across the posts that HAVE a play count.
 *
 * ⚠️ DIVIDES BY WHAT WAS COUNTED, NOT BY EVERYTHING. The previous line summed
 * readable posts and divided by all of them, so one unread post in five knocked
 * 20% off a creator's reported average and nothing recorded that it had.
 *
 * ⚠️ AND IT REPORTS ITS OWN COVERAGE. An average over 3 of 60 posts and an
 * average over 60 of 60 are not the same claim; returning the counts makes a
 * caller able to tell, which is the whole difference between a measurement and
 * a number.
 *
 * ⚖️ LIKES ARE NOT SUBSTITUTED HERE, unlike `reachOf`. This one is labelled
 * "average views" and a likes-derived figure under that name would be a
 * different quantity wearing the same word — the exact collapse `p.plays ||
 * p.likes` already makes when it formats "views/likes" into a prompt.
 */
export function averagePlays(posts: readonly { plays?: Reach }[]): AverageReach {
  let sum = 0
  let counted = 0
  for (const p of posts) {
    if (typeof p.plays === 'number' && Number.isFinite(p.plays)) { sum += p.plays; counted++ }
  }
  return {
    average: counted === 0 ? null : Math.round(sum / counted),
    counted,
    total: posts.length,
  }
}
