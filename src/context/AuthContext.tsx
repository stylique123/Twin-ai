import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getProfile } from '../lib/api'
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

  const refreshProfile = async () => {
    const p = await getProfile()
    setProfile(p)
  }

  useEffect(() => {
    const idleExceeded = () => {
      const last = Number(localStorage.getItem(IDLE_KEY) || 0)
      return last > 0 && Date.now() - last > IDLE_MS
    }

    supabase.auth.getSession().then(async ({ data }) => {
      // Security: if the last activity was over an hour ago, treat the session as
      // expired and sign out on load — reopening a tab after an idle hour requires
      // a fresh login instead of silently restoring the session.
      if (data.session && idleExceeded()) {
        await doSignOut()
        setLoading(false)
        return
      }
      setSession(data.session)
      if (data.session) { bumpActivity(); await refreshProfile() }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      if (s) await refreshProfile()
      else setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
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
