// WHAT THE PERSON SEES WHEN THE HOUR EXPIRES.
//
// An hour-long idle logout already existed here and was DELETED. AuthContext
// still records why: it "kicked creators out every time they reopened the app
// after an hour away, which read as 'it goes blank and logs me out'".
//
// Read that complaint carefully — it is two complaints, and only one of them is
// about the policy:
//
//   "it logs me out"   the policy. Asked for, and now deliberate.
//   "it goes blank"    the PRESENTATION. Nobody was told what happened, and
//                      whatever they were doing simply vanished.
//
// Re-introducing the policy without fixing the presentation would reproduce the
// deletion. So the sign-out now carries two things it never had: a REASON the
// login screen can state, and the DESTINATION the person was heading for, so
// signing back in returns them there instead of dumping them on a dashboard.
//
// The third protection lives in idleTimeout's `isBusy`: the sign-out never
// fires mid-recording or mid-upload, because "it goes blank" is only a
// presentation problem if no work was lost.

const REASON_KEY = 'twinai.signedOutReason'
const DESTINATION_KEY = 'twinai.signedOutFrom'

export type SignOutReason = 'idle' | 'unknown'

/** Paths that must never be returned to — signing back in should not re-enter the auth flow. */
const NOT_A_DESTINATION = ['/auth', '/login', '/signup', '/']

export function rememberSignOut(reason: SignOutReason, path: string): void {
  try {
    sessionStorage.setItem(REASON_KEY, reason)
    // A destination is only useful if it is somewhere the person was WORKING.
    if (!NOT_A_DESTINATION.includes(path)) sessionStorage.setItem(DESTINATION_KEY, path)
  } catch { /* private mode: the message is lost, the sign-out still happened */ }
}

export function takeSignOutNotice(): { reason: SignOutReason | null, destination: string | null } {
  try {
    const reason = sessionStorage.getItem(REASON_KEY) as SignOutReason | null
    const destination = sessionStorage.getItem(DESTINATION_KEY)
    // READ ONCE. A notice that survives a reload would tell someone they were
    // signed out for inactivity every time they visited the login page.
    sessionStorage.removeItem(REASON_KEY)
    sessionStorage.removeItem(DESTINATION_KEY)
    return { reason: reason === 'idle' || reason === 'unknown' ? reason : null, destination }
  } catch { return { reason: null, destination: null } }
}

/** The sentence shown on the login screen. `unknown` never claims to know why. */
export function signOutMessage(reason: SignOutReason | null): string | null {
  if (reason === 'idle') return 'You were signed out after an hour of inactivity. Your work is saved — sign in to pick up where you left off.'
  if (reason === 'unknown') return 'You were signed out. Your work is saved — sign in to pick up where you left off.'
  return null
}
