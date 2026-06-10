import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { GradientBar } from '../components/GradientBar'

export default function Auth() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (!isSupabaseConfigured) {
      setMsg('Backend not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // A DB trigger creates the profile row with starter credits.
        navigate('/onboarding')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/app')
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto grid min-h-[80vh] max-w-md place-items-center px-5">
      <div className="glass w-full p-8">
        <GradientBar />
        <h1 className="mt-6 font-display text-2xl">
          {mode === 'signup' ? 'Start free' : 'Welcome back'}
        </h1>
        <p className="mt-1 text-sm text-sand">
          {mode === 'signup' ? '2 free recreations. No card required.' : 'Pick up where you left off.'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            className="field"
            type="email"
            placeholder="you@brand.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="field"
            type="password"
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'One sec…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {msg && <p className="mt-4 text-sm text-coral">{msg}</p>}

        <button
          className="mt-5 text-sm text-stone hover:text-cream"
          onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
        >
          {mode === 'signup' ? 'Have an account? Sign in' : 'New here? Start free'}
        </button>
      </div>
    </main>
  )
}
