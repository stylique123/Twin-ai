// A VIEW COUNT IS NOT A SIGNAL. A MULTIPLE OF THAT CREATOR'S OWN MEDIAN IS.
//
// ⚠️⚠️ 50,000 VIEWS FROM A 2,000-FOLLOWER ACCOUNT IS A FAR STRONGER SIGNAL THAN
// 500,000 FROM A 5-MILLION ONE. Absolute reach ranks by audience size, so a
// corpus sorted on it surfaces the biggest accounts and teaches a creator with
// 1,500 followers nothing about her own next video.
//
// ⚖️ AND THE CORPUS CAN ANSWER THIS TODAY. Measured 2026-09-09: `reach` is
// populated on ALL 16,044 gallery_items across 3,877 creators, and it is
// genuinely PER-VIDEO — Linus Tech Tips carries 34 distinct values across 154
// cards, @topcomedey 95 across 115. This was checked before anything was built,
// because if `reach` had been a per-creator follower count every video of a
// creator would share one value and a median would be meaningless.
//
// ── THREE THINGS THE REAL DATA DICTATED ─────────────────────────────────────
//
// ⚠️⚠️ "0" IS UNKNOWN, NOT ZERO VIEWS. 945 rows carry reach "0", and 940 of them
// belong to the creator literally named "@" — a scrape that captured nothing.
// Treating those as zero-view videos would drag every median they touch toward
// zero and make ordinary videos look like breakout hits. Absent is not zero.
//
// ⚠️ `likes` IS "0" ON EVERY ROW SAMPLED and is not used here at all. A field
// that is uniformly zero is not a weak signal, it is an absent one.
//
// ⚠️ THE VALUES ARE ABBREVIATED STRINGS — "1.2M", "965.6K", "77.8M". They sort
// alphabetically, so "11.3M" < "9.8M" in SQL. Any ranking done on the raw column
// is silently wrong.

/**
 * Parse a scraped reach string into a number.
 *
 * ⚠️ RETURNS null FOR "0" AND FOR ANYTHING UNPARSEABLE. Every caller must handle
 * null as "we do not know", never as a quantity.
 */
export function parseReach(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null
  if (typeof raw !== 'string') return null
  const t = raw.trim().replace(/,/g, '')
  if (t === '') return null
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i)
  if (m === null) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase()] ?? 1
  const value = n * mult
  // ⚠️ ZERO IS THE UNKNOWN MARKER IN THIS CORPUS, not a measurement.
  return value > 0 ? value : null
}

/**
 * ⚠️ THE MEDIAN, NEVER THE MEAN. One 18-million-view outlier moves a mean
 * enormously and a median barely at all — and the whole point of a baseline is
 * that it describes the creator's ordinary video, not their best one.
 */
export function medianOf(values: readonly number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (xs.length === 0) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
}

/**
 * ⚠️⚠️ A BASELINE NEEDS ENOUGH VIDEOS TO BE A BASELINE. With three videos, the
 * median IS one of them, and every card is then measured against a number it
 * helped set. Five is the floor at which a median starts describing a habit
 * rather than an accident.
 *
 * ⚖️ THIS IS DELIBERATELY LOWER THAN `MIN_COHORT` (20) AND MEASURES SOMETHING
 * ELSE. This floor asks "does this creator have a stable normal?"; the cohort
 * floor asks "have enough different creators done this for it to be a pattern?".
 * Conflating them would either throw away most of the corpus or recommend from
 * a handful of videos.
 */
export const MIN_VIDEOS_FOR_BASELINE = 5

export interface RelativeRead {
  /** Multiple of that creator's own median. 4.2 means 4.2× their normal. */
  lift: number
  /** How many of that creator's videos the median rests on. */
  basedOn: number
}

/**
 * How this video did against its OWN creator's normal.
 *
 * ⚠️ RETURNS null RATHER THAN 1.0 WHEN IT CANNOT TELL. A default of "average"
 * would flood every ranking with cards that were never measured, and they would
 * outrank genuinely below-average videos that were.
 */
export function relativePerformance(
  cardReach: unknown,
  creatorReaches: readonly unknown[],
): RelativeRead | null {
  const value = parseReach(cardReach)
  if (value === null) return null
  const known = creatorReaches.map(parseReach).filter((v): v is number => v !== null)
  if (known.length < MIN_VIDEOS_FOR_BASELINE) return null
  const median = medianOf(known)
  if (median === null || median <= 0) return null
  return { lift: value / median, basedOn: known.length }
}

/**
 * ⚠️⚠️ ONE VIDEO MUST NOT CARRY A SHAPE. The physio's LEGO parody did 543,300
 * against a ~5,000 median — a 108× lift that teaches nothing about his clinical
 * content, and would dominate any ranking it entered.
 *
 * ⚖️ CAPPED, NOT DISCARDED. Throwing the row away loses the fact that the shape
 * worked at all; capping keeps it as one strong vote instead of a hundred. The
 * cap is stated here rather than chosen per call site, so no ranking can quietly
 * opt out of it.
 */
export const MAX_SINGLE_CARD_LIFT = 10

export function cappedLift(lift: number): number {
  if (!Number.isFinite(lift) || lift <= 0) return 0
  return Math.min(lift, MAX_SINGLE_CARD_LIFT)
}

/**
 * The median lift of a set of cards — the unit a shape is ranked by.
 *
 * ⚖️ MEDIAN OF CAPPED LIFTS, which is two defences against the same failure. The
 * cap stops one card carrying the shape; the median stops a handful of capped
 * cards doing it between them.
 */
export function medianLift(lifts: readonly number[]): number | null {
  return medianOf(lifts.map(cappedLift))
}
