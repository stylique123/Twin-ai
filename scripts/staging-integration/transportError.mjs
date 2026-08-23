// WHAT A FAILED READ ACTUALLY TELLS YOU, AND WHAT IT DOES NOT.
//
// ⚠️ THREE MATRIX RUNS DIED ON ONE LINE WITH NOTHING AFTER THE COLON:
//
//     K: non-sanctioned analysis rows is unreadable:
//
// The cause is structural, in postgrest-js PostgrestBuilder.ts:
//
//     const body = await res.text()
//     try { error = JSON.parse(body) }
//     catch { error = { message: body } }    // body '' -> message ''
//
// A non-2xx carrying an EMPTY BODY yields message ''. Count assertions use
// `head: true`, so PostgREST returns no body by design and the message is
// ALWAYS empty on an error status. The harness printed only that message, so
// it was blind by construction rather than by accident.
//
// ⚖️ THE STATUS WAS AVAILABLE THE WHOLE TIME. postgrest-js returns
// { data, error, count, status, statusText }; the caller destructured two.
//
// ⚠️ AND THE CENTRAL DISTINCTION, WHICH IS THE POINT OF THE #67 TAXONOMY:
// an empty body means THE REQUEST DID NOT COMPLETE. It is not evidence that
// the property under test failed. Reporting it as a failed assertion invites
// exactly the wrong repair -- widening a tolerance to make a network fault
// stop showing up.

/** The taxonomy names. TRANSPORT_FAILED and ASSERTION_FAILED are not degrees
 *  of the same thing; they have opposite repairs. */
export const TRANSPORT_FAILED = 'TRANSPORT_FAILED'
export const ASSERTION_UNREADABLE = 'ASSERTION_UNREADABLE'

/**
 * Classify a failed read and say everything that survived the empty body.
 *
 * ⚠️ EMPTINESS IS DECIDED ON THE MESSAGE, NOT ON THE STATUS. A 500 that DOES
 * carry a PostgREST payload is readable and must be diagnosed on its own
 * evidence; a 200 could never reach here. Keying off the status code instead
 * would re-introduce guessing at exactly the point this exists to stop it.
 */
export function describeReadFailure({ what, error, status, statusText, elapsedMs }) {
  const said = String(error?.message ?? '')
  const bodyWasEmpty = said === ''
  const kind = bodyWasEmpty ? TRANSPORT_FAILED : ASSERTION_UNREADABLE
  const where = `HTTP ${status ?? 'unknown'} ${statusText || '(no status text)'}`
  const ms = Number.isFinite(elapsedMs) ? `${elapsedMs}ms` : 'unknown elapsed'
  const body = bodyWasEmpty ? 'body WAS EMPTY (0 bytes)' : `body ${said.length} bytes`
  const tail = bodyWasEmpty
    ? '. An empty body means the request did not complete; it is NOT evidence that the property '
      + 'under test failed. Do not merge around this and do not widen a tolerance.'
    : `: ${said}`
  return { kind, bodyWasEmpty, text: `${what} is unreadable [${kind}] — ${where}, ${ms}, ${body}${tail}` }
}
