import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { REFERRAL_CODE_KEY } from '../lib/api'
import { motion } from 'framer-motion'
import { Check, ArrowRight, ArrowLeft } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { planFor, PLANS } from '../lib/brand'
import { Aurora } from '../components/Aurora'
import { Logo } from '../components/Logo'
import { EASE } from '../components/motion'

const PERKS = ['3 free remixes', 'Script in your voice, record + edit in one place', 'No card required']

// Where we remember the plan the user picked on the pricing page, so the choice
// survives signup + email confirmation and reaches onboarding / billing later.
export const INTENDED_PLAN_KEY = 'twinai_intended_plan'

export default function Auth() {
  const [params] = useSearchParams()
  const intendedPlanId = params.get('plan')
  const intendedPlan = intendedPlanId && PLANS.some((p) => p.id === intendedPlanId) ? planFor(intendedPlanId) : null
  const [mode, setMode] = useState<'signin' | 'signup'>(params.get('mode') === 'signin' ? 'signin' : 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [msgType, setMsgType] = useState<'error' | 'success'>('error')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  // Remember a referral code from the invite link so it survives signup + email
  // confirmation; AuthContext redeems it once the user has a session.
  useEffect(() => {
    const ref = params.get('ref')
    if (ref) { try { localStorage.setItem(REFERRAL_CODE_KEY, ref) } catch { /* storage unavailable */ } }
  }, [params])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (!isSupabaseConfigured) {
      setMsg('Backend not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
      setMsgType('error')
      return
    }
    setBusy(true)
    try {
      // Remember the plan the user chose on pricing so onboarding/billing can honor it.
      if (intendedPlan && intendedPlan.id !== 'free') {
        try { localStorage.setItem(INTENDED_PLAN_KEY, intendedPlan.id) } catch { /* storage unavailable */ }
      }
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        })
        if (error) throw error
        if (data.session) {
          navigate('/onboarding')
        } else {
          setMsg('Account created! Check your inbox to confirm your email, then sign in below.')
          setMsgType('success')
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/app')
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Something went wrong')
      setMsgType('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-clip px-5 py-12">
      <Aurora />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="relative grid w-full max-w-4xl overflow-hidden rounded-panel border border-white/10 bg-ink2/80 backdrop-blur-xl md:grid-cols-2"
      >
        {/* Left, brand panel */}
        <div className="relative hidden flex-col justify-between gap-8 bg-signature-soft p-8 md:flex">
          <div className="flex items-center justify-between">
            <Logo size={30} />
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sand transition-colors hover:text-cream"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
          </div>
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
          <p className="text-xs text-stone">Paste a reference. Get a finished video in your voice.</p>
        </div>

        {/* Right, form */}
        <div className="p-8 sm:p-10">
          {/* Mobile header with Back */}
          <div className="flex items-center justify-between md:hidden">
            <Logo size={28} />
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sand transition-colors hover:text-cream"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
          </div>

          {intendedPlan && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber/25 bg-amber/10 px-3 py-1.5 text-xs font-semibold text-amber md:mt-0">
              <Check className="h-3.5 w-3.5" />
              {intendedPlan.id === 'free'
                ? "You're starting on the Free plan"
                : `You're starting on ${intendedPlan.name}`}
            </div>
          )}

          <h1 className="mt-6 font-display text-3xl">
            {mode === 'signup' ? 'Start free' : 'Welcome back'}
          </h1>
          <p className="mt-1.5 text-sm text-sand">
            {mode === 'signup' ? '3 free remixes. No card required.' : 'Pick up where you left off.'}
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

          {msg && (
            <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${msgType === 'success' ? 'bg-teal/10 text-teal' : 'bg-coral/10 text-coral'}`}>
              {msg}
            </p>
          )}

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
