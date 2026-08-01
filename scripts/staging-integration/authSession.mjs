// A bearer token that is still valid when the matrix finally gets round to
// using it.
//
// THE BUG THIS FIXES, precisely. Every phase script built its Authorization
// header the same way:
//
//     const { data: { session } } = await client.auth.getSession()
//     headers.Authorization = `Bearer ${session.access_token}`
//
// `getSession()` hands back the session held in memory. It does not check
// whether the access token has expired. Supabase access tokens live about an
// hour, and the full staging matrix takes SEVENTY-SEVEN MINUTES — so a client
// that signed in during an early section is presenting a dead token by the
// time a later section calls an edge function.
//
// What that looks like in CI is the worst possible thing: `401 Not
// authenticated`, thrown from whichever assertion happened to run first past
// the hour mark. It is indistinguishable in the log from a genuine
// authorization defect, it moves between phases from run to run, and it lands
// AFTER dozens of real checks have already passed — so the run reads as "the
// editor is broken" when nothing is broken except the clock. It has already
// been miscounted once as one of the matrix's two real failures.
//
// The fix is to refresh when the token is spent rather than to hope the run
// finishes inside the hour. Refresh tokens outlive the whole matrix by a wide
// margin, so this costs one extra round trip on the rare call that needs it
// and nothing at all on the rest.

/**
 * Seconds of headroom before expiry at which we refresh anyway.
 *
 * Not zero, because the check and the eventual server-side validation are not
 * simultaneous: a token with four seconds left passes here, then travels, then
 * gets validated after it has died. Two minutes is far longer than any
 * round trip in this matrix and far shorter than the token's lifetime, so it
 * cannot cause churn.
 */
const EXPIRY_SKEW_SEC = 120

/**
 * `Authorization` header value for a signed-in staging client, refreshing the
 * session first if the access token is spent or nearly so.
 *
 * Throws with a specific message rather than a TypeError on
 * `session.access_token` when there is no session at all — that case means a
 * caller forgot to await login(), and "cannot read property of null" is a
 * miserable thing to debug from a CI log.
 */
export async function authHeader(client) {
  const { data: { session }, error } = await client.auth.getSession()
  if (error) throw new Error(`auth: getSession failed: ${error.message}`)
  if (!session) throw new Error('auth: this client has no session — was login() awaited?')

  const nowSec = Math.floor(Date.now() / 1000)
  const expiresAt = typeof session.expires_at === 'number' ? session.expires_at : null
  if (expiresAt !== null && expiresAt - EXPIRY_SKEW_SEC > nowSec) {
    return `Bearer ${session.access_token}`
  }

  // Either the token is spent, or the SDK did not tell us when it expires. The
  // second case is treated like the first on purpose: refreshing a live token
  // is harmless, while presenting a dead one fails the run an hour later at a
  // place that has nothing to do with the cause.
  const { data: refreshed, error: refreshErr } = await client.auth.refreshSession()
  if (refreshErr || !refreshed?.session) {
    throw new Error(`auth: session refresh failed: ${refreshErr?.message ?? 'no session returned'}`)
  }
  return `Bearer ${refreshed.session.access_token}`
}
