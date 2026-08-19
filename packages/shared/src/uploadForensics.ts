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
  /** ⚖️ NO BYTES, PAST THE GRACE PERIOD, AND NOBODY SAID WHY. 0149 gave the
   *  client a way to report what it saw; a row with no report is one that
   *  never got to send one — the tab closed, the process died, the network
   *  went. That is a stalled upload of UNKNOWN cause, and elapsed time alone
   *  may never promote it to either a fault or an abandonment. */
  'stalled',
  /** ⚠️ THE CREATOR SAID SO. Reachable ONLY from a client report carrying
   *  `outcome: 'abandoned'` — never from a clock. The client is the only party
   *  that knows it gave up, so its word is the only thing that establishes it. */
  'creator_abandoned',
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
 * ⚖️ AND `stalled` IS NOT ONE OF THEM, WHICH IS THE WHOLE CORRECTION. It is the
 * bucket for "no bytes, no report, and no idea", and putting it in OUR_FAULT
 * would restore by the back door exactly the inference 0149 was built to
 * replace: reading a clock and calling the result a cause.
 *
 * ⚠️ `creator_abandoned` IS NOT OURS EITHER, and is reachable only from a report.
 *
 * ⚖️ THE VERDICT NOW EXISTS BECAUSE THE EVIDENCE DOES. Before 0149 a closed tab
 * and a hung upload left IDENTICAL rows, so no honest classifier could name
 * either — `CANNOT_YET_DISTINGUISH` said so. `media_upload_attempts` is the
 * client saying which one happened. What has NOT changed is the rule: absent
 * that report, the answer is still `stalled`, still not a fault, and still not
 * an abandonment.
 */
export const CANNOT_YET_DISTINGUISH =
  'Without a client report a closed tab and a hung upload still leave identical '
  + 'rows. `media_upload_attempts` (0149) is what separates them, and a row with '
  + 'no report stays `stalled` rather than being guessed at.'

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
  /**
   * ⚠️ THE LATEST CLIENT REPORT, WHEN THERE IS ONE — the newest row in
   * `media_upload_attempts` for this asset. Absent means nobody reported, which
   * is itself the common case and must not be read as a report of success.
   */
  report?: AttemptOutcome | null
}

/** What the client said it was doing. Mirrors 0149's `outcome` check constraint. */
export type AttemptOutcome = 'progressing' | 'failed' | 'abandoned'

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
    // absent object become evidence of anything — and even then, of what?
    if (fresh) return 'in_flight'
    // ⚠️ THE REPORT DECIDES, NOT THE CLOCK. This is the correction: elapsed time
    // establishes that the upload is no longer happening, and nothing more. What
    // stopped it is a separate fact, and only the client knows it.
    if (row.report === 'abandoned') return 'creator_abandoned'
    if (row.report === 'failed') return 'upload_never_landed'
    // A client still reporting progress past the grace period is a client that
    // has not given up, however slow it is.
    if (row.report === 'progressing') return 'in_flight'
    return 'stalled'
  }

  // Bytes are there. Do they add up?
  if (row.declaredBytes !== null && row.storedBytes !== null
    && row.storedBytes < row.declaredBytes) {
    if (fresh || row.report === 'progressing') return 'in_flight'
    // ⚖️ PARTIAL BYTES ARE THEMSELVES THE EVIDENCE. Unlike the no-object case,
    // a short object proves the transport ran and stopped mid-way — so this
    // verdict does not need a report to be honest. An explicit `abandoned`
    // report still outranks it, because the creator is describing their own act.
    if (row.report === 'abandoned') return 'creator_abandoned'
    return 'upload_partial'
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
