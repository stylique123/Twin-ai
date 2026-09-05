// THE CREATOR'S OWN NUMBERS, READ AT LAST.
//
// ⚠️ `scraped_posts` HAD ONE WRITER AND ZERO READERS. The scan stores every post
// with its play count and nothing has ever looked at them — the exact defect
// this codebase names as its central one, sitting in a table built to end it.
// This is the reader.
//
// ── WHY RELATIVE TO THEIR OWN MEDIAN, AND NOT A THRESHOLD ─────────────────
//
// ⚠️ MEASURED, 2026-09-05, over the 100 stored posts of two real creators:
//
//   handle             median    best        best ÷ median   posts >= 2x
//   lukefitphysio         588    543,300             924x              9
//   ishmaelmechanic    37,000  9,300,000             251x             19
//
// The mechanic's MEDIAN is 63x the physio's. Any absolute threshold calls every
// physio post a failure and every mechanic post a hit, and neither judgement
// tells its creator anything. A 3,000-view post on a 1,500-view account is a
// hit; the same number on the mechanic's account is his worst week in a year.
//
// ⚖️ AND THE MEDIAN, NOT THE MEAN. The physio's mean is dragged upward by a
// single 543,300 parody — his mean is roughly 23x his median. A creator asking
// "is this normal for me" needs the middle of their distribution, not a number
// one outlier can move.

/** A post as this module needs it. `plays` null means NOT READ. */
export interface OwnPost {
  plays?: number | null
  url?: string | null
  caption?: string | null
}

export type PerformanceBand = 'breakout' | 'strong' | 'typical' | 'quiet'

/** Median plays across the posts that CARRY a count.
 *
 *  ⚠️ UNREAD POSTS ARE EXCLUDED, NOT ZEROED. A platform that withheld a count
 *  must not drag a creator's median toward zero and relabel their whole
 *  catalogue as quiet. Returns null when nothing was readable — never 0, which
 *  would make every post look like a breakout by division. */
export function medianPlays(posts: readonly OwnPost[]): number | null {
  const read = posts
    .map((p) => p.plays)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b)
  if (read.length === 0) return null
  const mid = Math.floor(read.length / 2)
  return read.length % 2 === 1 ? read[mid] : (read[mid - 1] + read[mid]) / 2
}

/**
 * How a post did BY THIS CREATOR'S STANDARDS.
 *
 * ⚠️ null WHEN THE COUNT WAS NOT READ, and null when there is no median to
 * compare against. A band is a claim about performance, and we have not measured
 * one for a post whose number never arrived.
 */
export function bandFor(plays: number | null | undefined, median: number | null): PerformanceBand | null {
  if (typeof plays !== 'number' || !Number.isFinite(plays) || plays < 0) return null
  if (median === null || median <= 0) return null
  const ratio = plays / median
  // ⚖️ 5x AND 2x ARE DELIBERATELY WIDE. The physio's best is 924x his median and
  // his 9th-best is barely 2x; a narrow band would call half his catalogue
  // remarkable and tell him nothing. Wide bands mean "breakout" stays rare
  // enough to be worth reading.
  if (ratio >= 5) return 'breakout'
  if (ratio >= 2) return 'strong'
  if (ratio >= 0.5) return 'typical'
  return 'quiet'
}

export interface WhatWorks {
  /** null when nothing was readable. */
  median: number | null
  /** Posts carrying a count. */
  counted: number
  /** Posts considered. `counted < total` means this is a sample. */
  total: number
  /** Their own outliers, best first — at least 5x their median. */
  breakouts: OwnPost[]
  /** How the catalogue distributes across bands. */
  bands: Record<PerformanceBand, number>
  /** ⚠️ POSTS WHOSE COUNT NEVER ARRIVED. Reported, never folded into `quiet`. */
  unmeasured: number
}

/**
 * What actually works for this creator, in their own terms.
 *
 * ⚠️ IT REPORTS ITS OWN COVERAGE. An answer drawn from 3 of 60 posts and one
 * drawn from 60 of 60 are different claims, and a caller that cannot tell them
 * apart will present a guess as a finding.
 */
export function whatWorks(posts: readonly OwnPost[]): WhatWorks {
  const median = medianPlays(posts)
  const bands: Record<PerformanceBand, number> = { breakout: 0, strong: 0, typical: 0, quiet: 0 }
  let counted = 0
  let unmeasured = 0
  const breakouts: OwnPost[] = []
  for (const p of posts) {
    const band = bandFor(p.plays, median)
    if (band === null) { unmeasured++; continue }
    counted++
    bands[band]++
    if (band === 'breakout') breakouts.push(p)
  }
  breakouts.sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0))
  return { median, counted, total: posts.length, breakouts, bands, unmeasured }
}
