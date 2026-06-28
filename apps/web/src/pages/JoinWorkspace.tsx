import { useEffect, useState } from 'react'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { Loader2, Check, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { acceptWorkspaceInvite, markOnboarded } from '../lib/api'
import { Aurora } from '../components/Aurora'
import { Logo } from '../components/Logo'

// A teammate opens /join/:token. If signed out, we bounce them through signup
// (preserving the token) so they land back here authenticated, then accept.
export default function JoinWorkspace() {
  const { token = '' } = useParams()
  const { session, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<'idle' | 'joining' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  const join = async () => {
    setState('joining')
    const r = await acceptWorkspaceInvite(token)
    if (r.ok) {
      setState('done')
      try { localStorage.removeItem('twinai_pending_join') } catch { /* ignore */ }
      // A teammate works in the owner's workspace — mark them onboarded so the
      // app's "not onboarded → /onboarding" gate doesn't bounce them.
      await markOnboarded().catch(() => {})
      await refreshProfile().catch(() => {})
      setTimeout(() => navigate('/app'), 1200)
    } else {
      setState('error')
      setMsg(r.error || 'Could not join this workspace.')
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when session + token are ready
  useEffect(() => { if (session && token) join() }, [session, token])

  // Not signed in → stash the invite and send them to signup; they return here.
  // (Placed AFTER all hooks so hook order stays stable across renders.)
  if (!session) {
    try { localStorage.setItem('twinai_pending_join', token) } catch { /* storage off */ }
    return <Navigate to="/auth?mode=signup" replace />
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-clip px-5">
      <Aurora className="opacity-50" />
      <div className="glass relative w-full max-w-md rounded-panel p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-signature-soft"><Users className="h-5 w-5 text-cream" /></span>
        {state === 'done' ? (
          <>
            <p className="mt-4 inline-flex items-center gap-2 font-heading text-lg text-cream"><Check className="h-5 w-5 text-teal" /> You're in!</p>
            <p className="mt-1 text-sm text-stone">Taking you to the shared workspace…</p>
          </>
        ) : state === 'error' ? (
          <>
            <p className="mt-4 font-heading text-lg text-cream">Couldn't join</p>
            <p className="mt-1 text-sm text-coral">{msg}</p>
            <button onClick={() => navigate('/app')} className="btn-ghost mt-5">Go to your studio</button>
          </>
        ) : (
          <>
            <p className="mt-4 inline-flex items-center gap-2 font-heading text-lg text-cream"><Loader2 className="h-5 w-5 animate-spin" /> Joining the workspace…</p>
            <p className="mt-1 text-sm text-stone">One moment.</p>
          </>
        )}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-stone">Powered by <Logo className="h-3.5" /></div>
      </div>
    </main>
  )
}
