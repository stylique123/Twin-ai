// `uploading` IS A STATE, NOT A BEHAVIOUR.
//
// ⚠️ TWO TAKES HAVE READ `uploading` SINCE 2026-08-09 and it is tempting to
// count them as creators who gave up. They are not. Both rows exist, both were
// issued a signed URL, and NEITHER has an object in storage — 59.8MB and
// 123.7MB, while the only take that ever reached storage was 5.8MB. The upload
// transport never completed, and the cause was ours: a single-shot XHR PUT with
// no `ontimeout`/`onabort` handler, so a timed-out upload left a promise that
// never settled, finalize was never called, and `UploadOnce` — which clears its
// slot only in `.catch()` — disabled the retry button too.
//
// ⚖️ SO A FUNNEL MAY NOT READ `uploading` AS ABANDONMENT. "recording started but
// not completed" pools human abandonment with system failure, and that is the
// aggregation that later produces a confident wrong product conclusion —
// somebody spends a quarter making the record button friendlier while the actual
// defect is a missing event handler.
//
// ⚠️ DERIVED FROM WHAT ALREADY EXISTS, and what does NOT exist is named rather
// than invented. `media_assets` carries the declared size, the status and the
// finalize receipt; `storage.objects` carries whether the bytes landed and how
// many. Between them most cases are already decidable. What is genuinely absent
// is timing — `upload_started_at`, `last_chunk_at`, `retry_count` — and until
// those exist the honest answer for a subset of cases is `unknown`, not a guess.

export const UPLOAD_OUTCOMES = [
  /** Bytes landed, finalize ran, validation accepted it. */
  'accepted',
  /** ⚠️ OURS. Bytes landed whole and validation refused them — the WebM
   *  duration case. The creator did everything right. */
  'validation_failed',
  /** Bytes landed whole and finalize never ran. Client died between the two, or
   *  the finalize call failed and was never retried. */
  'finalize_not_called',
  /** Nothing in storage at all, and the declared size is large. Consistent with
   *  the transport hang — and NOT with a creator changing their mind, who would
   *  have had to do so during the upload itself. */
  'upload_never_landed',
  /** In storage but short of the declared size: a genuinely interrupted upload. */
  'upload_partial',
  /** ⚖️ THE ONLY HONEST VERDICT FOR "still going". A recent row with no object
   *  yet is an upload in progress, not a failure, and calling it one is how a
   *  funnel reports its own live traffic as breakage. */
  'in_flight',
  /** ⚠️ NOT A DUMPING GROUND — it is what the missing timing fields cost. Every
   *  row that lands here is an argument for adding them. */
  'unknown',
] as const
export type UploadOutcome = (typeof UPLOAD_OUTCOMES)[number]

/** ⚠️ WHICH OF THESE ARE OURS. The whole point of the split. */
export const OUR_FAULT: ReadonlySet<UploadOutcome> = new Set<UploadOutcome>([
  'validation_failed', 'finalize_not_called', 'upload_never_landed', 'upload_partial',
])

/**
 * ⚖️ AND NONE OF THEM IS "THE CREATOR ABANDONED IT". That verdict is deliberately
 * absent from this union, because nothing we currently record can support it. A
 * creator who closed the tab mid-upload and a creator whose upload hung produce
 * IDENTICAL rows. Offering an `abandoned` value would invite somebody to pick it,
 * and the first person to do so would be guessing with a confident-looking word.
 */
export const CANNOT_YET_DISTINGUISH =
  'A closed tab and a hung upload leave identical rows. `upload_started_at`, '
  + '`last_chunk_at` and `retry_count` are what would separate them.'

export interface UploadRow {
  status: string
  /** What the client said it was sending. */
  declaredBytes: number | null
  /** Present once finalize ran — the receipt it writes. */
  finalizedEtag: string | null
  /** Whether an object exists at the asset's storage path. */
  objectExists: boolean
  /** Its size, when it exists. */
  storedBytes: number | null
  createdAt: string
  /** Supplied, not read, so a classification is reproducible. */
  asOf: string
}

/**
 * How long a row may sit before "still uploading" stops being credible.
 *
 * ⚖️ TEN MINUTES IS GENEROUS AGAINST THE NEW TIMEOUT. `uploadTimeoutMs` gives a
 * 124MB take roughly 17 minutes, so this is not a claim that the upload should
 * be done — it is the point past which a row with NO bytes at all has almost
 * certainly failed rather than merely being slow. A single-shot PUT that has
 * transferred nothing after ten minutes is not going to finish.
 */
export const IN_FLIGHT_GRACE_MS = 10 * 60_000

export function classifyUpload(row: UploadRow): UploadOutcome {
  const age = Date.parse(row.asOf) - Date.parse(row.createdAt)
  const fresh = Number.isFinite(age) && age < IN_FLIGHT_GRACE_MS

  if (row.status === 'ready') return 'accepted'
  if (row.status === 'rejected') {
    // ⚠️ Rejected WITH the bytes present is validation refusing good work.
    // Rejected without them is a different story and must not wear the same word.
    return row.objectExists ? 'validation_failed' : 'unknown'
  }

  if (!row.objectExists) {
    // ⚖️ A FRESH ROW IS STILL GOING. Only once past the grace period does an
    // absent object become evidence of anything.
    return fresh ? 'in_flight' : 'upload_never_landed'
  }

  // Bytes are there. Do they add up?
  if (row.declaredBytes !== null && row.storedBytes !== null
    && row.storedBytes < row.declaredBytes) {
    return fresh ? 'in_flight' : 'upload_partial'
  }

  // Whole bytes present. Did finalize run?
  if (!row.finalizedEtag) return fresh ? 'in_flight' : 'finalize_not_called'

  // Finalized, bytes whole, and still not settled — validation has not run or
  // has not finished. Nothing here says which, so nothing here claims one.
  return fresh ? 'in_flight' : 'unknown'
}

export type UploadTally = Record<UploadOutcome, number>

export function tallyUploads(rows: readonly UploadRow[]): UploadTally {
  const out = Object.fromEntries(UPLOAD_OUTCOMES.map((k) => [k, 0])) as UploadTally
  for (const r of rows) out[classifyUpload(r)]++
  return out
}

/** How many of the failures were ours. The number that decides what to fix. */
export function oursCount(t: UploadTally): number {
  return [...OUR_FAULT].reduce((n, k) => n + t[k], 0)
}
