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

// ⚠️ TWO CONSTANTS WERE DELETED HERE, AND ONE OF THEM WAS A FALSE PROMISE.
//
// `MAX_RECORDING_MS = 10 * 60_000` was documented as "the supported recording
// length. Longer is refused BEFORE anything uploads." Nothing read it. And
// `preflight` below takes `sizeBytes` and NOTHING ELSE — it has no duration
// parameter, so there was never a place for a length refusal to happen. The
// sentence described a check that did not exist.
//
// ⚖️ LENGTH IS ENFORCED, JUST NOT HERE AND NOT WITH THAT NUMBER. The real cap
// is `env.sourceMaxDurationMs` (worker/src/env.ts:134), default THIRTY minutes,
// applied in `validateSource.ts:246` and `validateClip.ts:104` — in the worker,
// AFTER the whole file has uploaded. So the documented ceiling was 10 minutes,
// the enforced one is 30, and the enforcement lands at exactly the moment this
// file's header comment exists to prevent: after the creator's upload finished.
//
// ⚠️ AND THE TWO NUMBERS WERE NEVER THE SAME KIND OF THING. A source asset is
// ONE SCENE: `sceneTimeCapSec` (recordingScript.ts:155) clamps every take to
// `min(max(est + 5, 12), 30)` seconds and V2Capture AUTO-STOPS on it. So a
// 10-minute per-asset ceiling is 20x a bound the recorder already enforces and
// is unreachable by construction, while the product's "10 minutes of normal
// mobile capture" in the header is a WHOLE-VIDEO figure. Comparing it against
// one asset was a unit mismatch, which is why no reader was ever written.
//
// `TARGET_MAX_BYTES = 300 * 1024 * 1024` was "what normal mobile capture is
// expected to produce". Also unread, and nothing should enforce it: refusing an
// upload for exceeding a TARGET would reject valid recordings. An expectation
// with no reader is a comment wearing the costume of code, and the header above
// already states the promise it was restating.
//
// Measured on production 2026-09-15 before deleting either: 7 source assets,
// max 123.7 MB, ONE of the 7 carrying a duration at all (4,736 ms). Zero over
// 30s, zero over 10 minutes, zero over 300 MB. ⚠️ n=7 IS NOT EVIDENCE THE
// CEILINGS ARE RIGHT-SIZED — it is only evidence that nothing has approached
// them, so no number here is being re-derived from seven rows. What is being
// removed is the pair with no readers; SUPPORTED_MAX_BYTES and
// RESUMABLE_THRESHOLD_BYTES below are read by `preflight` and stay untouched.

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

/**
 * THE RESUMABLE PATH IS RETIRED, AND IT NEVER DELIVERED A BYTE.
 *
 * ⚠️ MEASURED ON PRODUCTION 2026-09-15, AND THE SPLIT LANDS EXACTLY ON THE
 * THRESHOLD ABOVE:
 *
 *   routed to                          assets   ready   stuck uploading
 *   <= 6 MB  single PUT, token in URL       1       1                 0
 *   >  6 MB  resumable, `x-signature`       6       0                 6
 *
 * One for one on the transport that carries the token the way storage expects.
 * Zero for six, lifetime, on the one that does not.
 *
 * ⚖️ THE CAUSE, READ IN THE CODE RATHER THAN INFERRED FROM THE RATE. The tus
 * config sent the server-minted token in an `x-signature` header and NO
 * `Authorization` header. `x-signature` is not a Storage header — storage-js
 * never sends it, and `uploadToSignedUrl` carries the token as `?token=` in the
 * query string instead. So every resumable request arrived with no credential
 * storage reads, and parsing an absent bearer token is what produced
 * `403 AccessDenied "Invalid Compact JWS"` on every take over 6 MB.
 *
 * ⚠️ AND IT IS NOT THE SERVICE-ROLE KEY OR THE JWT SIGNING-KEY MIGRATION,
 * WHICH IS WHERE THIS WAS HUNTED FOR DAYS. Both paths use the same project, the
 * same storage and the same token minted by `createSignedUploadUrl`. A rotated
 * key or a signature mismatch would break BOTH. Only the transport differs, and
 * only one transport fails. Production still has the legacy anon key enabled
 * alongside the new publishable key, so legacy JWTs are accepted.
 *
 * ⚠️ THE TUS FINGERPRINT PROBLEM IS REAL AND DOWNSTREAM. The original comment
 * blamed tus-js-client keying its fingerprint on the blob alone, so a retry
 * resumed against a URL minted under a dead token. That is a genuine defect and
 * it is irrelevant while the path never authenticates at all — it could only
 * start mattering after this is fixed.
 *
 * ⚖️ RETIRED RATHER THAN REPAIRED, AND THE ALTERNATIVE WAS A SECURITY BOUNDARY.
 * tus on that endpoint cannot use a signed-upload token; the platform's own
 * pattern is `Authorization: Bearer <user JWT>` with row security applying,
 * which needs a storage INSERT policy on `takes`. Opening one to rescue a
 * transport that has never worked is a real widening for a hypothetical
 * benefit. The single PUT handles what creators actually produce: a real take
 * measured 95.6 MB at 76 seconds, 1080x1920.
 *
 * ⚠️ WHAT WOULD JUSTIFY REVIVING IT: poor-connection failures on large takes,
 * MEASURED. Not assumed, and not "resumable uploads are best practice".
 * Resumable exists for unreliable connections, which is not a problem this
 * product has yet had. The reviver needs the `Authorization: Bearer` header,
 * the storage policy, and the fingerprint fix — all three, or it returns to
 * zero for six.
 *
 * The transport code is left in place, dormant, so reviving it is a change to
 * this one flag rather than a rewrite from a deleted file.
 */
export const RESUMABLE_RETIRED = true

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
  // ⚠️ THE RETIREMENT IS CHECKED HERE, NOT AT THE CALL SITE. A caller that
  // forgot would route a creator's take to a transport with zero lifetime
  // successes, and preflight is the one place every upload passes through.
  if (RESUMABLE_RETIRED) return { ok: true, transport: 'single' }
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
 * Would a DIFFERENT transport plausibly succeed where this one failed?
 *
 * ⚠️ THIS IS A SECOND QUESTION AND THE CODE WAS ANSWERING THE FIRST ONE. On the
 * resumable path a 403 was classified `deterministic`, which is correct — the
 * identical request will fail identically — and then used to conclude "try
 * nothing else", which does not follow. `mayRetry` says whether to re-send the
 * SAME request; it cannot say whether another transport would work, and for
 * months it was asked that question anyway. Every take over 6 MB was thrown at
 * the point where the working path was one line away.
 *
 * ⚖️ THE DIVIDING LINE IS WHETHER THE REFUSAL IS ABOUT THE PAYLOAD OR ABOUT
 * HOW THIS TRANSPORT AUTHENTICATED. 413, 415, 422 and 400 are properties of the
 * bytes or the request shape: no transport changes them, and re-sending 95 MB to
 * be told the same thing costs the creator twice. 401 and 403 are properties of
 * the CREDENTIAL, and the two transports carry credentials differently — the
 * single PUT puts the token in the URL, tus put it in a header storage does not
 * read. So an auth refusal on one says nothing about the other.
 *
 * ⚠️ NOT A LICENCE TO RETRY FOREVER. It answers one question once, for a
 * caller that has another transport to try. A transient failure is `mayRetry`'s
 * business and stays there.
 */
export function mayTryAnotherTransport(status: number | null | undefined, message?: string | null): boolean {
  const kind = classifyUploadFailure(status, message)
  if (kind !== 'deterministic') return true
  const s = typeof status === 'number' && Number.isFinite(status) ? status : null
  // Only an auth refusal. A payload refusal is final on every transport.
  return s === 401 || s === 403
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
