// A DECISION MADE AGAINST PROSE IS A DECISION THAT CHANGES WHEN SOMEBODY EDITS
// AN ERROR MESSAGE.
//
// ⚠️ THIS IS ALREADY BITING. `referenceLibraryHealth.classifyReference` sorts the
// library by matching substrings of human sentences, and says so in its own
// comments — "fragile against rewording", with `failure_code` named as the right
// fix and deferred. Today the routing ladder makes it load-bearing: whether a
// video graduates to PAID residential traffic must not depend on yt-dlp's
// wording, because the day upstream rewrites "Unexpected response from webpage
// request" we either start paying for failures that were never about IP, or stop
// paying for the ones that are.
//
// ⚖️ SO: A CODE FOR THE DECISION, THE RAW TEXT KEPT BESIDE IT. The code is what
// routing reads; `raw_error` is what a human reads when the code turns out to be
// wrong. Neither replaces the other.
//
// ⚠️ AND ONLY *SOME* FAILURES MAY COST MONEY. A deleted video, a malformed URL
// and a silent clip are not access problems, and routing them through a paid
// residential proxy buys nothing and bills for it. `RETRYABLE_VIA_PROXY` is the
// allowlist, and it is deliberately small: a failure has to be positively
// identified as access/challenge/reputation to graduate.

export const DOWNLOAD_FAILURES = [
  /** TikTok served a page and yt-dlp's JS challenge solver found no challenge
   *  blob in it — `ExtractorError('Unexpected response from webpage request')`
   *  at extractor/tiktok.py:231. An anti-bot interstitial, not a parse bug. */
  'TIKTOK_CHALLENGE_FAILED',
  /** Positively identified block: 403/429/captcha/"blocked" from the host. */
  'TIKTOK_IP_BLOCKED',
  /** ⚠️ THE 2026-08 BUG, KEPT AS A CODE SO IT CANNOT RECUR SILENTLY. yt-dlp
   *  refused every impersonation target — curl-cffi installed, importable, and
   *  outside yt-dlp's supported window. The build assertion now fails on this,
   *  but a running container predating the assertion can still report it. */
  'IMPERSONATION_UNAVAILABLE',
  /** The URL resolved and there is no media behind it. */
  'MEDIA_NOT_FOUND',
  /** Private, deleted, region-locked, login-walled. Nothing we buy changes it. */
  'PRIVATE_OR_UNAVAILABLE',
  /** We ran out of time. Says nothing about whether the host would have served
   *  us — which is exactly why it is not pooled with the blocks. */
  'DOWNLOAD_TIMEOUT',
  /** ⚖️ NOT A DUMPING GROUND, AND NOT A LICENCE TO SPEND. Unrecognised means
   *  unrecognised; it does not graduate to paid routing, because "we do not know
   *  why this failed" is not evidence that an IP would fix it. */
  'UNKNOWN_DOWNLOAD_FAILURE',
] as const
export type DownloadFailure = (typeof DOWNLOAD_FAILURES)[number]

/**
 * ⚠️ WHICH FAILURES MAY GRADUATE TO PAID ROUTING — the whole reason codes exist.
 *
 * ⚖️ TIMEOUTS ARE OUT, DELIBERATELY. A timeout is ambiguous between a slow host,
 * a slow box and a silent drop, and routing every one of them through metered
 * residential egress would bill us for our own CPU contention. If timeouts turn
 * out to correlate with blocking, the measurement will show it and the set can
 * change with a reason attached.
 */
export const RETRYABLE_VIA_PROXY: ReadonlySet<DownloadFailure> = new Set<DownloadFailure>([
  'TIKTOK_CHALLENGE_FAILED',
  'TIKTOK_IP_BLOCKED',
])

/**
 * Classify one raw downloader error.
 *
 * ⚠️ ORDER MATTERS AND THE SPECIFIC CASES COME FIRST. "login required" contains
 * neither "403" nor "blocked", but a login wall is a property of the video and a
 * 403 is a property of us, and paying a residential proxy to re-ask for a
 * private video is exactly the waste the allowlist exists to prevent.
 */
export function classifyDownloadFailure(raw: unknown): DownloadFailure {
  const s = (typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : '').toLowerCase()
  if (s.trim() === '') return 'UNKNOWN_DOWNLOAD_FAILURE'

  // The exact string yt-dlp raises when the challenge blob is missing.
  if (s.includes('unexpected response from webpage request')
    || s.includes('unable to extract challenge data')) return 'TIKTOK_CHALLENGE_FAILED'

  // ⚖️ CHECKED BEFORE THE BLOCK CODES. A login wall is about the video.
  if (s.includes('login required') || s.includes('requiring login')
    || s.includes('private') || s.includes('this video is unavailable')
    || s.includes('video has been removed') || s.includes('account is private')
    || s.includes('not available in your country')) return 'PRIVATE_OR_UNAVAILABLE'

  if (s.includes('impersonate target is available')
    || s.includes('impersonation is not supported')
    || s.includes('only curl_cffi versions')) return 'IMPERSONATION_UNAVAILABLE'

  // ⚠️ CHECKED BEFORE `DOWNLOAD_TIMEOUT`, AND THAT ORDER IS A SPENDING DECISION.
  // "timed out ... 403" carries one ambiguous clue and one positive one: a 403 is
  // the host telling us no, a timeout could be our own box. The positive evidence
  // wins, so the pair graduates to paid routing while a bare timeout does not.
  // ⚠️ MATCHED AS A STANDALONE NUMBER, NOT AS "http error 403". A precedence
  // test caught this: the real error from a blocking proxy reads "response 403",
  // which the narrower pattern missed, so a live block was classified
  // MEDIA_NOT_FOUND — a code that is deliberately NOT payable. A genuine IP block
  // would then never have graduated to the proxy, which is the one thing the
  // ladder exists to do. Word boundaries keep it off the digits of a video id.
  if (/\b(403|429)\b/.test(s)
    || s.includes('rate-limit') || s.includes('rate limit')
    || s.includes('captcha') || s.includes('blocked')
    || s.includes('too many requests')) return 'TIKTOK_IP_BLOCKED'

  if (s.includes('timed out') || s.includes('timeout')) return 'DOWNLOAD_TIMEOUT'

  if (s.includes('unable to extract aweme detail')
    || s.includes('no video formats found')
    || s.includes('unable to download webpage')
    || /\b404\b/.test(s)) return 'MEDIA_NOT_FOUND'

  return 'UNKNOWN_DOWNLOAD_FAILURE'
}

// WHO CLASSIFIED THIS, RECORDED SO A MEASUREMENT CANNOT ACQUIRE A FICTIONAL
// CHILDHOOD.
//
// ⚠️ THE FIRST CANARY ROWS WILL CARRY CODES THE WORKER DID NOT EMIT. The image
// running them predates this file, so their codes are derived by hand from
// `raw_error` after the fact. That is fine — and backfilling them as though the
// worker produced them would quietly convert a manual reading into apparent
// instrument data, which is the kind of tidying that makes a dataset look more
// trustworthy than it is.
//
// ⚖️ SO THE PROVENANCE TRAVELS WITH THE CODE. `offline` rows are still usable
// evidence; they are simply evidence of a different kind, and any analysis that
// cares about the difference can now ask.
export const CLASSIFIER_SOURCES = ['worker', 'offline'] as const
export type ClassifierSource = (typeof CLASSIFIER_SOURCES)[number]

/** Does this failure justify spending residential egress on a retry? */
export function mayRetryViaProxy(code: DownloadFailure): boolean {
  return RETRYABLE_VIA_PROXY.has(code)
}
