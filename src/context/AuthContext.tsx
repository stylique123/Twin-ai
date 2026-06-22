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

// Idle auto-logout window: one hour of inactivity ends the session.
const IDLE_KEY = 'twinai_last_active'
const IDLE_MS = 60 * 60 * 1000
const bumpActivity = () => {
  try { localStorage.setItem(IDLE_KEY, String(Date.now())) } catch { /* storage off */ }
}

// Fully clear the session: local-scope sign-out + strip any persisted auth token
// and the activity marker so the next load can't resurrect the session.
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
  const refreshProfile = async () => {
    try {
      const p = await getProfile()
      setProfile(p)
    } catch {
      /* leave profile as-is — auth must never hang on the profile query */
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
    const idleExceeded = () => {
      const last = Number(localStorage.getItem(IDLE_KEY) || 0)
      return last > 0 && Date.now() - last > IDLE_MS
    }

    // Guarantee the "Loading…" gate always clears. Previously `setLoading(false)`
    // ran only AFTER `await refreshProfile()`, so a hung/failed profile query (e.g.
    // the access token refreshing after an idle period) left the app stuck on the
    // loading screen forever — the bug that forced a manual refresh. We now unblock
    // the UI the moment the session is known and load the profile in the background,
    // with a hard safety timeout as a final backstop.
    let settled = false
    const finishLoading = () => { if (!settled) { settled = true; setLoading(false) } }
    const safety = window.setTimeout(finishLoading, 8000)

    supabase.auth.getSession().then(async ({ data }) => {
      // Security: if the last activity was over an hour ago, treat the session as
      // expired and sign out on load — reopening a tab after an idle hour requires
      // a fresh login instead of silently restoring the session.
      if (data.session && idleExceeded()) {
        await doSignOut()
        finishLoading()
        return
      }
      setSession(data.session)
      finishLoading() // unblock route guards immediately
      if (data.session) { bumpActivity(); void refreshProfile(); void redeemStoredReferral() } // profile + referral in background
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

  // Idle auto-logout: record activity, and every 30s check whether the user has
  // been inactive for over an hour — if so, sign them out.
  useEffect(() => {
    if (!session) return
    const onActivity = () => bumpActivity()
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart', 'visibilitychange']
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    const timer = window.setInterval(() => {
      const last = Number(localStorage.getItem(IDLE_KEY) || 0)
      if (last > 0 && Date.now() - last > IDLE_MS) {
        void doSignOut().then(() => window.location.assign('/'))
      }
    }, 30_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity))
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

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
