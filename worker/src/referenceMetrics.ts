// WHAT A PASTED REFERENCE WAS WORTH — THE WORKER'S HALF.
//
// ⚠️ MIRRORS @twinai/shared's `referenceMetricsFrom` BY BEHAVIOUR, NOT BY
// IMPORT. The worker has no runtime dependency on @twinai/shared and this file
// does not introduce one — the same reason `earlyLookRules.ts` and
// `visualExtractionRules.ts` exist as mirrors. `referenceMetricsParity.test.ts`
// in packages/shared EXECUTES BOTH over the same case table, so a rule that
// drifts by one character fails there rather than in production.
//
// ⚠️ EVERY VALUE IS THREE-STATE AND ZERO IS "UNREAD". yt-dlp omits `view_count`
// on some extractors and answers 0 on others; 945 rows of the scraped corpus
// carry reach "0" from a scrape that captured nothing. A stored 0 would say the
// video was watched by nobody, which is a measurement nobody made — and 0201
// refuses it at the database as well.

export interface WorkerReferenceMetrics {
  views: number | null
  creatorAudience: number | null
  creatorHandle: string | null
  relativeLift: number | null
  relativeBasis: number | null
}

export const EMPTY_WORKER_REFERENCE_METRICS: WorkerReferenceMetrics = Object.freeze({
  views: null, creatorAudience: null, creatorHandle: null,
  relativeLift: null, relativeBasis: null,
})

/** Mirrors MIN_VIDEOS_FOR_BASELINE. With three videos the median IS one of them
 *  and every card is measured against a number it helped set. */
export const MIN_VIDEOS_FOR_BASELINE = 5

function positiveInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

function positiveNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function handleOf(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/^@+/, '')
  return t === '' ? null : t
}

/** Mirrors `parseReach`: abbreviated strings are real in this corpus ("1.2M"),
 *  and they sort alphabetically, so anything read raw is silently wrong. */
function parseReach(raw: unknown): number | null {
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
  return value > 0 ? value : null
}

/** The MEDIAN, never the mean: one 18-million-view outlier moves a mean
 *  enormously and a median barely at all. */
function medianOf(values: readonly number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (xs.length === 0) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 === 1 ? (xs[mid] as number) : (((xs[mid - 1] as number) + (xs[mid] as number)) / 2)
}

/**
 * ⚠️ A LIFT MUST BELONG TO A NAMED UPLOADER. The median is only the right median
 * if we know whose videos it came from; a multiple computed against videos we
 * cannot attribute would be a confident statement about the wrong creator's
 * normal — the worst outcome available here, because it looks correct.
 */
export function workerReferenceMetrics(input: {
  views?: unknown
  creatorAudience?: unknown
  creatorHandle?: unknown
  siblingReaches?: readonly unknown[]
}): WorkerReferenceMetrics {
  const views = positiveInt(input.views)
  const who = handleOf(input.creatorHandle)
  const siblings = Array.isArray(input.siblingReaches) ? input.siblingReaches : []
  const known = siblings.map(parseReach).filter((v): v is number => v !== null)
  const median = known.length >= MIN_VIDEOS_FOR_BASELINE ? medianOf(known) : null
  const lift =
    who !== null && views !== null && median !== null && median > 0
      ? positiveNumber(views / median)
      : null
  return {
    views,
    creatorAudience: positiveInt(input.creatorAudience),
    creatorHandle: who,
    relativeLift: lift,
    relativeBasis: lift === null ? null : known.length,
  }
}
