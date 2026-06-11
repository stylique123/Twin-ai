import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, ArrowRight } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { Aurora } from '../components/Aurora'
import { Logo } from '../components/Logo'
import { EASE } from '../components/motion'

const PERKS = ['2 free recreations', 'Blueprint in ~30 seconds', 'No card required']

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
    <main className="relative grid min-h-[calc(100vh-64px)] place-items-center overflow-clip px-5 py-12">
      <Aurora />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="relative grid w-full max-w-4xl overflow-hidden rounded-panel border border-white/10 bg-ink2/80 backdrop-blur-xl md:grid-cols-2"
      >
        {/* Left — brand panel */}
        <div className="relative hidden flex-col justify-between gap-8 bg-signature-soft p-8 md:flex">
          <Logo size={30} />
          <div>
            <h2 className="font-display text-3xl leading-tight">
              You bring the idea.<br />
              <span className="gradient-text">TwinAI makes it shootable.</span>
            </h2>
            <ul className="mt-6 space-y-3">
              {PERKS.map((p) => (
                <li key={p} className="flex items-center gap-2.5 text-sand">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-teal/20">
                    <Check className="h-3 w-3 text-teal" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-stone">Reference-based creation — not a clipper.</p>
        </div>

        {/* Right — form */}
        <div className="p-8 sm:p-10">
          <div className="md:hidden"><Logo size={28} /></div>
          <h1 className="mt-6 font-display text-3xl md:mt-0">
            {mode === 'signup' ? 'Start free' : 'Welcome back'}
          </h1>
          <p className="mt-1.5 text-sm text-sand">
            {mode === 'signup' ? '2 free recreations. No card required.' : 'Pick up where you left off.'}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-3">
            <div>
              <label className="eyebrow">Email</label>
              <input
                className="field mt-1.5"
                type="email"
                placeholder="you@brand.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="eyebrow">Password</label>
              <input
                className="field mt-1.5"
                type="password"
                placeholder="Min 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <button className="btn-gradient w-full" disabled={busy}>
              {busy ? 'One sec…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {msg && <p className="mt-4 rounded-lg bg-coral/10 px-3 py-2 text-sm text-coral">{msg}</p>}

          <button
            className="mt-6 text-sm text-stone transition-colors hover:text-cream"
            onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
          >
            {mode === 'signup' ? 'Have an account? Sign in →' : 'New here? Start free →'}
          </button>
        </div>
      </motion.div>
    </main>
  )
}
