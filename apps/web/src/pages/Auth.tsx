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

const FREE_PERKS = ['3 free remixes', 'Script in your voice, record + edit in one place', 'No card required']
const PAID_PERKS = ['Script in your voice, record + edit in one place', 'No watermark on your exports', 'Cancel any time']

// Where we remember the plan the user picked on the pricing page, so the choice
// survives signup + email confirmation and reaches onboarding / billing later.
export const INTENDED_PLAN_KEY = 'twinai_intended_plan'

export default function Auth() {
  const [params] = useSearchParams()
  const intendedPlanId = params.get('plan')
  const intendedPlan = intendedPlanId && PLANS.some((p) => p.id === intendedPlanId) ? planFor(intendedPlanId) : null
  const isPaidIntent = !!intendedPlan && intendedPlan.id !== 'free'
  const perks = isPaidIntent ? PAID_PERKS : FREE_PERKS
  // 'forgot' = request a reset email; 'reset' = arrived from that email's link
  // (we send the link back to /auth?mode=reset), set the new password.
  type Mode = 'signin' | 'signup' | 'forgot' | 'reset'
  const [mode, setMode] = useState<Mode>(
    params.get('mode') === 'reset' ? 'reset' : params.get('mode') === 'signin' ? 'signin' : 'signup',
  )
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

  // Un-stick the form after a cancelled OAuth redirect. `oauth()` sets busy=true
  // and hands off to Google; if the user backs out, the browser restores THIS page
  // from its back-forward cache with busy frozen true, leaving every button stuck
  // on "One sec…" until a manual refresh. `pageshow` fires on that bfcache restore —
  // reset busy so email sign-in works immediately. (Harmless on a normal load,
  // where busy is already false and no request is mid-flight.)
  useEffect(() => {
    const unstick = () => setBusy(false)
    window.addEventListener('pageshow', unstick)
    return () => window.removeEventListener('pageshow', unstick)
  }, [])

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
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?mode=reset`,
        })
        if (error) throw error
        setMsg('Reset link sent — check your inbox and open the link on this device.')
        setMsgType('success')
      } else if (mode === 'reset') {
        // The recovery link signed the user in; set the new password and go.
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        navigate('/app')
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // Stamp the chosen plan into the user's metadata so the server-side
          // profile trigger can decide credits: free signups get the 3 free
          // remixes; anyone who signs up FOR a paid plan does not (they activate
          // their allowance by paying). This is the authoritative signal — it
          // can't be spoofed by the client the way localStorage can.
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { intended_plan: intendedPlan?.id ?? 'free' },
          },
        })
        if (error) throw error
        if (data.session) {
          // A teammate who clicked an invite link goes straight to accept it
          // (they use the owner's workspace and skip their own onboarding).
          const pendingJoin = (() => { try { return localStorage.getItem('twinai_pending_join') } catch { return null } })()
          navigate(pendingJoin ? `/join/${pendingJoin}` : '/onboarding')
        } else {
          setMsg('Account created! Check your inbox to confirm your email, then sign in below.')
          setMsgType('success')
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        const pendingJoin = (() => { try { return localStorage.getItem('twinai_pending_join') } catch { return null } })()
        navigate(pendingJoin ? `/join/${pendingJoin}` : '/app')
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Something went wrong')
      setMsgType('error')
    } finally {
      setBusy(false)
    }
  }

  // Social login. Plan/referral are already in localStorage and survive the OAuth
  // round-trip; we land on /app and the route guard sends new users to onboarding.
  const oauth = async (provider: 'google') => {
    setMsg(null)
    if (!isSupabaseConfigured) { setMsg('Backend not configured yet.'); setMsgType('error'); return }
    if (intendedPlan && intendedPlan.id !== 'free') { try { localStorage.setItem(INTENDED_PLAN_KEY, intendedPlan.id) } catch { /* storage unavailable */ } }
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        // Land straight in the dashboard (Protected → routes to onboarding if the
        // brand voice isn't set up). If this URL isn't allow-listed and Supabase
        // falls back to the Site URL, the Landing page bounces them here anyway.
        provider,
        options: { redirectTo: `${window.location.origin}/dashboard` },
      })
      if (error) throw error
      // The browser redirects to the provider; nothing else runs here.
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not start Google sign-in')
      setMsgType('error')
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
        className="relative grid grid-cols-1 w-full max-w-4xl overflow-hidden rounded-panel border border-white/10 bg-ink2/80 backdrop-blur-xl md:grid-cols-2"
      >
        {/* Left, brand panel — a real creator reel runs behind it (dimmed under a
            scrim) so the sign-up screen feels like the product, not a plain form. */}
        <div className="relative hidden flex-col justify-between gap-8 overflow-hidden bg-signature-soft p-8 md:flex">
          {/* Same-origin checked-in asset — the old external CloudFront URL had
              expired (empty panel + an avoidable third-party request on the auth page). */}
          <video
            autoPlay muted loop playsInline
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
            src="/media/hero-talkinghead.mp4"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-ink/70 via-ink/55 to-ink/80" />
          <div className="relative z-10 flex items-center justify-between">
            <Logo size={30} />
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-sand transition-colors hover:text-cream"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
          </div>
          <div className="relative z-10">
            <h2 className="font-display text-3xl leading-tight">
              You bring the idea.<br />
              <span className="gradient-text">TwinAI makes it shootable.</span>
            </h2>
            <ul className="mt-6 space-y-3">
              {perks.map((p) => (
                <li key={p} className="flex items-center gap-2.5 text-sand">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-teal/20">
                    <Check className="h-3 w-3 text-teal" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <p className="relative z-10 text-xs text-sand">Paste a reference. Get a finished video in your voice.</p>
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
            {mode === 'forgot' ? 'Reset your password'
              : mode === 'reset' ? 'Choose a new password'
              : mode === 'signin' ? 'Welcome back'
              : isPaidIntent ? `Start on ${intendedPlan!.name}` : 'Start free'}
          </h1>
          <p className="mt-1.5 text-sm text-sand">
            {mode === 'forgot' ? "Enter your email and we'll send you a reset link."
              : mode === 'reset' ? 'Set a new password for your account below.'
              : mode === 'signin' ? 'Pick up where you left off.'
              : isPaidIntent
                ? `Create your account, then activate ${intendedPlan!.name} — $${intendedPlan!.price}/mo.`
                : '3 free remixes. No card required.'}
          </p>

          {(mode === 'signin' || mode === 'signup') && (
            <>
              <button
                type="button"
                onClick={() => oauth('google')}
                disabled={busy}
                className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-medium text-cream transition-colors hover:bg-white/[0.07] disabled:opacity-50"
              >
                <GoogleIcon className="h-4 w-4" /> Continue with Google
              </button>
              <div className="my-5 flex items-center gap-3 text-xs text-stone">
                <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}

          <form onSubmit={submit} className={`space-y-3 ${mode === 'forgot' || mode === 'reset' ? 'mt-7' : ''}`}>
            {mode !== 'reset' && (
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
            )}
            {mode !== 'forgot' && (
              <div>
                <label className="eyebrow">{mode === 'reset' ? 'New password' : 'Password'}</label>
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
            )}
            <button className="btn-gradient w-full" disabled={busy}>
              {busy ? 'One sec…'
                : mode === 'forgot' ? 'Send reset link'
                : mode === 'reset' ? 'Save new password'
                : mode === 'signup' ? 'Create account' : 'Sign in'}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {msg && (
            <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${msgType === 'success' ? 'bg-teal/10 text-teal' : 'bg-coral/10 text-coral'}`}>
              {msg}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
            {mode !== 'reset' && (
              <button
                className="text-sm text-stone transition-colors hover:text-cream"
                onClick={() => { setMsg(null); setMode(mode === 'signin' ? 'signup' : 'signin') }}
              >
                {mode === 'signup' ? 'Have an account? Sign in →' : mode === 'forgot' ? '← Back to sign in' : 'New here? Start free →'}
              </button>
            )}
            {mode === 'signin' && (
              <button
                className="text-sm text-stone transition-colors hover:text-cream"
                onClick={() => { setMsg(null); setMode('forgot') }}
              >
                Forgot password?
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </main>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  )
}
