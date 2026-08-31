// A REFERENCE THAT COULD NOT BE READ IS A SUCCESSFUL JOB, AND THAT IS THE BUG.
//
// ⚠️ MEASURED ON PRODUCTION 2026-08-30, across 1,188 `assess_reference` jobs:
//
//     807  done, no error          genuine assessments
//     227  failed                  visible at the queue level
//     154  done, result.error set  INVISIBLE at the queue level
//
// So `select count(*) where status = 'failed'` reports 227 failures when the
// real number is 381. It understates the failure rate by 40%, and every
// dashboard, every health check and every "did the backlog run work?" question
// asked at the queue level has been reading the smaller number.
//
// ⚖️ THE SWALLOW ITSELF IS CORRECT AND STAYS. `assessReference` catches the
// download error deliberately: a deleted video, a host the allowlist refuses
// and a clip with no speech are real properties of the LIBRARY, not transient
// job failures, and throwing would buy nothing but retries of a video that will
// never load. The row is written with its `error` column set. Nothing is lost.
// What was missing is a way to COUNT it without probing a nested JSON key for
// nullness, which is why nobody did.
//
// ⚖️ SO THE FIX IS A DISCRIMINATOR, NOT A THROW. The job result now says what
// happened in one field, and names the class of reason in another. Retry
// behaviour is untouched by design.
//
// ⚠️ AND `no_speech` IS NOT A FAILURE. A video that genuinely contains no
// speech was assessed correctly; the answer is just "there is nothing here to
// learn from". Counting it as a fetch failure would inflate the very number
// this file exists to make honest. It gets its own class and `unusable` is
// still true — the reference cannot be used — but it is never evidence that
// the fetch is broken.

/** What to DO about a reference we could not read. Same philosophy as
 *  `failureExplain`'s classes: not one label per message, but the small set of
 *  distinct answers to "what now". */
export type ReferenceFailureClass =
  /** The host refused this egress IP. Retrying from the same address never
   *  helps; this is the one that needs a different route out. */
  | 'blocked_by_host'
  /** The extractor could not parse the page. A yt-dlp upgrade may fix it; the
   *  same binary on the same URL will not. */
  | 'extractor_stale'
  /** The host wants a session we do not have. */
  | 'auth_required'
  /** Deleted, private, or otherwise no longer there. Never retry. */
  | 'source_gone'
  /** The video was read and genuinely has no speech in it. NOT a fetch failure
   *  — see the note above. */
  | 'no_speech'
  /** Something missing on our own worker. Nothing about the reference is wrong. */
  | 'our_config'
  /** Unmatched. Deliberately not guessed: an unclassified reason that silently
   *  became `extractor_stale` would send someone upgrading yt-dlp to fix an IP
   *  block. Left visible so the gap is findable. */
  | 'unknown'

/** Did this job produce a usable assessment? */
export type ReferenceOutcome = 'assessed' | 'unusable'

/** ⚠️ ORDER IS LOAD-BEARING. `Your IP address is blocked` arrives INSIDE a
 *  yt-dlp error, and 71 of the 92 non-IP yt-dlp failures are also TikTok — so a
 *  broad `[TikTok]` test placed first would swallow the IP blocks and the auth
 *  failures alike and report one useless bucket. Most specific first. */
export function classifyReferenceFailure(message: string | null | undefined): ReferenceFailureClass {
  const m = (message ?? '').toLowerCase()
  if (m === '') return 'unknown'
  if (m.includes('your ip address is blocked')) return 'blocked_by_host'
  if (m.includes('no captions we can read') || m.includes('no speech')) return 'no_speech'
  if (m.includes('unavailable: no mo') || m.includes('python3 exited')) return 'our_config'
  if (m.includes('login') || m.includes('cookies') || m.includes('sign in')) return 'auth_required'
  if (m.includes('removed') || m.includes('private') || m.includes('not available')) return 'source_gone'
  if (m.includes('unable to extract') || m.includes('unexpected') || m.includes('no audio url found')) return 'extractor_stale'
  if (m.includes('yt-dlp')) return 'extractor_stale'
  return 'unknown'
}

/** Whether a class means OUR fetching is broken, as opposed to the reference
 *  being genuinely unusable. This is the number to watch before spending a
 *  backlog: `no_speech` and `source_gone` are properties of the video and no
 *  amount of fixing changes them. */
export function isFetchDefect(cls: ReferenceFailureClass): boolean {
  return cls === 'blocked_by_host' || cls === 'extractor_stale'
    || cls === 'auth_required' || cls === 'our_config'
}
