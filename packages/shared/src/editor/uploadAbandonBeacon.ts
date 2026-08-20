// THE REPORT THAT HAS TO SURVIVE THE PAGE IT IS REPORTING ABOUT.
//
// ⚠️ `creator_abandoned` HAS BEEN A VALUE NO ROW COULD HOLD. `uploadForensics`
// has classified it since #414 and `ATTEMPT_OUTCOMES` has accepted it since
// #414, but nothing ever sent one — because the only moment it is true is the
// moment the page is going away, and an ordinary request is cancelled with the
// page. A vocabulary entry with no emitter is the same failure this repo keeps
// repeating in a smaller costume: `scanTargetConfirmation`, the caption
// extractor and `csEntities` each shipped complete, tested and unreachable.
//
// ⚖️ `fetch(keepalive: true)` RATHER THAN `navigator.sendBeacon`, AND THE REASON
// IS AUTHENTICATION. `sendBeacon` cannot set headers, so the only way to
// authenticate it is to put the access token in the URL — where it lands in
// server logs, proxy logs and browser history. A JWT in a query string is a
// credential leak with a long half-life, and the convenience is not worth it.
// `fetch` with `keepalive` sends real headers and survives unload, which is
// exactly the pair of properties this needs.
//
// ⚠️ AND THE BIAS IS THE WHOLE POINT. A report that lands only when the tab
// happens to close slowly would produce a dataset that systematically
// under-counts fast exits — worse than no dataset, because it looks like
// evidence. `pagehide` (not `beforeunload`, not `unload`) is the event that
// fires reliably on mobile Safari's back-forward cache and on tab close alike,
// and `keepalive` is what stops the browser cancelling the request.

/** ⚠️ 64KB IS THE SPEC'D `keepalive` BUDGET ACROSS ALL IN-FLIGHT REQUESTS. This
 *  body is a few hundred bytes; the number is here so a future caller that wants
 *  to attach anything larger has to notice the ceiling first. */
export const KEEPALIVE_BUDGET_BYTES = 64 * 1024

export interface BeaconTarget {
  /** Full URL of the source-asset function. */
  url: string
  /** The signed-in user's access token. Sent as a header, never in the URL. */
  accessToken: string
  /** The project's publishable key, which the gateway requires alongside it. */
  apiKey: string
}

/**
 * Send one attempt report in a way that outlives the page.
 *
 * ⚖️ RETURNS WHETHER IT WAS DISPATCHED, NOT WHETHER IT ARRIVED. Nothing can know
 * the latter from inside a page that is closing, and pretending otherwise would
 * put a `sent: true` in a log that means less than it says.
 */
export function sendAbandonBeacon(target: BeaconTarget, body: Record<string, unknown>): boolean {
  try {
    if (typeof fetch !== 'function') return false
    const payload = JSON.stringify(body)
    // ⚠️ REFUSE RATHER THAN TRUNCATE. A body cut in half is a malformed report
    // the edge will 400, which spends the one request this creator will ever
    // send on nothing.
    if (payload.length > KEEPALIVE_BUDGET_BYTES) return false
    void fetch(target.url, {
      method: 'POST',
      keepalive: true,
      headers: {
        'content-type': 'application/json',
        // The gateway wants both: the anon key identifies the project, the
        // bearer identifies the creator. The edge function's own auth check is
        // what actually gates the write — this is not a security boundary, it
        // is the shape the platform requires.
        apikey: target.apiKey,
        authorization: `Bearer ${target.accessToken}`,
      },
      body: payload,
      // ⚖️ NOT `credentials: 'include'` — nothing here depends on a cookie, and
      // asking for one on an unload request invites a preflight that will not
      // complete.
    }).catch(() => {})
    return true
  } catch {
    // ⚠️ NEVER THROWS ON THE WAY OUT. This runs inside a `pagehide` handler; an
    // exception here would be thrown into a page that is already leaving, where
    // nothing can catch it and nobody would see it.
    return false
  }
}

/**
 * Watch one in-flight upload and report it abandoned if the page goes away
 * first.
 *
 * ⚠️ THE RETURNED FUNCTION MUST BE CALLED ON EVERY TERMINAL PATH — success,
 * failure, and cancel alike. An upload that finished and did not disarm its
 * watcher reports `abandoned` on the next navigation, which would put a
 * fabricated abandonment beside a real success. That is worse than the silence
 * this replaces: it is a confident wrong answer.
 *
 * ⚖️ ONE SHOT. `pagehide` can fire more than once (bfcache restore, then a real
 * close), and two reports for one attempt would double-count the rarest event
 * in the dataset.
 */
export function armAbandonBeacon(
  target: BeaconTarget,
  buildBody: () => Record<string, unknown>,
): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {}
  }
  let fired = false
  const onHide = () => {
    if (fired) return
    fired = true
    try { sendAbandonBeacon(target, buildBody()) } catch { /* see above */ }
  }
  window.addEventListener('pagehide', onHide)
  return () => {
    fired = true
    window.removeEventListener('pagehide', onHide)
  }
}
