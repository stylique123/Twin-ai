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

// ── WHETHER THERE IS ANYTHING HONEST TO SAY ───────────────────────────────
//
// ⚖️ THE RULE DECIDES, NOT THE CARD. `messageForOwnAccount` established this
// shape: a screen asks the shared rule whether to speak, so every judgement
// about what counts as enough lives in one tested place rather than in a
// component's early return.

export type WhatWorksMessage =
  /** Say nothing. Not enough measured posts, or no outlier worth naming. */
  | { kind: 'silent' }
  /** Their own outliers, with the median that makes them outliers. */
  | { kind: 'breakouts'; median: number; best: OwnPost; alsoRan: number; counted: number }

/** Below this a "what works for you" claim is a guess dressed as a finding.
 *
 *  ⚠️ TEN, AND IT IS A FLOOR ON MEASURED POSTS, NOT ON POSTS. A catalogue of
 *  forty where the platform withheld thirty-five counts has five data points,
 *  and a median drawn from five is not a creator's normal. */
export const MIN_MEASURED_FOR_A_CLAIM = 10

/**
 * What, if anything, to tell this creator about their own numbers.
 *
 * ⚠️ SILENCE IS THE DEFAULT AND IT IS NOT A FAILURE STATE. A creator whose
 * catalogue has no breakout has a consistent account, which is a fine thing to
 * have and a terrible thing to be told about in a card headed "what works".
 * Manufacturing a "top post" out of a flat distribution would teach them to
 * chase noise.
 */
export function messageForWhatWorks(w: WhatWorks): WhatWorksMessage {
  if (w.median === null) return { kind: 'silent' }
  if (w.counted < MIN_MEASURED_FOR_A_CLAIM) return { kind: 'silent' }
  const best = w.breakouts[0]
  if (!best) return { kind: 'silent' }
  return {
    kind: 'breakouts',
    median: w.median,
    best,
    // ⚖️ HOW MANY OTHERS CLEARED THE SAME BAR. One outlier is an accident; four
    // is a pattern, and the creator can tell the difference if we show it.
    alsoRan: Math.max(0, w.breakouts.length - 1),
    counted: w.counted,
  }
}

/** How many times better than their own normal, rounded for a human.
 *
 *  ⚠️ NOT A PERCENTAGE. "924x your normal" is legible; "92,300% above median"
 *  is a number a person has to decode before they can feel it. */
export function timesTheirNormal(plays: number, median: number): number {
  if (!Number.isFinite(plays) || !Number.isFinite(median) || median <= 0) return 0
  return Math.round(plays / median)
}
