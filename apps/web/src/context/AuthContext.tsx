import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getProfileStrict, redeemReferral, REFERRAL_CODE_KEY } from '../lib/api'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  authError: string | null
  profileLoading: boolean
  profileError: string | null
  refreshSession: () => Promise<Session | null>
  refreshProfile: () => Promise<Profile | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  authError: null,
  profileLoading: false,
  profileError: null,
  refreshSession: async () => null,
  refreshProfile: async () => null,
  signOut: async () => {},
})

// Legacy idle-logout marker — the hour-long idle auto-logout is GONE (it kicked
// creators out every time they reopened the app after an hour away, which read
// as "it goes blank and logs me out"). Clean the stale key up on sign-out only.
const IDLE_KEY = 'twinai_last_active'

// Fully clear the session: local-scope sign-out + strip any persisted auth token
// so the next load can't resurrect the session.
async function doSignOut() {
  try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ignore */ }
  try {
    localStorage.removeItem(IDLE_KEY)
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('sb-') && k.includes('auth')) localStorage.removeItem(k)
    }
  } catch { /* storage unavailable */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  // Auth can emit INITIAL_SESSION and SIGNED_IN/TOKEN_REFRESHED close together.
  // Only the newest profile read may commit, otherwise a slower stale
  // onboarded=false response can overwrite the verified post-onboarding profile.
  const profileRequest = useRef(0)
  // ⚖️ WHO THE LAST EVENT WAS ABOUT. `onAuthStateChange` does not tell you
  // whether the user CHANGED, only that something happened, and "same user" is
  // the fact that decides whether a profile read may block the screen.
  const lastUserId = useRef<string | null>(null)

  // Retry the trigger-created profile briefly, but report a real result to
  // callers. Critical flows (auth routing and onboarding completion) must never
  // treat a failed profile read as success.
  /**
   * @param background true when this is a REVALIDATION of a profile we already
   *   hold, rather than a first load. A background refresh must not announce
   *   itself: `profileLoading` is what the route guard reads, and flipping it
   *   for a profile already in memory is what emptied the screen on every tab
   *   switch. The result still commits — only the spinner is suppressed.
   */
  const refreshProfile = async (background = false) => {
    const request = ++profileRequest.current
    if (!background) setProfileLoading(true)
    setProfileError(null)
    let lastFailure: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const p = await getProfileStrict()
        if (request === profileRequest.current) {
          setProfile(p)
          setProfileLoading(false)
        }
        return p
      } catch (error) {
        lastFailure = error
        if (attempt < 2) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
      }
    }
    if (request === profileRequest.current) {
      // Preserve a previously loaded profile during a transient refresh failure,
      // but stop route guards from guessing when no profile was ever established.
      setProfileError("We couldn't load your account. Check your connection and retry.")
      setProfileLoading(false)
      console.warn('profile_load_failed', {
        failureType: lastFailure instanceof Error ? lastFailure.name : typeof lastFailure,
      })
    }
    return null
  }

  const refreshSession = async (): Promise<Session | null> => {
    setLoading(true)
    setAuthError(null)
    const safety = window.setTimeout(() => {
      setAuthError("We couldn't verify your sign-in. Check your connection and retry.")
      setLoading(false)
    }, 8000)
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      setSession(data.session)
      setAuthError(null)
      if (data.session) {
        lastUserId.current = data.session.user?.id ?? null
        void refreshProfile()
        void redeemStoredReferral()
      } else {
        profileRequest.current++
        setProfile(null)
        setProfileLoading(false)
        setProfileError(null)
      }
      return data.session
    } catch (error) {
      console.warn('auth_session_refresh_failed', {
        failureType: error instanceof Error ? error.name : typeof error,
      })
      setAuthError("We couldn't verify your sign-in. Check your connection and retry.")
      return null
    } finally {
      window.clearTimeout(safety)
      // A late successful response clears the timeout error above; a late failure
      // keeps it. Either way the route never guesses that "unknown" means signed out.
      setLoading(false)
    }
  }

  // If the user arrived via a referral link, redeem it now that they have a
  // session. Clears the stored code on any definitive outcome so it never loops;
  // keeps it only on a transient error so a later session can retry.
  const redeemStoredReferral = async () => {
    try {
      const code = localStorage.getItem(REFERRAL_CODE_KEY)
      if (!code) return
      const res = await redeemReferral(code)
      if (res.ok || (res.reason && res.reason !== 'error' && res.reason !== 'rate_limited')) {
        localStorage.removeItem(REFERRAL_CODE_KEY)
      }
      if (res.ok) await refreshProfile()
    } catch {
      /* never block auth on a referral redeem */
    }
  }

  useEffect(() => {
    // Sessions persist until the user signs out (or the refresh token is revoked
    // server-side) — no idle auto-logout. Supabase refreshes the token itself.
    void refreshSession()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // ⚠️ THIS HANDLER FIRES WHEN A BACKGROUND TAB COMES BACK, and that is the
      // whole reported bug. Supabase refreshes the access token on focus and
      // emits TOKEN_REFRESHED — same user, same profile, nothing to reload. The
      // old body called `refreshProfile()` unconditionally, which flipped
      // `profileLoading`, which made the route guard swap the page for a
      // full-screen loader, which UNMOUNTED whatever the creator was doing.
      //
      // ⚖️ IDENTITY IS WHAT DECIDES, NOT THE EVENT NAME ALONE. A token refresh
      // for the same user needs no read; a genuinely different user needs a
      // blocking one, because rendering someone else's page against a stale
      // profile is the failure the guard exists to prevent. So: same id -> a
      // silent background revalidation; new id -> the old blocking path.
      const sameUser = s?.user?.id != null && s.user.id === lastUserId.current
      lastUserId.current = s?.user?.id ?? null
      setSession(s)
      setAuthError(null)
      setLoading(false)
      if (s) {
        // ⚖️ STILL REVALIDATED, JUST QUIETLY. Skipping the read entirely would
        // mean a plan change or a credit spend in another tab never landed.
        void refreshProfile(sameUser)
        // ⚠️ ONLY ON A REAL SIGN-IN. A referral redeem on every token refresh is
        // a network call every focus, forever, for a code that is cleared the
        // first time it resolves.
        if (!sameUser) void redeemStoredReferral()
      } else {
        profileRequest.current++
        setProfile(null)
        setProfileLoading(false)
        setProfileError(null)
      }
    })
    return () => { sub.subscription.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signOut = async () => {
    // Clear local state FIRST so the UI (route guards, nav) flips to logged-out
    // instantly, never waiting on the network round-trip or the auth listener.
    profileRequest.current++
    setSession(null)
    setProfile(null)
    setAuthError(null)
    setProfileLoading(false)
    setProfileError(null)
    await doSignOut()
  }

  return (
    <Ctx.Provider value={{
      session,
      profile,
      loading,
      authError,
      profileLoading,
      profileError,
      refreshSession,
      refreshProfile,
      signOut,
    }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(Ctx)
