// WHAT ACTUALLY FAILED, IN THE BROWSER — #67's taxonomy, client side.
//
// ⚠️ THE OWNER WAS STRANDED AND NOBODY COULD SAY WHY. They finished 103 labels,
// pressed Finish & Lock from a phone, and got "Failed to send a request to the
// Edge Function". Then a refresh showed the same. From the outside that string
// is compatible with: the server refused, the server is down, the session
// expired, the phone lost signal, or the request was aborted. Those are five
// different problems with five different answers, and the page said none of it.
//
// ⚖️ THE ONE THING THAT STRING DOES SETTLE. supabase-js raises it ONLY as a
// FunctionsFetchError, when the underlying fetch itself rejects -- so there was
// NO HTTP RESPONSE. It is not a refusal. refusalText() already reads the body
// whenever a Response exists, so a server that answered would have said its own
// words instead. Distinguishing "never landed" from "landed and said no" is the
// same distinction #478 had to make for the staging harness, and for the same
// reason: an empty transport error must never be reported as the property under
// test having failed.
//
// ⚠️ ABSENT IS NOT ZERO. `status` is null when no response arrived. It must
// never be 0, and a reader must never treat a missing status as a real one.

export type PilotFailureKind =
  /** The request never got an HTTP response. Nothing about the server is known. */
  | 'TRANSPORT_FAILED'
  /** The server answered, and said no. Its own words are in `message`. */
  | 'REFUSED'
  /** The server answered 401/403. The session, not the request, is the problem. */
  | 'UNAUTHENTICATED'

export interface PilotFailure {
  kind: PilotFailureKind
  /** What to show a person. The server's words when there are any. */
  message: string
  /** HTTP status, or NULL when no response arrived. Never 0. */
  status: number | null
  /** Whether an HTTP response was actually received. The load-bearing fact. */
  hadHttpResponse: boolean
  /** Which call this was — packet, label, event or finish. */
  action: string
  /** Whether retrying the same request is a sane next move. */
  retryable: boolean
}

/**
 * Classify a failed pilot-review call.
 *
 * `response` is the Response supabase-js hangs off `error.context` for a
 * non-2xx; it is absent for a transport failure. `message` is what
 * refusalText() already resolved -- the server's own words when it spoke.
 */
export function classifyPilotFailure(
  action: string,
  message: string,
  response: { status?: unknown } | null | undefined,
): PilotFailure {
  // ⚠️ THE NULL CHECK PRECEDES THE COERCION. Number(null) is 0 and
  // Number.isFinite(0) is true, so testing finiteness first would turn an
  // absent status into a confident 0.
  const raw = response?.status
  const status = raw === null || raw === undefined || typeof raw !== 'number' || !Number.isFinite(raw)
    ? null
    : raw
  const hadHttpResponse = status !== null

  if (!hadHttpResponse) {
    return {
      kind: 'TRANSPORT_FAILED',
      message,
      status: null,
      hadHttpResponse: false,
      action,
      // Nothing is known to be wrong with the request itself.
      retryable: true,
    }
  }
  if (status === 401 || status === 403) {
    return {
      kind: 'UNAUTHENTICATED', message, status, hadHttpResponse: true, action,
      // Pressing again with the same dead session just fails again.
      retryable: false,
    }
  }
  return {
    kind: 'REFUSED', message, status, hadHttpResponse: true, action,
    // A 5xx may pass on a second try; a 4xx refusal is a decision, not a blip.
    retryable: status >= 500,
  }
}

/**
 * One line a person can read, and screenshot.
 *
 * ⚠️ IT MUST SAY WHETHER A RESPONSE ARRIVED. That is the fact that separates
 * "the service refused you" from "the message never got there", and it is the
 * fact the owner needed and did not have.
 */
export function describePilotFailure(f: PilotFailure): string {
  if (f.kind === 'TRANSPORT_FAILED') {
    return `The request never reached the server — no reply came back at all `
      + `(step: ${f.action}). Your saved work is not affected.`
  }
  if (f.kind === 'UNAUTHENTICATED') {
    return `The server replied ${f.status}: you are signed out, or not an admin `
      + `on this account (step: ${f.action}). Sign in again.`
  }
  return `The server replied ${f.status} (step: ${f.action}): ${f.message}`
}
