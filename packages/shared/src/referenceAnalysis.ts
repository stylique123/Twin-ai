// REFERENCE-1 — reading back "did we actually watch the video".
//
// `generations.reference_analysis` (0110) is written by `generate-blueprint`
// from the branch it took: a real transcript reached the prompt, or the model
// reasoned from the format pattern, or there was no reference at all.
//
// The reason this needs a reader at all — rather than a `?.mode` at each call
// site — is the NULL case. A generation created before 0110 has no record, and
// the honest answer for it is "we do not know", not "pattern". Defaulting an
// absent value to the fallback would be inventing a fact about history to make
// a badge render, and it would put a "we could not read this" notice on
// generations that were read perfectly well.
//
// Same three-state rule as preflight and the pre-script brief: unset is its own
// state, and a surface that cannot tell must say nothing rather than guess.

/** What the server recorded. `unknown` is the pre-0110 case, never a guess. */
export type ReferenceMode = 'real' | 'pattern' | 'none' | 'unknown'

export interface ReferenceAnalysis {
  mode: ReferenceMode
  /** Only ever set for `pattern`, and only when the server named a cause. */
  reason: string | null
}

const MODES: readonly string[] = ['real', 'pattern', 'none']

/**
 * Read the column. Anything unrecognised reads as `unknown` rather than
 * throwing: this feeds a badge, and a plan screen must not fail to render
 * because a provenance value was written by a version that knows one more mode.
 */
export function readReferenceAnalysis(raw: unknown): ReferenceAnalysis {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { mode: 'unknown', reason: null }
  const o = raw as Record<string, unknown>
  const mode = typeof o.mode === 'string' && MODES.includes(o.mode)
    ? (o.mode as ReferenceMode)
    : 'unknown'
  const rawReason = typeof o.reason === 'string' ? o.reason.trim() : ''
  // A reason on anything but `pattern` describes a failure that did not happen.
  // The CHECK refuses it; this refuses it again at the reader, because the
  // column can hold rows written before a constraint existed.
  const reason = mode === 'pattern' && rawReason !== '' ? rawReason : null
  return { mode, reason }
}

/**
 * Should a surface say anything at all?
 *
 * Only `pattern` earns a notice. `real` is the promise the product already
 * makes — badging it would turn the normal case into a claim, and a screen
 * covered in reassurance reads as a screen with something to reassure about.
 * `none` is the creator's own choice. `unknown` has nothing to say.
 */
export function shouldDiscloseReference(a: ReferenceAnalysis): boolean {
  return a.mode === 'pattern'
}

/**
 * The sentence, in the creator's terms. Never "ingest failed" or a code — the
 * question they have is "can I trust this analysis", and the answer is what to
 * do about it.
 */
export function referenceDisclosure(a: ReferenceAnalysis): string | null {
  if (!shouldDiscloseReference(a)) return null
  return a.reason
    ?? 'We could not read this video, so the script follows the format instead.'
}

// ── THE HARD STOP ─────────────────────────────────────────────────────────
//
// `pattern` used to be a fallback: the read failed, so the model reasoned from
// the format instead and the creator was charged for it. The theory was that a
// less-tailored script beats "We hit a snag".
//
// It does not, because the creator did not ask for one. Pasting a reference IS
// the request: write this, the way that one is written. A pattern-mode build
// answers a different question, and it announced that at 94% — after the remix
// was gone. `referenceDisclosure` above exists to caption exactly that
// experience, which is the tell that it should never have been sold.
//
// So `pattern` now refuses BEFORE spend, everywhere. The creator who wants a
// build from their own style alone still has one, free: leave the reference
// out. What they must never get is a bill for us substituting that silently.
//
// The reasons are causes of a FAILED READ, not judgements about the video —
// that axis is `referenceCheck.ts`'s `ReferenceReason`, which measures a video
// we did read. These say what we could not do.

/** Why no transcript reached the writer. */
export type ReferenceUnreadCause =
  /** Not a host `ingest-reference` can fetch (mirrors its SSRF allow-list). */
  | 'unsupported_host'
  /** The read was attempted and errored. */
  | 'read_failed'
  /** The read did not finish inside the wait the creator can reasonably sit through. */
  | 'read_timed_out'
  /** The read finished and produced nothing usable. */
  | 'read_empty'
  /**
   * ⚠️ NOT A FACT ABOUT THIS VIDEO. Twin's own reading capacity is spent, so
   * EVERY reference fails identically until it resets. Measured 2026-09-01:
   * of 52 failed `assess_reference` jobs in 24h, 52 were
   * `RESOURCE_EXHAUSTED quotaId=GenerateRequestsPerDayPerProjectPerModel`,
   * across BOTH TikTok (23) and YouTube (29) — while 239 other jobs on the
   * same platforms finished fine. The download works; the reading budget is
   * gone.
   *
   * ⚖️ THIS EXISTS BECAUSE `read_timed_out` WAS TELLING A CREATOR SOMETHING
   * FALSE. A job retrying on an exhausted daily quota never finishes inside
   * the client's 72s poll, so it fell through to "this video is taking longer
   * to read than we can hold you here for" and offered "Try a different
   * reference" — advice that CANNOT work, because the next reference hits the
   * same wall. A wrong cause that sends someone to spend their afternoon
   * re-picking videos is worse than no cause.
   */
  | 'read_unavailable'

/**
 * What to tell the creator, per cause. One sentence of fact, then nothing —
 * the screen supplies "no remix was used" and the way out, because those are
 * the same whatever the cause.
 *
 * These sentences are ALSO produced by `generate-blueprint`, which cannot
 * import this package (Deno, at deploy time). `referenceAnalysis.test.ts`
 * reads that file and fails when the two disagree, so the duplication cannot
 * drift into two different promises about the same event.
 */
export const REFERENCE_UNREAD_TEXT: Record<ReferenceUnreadCause, string> = {
  unsupported_host: 'We can only watch TikTok, Instagram and YouTube links, so we could not read this one.',
  read_failed: 'We could not read this video — it may be private, deleted, or from an account that blocks us.',
  read_timed_out: 'This video is taking longer to read than we can hold you here for.',
  read_empty: 'We reached this video but the read came back empty, so there is nothing for us to follow.',
  read_unavailable: 'Twin has used up how much video it can read today, so this is not about your link — no reference can be read until that resets.',
}

/**
 * Does this job error mean Twin's own reading capacity is spent, rather than
 * anything about the creator's video?
 *
 * ⚠️ THE JOB IS STILL `queued` WHEN THIS IS TRUE. It is retrying with backoff
 * against a quota that will not clear today, so waiting for `failed` would
 * mean waiting past the client's whole poll window and then reporting a
 * timeout. The error text is on the row from the FIRST attempt onward, which
 * is what makes this answerable in time to say something true.
 *
 * ⚖️ MATCHES THE DAILY CLASS ONLY. A per-minute 429 genuinely IS transient and
 * the next attempt may well succeed, so calling that "unavailable" would
 * refuse a build that was about to work. `class=daily` is the worker's own
 * word for the one that does not clear on a retry.
 */
export function isReadCapacityExhausted(error: string | null | undefined): boolean {
  if (typeof error !== 'string' || !error) return false
  return /class=daily/.test(error) && /RESOURCE_EXHAUSTED/.test(error)
}

/** The code the server returns, and the client recognises, for the hard stop. */
export const REFERENCE_UNREAD_CODE = 'REFERENCE_UNREAD'
