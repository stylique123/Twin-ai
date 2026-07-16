import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getProfile, redeemReferral, REFERRAL_CODE_KEY } from '../lib/api'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
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

  // Best-effort: never let a slow/stuck profile fetch block the whole app. The
  // route guards only need `session`; the profile fills in when it arrives.
  // Retry a couple of times with short backoff — on first load the access token
  // may still be refreshing, and a single transient miss would otherwise leave
  // the user staring at a profile with no credits/plan until they navigate.
  const refreshProfile = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const p = await getProfile()
        setProfile(p)
        return
      } catch {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
        /* else leave profile as-is — auth must never hang on the profile query */
      }
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
    // Guarantee the "Loading…" gate always clears. Previously `setLoading(false)`
    // ran only AFTER `await refreshProfile()`, so a hung/failed profile query (e.g.
    // the access token refreshing after an idle period) left the app stuck on the
    // loading screen forever — the bug that forced a manual refresh. We now unblock
    // the UI the moment the session is known and load the profile in the background,
    // with a hard safety timeout as a final backstop.
    let settled = false
    const finishLoading = () => { if (!settled) { settled = true; setLoading(false) } }
    const safety = window.setTimeout(finishLoading, 8000)

    // Sessions persist until the user signs out (or the refresh token is revoked
    // server-side) — no idle auto-logout. Supabase refreshes the token itself.
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      finishLoading() // unblock route guards immediately
      if (data.session) { void refreshProfile(); void redeemStoredReferral() } // profile + referral in background
    }).catch(finishLoading).finally(() => window.clearTimeout(safety))

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      finishLoading()
      if (s) { void refreshProfile(); void redeemStoredReferral() }
      else setProfile(null)
    })
    return () => { window.clearTimeout(safety); sub.subscription.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signOut = async () => {
    // Clear local state FIRST so the UI (route guards, nav) flips to logged-out
    // instantly, never waiting on the network round-trip or the auth listener.
    setSession(null)
    setProfile(null)
    await doSignOut()
  }

  return (
    <Ctx.Provider value={{ session, profile, loading, refreshProfile, signOut }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(Ctx)
