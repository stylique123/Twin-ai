// WHICH QUOTA, AND WHEN MAY WE ASK AGAIN.
//
// ⚠️ 131 JOBS FAILED ON 2026-08-20 AND THE RECORD CANNOT SAY WHY. `geminiJson`
// threw `Gemini ${status}: ${body.slice(0, 200)}`, and 200 characters of
// Google's error body is exactly the part that reads the same for every quota
// class: "You exceeded your current quota, please check your plan and billing
// details." The part that DISTINGUISHES them — `error.status`, and
// `error.details[]` carrying QuotaFailure.quotaId / quotaMetric / quotaValue and
// RetryInfo.retryDelay — all sits past character 200. Then `redact()` replaced
// the docs URL with `[url]`. A remarkably efficient way to retain the error
// while discarding the answer.
//
// ⚖️ AND THE FOUR CASES WANT OPPOSITE ACTIONS:
//
//   requests-per-day exhausted  → stop; the day is over. Retrying burns
//                                 acquisition for a refusal that cannot change
//                                 until midnight Pacific.
//   per-minute / per-token      → wait seconds and continue.
//   spend-rate throttle         → slow down; the window is short but the fix is
//                                 rate, not time.
//   billing / tier ceiling      → waiting changes nothing; a human decides.
//
// Guessing between them is a spending decision made by coin flip. So this module
// reads Google's STRUCTURED metadata and, when the metadata is absent, says
// `unknown` rather than inventing a class from prose.
//
// ⚠️ WHAT IS DELIBERATELY NOT DONE HERE: inferring "daily" or "billing" from the
// human-readable message. That string is written for humans, changes without
// notice, and already fooled us once by being identical across classes. If
// Google does not name the quota in `details[]`, the honest answer is that we do
// not know — and `unknown` is wired to the same conservative action as daily.
//
// ⚠️ AND THE WHOLE BODY IS NOT PERSISTED. A generative API's error body can echo
// request content; keeping it forever would put transcript fragments in an error
// column. Only the named fields below are extracted.

// ⚠️ RETRYINFO IS ADVISORY. QUOTA CLASS IS AUTHORITATIVE FOR POLICY.
//
// This is the rule most likely to be "simplified" back out by a future reader,
// because "Google told us when to retry, so retry then" is an obviously
// reasonable sentence. It is also wrong, and we have the evidence: Google
// attaches `RetryInfo { retryDelay: "43s" }` to a per-DAY exhaustion. The hint
// says when the API will next ACCEPT a request; it does not say the exhausted
// allowance will have returned. Obeying it re-downloads the video, re-runs
// whisper, and is refused again 43 seconds later — repeatedly.
//
// ⚖️ SO THE PRECEDENCE IS FIXED AND TESTED: `planRetry` reads the CLASS first
// and only consults `retryDelayMs` once the class is known not to be daily. If
// you are here to collapse those two branches into one, the test
// "does not retry a daily quota, even when RetryInfo suggests seconds" is the
// thing you will have to delete, and it is named that way on purpose.

/** Exactly the fields a retry or a spend decision needs. */
export interface GeminiQuotaError {
  httpStatus: number
  /** Google's canonical code, e.g. RESOURCE_EXHAUSTED. */
  status?: string
  /** Human-readable, kept SHORT and never parsed for meaning. */
  message?: string
  /** e.g. GenerateRequestsPerDayPerProjectPerModel */
  quotaId?: string
  /** e.g. generativelanguage.googleapis.com/generate_content_free_tier_requests */
  quotaMetric?: string
  quotaValue?: string
  /** Parsed from RetryInfo.retryDelay ("43s", "1.5s") into milliseconds. */
  retryDelayMs?: number
  /** The @type of every detail Google sent, so an unfamiliar shape is visible
   *  rather than silently ignored. */
  rawDetailsType?: string[]
}

/**
 * ⚠️ `unknown` IS A REAL MEMBER AND THE DEFAULT, not a gap. It means Google
 * refused us without naming a quota, and it is wired to the same conservative
 * action as `daily`: stop asking. An unnamed refusal is not evidence that
 * waiting sixty seconds will help.
 */
export const QUOTA_CLASSES = ['daily', 'short_window', 'billing', 'unknown'] as const
export type QuotaClass = (typeof QUOTA_CLASSES)[number]

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** `"43s"` / `"1.5s"` / `"0s"` → milliseconds. Anything else → undefined.
 *
 *  ⚖️ `0s` IS A REAL ANSWER MEANING "RETRY NOW", and it must not be confused
 *  with absence — which is why this returns `undefined` rather than 0 when the
 *  field is missing or malformed. */
export function parseRetryDelayMs(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined
  const m = /^(\d+(?:\.\d+)?)s$/.exec(raw.trim())
  if (!m) return undefined
  const secs = Number(m[1])
  if (!Number.isFinite(secs) || secs < 0) return undefined
  // Bounded: a delay longer than a day is a daily quota wearing a RetryInfo, and
  // sleeping a worker for it would wedge the queue rather than pause it.
  return Math.min(Math.round(secs * 1000), 24 * 60 * 60 * 1000)
}

/**
 * Read one Gemini error body.
 *
 * ⚠️ NEVER THROWS. This runs on the failure path; a parser that can itself fail
 * would replace a diagnosable refusal with an undiagnosable one. A body that is
 * not JSON, or not shaped like Google's error envelope, yields an object
 * carrying only `httpStatus` — which is honest.
 */
export function parseGeminiError(httpStatus: number, body: string): GeminiQuotaError {
  const out: GeminiQuotaError = { httpStatus }
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { return out }
  const err = isRecord(parsed) ? parsed.error : undefined
  if (!isRecord(err)) return out

  if (typeof err.status === 'string') out.status = err.status
  // ⚖️ TRUNCATED HARD. The message is for a human reading a row, not for logic,
  // and an unbounded string from an API is how a diagnostic column becomes a
  // free-text channel.
  if (typeof err.message === 'string') out.message = err.message.slice(0, 300)

  const details = Array.isArray(err.details) ? err.details : []
  const types: string[] = []
  for (const d of details) {
    if (!isRecord(d)) continue
    const t = typeof d['@type'] === 'string' ? (d['@type'] as string) : ''
    if (t) types.push(t)

    if (t.endsWith('QuotaFailure')) {
      const violations = Array.isArray(d.violations) ? d.violations : []
      // ⚠️ THE FIRST VIOLATION THAT NAMES A QUOTA WINS, and the rest are not
      // merged. Google can report several; inventing a combined identity from
      // them would produce a quotaId that exists nowhere in their console, which
      // is worse than reporting one real one.
      for (const v of violations) {
        if (!isRecord(v)) continue
        const id = typeof v.quotaId === 'string' ? v.quotaId : ''
        const metric = typeof v.quotaMetric === 'string' ? v.quotaMetric : ''
        if (!id && !metric) continue
        if (id) out.quotaId = id
        if (metric) out.quotaMetric = metric
        if (typeof v.quotaValue === 'string') out.quotaValue = v.quotaValue
        else if (typeof v.quotaValue === 'number') out.quotaValue = String(v.quotaValue)
        break
      }
    }

    if (t.endsWith('RetryInfo')) {
      const ms = parseRetryDelayMs(d.retryDelay)
      if (ms !== undefined) out.retryDelayMs = ms
    }
  }
  if (types.length) out.rawDetailsType = types
  return out
}

/**
 * Which quota, from the structured identity only.
 *
 * ⚠️ MATCHED ON `quotaId` / `quotaMetric`, NEVER ON `message`. Google's quota ids
 * name their own window — `...PerDay...`, `...PerMinute...` — which is a fact
 * about the quota rather than a sentence about it.
 *
 * ⚖️ AND BILLING IS NOT INFERRED. There is no reliable structured marker that
 * separates "your tier caps you here" from "you used today's allowance", so this
 * never returns `billing` from a guess. That classification comes from a human
 * reading the console, and until then `unknown` is the honest answer — wired,
 * like `daily`, to stop asking.
 */
export function classifyQuota(e: GeminiQuotaError): QuotaClass {
  const id = `${e.quotaId ?? ''} ${e.quotaMetric ?? ''}`.toLowerCase()
  if (id.trim() !== '') {
    if (id.includes('perday') || id.includes('per_day') || id.includes('daily')) return 'daily'
    if (id.includes('perminute') || id.includes('per_minute')
      || id.includes('persecond') || id.includes('per_second')) return 'short_window'
  }
  return 'unknown'
}

export interface RetryPlan {
  retry: boolean
  delayMs: number
  /** Why, in a form a log line can carry unchanged. */
  reason: string
}

/** How long a short-window wait may be before it stops being a wait and starts
 *  being a wedged worker. */
export const MAX_INLINE_RETRY_MS = 90_000

/**
 * What to do about one refusal.
 *
 * ⚠️ GOOGLE'S OWN `retryDelay` OUTRANKS OUR ARITHMETIC. If the API says 43
 * seconds, guessing 1s then 4s then giving up is both ruder and less effective
 * than doing as we are told.
 *
 * ⚖️ AND A DAILY QUOTA IS NOT RETRIED AT ALL. Five local attempts against a
 * day-long refusal is not resilience — in this pipeline each attempt re-downloads
 * the video and re-runs whisper, so it is a way of spending acquisition to
 * confirm a wall we already found.
 */
export function planRetry(e: GeminiQuotaError, attempt: number): RetryPlan {
  // ⚠️ CLASS FIRST, HINT SECOND — see the header. Reordering these two blocks is
  // the specific regression this file exists to prevent.
  const cls = classifyQuota(e)

  if (cls === 'daily') {
    return { retry: false, delayMs: 0, reason: `daily quota exhausted (${e.quotaId ?? 'unnamed'}) — no retry until it resets` }
  }

  // ⚖️ THE API'S OWN INSTRUCTION, WHEN IT GIVES ONE — but only if it fits inside
  // a job. A RetryInfo of half an hour is a daily quota by another name.
  if (e.retryDelayMs !== undefined) {
    if (e.retryDelayMs <= MAX_INLINE_RETRY_MS) {
      return { retry: attempt < 2, delayMs: e.retryDelayMs, reason: `RetryInfo says ${e.retryDelayMs}ms` }
    }
    return { retry: false, delayMs: 0, reason: `RetryInfo asks for ${e.retryDelayMs}ms — too long to hold a job open` }
  }

  if (cls === 'short_window') {
    const delay = Math.min(MAX_INLINE_RETRY_MS, 5_000 * (attempt + 1))
    return { retry: attempt < 2, delayMs: delay, reason: `short-window quota (${e.quotaId ?? 'unnamed'})` }
  }

  // ⚠️ UNKNOWN DOES NOT GRADUATE TO OPTIMISM. We were refused and not told why;
  // hammering is the one response that cannot be justified by the evidence.
  return { retry: false, delayMs: 0, reason: 'quota refusal with no named quota — not retried, evidence preserved' }
}

/** One line for `jobs.error`, built to survive truncation: the discriminating
 *  fields come FIRST, because the last thing this project learned is that a
 *  200-character slice keeps whatever is at the front. */
export function quotaSummary(e: GeminiQuotaError): string {
  const cls = classifyQuota(e)
  const bits = [
    `Gemini ${e.httpStatus}`,
    `class=${cls}`,
    e.status ? `status=${e.status}` : '',
    e.quotaId ? `quotaId=${e.quotaId}` : '',
    e.quotaMetric ? `metric=${e.quotaMetric}` : '',
    e.quotaValue ? `limit=${e.quotaValue}` : '',
    e.retryDelayMs !== undefined ? `retryAfterMs=${e.retryDelayMs}` : '',
    e.rawDetailsType?.length ? `details=${e.rawDetailsType.join('|')}` : '',
  ].filter(Boolean)
  return bits.join(' ')
}
