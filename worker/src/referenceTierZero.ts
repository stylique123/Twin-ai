// WHAT A REFERENCE LOOKS LIKE, WITHOUT ASKING A MODEL.
//
// ⚠️ THIS IS A REDUCER, NOT AN ANALYSER. `editor_visual.py` already produces
// `shotBoundaries`, `faces`, `faceCoverage` and `motion` against a digest-pinned
// YuNet model, and it has run in production for the creator's own take since
// Editor v2 Phase 6. Nothing here re-implements any of that. This turns its raw
// output into the few numbers a creator's reference profile actually needs.
//
// ⚖️ WHY IT EXISTS: THE ONLY VISUAL READER WE HAVE IS QUOTA-BOUND. Measured
// 2026-09-01 — of 52 failed `assess_reference` jobs in 24h, 52 were
// RESOURCE_EXHAUSTED on Gemini's daily per-model quota, across BOTH TikTok and
// YouTube, while 239 other jobs on the same platforms finished fine. The
// download works; the reading budget runs out. These numbers come off the file
// and cannot be rate-limited, so a creator still learns something true about
// their reference on the day the quota is gone.

/** One shot boundary as `editor_visual.py` emits it. */
export interface ShotBoundary { timeMs?: unknown }

/** The subset of the bridge's output this reads. Deliberately narrow: a reducer
 *  that accepts the whole document invites new fields to be read without anyone
 *  deciding they should be. */
export interface TierZeroInput {
  shotBoundaries?: unknown
  faceCoverage?: { samplesWithFace?: unknown; samplesTotal?: unknown }
  durationMs?: unknown
  /** Speech-active milliseconds from the VAD pass, when it ran. Separate input
   *  because it comes from a DIFFERENT analyser — a silence is not a cut. */
  speechMs?: unknown
}

/**
 * ⚠️ EVERY FIELD IS NULLABLE AND `null` MEANS "NOT MEASURED", NEVER "ZERO".
 * A reference with no cuts and a reference nobody scanned are opposite facts,
 * and a `0` that means both is how a surface starts claiming a static video
 * where it has no evidence at all.
 */
export interface TierZeroProfile {
  /** How many times the picture cuts. */
  cuts: number | null
  /** Cuts per minute of runtime. Null when duration is unknown — a rate needs
   *  a denominator, and inventing one is the whole class of bug this avoids. */
  cutsPerMinute: number | null
  /** Median seconds between cuts. Median, not mean: one long hold at the end of
   *  an otherwise fast cut-up drags a mean somewhere no shot actually is. */
  medianShotSec: number | null
  /** Percentage of sampled frames with a detectable face, 0–100. */
  faceCoveragePct: number | null
  /** Percentage of runtime with speech, 0–100. */
  speechPct: number | null
}

/** One speech interval as the transcript carries it, in SECONDS. */
export interface SpeechSegment { start?: unknown; end?: unknown }

/**
 * Speech-active milliseconds from a transcript's own segments.
 *
 * ⚠️ OVERLAPPING SEGMENTS MUST BE MERGED, NOT SUMMED. Whisper emits segments
 * that can overlap at their boundaries, and captions frequently do — summing
 * raw durations then reports MORE speech than the video has runtime, which
 * `pct()` would hand back as a percentage above 100. Merging first is the
 * difference between a measurement and a number that merely looks like one.
 *
 * ⚠️ AND A ZERO-LENGTH OR BACKWARDS SEGMENT CONTRIBUTES NOTHING rather than a
 * negative, which would silently reduce the total below the truth.
 *
 * Returns null when there is nothing to measure — never 0, which would claim a
 * silent video.
 */
export function speechActiveMs(segments: unknown): number | null {
  if (!Array.isArray(segments)) return null
  const spans: Array<[number, number]> = []
  for (const seg of segments) {
    const a = num((seg as SpeechSegment)?.start)
    const b = num((seg as SpeechSegment)?.end)
    if (a === null || b === null) continue
    if (b <= a) continue
    spans.push([a * 1000, b * 1000])
  }
  if (spans.length === 0) return null
  spans.sort((x, y) => x[0] - y[0])
  let total = 0
  let [curStart, curEnd] = spans[0]!
  for (let i = 1; i < spans.length; i++) {
    const [s, e] = spans[i]!
    if (s <= curEnd) { if (e > curEnd) curEnd = e; continue }
    total += curEnd - curStart
    curStart = s; curEnd = e
  }
  total += curEnd - curStart
  return Math.round(total)
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** ⚠️ THE NULL CHECK PRECEDES THE COERCION. `Number(undefined)` is NaN and
 *  `Number(null)` is 0 — the second silently turns "we did not measure this"
 *  into "we measured zero", which is the exact lie this module refuses. */
function pct(part: unknown, whole: unknown): number | null {
  const p = num(part); const w = num(whole)
  if (p === null || w === null) return null
  if (w <= 0) return null
  return Math.round((p / w) * 1000) / 10
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/**
 * Reduce one analyser run to the profile.
 *
 * ⚖️ IT DOES NOT CLASSIFY THE FORMAT, AND THAT IS DELIBERATE. The obvious next
 * field is `format: 'talking_head' | 'montage'`, and it would need thresholds —
 * how many cuts per minute is a montage, how much face coverage is a talking
 * head. No such threshold has been measured on this product's references. A
 * constraint that has only ever seen the population it was written for looks
 * like a working constraint, and a label is far easier to believe than the
 * numbers under it. The numbers ship; the label waits for evidence.
 */
export function tierZeroProfile(input: TierZeroInput | null | undefined): TierZeroProfile {
  const empty: TierZeroProfile = {
    cuts: null, cutsPerMinute: null, medianShotSec: null,
    faceCoveragePct: null, speechPct: null,
  }
  if (!input || typeof input !== 'object') return empty

  const bounds = Array.isArray(input.shotBoundaries) ? input.shotBoundaries : null
  const times = bounds === null
    ? null
    : bounds
      .map((b) => num((b as ShotBoundary)?.timeMs))
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b)

  // ⚠️ AN ABSENT ARRAY IS NOT AN EMPTY ONE. `shotBoundaries: []` means the pass
  // ran and found no cuts — a real, useful fact about a static talking head.
  // A missing key means it never ran. They must not both read as `cuts: 0`.
  const cuts = times === null ? null : times.length

  const durationMs = num(input.durationMs)
  const cutsPerMinute = cuts === null || durationMs === null || durationMs <= 0
    ? null
    : Math.round((cuts / (durationMs / 60_000)) * 10) / 10

  // ⚠️ GAPS BETWEEN CUTS, NOT THE CUT TIMES THEMSELVES. With N boundaries there
  // are N-1 interior shots; one boundary gives no gap at all, so the median is
  // null rather than a number derived from a single point.
  let medianShotSec: number | null = null
  if (times !== null && times.length >= 2) {
    const gaps: number[] = []
    for (let i = 1; i < times.length; i++) gaps.push((times[i]! - times[i - 1]!) / 1000)
    const m = median(gaps)
    medianShotSec = m === null ? null : Math.round(m * 10) / 10
  }

  return {
    cuts,
    cutsPerMinute,
    medianShotSec,
    faceCoveragePct: pct(input.faceCoverage?.samplesWithFace, input.faceCoverage?.samplesTotal),
    speechPct: pct(input.speechMs, durationMs),
  }
}

/** Did this produce anything at all? Used to decide whether a Tier 0 profile is
 *  worth storing, so a row of five nulls is never written as if it were a read. */
export function tierZeroHasSignal(p: TierZeroProfile): boolean {
  return (Object.values(p) as Array<number | null>).some((v) => v !== null)
}
