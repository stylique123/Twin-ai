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

  // Retry the trigger-created profile briefly, but report a real result to
  // callers. Critical flows (auth routing and onboarding completion) must never
  // treat a failed profile read as success.
  const refreshProfile = async () => {
    const request = ++profileRequest.current
    setProfileLoading(true)
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
      setSession(s)
      setAuthError(null)
      setLoading(false)
      if (s) { void refreshProfile(); void redeemStoredReferral() }
      else {
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
