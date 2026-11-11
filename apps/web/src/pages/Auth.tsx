import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { REFERRAL_CODE_KEY } from '../lib/api'
import { Loader2, Eye, EyeOff, Lightbulb, Play, PenLine, CalendarDays } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { planFor, PLANS } from '../lib/brand'
import '../styles/onboarding.css'
import { useAuth } from '../context/AuthContext'
import { authenticatedDestination } from '../lib/authRouting'


// Where we remember the plan the user picked on the pricing page, so the choice
// survives signup + email confirmation and reaches onboarding / billing later.
export const INTENDED_PLAN_KEY = 'twinai_intended_plan'

export default function Auth() {
  const [params] = useSearchParams()
  const intendedPlanId = params.get('plan')
  const intendedPlan = intendedPlanId && PLANS.some((p) => p.id === intendedPlanId) ? planFor(intendedPlanId) : null
  const isPaidIntent = !!intendedPlan && intendedPlan.id !== 'free'
  // 'forgot' = request a reset email; 'reset' = arrived from that email's link
  // (we send the link back to /auth?mode=reset), set the new password.
  type Mode = 'signin' | 'signup' | 'forgot' | 'reset'
  const [mode, setMode] = useState<Mode>(
    params.get('mode') === 'reset' ? 'reset' : params.get('mode') === 'signin' ? 'signin' : 'signup',
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // ⚠️ AUDIT 2026-09-30: a browser-suggested password was accepted unseen and
  // she never knew it. The password can always be shown.
  const [showPassword, setShowPassword] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgType, setMsgType] = useState<'error' | 'success'>('error')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const wide = useWide()
  const {
    session,
    profile,
    profileLoading,
    profileError,
    refreshSession,
    refreshProfile,
  } = useAuth()

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

  // Email confirmation returns here. If the provider did not establish a
  // browser session, show SIGN IN — never the signup form the creator just
  // completed. If it did establish one, the authenticated redirect below sends
  // them to their saved onboarding/app state.
  useEffect(() => {
    if (params.get('confirmed') === '1' && !session) {
      setMode('signin')
      setMsg('Email confirmed — sign in to continue.')
      setMsgType('success')
    }
  }, [params, session])

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
          // videos; anyone who signs up FOR a paid plan does not (they activate
          // their allowance by paying). This is the authoritative signal — it
          // can't be spoofed by the client the way localStorage can.
          options: {
            emailRedirectTo: `${window.location.origin}/auth?mode=signin&confirmed=1`,
            data: { intended_plan: intendedPlan?.id ?? 'free' },
          },
        })
        if (error) throw error
        if (data.session) {
          // Make the context session authoritative before navigation. Relying
          // only on the async auth listener let the protected route briefly see
          // "no session" and bounce a successful signup back to /auth.
          if (!await refreshSession()) throw new Error("We couldn't verify your new session. Please sign in.")
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
        if (!await refreshSession()) throw new Error("We couldn't verify your sign-in. Please retry.")
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

  // /auth used to ignore an existing session. Email confirmation therefore
  // landed a successfully authenticated creator on the signup form again. Wait
  // for the profile state machine, then continue exactly where the account is.
  if (mode !== 'reset' && session) {
    if (profileLoading) {
      return (
        <main className="grid min-h-screen place-items-center text-sand">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Finishing your sign-in…
          </span>
        </main>
      )
    }
    if (profileError && !profile) {
      return (
        <main className="grid min-h-screen place-items-center px-5 text-center text-cream">
          <div className="max-w-sm">
            <p className="font-semibold">We couldn't finish loading your account.</p>
            <p className="mt-1 text-sm text-sand">{profileError}</p>
            <button className="btn-gradient mt-5" onClick={() => void refreshProfile()}>
              Retry account setup
            </button>
          </div>
        </main>
      )
    }
    const pendingJoin = (() => {
      try { return localStorage.getItem('twinai_pending_join') } catch { return null }
    })()
    return <Navigate to={authenticatedDestination({ pendingJoin, onboarded: profile?.onboarded === true })} replace />
  }

  const up = mode === 'signup'
  const signinish = mode === 'signin'
  const title = mode === 'forgot' ? 'Reset your password'
    : mode === 'reset' ? 'Choose a new password'
    : signinish ? 'Sign in'
    : isPaidIntent ? `Start on ${intendedPlan!.name}` : 'Create your free account'
  const sub = mode === 'forgot' ? "Enter your email and we'll send you a reset link."
    : mode === 'reset' ? 'Set a new password for your account below.'
    : signinish ? 'Good to see you again.'
    : isPaidIntent
      ? `Create your account, then activate ${intendedPlan!.name} — $${intendedPlan!.price}/mo.`
      : 'Your first 3 videos are free. No card.'
  const cta = busy ? 'One sec…'
    : mode === 'forgot' ? 'Send reset link'
    : mode === 'reset' ? 'Save new password'
    : up ? 'Create my account' : 'Sign in to my studio'
  const pwPh = mode === 'reset' ? 'Pick a new password, at least 6 characters' : signinish ? 'Your password' : 'Pick a password, at least 6 characters'
  const switchMode = (m: Mode) => { setMsg(null); setMode(m) }
  const ui: WelcomeUi = {
    mode, up, title, sub, cta, pwPh, busy, msg, msgType, email, password, showPassword, intendedPlan,
    setEmail, setPassword, toggleShow: () => setShowPassword((v) => !v), submit, oauth: () => oauth('google'), switchMode,
  }
  return wide ? <WelcomeDesktop ui={ui} /> : <WelcomePhone ui={ui} />
}

// ---------------------------------------------------------------------------
// Welcome board (>=768) and MWelcome board (<768), values copied one for one.
// Sign up and Sign in have different left panels and entrance animations.
// ---------------------------------------------------------------------------

type WelcomeUi = {
  mode: 'signin' | 'signup' | 'forgot' | 'reset'
  up: boolean
  title: string
  sub: string
  cta: string
  pwPh: string
  busy: boolean
  msg: string | null
  msgType: 'error' | 'success'
  email: string
  password: string
  showPassword: boolean
  intendedPlan: ReturnType<typeof planFor> | null
  setEmail: (v: string) => void
  setPassword: (v: string) => void
  toggleShow: () => void
  submit: (e: React.FormEvent) => void
  oauth: () => void
  switchMode: (m: 'signin' | 'signup' | 'forgot' | 'reset') => void
}

const DEMO = [
  { said: 'people keep asking how i started the coffee cart lol', out: 'Everyone asks how I started the cart. Honest answer? My kitchen, one grinder, and zero plan.' },
  { said: 'new single origin in, tastes like blueberries?? idk how to explain', out: 'I opened this bag and smelled blueberries. Not a flavouring. Just the bean. Let me show you.' },
  { said: 'roasting at 5am again, nobody sees this part', out: "It's 5am, the roaster's warming up, and this is the part of the job nobody films. Until now." },
]
const NEXT_STEPS = [['Paste your handle', 'Twin reads your recent posts', '30 sec'], ['Answer 3 quick questions', 'Only the things a scan can’t see', '1 min'], ['Get your first script', 'In your voice, tested on 10 viewers', 'ready']] as const
// Owner decision: no user data exists before sign-in, so these cards carry no
// counts, times or platforms (the board's example numbers are not shipped).
const BACK_CARDS = [
  { Icon: Lightbulb, tint: '#FFB347', t: 'New video ideas', d: 'Written from this week’s trends in your niche' },
  { Icon: Play, tint: '#65E5D8', t: 'How your last video did', d: 'Views and comments since you last looked' },
  { Icon: PenLine, tint: '#FF5B7B', t: 'Scripts ready to film', d: 'Tested on viewers like yours' },
  { Icon: CalendarDays, tint: '#B7AE9F', t: 'Your scheduled posts', d: 'Going out at your best times' },
]
const REDUCED = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** The board's "What Twin wrote" typing loop (38ms ticks, 2 chars per tick,
 *  ~1.7s hold, three lines). Reduced motion: the first line, fully written. */
function useDemo() {
  const [st, setSt] = useState({ i: 0, k: REDUCED ? DEMO[0].out.length : 0, w: 0, t: 0 })
  useEffect(() => {
    if (REDUCED) return
    const t = setInterval(() => setSt((s) => {
      const L = DEMO[s.i].out.length
      if (s.k < L) return { ...s, k: s.k + 2, t: s.t + 1 }
      if (s.w < 45) return { ...s, w: s.w + 1, t: s.t + 1 }
      return { i: (s.i + 1) % 3, k: 0, w: 0, t: s.t + 1 }
    }), 38)
    return () => clearInterval(t)
  }, [])
  const step = REDUCED ? 0 : Math.floor(st.t / 70) % 3
  return { said: DEMO[st.i].said, typed: DEMO[st.i].out.slice(0, st.k), step }
}

function useWide() {
  const q = '(min-width: 768px)'
  const [w, setW] = useState(() => typeof window === 'undefined' || window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setW(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return w
}

function NextSteps({ step, small }: { step: number; small?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {NEXT_STEPS.map((x, i) => (
        <div key={x[0]} className="flex items-center gap-3 rounded-[12px] px-3 py-[9px] transition-[background] duration-[400ms]" style={{ background: i === step ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
          <span
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold transition-all duration-[400ms]"
            style={{ background: i === step ? 'linear-gradient(135deg,#FFB347,#FF5B7B)' : i < step ? '#65E5D8' : 'rgba(255,255,255,0.08)', color: i <= step ? '#07070A' : '#8D8475' }}
          >
            {i < step ? '✓' : i + 1}
          </span>
          <span className="flex flex-col gap-[1px]">
            <span className={`${small ? 'text-[13.5px]' : 'text-[14px]'} font-semibold transition-colors duration-[400ms]`} style={{ color: i === step ? '#F6F1E9' : '#B7AE9F' }}>{x[0]}</span>
            <span className="text-[12px] text-label">{x[1]}</span>
          </span>
          <span className="ml-auto text-[12px] text-stone-dim">{x[2]}</span>
        </div>
      ))}
    </div>
  )
}

function BackCards({ phone }: { phone?: boolean }) {
  return (
    <div className={`flex flex-col ${phone ? 'gap-[7px]' : 'gap-2'}`}>
      {BACK_CARDS.map(({ Icon, tint, t, d }, i) => (
        <div key={t} className={`ob-wsCard flex items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.04] ${phone ? 'px-[13px] py-[11px]' : 'px-[14px] py-3'}`} style={{ animationDelay: `${0.35 + i * 0.32}s` }}>
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${tint}22`, color: tint }}>
            <Icon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col gap-[2px]">
            <span className="text-[14.5px] font-semibold">{t}</span>
            <span className="text-[12.5px] text-label">{d}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function Message({ ui }: { ui: WelcomeUi }) {
  if (!ui.msg) return null
  return (
    <p role={ui.msgType === 'error' ? 'alert' : 'status'} className={`m-0 rounded-[11px] px-[14px] py-[10px] text-[13.5px] ${ui.msgType === 'success' ? 'bg-teal/10 text-teal-soft' : 'bg-coral/10 text-coral-soft'}`}>
      {ui.msg}
    </p>
  )
}

function PasswordField({ ui, phone }: { ui: WelcomeUi; phone?: boolean }) {
  return (
    <div className="relative">
      <input
        className={`ob-inp w-full border border-white/[0.09] bg-ink pr-11 text-cream outline-none ${phone ? 'rounded-[12px] p-[14px] text-[16px]' : 'rounded-[11px] px-[14px] py-[13px] text-[15px]'}`}
        type={ui.showPassword ? 'text' : 'password'}
        aria-label={phone ? (ui.mode === 'reset' ? 'New password' : 'Password') : undefined}
        // MODE-DEPENDENT: on sign-in a manager should FILL the saved password;
        // on sign-up or reset it should OFFER a new one (see the note above).
        autoComplete={ui.mode === 'signin' ? 'current-password' : 'new-password'}
        placeholder={ui.pwPh}
        value={ui.password}
        onChange={(e) => ui.setPassword(e.target.value)}
        minLength={6}
        required
      />
      {/* ⚠️ AUDIT 2026-09-30: the password can always be shown. */}
      <button type="button" onClick={ui.toggleShow} aria-label={ui.showPassword ? 'Hide password' : 'Show password'}
        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-label hover:text-cream">
        {ui.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

function Terms({ phone }: { phone?: boolean }) {
  return (
    <p className={`m-0 text-center text-[12px] text-stone-dim ${phone ? '' : '-mt-2'}`}>
      By continuing you agree to our <Link to="/terms" className="text-sand-muted underline">Terms of Use</Link> and{' '}
      <Link to="/privacy" className="text-sand-muted underline">Privacy Policy</Link>.
    </p>
  )
}

function WelcomeDesktop({ ui }: { ui: WelcomeUi }) {
  const demo = useDemo()
  const tab = (on: boolean) => ({ background: on ? '#F6F1E9' : 'transparent', color: on ? '#07070A' : '#B7AE9F' })
  const signinish = ui.mode === 'signin' || ui.mode === 'forgot'
  return (
    <main className="page-glow relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-ink px-6 py-10 leading-[normal] text-cream">
      <div className="ob-aur ob-drift1 left-[-160px] top-[-200px] h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,rgba(255,179,71,0.16),rgba(255,179,71,0)_65%)]" aria-hidden="true" />
      <div className="ob-aur ob-drift2 right-[-180px] top-[120px] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,rgba(255,91,123,0.15),rgba(255,91,123,0)_65%)]" aria-hidden="true" />
      <div className="ob-aur ob-drift1 bottom-[-320px] left-[35%] h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle,rgba(101,229,216,0.10),rgba(101,229,216,0)_65%)] [animation-direction:reverse] [animation-duration:24s]" aria-hidden="true" />

      <div className="pin d1 relative z-[1] flex min-h-[680px] w-full max-w-[1080px] lg:h-[680px] overflow-hidden rounded-[26px] border border-white/[0.08] bg-[rgba(17,17,21,0.86)] shadow-[0_60px_140px_-40px_rgba(0,0,0,0.9)]">
        <section className="flex shrink basis-1/2 flex-col gap-[22px] border-r border-white/[0.06] bg-[linear-gradient(160deg,rgba(255,179,71,0.08),rgba(255,91,123,0.06)_45%,rgba(101,229,216,0.04))] px-8 py-10 lg:shrink-0 lg:basis-[656px] lg:px-12">
          <Link to="/" className="flex items-center gap-[10px] self-start text-cream no-underline">
            <span className="ob-gbtn flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[15px] font-extrabold text-ink">T</span>
            <span className="text-[17px] font-bold tracking-[-0.01em]">TwinAI</span>
          </Link>
          {!signinish ? (
            <div key="up" className="ob-wsRise flex flex-grow flex-col gap-5">
              <span className="text-[12px] font-bold tracking-[.12em] text-amber">NEW HERE? HERE’S WHAT HAPPENS</span>
              <h1 className="m-0 mt-[-8px] text-[40px] font-bold leading-[1.06] tracking-[-0.035em]">Your next video,<br />written in <span className="ob-grad">your voice.</span></h1>
              <div className="flex flex-col gap-[10px]" aria-hidden="true">
                <div className="max-w-[400px] self-start rounded-[14px_14px_14px_4px] bg-white/[0.06] px-[14px] py-[10px] text-[13.5px] leading-[1.45] text-sand">
                  <span className="mb-[3px] block text-[12px] font-bold tracking-[0.08em] text-label">WHAT YOU SAID</span>{demo.said}
                </div>
                <div className="min-h-[66px] max-w-[420px] self-end rounded-[14px_14px_4px_14px] border border-[rgba(255,91,123,0.28)] bg-[#1A1418] px-4 py-3 text-[15px] font-medium leading-[1.45] shadow-[0_16px_40px_-18px_rgba(255,91,123,0.6)]">
                  <span className="mb-1 flex items-center gap-2 text-[12px] font-bold tracking-[0.08em] text-coral-soft"><span className="ob-ringp h-[7px] w-[7px] rounded-[9px] bg-coral" />WHAT TWIN WROTE</span>
                  {demo.typed}<span className="ob-caret" />
                </div>
              </div>
              <div className="mt-auto flex flex-col gap-2">
                <span className="text-[12px] font-bold tracking-[.1em] text-label">YOUR NEXT 2 MINUTES</span>
                <NextSteps step={demo.step} />
              </div>
            </div>
          ) : (
            <div key="in" className="ob-wsSlide flex flex-grow flex-col gap-[18px]">
              <span className="text-[12px] font-bold tracking-[.12em] text-teal">WELCOME BACK</span>
              <h1 className="m-0 mt-[-6px] text-[40px] font-bold leading-[1.06] tracking-[-0.035em]">Your twin kept working<br /><span className="ob-grad">while you were away.</span></h1>
              <BackCards />
              <p className="ob-wsCard m-0 mt-auto text-[13.5px] leading-[1.5] text-label [animation-delay:1.7s]">Your voice, drafts and calendar are exactly where you left them.</p>
            </div>
          )}
        </section>

        <section className="flex flex-grow flex-col justify-center gap-[22px] px-8 py-11 lg:px-[52px]">
          {(ui.mode === 'signup' || ui.mode === 'signin') && (
            <div role="tablist" aria-label="Account" className="flex gap-1 self-start rounded-[12px] border border-white/[0.07] bg-ink p-1">
              <button type="button" role="tab" aria-selected={ui.up} onClick={() => ui.switchMode('signup')} className="cursor-pointer rounded-[9px] border-0 px-4 py-2 text-[13.5px] font-semibold transition-[background] duration-200" style={tab(ui.up)}>Start free</button>
              <button type="button" role="tab" aria-selected={!ui.up} onClick={() => ui.switchMode('signin')} className="cursor-pointer rounded-[9px] border-0 px-4 py-2 text-[13.5px] font-semibold transition-[background] duration-200" style={tab(!ui.up)}>Sign in</button>
            </div>
          )}
          <div key={ui.mode} className="ob-wsFade flex flex-col gap-[6px]">
            <h2 className="m-0 text-[30px] font-bold tracking-[-0.025em]">{ui.title}</h2>
            <p className="m-0 text-[14.5px] text-sand-muted">{ui.sub}</p>
          </div>
          {(ui.mode === 'signup' || ui.mode === 'signin') && (
            <>
              <button type="button" onClick={ui.oauth} disabled={ui.busy} className="ob-lift flex cursor-pointer items-center justify-center gap-[10px] rounded-[12px] border border-white/[0.14] bg-cream p-[13px] text-[14.5px] font-semibold text-ink disabled:opacity-60">
                <GoogleIcon className="h-[17px] w-[17px]" />Continue with Google
              </button>
              <div className="flex items-center gap-3 text-[12.5px] text-label"><span className="h-px flex-grow bg-white/[0.08]" />or with email<span className="h-px flex-grow bg-white/[0.08]" /></div>
            </>
          )}
          <form onSubmit={ui.submit} className="flex flex-col gap-[22px]">
            {ui.mode !== 'reset' && (
              <label className="flex flex-col gap-[7px] text-[13px] font-medium text-sand-muted">
                Email
                <input className="ob-inp rounded-[11px] border border-white/[0.09] bg-ink px-[14px] py-[13px] text-[15px] text-cream outline-none" type="email"
                  // `username` lets a password manager offer the saved account.
                  autoComplete="username" placeholder="you@yourbrand.com" value={ui.email} onChange={(e) => ui.setEmail(e.target.value)} required />
              </label>
            )}
            {ui.mode !== 'forgot' && (
              <div className="flex flex-col gap-[7px] text-[13px] font-medium text-sand-muted">
                <span className="flex justify-between">
                  {ui.mode === 'reset' ? 'New password' : 'Password'}
                  {ui.mode === 'signin' && <button type="button" onClick={() => ui.switchMode('forgot')} className="border-0 bg-transparent p-0 text-coral-soft">Forgot it?</button>}
                </span>
                <PasswordField ui={ui} />
              </div>
            )}
            <Message ui={ui} />
            <button type="submit" disabled={ui.busy} className="ob-cta ob-gbtn mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-[12px] border-0 p-[15px] text-[15.5px] font-bold text-ink shadow-[0_14px_36px_-14px_rgba(255,91,123,0.8)] disabled:opacity-70">
              {ui.cta} {!ui.busy && <span aria-hidden="true">→</span>}
            </button>
          </form>
          <button type="button" onClick={() => ui.switchMode(ui.mode === 'signup' ? 'signin' : ui.mode === 'reset' ? 'signin' : ui.mode === 'forgot' ? 'signin' : 'signup')} className="cursor-pointer border-0 bg-transparent text-[13.5px] text-sand-soft">
            {ui.mode === 'signup' ? 'Already have an account? Sign in' : ui.mode === 'signin' ? 'New here? Start free' : 'Back to sign in'}
          </button>
          <Terms />
        </section>
      </div>
    </main>
  )
}

function WelcomePhone({ ui }: { ui: WelcomeUi }) {
  const demo = useDemo()
  const signinish = ui.mode === 'signin' || ui.mode === 'forgot'
  return (
    <main className="page-glow relative flex min-h-[100dvh] flex-col overflow-hidden bg-ink pb-[max(30px,env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] leading-[normal] text-cream [background-size:100%_1000px]">
      <div className="ob-aur ob-drift1 left-[-160px] top-[-160px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(255,179,71,0.2),rgba(255,179,71,0)_65%)] [animation-duration:16s]" aria-hidden="true" />
      <div className="ob-aur ob-drift2 right-[-200px] top-[160px] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(255,91,123,0.17),rgba(255,91,123,0)_65%)] [animation-duration:20s]" aria-hidden="true" />
      <Link to="/" className="pin d1 relative z-[1] flex items-center gap-[10px] px-6 pt-[14px] text-cream no-underline">
        <span className="ob-gbtn flex h-7 w-7 items-center justify-center rounded-[8px] text-[14px] font-extrabold text-ink">T</span>
        <span className="text-[16px] font-bold">TwinAI</span>
      </Link>
      {!signinish ? (
        <div key="up" className="ob-wsRise relative z-[1] mx-6 mt-[22px] flex flex-col gap-4">
          <span className="text-[12px] font-bold tracking-[.12em] text-amber">NEW HERE? HERE’S WHAT HAPPENS</span>
          <h1 className="m-0 mt-[-6px] text-[34px] font-bold leading-[1.06] tracking-[-0.035em]">Your next video,<br />written in <span className="ob-grad">your voice.</span></h1>
          <div aria-hidden="true" className="box-border min-h-[92px] w-full self-end rounded-[14px_14px_4px_14px] border border-[rgba(255,91,123,0.28)] bg-[#1A1418] px-[14px] py-3 text-[14.5px] font-medium leading-[1.45]">
            <span className="mb-1 flex items-center gap-[7px] text-[12px] font-bold tracking-[0.08em] text-coral-soft"><span className="ob-ringp h-[7px] w-[7px] rounded-[9px] bg-coral" />TWIN, WRITING AS YOU</span>
            {demo.typed}<span className="ob-caret" />
          </div>
          <NextSteps step={demo.step} small />
        </div>
      ) : (
        <div key="in" className="ob-wsSlide relative z-[1] mx-6 mt-[22px] flex flex-col gap-[14px]">
          <span className="text-[12px] font-bold tracking-[.12em] text-teal">WELCOME BACK</span>
          <h1 className="m-0 mt-[-6px] text-[32px] font-bold leading-[1.08] tracking-[-0.035em]">Your twin kept working <span className="ob-grad">while you were away.</span></h1>
          <BackCards phone />
        </div>
      )}
      <section className="pin d4 relative z-[1] mx-4 mt-[22px] flex flex-col gap-3 rounded-[22px] border border-white/[0.08] bg-[rgba(17,17,21,0.92)] p-5">
        <div key={ui.mode} className="flex flex-col gap-[3px]">
          <h2 className="m-0 text-[22px] font-bold tracking-[-0.02em]">{ui.title}</h2>
          <span className="text-[13px] text-teal-soft">{ui.sub}</span>
        </div>
        {(ui.mode === 'signup' || ui.mode === 'signin') && (
          <button type="button" onClick={ui.oauth} disabled={ui.busy} className="flex items-center justify-center gap-[10px] rounded-[12px] border-0 bg-cream p-[14px] text-[15px] font-semibold text-ink disabled:opacity-60">
            <GoogleIcon className="h-[17px] w-[17px]" />Continue with Google
          </button>
        )}
        <form onSubmit={ui.submit} className="flex flex-col gap-3">
          {ui.mode !== 'reset' && (
            <input className="ob-inp rounded-[12px] border border-white/[0.09] bg-ink p-[14px] text-[16px] text-cream outline-none" type="email" aria-label="Email"
              autoComplete="username" placeholder="you@yourbrand.com" value={ui.email} onChange={(e) => ui.setEmail(e.target.value)} required />
          )}
          {ui.mode !== 'forgot' && <PasswordField ui={ui} phone />}
          <Message ui={ui} />
          <button type="submit" disabled={ui.busy} className="ob-cta ob-gbtn flex items-center justify-center gap-2 rounded-[12px] border-0 p-[15px] text-[16px] font-bold text-ink shadow-[0_14px_30px_-12px_rgba(255,91,123,0.8)] disabled:opacity-70">
            {ui.cta}{!ui.busy && ' →'}
          </button>
        </form>
        <Terms phone />
        <button type="button" onClick={() => ui.switchMode(ui.mode === 'signup' ? 'signin' : ui.mode === 'signin' ? 'signup' : 'signin')} className="min-h-11 border-0 bg-transparent text-[14px] text-sand-soft">
          {ui.mode === 'signup' ? 'Already have an account? Sign in' : ui.mode === 'signin' ? 'New here? Start free' : 'Back to sign in'}
        </button>
        {ui.mode === 'signin' && (
          <button type="button" onClick={() => ui.switchMode('forgot')} className="-mt-2 min-h-11 border-0 bg-transparent text-[14px] text-coral-soft">Forgot your password?</button>
        )}
      </section>
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
