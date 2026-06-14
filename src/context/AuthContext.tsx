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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = async () => {
    const p = await getProfile()
    setProfile(p)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await refreshProfile()
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      if (s) await refreshProfile()
      else setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    // Clear local state FIRST so the UI (route guards, nav) flips to logged-out
    // instantly — never wait on the network round-trip or the auth listener.
    setSession(null)
    setProfile(null)
    // scope:'local' clears the persisted token from storage WITHOUT needing a
    // network round-trip to revoke server-side. The default 'global' scope can
    // throw on a flaky network and leave the token in localStorage, which the
    // next page load would then resurrect — the "I logged out but still see
    // Open studio" bug. Local scope makes sign-out reliable offline.
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      /* ignore */
    }
    // Belt-and-suspenders: if any Supabase auth token is still in storage, remove
    // it so getSession() on the next load can never bring the session back.
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('sb-') && k.includes('auth')) localStorage.removeItem(k)
      }
    } catch {
      /* storage unavailable; nothing to clear */
    }
  }

  return (
    <Ctx.Provider value={{ session, profile, loading, refreshProfile, signOut }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(Ctx)
