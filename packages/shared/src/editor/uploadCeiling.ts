// WHAT TWIN PROMISES TO ACCEPT FROM A CAMERA, AND WHAT IT DOES WHEN IT CANNOT.
//
// A real teleprompter take was recorded, reviewed, uploaded for five minutes,
// reached 100%, and was then refused with "The object exceeded the maximum
// allowed size". The creator still had the file. Twin had nothing.
//
// ⚠️ THE BUCKET WAS NEVER THE LIMIT. `takes` and `edits` both allow 600 MB. The
// refusal came from the project-level upload ceiling, which is a dashboard
// setting no code here can read — so nothing in this file may be written as
// though the current platform setting were the product's promise.
//
// ⚖️ THE PRODUCT DECIDES THE CEILING, AND THE TRANSPORT MEETS IT. 10 minutes of
// normal mobile capture, 600 MB supported. A single request that cannot carry
// that is a transport defect, not a reason to ask a creator to record less.

/** The supported recording length. Longer is refused BEFORE anything uploads. */
export const MAX_RECORDING_MS = 10 * 60_000

/** What normal mobile capture is expected to produce at this length. */
export const TARGET_MAX_BYTES = 300 * 1024 * 1024

/**
 * The hard supported ceiling — the same number the buckets already carry.
 *
 * ⚠️ NOT DERIVED FROM THE CURRENT PLATFORM SETTING. If the project-level limit
 * is lower than this, that is a misconfiguration to fix, not a product limit to
 * encode. Writing today's platform number here is how "the transport is small"
 * silently becomes "the product is small".
 */
export const SUPPORTED_MAX_BYTES = 600 * 1024 * 1024

/**
 * Above this, one request is the wrong shape.
 *
 * ⚖️ 6 MB IS THE PLATFORM'S OWN SINGLE-SHOT GUIDANCE, not a guess. Beyond it a
 * lost connection means starting again from byte zero, which on a phone is how
 * a good take becomes three failed uploads.
 */
export const RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024

const mb = (b: number) => `${(b / (1024 * 1024)).toFixed(1)} MB`

export type Preflight =
  | { ok: true; transport: 'single' | 'resumable' }
  | { ok: false; reason: 'too_large' | 'unknown_size'; message: string }

/**
 * Decided BEFORE a byte moves.
 *
 * ⚠️ AN UNKNOWN SIZE IS NOT A SMALL SIZE. A blob whose size cannot be read is
 * refused rather than optimistically streamed, because the alternative is
 * discovering the answer after five minutes of the creator's time.
 */
export function preflight(sizeBytes: unknown): Preflight {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, reason: 'unknown_size',
      message: 'Twin could not read the size of this recording, so it did not start uploading it. Your recording is still here.' }
  }
  if (sizeBytes > SUPPORTED_MAX_BYTES) {
    // ⚠️ EXACT NUMBERS, BOTH OF THEM. "Too big" without the two figures leaves
    // the creator unable to tell whether they were close or nowhere near.
    return { ok: false, reason: 'too_large',
      message: `This recording is ${mb(sizeBytes)}. Twin can save up to ${mb(SUPPORTED_MAX_BYTES)}. `
        + 'Your recording has not been deleted — you can still save it to your device.' }
  }
  return { ok: true, transport: sizeBytes > RESUMABLE_THRESHOLD_BYTES ? 'resumable' : 'single' }
}

export type FailureKind = 'deterministic' | 'transient' | 'unknown'

/**
 * Will trying the identical request again ever produce a different answer?
 *
 * ⚠️ THIS IS THE DEFECT THAT DOUBLED A FIVE-MINUTE WAIT. The web uploader
 * caught every XHR failure with a bare `catch {}` and silently re-sent the whole
 * blob through a second path. For a size rejection the second attempt is
 * guaranteed to fail identically, so the creator paid twice for one refusal and
 * the real status code was discarded on the way.
 */
export function classifyUploadFailure(status: number | null | undefined, message?: string | null): FailureKind {
  const s = typeof status === 'number' && Number.isFinite(status) ? status : null
  if (s !== null) {
    // 413 Payload Too Large, 401/403 auth, 400 malformed, 415 wrong type,
    // 422 unprocessable — none of these change on a retry.
    if (s === 413 || s === 401 || s === 403 || s === 400 || s === 415 || s === 422) return 'deterministic'
    if (s === 408 || s === 429 || s >= 500) return 'transient'
    if (s >= 200 && s < 300) return 'transient'
  }
  const m = String(message ?? '').toLowerCase()
  // ⚠️ MATCHED ON THE PLATFORM'S OWN WORDS. This exact sentence is what a real
  // creator was shown, and it must never be treated as worth retrying.
  if (m.includes('exceeded the maximum allowed size') || m.includes('payload too large')) return 'deterministic'
  if (m.includes('timed out') || m.includes('network') || m.includes('aborted')) return 'transient'
  return 'unknown'
}

/**
 * ⚖️ UNKNOWN IS RETRIED ONCE, DETERMINISTIC NEVER. Refusing to retry an
 * unrecognised failure would strand takes on transient faults we failed to
 * name; retrying a refusal wastes the creator's time to reach the same wall.
 */
export function mayRetry(kind: FailureKind): boolean {
  return kind !== 'deterministic'
}

/**
 * ⚠️ BYTES SENT IS NOT BYTES KEPT. `xhr.upload.onprogress` reaches 1.0 when the
 * browser finishes writing the request body — the server has not answered yet,
 * and a size rejection arrives after that moment. A creator was shown 100% and
 * then told the save failed, which is the UI's fault, not the server's.
 */
export type SaveStage = 'uploading' | 'finishing' | 'saved' | 'failed'

export function saveStageLabel(stage: SaveStage): string {
  switch (stage) {
    case 'uploading': return 'Uploading your recording…'
    // The honest state between "bytes left the phone" and "Twin has it".
    case 'finishing': return 'Almost there — making sure Twin has it…'
    case 'saved': return 'Saved'
    case 'failed': return 'Not saved'
  }
}

/** Only a successful finalize may say saved. Progress alone never may. */
export function isSaved(stage: SaveStage): boolean { return stage === 'saved' }
