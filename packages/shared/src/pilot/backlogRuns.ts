// WHAT A BACKLOG BATCH ACTUALLY MEASURED, PINNED SO IT CANNOT DRIFT.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// A batch result lives in a conversation, the conversation ends, and six weeks
// later "the sampler was fine, wasn't it?" is answered from memory. Worse: a
// backlog batch and a labelled pilot run look alike from a distance, and pooling
// them, or quoting a coverage batch as if a reviewer had judged it, is the exact
// mistake `PILOT_COHORT_IS_NOT_THE_PRODUCT_PATH` exists to prevent.
//
// ⚠️ SO A BATCH IS A RECORD WITH ITS DENOMINATOR ATTACHED. `enqueued` is the
// denominator, not `assessed`. A batch that looked at 21 of 32 and reports "4.00
// frames per reference" is telling the truth about the 21 and saying nothing
// about the 11 — and the 11 are the finding.
//
// ⚖️ AND A BACKLOG BATCH IS NOT A PILOT RUN. No reviewer labelled these. There is
// no supported_of_answered rate here and there must never appear to be one.

export interface BacklogAttrition {
  /** What went wrong, in the words the worker actually recorded. */
  cause: string
  count: number
  /** True when the reference was never downloaded, so the frames pass never ran.
   *  ⚠️ THIS IS THE FIELD THAT KEEPS A FETCH PROBLEM FROM READING AS A MODEL
   *  PROBLEM. A reference nobody could fetch says nothing about the sampler. */
  failedBeforeLooking: boolean
}

export interface BacklogBatch {
  id: string
  enqueuedAt: string
  /** The worker commit that ran it. Without this, a frames number cannot be
   *  attributed to the fix it was run to test. */
  workerCommit: string
  /** THE DENOMINATOR. Never the assessed count. */
  enqueued: number
  assessed: number
  /** Rows that actually persisted a visual assessment. May be lower than
   *  `assessed` — and when it is, that gap is a defect, not a rounding error. */
  profileRowsWritten: number
  framesPerReference: number
  minFrames: number
  maxFrames: number
  singleFrameReferences: number
  attrition: readonly BacklogAttrition[]
  /** What this batch settles, stated so nobody has to re-derive it. */
  concludes: string
  /** ⚠️ NEVER TRUE FOR A BACKLOG BATCH. Present so that any future code asking
   *  "may I quote a supported rate from this?" gets a hard no rather than a
   *  missing field it can interpret generously. */
  reviewerLabelled: false
}

export const BACKLOG_BATCHES: readonly BacklogBatch[] = Object.freeze([
  Object.freeze({
    id: 'no-speech-backlog-batch-1',
    enqueuedAt: '2026-08-24T01:18:53Z',
    workerCommit: '33c4292',
    enqueued: 32,
    assessed: 21,
    profileRowsWritten: 20,
    framesPerReference: 4,
    minFrames: 4,
    maxFrames: 4,
    singleFrameReferences: 0,
    attrition: Object.freeze([
      Object.freeze({
        cause: 'TikTok: Your IP address is blocked from accessing this post',
        count: 5,
        failedBeforeLooking: true,
      }),
      Object.freeze({
        cause: 'UNKNOWN_DOWNLOAD_FAILURE',
        count: 3,
        failedBeforeLooking: true,
      }),
      Object.freeze({
        cause: 'Instagram: this video could not be read: no audio url found',
        count: 3,
        failedBeforeLooking: true,
      }),
    ]),
    concludes:
      "#494's beatSchedule holds in production: content_beats and uniform both sampled "
      + 'exactly 4 frames on every reference, and no reference collapsed to a single frame. '
      + 'The sampler question is CLOSED and needs no further references. What this batch does '
      + 'NOT settle is coverage -- 11 of 32 were never fetched, and that attrition is a fact '
      + 'about the download route, not about the frames pass.',
    reviewerLabelled: false,
  }),
])

/** ⚠️ THE RATE THAT IS HONEST ABOUT ITS DENOMINATOR. Assessed over ENQUEUED, so a
 *  batch that quietly lost a third of its sample cannot report as a clean run. */
export const assessedRate = (b: BacklogBatch): number =>
  b.enqueued === 0 ? 0 : b.assessed / b.enqueued

/** References lost before the frames pass could run. ⚖️ SEPARATE FROM a visual
 *  failure on purpose: one is a supply problem and one is a model problem, and
 *  pooling them would hide whichever is currently smaller. */
export const lostBeforeLooking = (b: BacklogBatch): number =>
  b.attrition.filter((a) => a.failedBeforeLooking).reduce((n, a) => n + a.count, 0)

export const backlogBatch = (id: string): BacklogBatch | null =>
  BACKLOG_BATCHES.find((b) => b.id === id) ?? null
