// WHAT A PASTED REFERENCE IS WORTH, RECORDED AT THE MOMENT IT IS PASTED.
//
// ⚠️⚠️ LAYER D FORGOT EVERY REFERENCE THE MOMENT IT WAS USED. Measured in
// production 2026-09-12: 422 rows in `transcripts`, 125 of them references, and
// NOT ONE carries a view count, an audience size, or anything else about how the
// video actually did. The transcript, the duration and the derived structure are
// all kept; the only fact that says whether the video was any GOOD is thrown
// away at ingest.
//
// ⚖️ AND THIS IS THE SAMPLE NO SCRAPER CAN PRODUCE. Creators paste the videos
// they wish they had made — a taste-filtered set, handed over for free. Storing
// what those videos did is the cheapest measurement available to us.
//
// ⚠️ THE UNIT IS THE MULTIPLE, NOT THE COUNT. 50,000 views from a 2,000-follower
// account is a far stronger signal than 500,000 from a five-million one, and a
// ranking on absolute views orders references by the size of somebody else's
// audience. `relativePerformance` — already built, already tested, and until now
// never computed anywhere — is the reader that turns one into the other.
//
// ⚠️ EVERY FIELD IS THREE-STATE. `null` means NOT READ. The corpus already cost
// us this lesson twice: 945 gallery rows carry reach "0" from a scrape that
// captured nothing, and rounding those to zero views would have made ordinary
// videos look like breakout hits. A reference whose uploader yt-dlp would not
// name is not a reference with no uploader.
import { relativePerformance, type RelativeRead } from './relativePerformance'

/** The raw facts a reader can obtain about one pasted video. */
export interface ReferenceFactsInput {
  /** Views on THIS video. */
  views?: unknown
  /** The uploader's follower count, when the source states one. */
  creatorAudience?: unknown
  /** Who the siblings below belong to — so a lift can never be read as
   *  belonging to the wrong account. */
  creatorHandle?: unknown
  /** View counts of OTHER videos by the same uploader, in any order. */
  siblingReaches?: readonly unknown[]
}

/**
 * What gets stored on the transcript row.
 *
 * ⚖️ THE LIFT TRAVELS WITH ITS BASIS, ALWAYS. "3.4× their normal" and "3.4×
 * their normal, across 5 videos" are different claims, and only the second can
 * be argued with. A consumer that receives the number without the count has no
 * way to tell a habit from an accident.
 */
export interface ReferenceMetrics {
  views: number | null
  creatorAudience: number | null
  creatorHandle: string | null
  /** Multiple of the uploader's own median. null when it could not be computed. */
  relativeLift: number | null
  /** How many of the uploader's videos that median rests on. */
  relativeBasis: number | null
}

export const EMPTY_REFERENCE_METRICS: ReferenceMetrics = Object.freeze({
  views: null, creatorAudience: null, creatorHandle: null,
  relativeLift: null, relativeBasis: null,
})

/**
 * ⚠️ ZERO IS UNKNOWN HERE TOO, AND FOR THE SAME REASON AS IN THE CORPUS. yt-dlp
 * omits `view_count` and `channel_follower_count` on plenty of accounts, and
 * some sources answer 0 rather than omitting the key. A stored 0 would say "this
 * video was watched by nobody", which is a measurement nobody made.
 */
function positiveInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

function handle(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/^@+/, '')
  return t === '' ? null : t
}

/**
 * Read whatever the source gave us into the row shape.
 *
 * ⚠️ A MISSING SIBLING SET IS NOT A FAILURE. The video's own views and the
 * uploader's audience are worth storing on their own — they are what a later
 * normalisation has to work from — so the lift being incomputable must not
 * discard them. `relativePerformance` already refuses below
 * `MIN_VIDEOS_FOR_BASELINE`; this adds no second opinion about when a median is
 * safe, because two floors that disagree is how one of them gets ignored.
 *
 * ⚠️ AND A LIFT WITHOUT A NAMED UPLOADER IS REFUSED. The siblings are only the
 * right siblings if we know whose they are; computing a median against videos we
 * cannot attribute would produce a confident multiple of the wrong creator's
 * normal — the single worst outcome available here, because it looks correct.
 */
export function referenceMetricsFrom(input: ReferenceFactsInput): ReferenceMetrics {
  const views = positiveInt(input.views)
  const who = handle(input.creatorHandle)
  const siblings = Array.isArray(input.siblingReaches) ? input.siblingReaches : []
  const rel: RelativeRead | null =
    who === null ? null : relativePerformance(views, siblings)
  return {
    views,
    creatorAudience: positiveInt(input.creatorAudience),
    creatorHandle: who,
    relativeLift: rel?.lift ?? null,
    relativeBasis: rel?.basedOn ?? null,
  }
}

/**
 * The inverse: read a stored row back, tolerating every shape a nullable column
 * and an older writer can produce.
 *
 * ⚖️ A HALF-WRITTEN LIFT IS NO LIFT. If a row carries a multiple but not the
 * count it rests on — a row written before the basis column existed, or by a
 * writer that forgot it — the claim is dropped rather than shown unqualified.
 */
export function readReferenceMetrics(row: unknown): ReferenceMetrics {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    return EMPTY_REFERENCE_METRICS
  }
  const r = row as Record<string, unknown>
  const lift = positiveNumber(r.relative_lift ?? r.relativeLift)
  const basis = positiveInt(r.relative_basis ?? r.relativeBasis)
  const paired = lift !== null && basis !== null
  return {
    views: positiveInt(r.views),
    creatorAudience: positiveInt(r.creator_audience ?? r.creatorAudience),
    creatorHandle: handle(r.creator_handle ?? r.creatorHandle),
    relativeLift: paired ? lift : null,
    relativeBasis: paired ? basis : null,
  }
}

/** Like `positiveInt` but keeps the fraction — a lift of 3.4 is not a 3. */
function positiveNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * ⚠️⚠️ THE POINT OF THE WHOLE FILE: TWO REFERENCES RANK BY THEIR MULTIPLE, NOT
 * BY THEIR VIEW COUNT. A 50k video from a small account outranks a 500k video
 * from a huge one, which is the opposite of what absolute views say.
 *
 * ⚖️ AN UNMEASURED REFERENCE SORTS LAST, AND NEVER FIRST. Defaulting it to 1.0
 * ("average") would let every reference nobody could measure outrank genuinely
 * below-average ones that were measured. Ties fall back to views only as a
 * tie-break between two equally unmeasured rows, never as a substitute.
 */
export function byRelativeStrength(a: ReferenceMetrics, b: ReferenceMetrics): number {
  const la = a.relativeLift, lb = b.relativeLift
  if (la !== null && lb !== null && la !== lb) return lb - la
  if (la !== null && lb === null) return -1
  if (la === null && lb !== null) return 1
  return (b.views ?? 0) - (a.views ?? 0)
}
