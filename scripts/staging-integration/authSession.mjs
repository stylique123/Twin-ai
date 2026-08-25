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

/**
 * Force a fresh access token, whatever the cached session claims.
 *
 * ⚠️ `authHeader` REFRESHES ON THE CLOCK; THIS REFRESHES ON THE ANSWER. The
 * clock check is necessary and it is not sufficient: a token whose `expires_at`
 * is comfortably in the future can still be rejected — the auth service can
 * fail a verification transiently, and a session can be invalidated server-side
 * without the client being told. In both cases the SDK holds a token it
 * believes in and the edge function says 401.
 */
export async function freshAuthHeader(client) {
  const { data: refreshed, error } = await client.auth.refreshSession()
  if (error || !refreshed?.session) {
    throw new Error(`auth: forced session refresh failed: ${error?.message ?? 'no session returned'}`)
  }
  return `Bearer ${refreshed.session.access_token}`
}

/**
 * ⚠️ A 401 IS NOT A VERDICT UNTIL IT SURVIVES A FRESH TOKEN.
 *
 * THE COST, MEASURED. The staging matrix takes the better part of an hour and
 * a single unretried 401 destroys the whole run — this file's own header
 * records that such a 401 "has already been miscounted once as one of the
 * matrix's two real failures", and it happened again on 2026-08-25, killing a
 * run at minute 35 after dozens of assertions had already passed.
 *
 * ⚖️ AND THE ASYMMETRY IS THE TELL. `startProject` already retries a 429,
 * because a rate window is understood to be a fact about the moment rather
 * than about the code. A transient auth-verification failure is the same kind
 * of fact and was the only one treated as final.
 *
 * ⚖️ THIS WEAKENS NOTHING. It does not lower a permission, skip a check, or
 * accept an unauthenticated call. It re-establishes the caller's OWN session
 * once and asks again. A genuine authorization defect answers 401 to a
 * brand-new token too, so it still fails the run — twice, and loudly.
 *
 * ⚠️ EXACTLY ONE RETRY. A loop here would turn a real auth break into a hang,
 * and the second 401 is the one that means something.
 */
export async function callEdgeAuthRetried(call, client, label) {
  const first = await call()
  if (first.status !== 401 || !client) return first
  console.log(`   ⚠️ 401 on ${label} — refreshing the session and asking once more`)
  await freshAuthHeader(client)
  const second = await call()
  if (second.status === 401) {
    console.log(`   ⚠️ 401 on ${label} SURVIVED a fresh token — this is authorization, not the clock`)
  }
  return second
}

