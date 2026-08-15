// WHEN SCRIPT GENERATION FAILS, NOTHING IS WRITTEN DOWN. THIS IS THE CAUSE.
//
// ── WHAT IS ACTUALLY TRUE TODAY ───────────────────────────────────────────
//
// `generate-blueprint` inserts the `generations` row only AFTER the model call
// succeeds. On a timeout, a MAX_TOKENS truncation, invalid JSON or a non-2xx it
// refunds the credits, writes a `console.error`, and returns "Generation
// failed." No row is written anywhere, and edge logs expire within days.
//
// ⚠️ SO THREE QUESTIONS ARE UNANSWERABLE FROM THE DATABASE. How often does
// script generation fail? What does it fail on? And how often are we silently
// serving the SECOND-choice model, because the attempt ladder fell through to
// the fast fallback and nobody counted it?
//
// ⚖️ THE ONE DURABLE RECORD TODAY IS AN `ops_events` ROW WRITTEN WHEN THE REFUND
// FAILS. We durably record the failure of the failure handler, and not the
// failure. That sentence is the whole justification for this module.
//
// ── WHY A CODE AND A CAUSE, NOT A CODE ────────────────────────────────────
//
// The editor path already proves the shape works — `edit_director_calls` is a
// real state machine and it is what answered "how often has the director call
// failed, ever" with three, rather than a guess. Its remaining defect is the one
// deliberately not repeated here: it stores a code and drops the CAUSE, so a 429
// (our quota), a 503 (Google's problem) and a 400 (our malformed request) are
// indistinguishable in the record — and they call for three different responses.

/** Why an attempt did not produce a usable blueprint.
 *
 *  ⚖️ EVERY MEMBER MAPS TO A DIFFERENT ACTION, which is the test for whether a
 *  code deserves to exist. Quota means buy more or slow down; a 5xx means wait;
 *  a 4xx means our request is wrong; truncation means the output cap is too low
 *  for the prompt; incomplete means the model obeyed us and still dropped a
 *  required object. Collapsing any two of those loses the response. */
export type ScriptFailureCode =
  | 'timeout'
  | 'provider_quota'
  | 'provider_unavailable'
  | 'provider_rejected'
  | 'truncated'
  | 'empty_response'
  | 'invalid_json'
  | 'incomplete_blueprint'
  | 'unknown'

export interface ScriptFailure {
  code: ScriptFailureCode
  /** ⚠️ THE PROVIDER'S OWN WORDS, TRUNCATED, NEVER SUMMARISED. A code without a
   *  cause is a code that sends you to the logs, and the logs expire. */
  detail: string
}

/** How much of the provider's message is kept. Long enough for Google's error
 *  body to name the quota or the offending field; short enough that a runaway
 *  response cannot bloat the table. */
export const DETAIL_MAX = 300

/** Read a thrown error from the model call into a code and a cause.
 *
 *  ⚠️ IT PARSES THE MESSAGE, WHICH IS A COUPLING AND IS ADMITTED AS ONE. The
 *  provider layer throws `Gemini 429: …`, `Response truncated (finishReason=…)`
 *  and `Model returned invalid JSON` as free text. Restructuring that layer to
 *  throw typed errors touches the live generation path; reading it here does
 *  not, and the strings are pinned by tests that fail the moment they drift.
 *
 *  ⚖️ AND `unknown` IS A REAL ANSWER, NOT A FALLBACK TO GUESSING. An unrecognised
 *  failure keeps its full message and is counted as unknown, so a class of
 *  failure we have never seen shows up as a rising count rather than being
 *  silently filed under the nearest familiar code. */
export function classifyModelFailure(err: unknown): ScriptFailure {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const detail = raw.slice(0, DETAIL_MAX)
  const name = err instanceof Error ? err.name : ''

  // An aborted fetch is the timeout the ladder imposes, not the provider's.
  if (name === 'AbortError' || /\baborted\b|\btimed? ?out\b/i.test(raw)) {
    return { code: 'timeout', detail }
  }
  const status = /Gemini (\d{3})/.exec(raw)?.[1]
  if (status) {
    const n = Number(status)
    // ⚖️ 429 IS SPLIT OUT FROM THE OTHER 4xx ON PURPOSE. It is the only client
    // error that is not a bug in our request, and the only one where retrying
    // later is the correct response.
    if (n === 429) return { code: 'provider_quota', detail }
    if (n >= 500) return { code: 'provider_unavailable', detail }
    if (n >= 400) return { code: 'provider_rejected', detail }
  }
  if (/MAX_TOKENS|truncated/i.test(raw)) return { code: 'truncated', detail }
  if (/Empty response/i.test(raw)) return { code: 'empty_response', detail }
  if (/invalid JSON/i.test(raw)) return { code: 'invalid_json', detail }
  return { code: 'unknown', detail }
}

/** What an attempt ended as.
 *
 *  ⚠️ `incomplete` IS NOT A FAILURE AND NOT A SUCCESS. The ladder accepts a
 *  parseable-but-incomplete blueprint as a last resort — the creator gets their
 *  script and hooks, and the plan screen asks them to regenerate for the title.
 *  Recording that as success would hide a real quality event; recording it as
 *  failure would claim an outage that did not happen. */
export type ScriptAttemptOutcome = 'started' | 'succeeded' | 'incomplete' | 'failed'

/** Did the ladder end up serving the creator from a model that was not our first
 *  choice? The question C8 names and nothing can currently answer.
 *
 *  ⚖️ IT READS THE ATTEMPT INDEX, NOT THE MODEL NAME. Primary and fallback are
 *  both configurable and are frequently the SAME model with different budgets,
 *  so comparing names would report "no fallback" on the exact configuration that
 *  ships today. What matters is that the first attempt did not carry it. */
export function servedFromFallback(
  attempts: readonly { attemptIndex: number; outcome: ScriptAttemptOutcome }[],
): boolean {
  const served = attempts.find((a) => a.outcome === 'succeeded' || a.outcome === 'incomplete')
  return served ? served.attemptIndex > 0 : false
}

/** A one-line tally over stored attempts, so the three questions have answers.
 *  Exists because a table with no reader is the defect this record exists to fix. */
export function attemptSummary(
  attempts: readonly { attemptIndex: number; outcome: ScriptAttemptOutcome; failureCode?: string | null }[],
): { runs: number; failed: number; fellBack: number; byCode: Record<string, number> } {
  const byCode: Record<string, number> = {}
  let failed = 0
  for (const a of attempts) {
    if (a.outcome !== 'failed') continue
    failed++
    const c = a.failureCode ?? 'unknown'
    byCode[c] = (byCode[c] ?? 0) + 1
  }
  return {
    // ⚠️ A RUN IS AN ATTEMPT LADDER, NOT AN ATTEMPT. Counting attempts as runs
    // would make a two-attempt recovery look like two generations, and inflate
    // every rate computed against it.
    runs: attempts.filter((a) => a.attemptIndex === 0).length,
    failed,
    fellBack: attempts.filter((a) => a.attemptIndex > 0
      && (a.outcome === 'succeeded' || a.outcome === 'incomplete')).length,
    byCode,
  }
}
