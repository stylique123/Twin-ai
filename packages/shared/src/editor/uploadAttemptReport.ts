// THE CLIENT IS THE ONLY PARTY THAT KNOWS WHY AN UPLOAD STOPPED.
//
// ⚠️ `uploadForensics.ts` CLASSIFIES TWO PRODUCTION ROWS AS `stalled` AND CAN DO
// NOTHING BETTER, because a closed tab and a hung transport leave identical
// rows. Only the page that was doing the uploading knows which happened, and
// until 0149 it had no way to say so.
//
// ⚖️ AND A CAPABILITY NOTHING CALLS IS THIS REPO'S RECURRING FAILURE.
// `scanTargetConfirmation`, the caption extractor and `csEntities` each shipped
// complete, passed their own tests, and were never reached. A reporting endpoint
// is the easiest possible version of that mistake — it would sit there perfectly
// correct, and `creator_abandoned` would remain a value no row can ever hold.
// So the report is wired into the upload path in the same change that adds it.
//
// ⚖️ AND THE TAB-CLOSE CASE IS NOW COVERED, WHICH IT WAS NOT WHEN THIS FILE WAS
// WRITTEN. This header used to say `creator_abandoned` had no emitter, because
// an ordinary request is cancelled with the page it reports about — and a report
// that landed only when a tab happened to close slowly would systematically
// under-count fast exits, which is worse than no data because it looks like
// evidence. `uploadAbandonBeacon.ts` closes that gap with a
// `fetch(keepalive: true)` armed on `pagehide` and DISARMED on every terminal
// path, so a finished upload can never report an abandonment on the next
// navigation. `sendBeacon` was rejected for it: it cannot set headers, so
// authenticating it would mean putting a JWT in a URL.
//
// ⚠️ REPORTING MUST NEVER COST THE CREATOR ANYTHING. This runs while the upload
// is already failing. Every call is fire-and-forget, every failure is swallowed,
// and nothing here is ever awaited on the path back to the user.
import { getClient } from '../api'

export type AttemptOutcome = 'progressing' | 'failed' | 'abandoned'

export interface AttemptReportInput {
  outcome: AttemptOutcome
  startedAt?: number | null
  lastProgressAt?: number | null
  bytesSent?: number | null
  attemptNumber?: number | null
  failureCode?: string | null
}

const iso = (ms: number | null | undefined) =>
  typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null

/**
 * ⚠️ ONLY THE ALLOWED FIELDS ARE EVEN CONSTRUCTED. The edge rejects anything
 * else with a 400, and building the body here from a fixed shape means a future
 * caller cannot casually pass `status` through and discover it was refused only
 * at runtime.
 */
export function attemptBody(assetId: string, r: AttemptReportInput): Record<string, unknown> {
  return {
    action: 'upload_attempt',
    asset_id: assetId,
    outcome: r.outcome,
    started_at: iso(r.startedAt),
    last_progress_at: iso(r.lastProgressAt),
    bytes_sent: typeof r.bytesSent === 'number' && Number.isFinite(r.bytesSent)
      ? Math.max(0, Math.round(r.bytesSent)) : null,
    attempt_number: typeof r.attemptNumber === 'number' && Number.isFinite(r.attemptNumber)
      ? Math.min(1000, Math.max(1, Math.round(r.attemptNumber))) : null,
    failure_code: failureCode(r.failureCode),
  }
}

/** The bound on a stored failure description.
 *
 * ⚠️ 200 CUT OFF THE ANSWER. MEASURED 2026-09-01: the only record of why the
 * last real take failed reads
 *   "tus: unexpected response while creating upload, originated from request
 *    (method: POST, url: .../upload/resumable, response code: 400, response t"
 * — it stops mid-word at exactly 200 characters, one word before the response
 * BODY, which is the single field that would have named the cause. A bound that
 * truncates the diagnosis is not a bound, it is a second failure.
 *
 * ⚖️ STILL BOUNDED, JUST ABOVE THE THING BEING DIAGNOSED. An unbounded string
 * from a browser error would turn a diagnostic column into a free-text channel,
 * which is the reason the original limit existed and is still right. */
export const FAILURE_CODE_MAX_CHARS = 1000

/**
 * ⚖️ A CODE, NOT A MESSAGE. The thrown text is the only description we have, so
 * it is kept — but trimmed and bounded, because an unbounded string from a
 * browser error is how a diagnostic column turns into a free-text channel.
 */
export function failureCode(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim() : raw instanceof Error ? String(raw.message).trim() : ''
  return s === '' ? null : s.slice(0, FAILURE_CODE_MAX_CHARS)
}

/** Fire and forget. Never throws, never rejects, never blocks the caller. */
export function reportUploadAttempt(assetId: string, r: AttemptReportInput): void {
  try {
    void getClient().functions.invoke('source-asset', { body: attemptBody(assetId, r) })
      // ⚠️ SWALLOWED ON PURPOSE. The client calling this is usually already in
      // trouble; handing it a second failure to deal with helps nobody, and a
      // lost report is strictly better than a lost upload.
      .catch(() => {})
  } catch {
    // getClient() throws before initApi — nothing to report to yet.
  }
}
