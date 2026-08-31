/**
 * WHICH OF THIS CREATOR'S FORMATS ACTUALLY GOT WATCHED.
 *
 * ⚠️ THE PRODUCT'S OWN GOAL WAS THE ONE THING IT NEVER MEASURED. Twin records
 * an outcome (`recordPostStats` writes `posts.views`, and `OutcomeHistory`
 * renders the series) and it knows which generation produced each post
 * (`posts.generation_id`, since 0007). Both halves have existed for months.
 * NOTHING EVER JOINED THEM, so a creator could see that one video got 40k and
 * still not know whether their listicles beat their storytimes.
 *
 * ⚖️ SO THIS IS A READ, NOT A PIPELINE. No new capture, no migration, no worker.
 * Everything below is computed from rows the product already stores, which is
 * why the expensive-sounding "outcome loop" is a pure function.
 *
 * ── WHAT MAKES A NUMBER HERE TRUE RATHER THAN FLATTERING ──────────────────
 *
 * ⚠️ THE MEDIAN, NEVER THE MEAN. One video that broke out would drag a format's
 * mean above every other format on a single lucky post, and the creator would
 * be told to make more of something that worked once. The median asks the
 * question a creator actually has — "if I make another one of these, what
 * usually happens?" — and one outlier cannot move it.
 *
 * ⚠️ A FORMAT WITH TOO FEW POSTS IS NOT REPORTED AT ALL, and that is the whole
 * discipline this repo already applies to `mayGenerateClaims` at
 * CLAIM_STOP_MIN_POPULATION. Two posts are not a rate. Ranking them anyway
 * produces a confident sentence built on noise, which is worse than silence
 * because the creator will act on it.
 *
 * ⚠️ AND A COMPARISON NEEDS TWO COMPARABLE THINGS. A single reportable format
 * is not a finding — "your best format is your only format" is a tautology
 * wearing an insight's clothes. `verdict` says which of these is true, so a
 * surface can explain the silence rather than rendering an empty panel.
 *
 * ⚖️ ONLY POSTS WITH A VIEW COUNT COUNT. A post with `views: null` is one
 * nobody has reported on, not one that got zero — the distinction this repo
 * states everywhere as "absent is not zero". Treating null as 0 would punish
 * every format whose posts the creator simply has not filled in yet.
 */

/** The rows this reads. Deliberately structural rather than importing `Post`
 *  and `Generation`: it needs four fields, and a narrow input is a function
 *  that can be tested without constructing two large records. */
export interface OutcomePost {
  id: string
  generation_id: string | null
  views: number | null
}
export interface OutcomeGeneration {
  id: string
  blueprint?: { reference_read?: { format_label?: unknown } } | null
}

export interface FormatOutcome {
  format: string
  /** Posts of this format that carry a view count. Never the total posted. */
  posts: number
  medianViews: number
}

export type FormatOutcomeVerdict =
  /** Nothing to say yet, and which fact makes it so. */
  | { kind: 'no_posts_with_views' }
  | { kind: 'no_format_reaches_minimum'; best: number; needed: number }
  | { kind: 'only_one_format_reportable'; format: string }
  | { kind: 'ranked'; formats: FormatOutcome[] }

/** ⚠️ FIVE, AND IT IS A FLOOR RATHER THAN A TARGET. Below five posts a median
 *  is one or two videos wearing a statistic's clothes, and the creator would
 *  reshape a month of work around it. It is lower than
 *  `CLAIM_STOP_MIN_POPULATION`'s 25 on purpose: that gate protects a CLAIM MADE
 *  TO AN AUDIENCE, and this one only orders a creator's own history for their
 *  own eyes — a weaker promise that can carry a weaker bar. */
export const MIN_POSTS_PER_FORMAT = 5

function median(sorted: readonly number[]): number {
  const n = sorted.length
  const mid = n >> 1
  return n % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * Rank this creator's formats by how the middle video of each actually did.
 *
 * Returns a VERDICT rather than a possibly-empty list, so a caller can say why
 * there is nothing to show. An empty array and "not enough data yet" are
 * different facts and only one of them means the creator has learned something.
 */
export function rankFormatsByOutcome(
  posts: readonly OutcomePost[] | null | undefined,
  generations: readonly OutcomeGeneration[] | null | undefined,
  minPosts: number = MIN_POSTS_PER_FORMAT,
): FormatOutcomeVerdict {
  const formatOf = new Map<string, string>()
  for (const g of generations ?? []) {
    const label = g?.blueprint?.reference_read?.format_label
    if (typeof label === 'string' && label.trim() !== '') formatOf.set(g.id, label.trim())
  }

  const byFormat = new Map<string, number[]>()
  let withViews = 0
  for (const p of posts ?? []) {
    // ⚠️ THE NULL CHECK PRECEDES THE COERCION. `Number(null)` is 0, and a post
    // nobody has reported on would otherwise enter the median as a zero-view
    // video and drag its whole format down.
    if (typeof p?.views !== 'number' || !Number.isFinite(p.views)) continue
    if (p.views < 0) continue
    withViews += 1
    const gid = p.generation_id
    if (gid === null || gid === undefined) continue
    const fmt = formatOf.get(gid)
    if (fmt === undefined) continue
    const bucket = byFormat.get(fmt)
    if (bucket) bucket.push(p.views)
    else byFormat.set(fmt, [p.views])
  }

  if (withViews === 0) return { kind: 'no_posts_with_views' }

  const reportable: FormatOutcome[] = []
  let best = 0
  for (const [format, views] of byFormat) {
    if (views.length > best) best = views.length
    if (views.length < minPosts) continue
    const sorted = [...views].sort((a, b) => a - b)
    reportable.push({ format, posts: views.length, medianViews: median(sorted) })
  }

  if (reportable.length === 0) return { kind: 'no_format_reaches_minimum', best, needed: minPosts }

  // ⚖️ TIES BROKEN BY NAME, so the same history always produces the same order.
  // A ranking that reshuffles between two identical reads reads as new
  // information and is not.
  reportable.sort((a, b) => b.medianViews - a.medianViews || a.format.localeCompare(b.format))

  if (reportable.length === 1) return { kind: 'only_one_format_reportable', format: reportable[0].format }
  return { kind: 'ranked', formats: reportable }
}

/**
 * How much better the top format is than the bottom one, as a multiple.
 *
 * ⚠️ RETURNS NULL WHEN THE BOTTOM IS ZERO. "Infinity times better" is not a
 * sentence anyone can act on, and rendering it would be the one number on the
 * panel a creator remembers.
 */
export function outcomeSpread(formats: readonly FormatOutcome[]): number | null {
  if (formats.length < 2) return null
  const top = formats[0].medianViews
  const bottom = formats[formats.length - 1].medianViews
  if (bottom <= 0) return null
  return Math.round((top / bottom) * 10) / 10
}
