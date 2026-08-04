import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { idleVerdict, markActivity, startIdleWatch } from '../lib/idleTimeout'
import { rememberSignOut } from '../lib/idleSignOut'
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
  /** Hold off the idle sign-out while real work is in flight. Returns the release. */
  holdIdle: () => () => void
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
  holdIdle: () => () => {},
})

// THE IDLE LOGOUT IS BACK, and this comment is kept because it is the reason it
// has to be built differently this time. It was deleted for kicking creators
// out when they reopened the app after an hour away, "which read as 'it goes
// blank and logs me out'".
//
// That is TWO complaints and only one is about the policy:
//   "it logs me out"  the policy — asked for again, and now deliberate.
//   "it goes blank"   the presentation — nobody was told, and work vanished.
//
// So the policy returns with the three things it lacked:
//   1. it NEVER fires mid-recording or mid-upload (idleTimeout's `isBusy`),
//      because "it goes blank" only matters when work is lost;
//   2. the login screen states the reason (idleSignOut);
//   3. signing back in returns to where you were, not to a dashboard.
//
// Rebuilding it without those would simply earn the deletion again.
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
  // A COUNTER, not a boolean: a recording and an upload can overlap, and a
  // boolean would let whichever finished first declare the app idle while the
  // other was still running.
  const busyRef = useRef(0)

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
    const expire = (reason: 'idle' | 'unknown') => {
      try { rememberSignOut(reason, window.location.pathname + window.location.search) } catch { /* ignore */ }
      void doSignOut().then(() => { setSession(null); setProfile(null) })
    }

    // THE BOOT CHECK is the half that fixes the reported symptom. A live timer
    // does nothing for a tab that was closed: no timer was running while the
    // person was away for a month.
    const boot = idleVerdict()
    if (boot.expired) {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) expire(boot.reason)
        else markActivity()
      })
    } else {
      markActivity()
    }

    // `isBusy` is read live from a ref so a recording that starts after this
    // effect still defers the sign-out.
    const stopIdle = startIdleWatch(expire, { isBusy: () => busyRef.current > 0 })

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
    return () => { sub.subscription.unsubscribe(); stopIdle() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Mark real work in flight — a recording, an upload — so the idle sign-out
   * defers. Release is idempotent: calling it twice must not decrement someone
   * else's hold, which would let the sign-out fire mid-recording.
   */
  const holdIdle = () => {
    busyRef.current++
    let released = false
    return () => { if (!released) { released = true; busyRef.current = Math.max(0, busyRef.current - 1) } }
  }

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
      holdIdle,
    }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(Ctx)
