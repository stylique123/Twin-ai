import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, Check, Sparkles, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { PLANS, videosFromCredits } from '../lib/brand'
import { logEvent } from '../lib/api'
import { Aurora } from '../components/Aurora'
import { Reveal } from '../components/motion'

// Where checkout sends the user back to (billing/index.ts → `${appUrl}/billing?ok=1`).
// The webhook that actually grants the plan + credits fires ASYNCHRONOUSLY, so on
// arrival the profile usually hasn't updated yet. We poll refreshProfile until the
// plan changes or credits increase past the pre-checkout baseline, so the user sees
// a calm "activating → you're in" instead of landing on a stale page (or, before
// this route existed, getting bounced to the marketing site after paying).
const POLL_MS = 2500
const MAX_MS = 45_000

export default function Billing() {
  const { profile, refreshProfile } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const cancelled = params.get('cancel') === '1' || params.get('canceled') === '1'

  // Baseline captured once, before the webhook lands.
  const baseline = useRef<{ plan: string; credits: number } | null>(null)
  if (baseline.current === null && profile) {
    baseline.current = { plan: profile.plan ?? 'aspiring', credits: profile.credits ?? 0 }
  }

  const [status, setStatus] = useState<'activating' | 'done' | 'slow'>('activating')

  const activated =
    !!profile && !!baseline.current &&
    ((profile.plan ?? 'aspiring') !== baseline.current.plan || (profile.credits ?? 0) > baseline.current.credits)

  useEffect(() => {
    if (cancelled) return
    logEvent('checkout_return', { ok: params.get('ok') === '1' })
    let stop = false
    const started = Date.now()
    const tick = async () => {
      if (stop) return
      await refreshProfile()
      if (stop) return
      if (Date.now() - started > MAX_MS) { setStatus((s) => (s === 'done' ? s : 'slow')); return }
      window.setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => { stop = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelled])

  // Flip to the success state the moment activation is detected.
  useEffect(() => {
    if (activated && status !== 'done') {
      setStatus('done')
      logEvent('checkout_activated', { plan: profile?.plan ?? null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activated])

  const plan = PLANS.find((p) => p.id === profile?.plan) ?? PLANS[0]
  const left = videosFromCredits(profile?.credits ?? 0)

  return (
    <main className="relative overflow-clip">
      <Aurora className="opacity-60" />
      <div className="relative mx-auto grid min-h-[70vh] max-w-lg place-items-center px-5 py-16">
        <Reveal>
          <div className="glass w-full p-7 text-center sm:p-9">
            {cancelled ? (
              <>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/5">
                  <Sparkles className="h-6 w-6 text-sand" />
                </div>
                <h1 className="mt-5 font-display text-3xl tracking-tight">Checkout cancelled</h1>
                <p className="mt-2 text-sm text-stone">No charge was made. You can upgrade any time — your free remixes are still here.</p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Link to="/settings" className="btn-gradient text-sm">View plans</Link>
                  <Link to="/dashboard" className="btn-ghost text-sm">Back to dashboard</Link>
                </div>
              </>
            ) : status === 'done' ? (
              <>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-teal/15">
                  <Check className="h-6 w-6 text-teal" />
                </div>
                <h1 className="mt-5 font-display text-3xl tracking-tight">You're on {plan.name}</h1>
                <p className="mt-2 text-sm text-stone">
                  {left} remix{left === 1 ? '' : 'es'} ready to go. Let's make your next one.
                </p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button onClick={() => navigate('/app')} className="btn-gradient text-sm">
                    Make a video <ArrowRight className="h-4 w-4" />
                  </button>
                  <Link to="/dashboard" className="btn-ghost text-sm">Back to dashboard</Link>
                </div>
              </>
            ) : status === 'slow' ? (
              <>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber/15">
                  <Check className="h-6 w-6 text-amber" />
                </div>
                <h1 className="mt-5 font-display text-3xl tracking-tight">Payment received</h1>
                <p className="mt-2 text-sm text-stone">
                  Your plan is activating — this can take a minute. Your credits will appear on your dashboard shortly; no need to pay again.
                </p>
                <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <button onClick={() => refreshProfile()} className="btn-gradient text-sm">Check again</button>
                  <Link to="/dashboard" className="btn-ghost text-sm">Back to dashboard</Link>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/5">
                  <Loader2 className="h-6 w-6 animate-spin text-amber" />
                </div>
                <h1 className="mt-5 font-display text-3xl tracking-tight">Activating your plan…</h1>
                <p className="mt-2 text-sm text-stone">Thanks for upgrading. We're applying your credits now — this only takes a few seconds.</p>
              </>
            )}
          </div>
        </Reveal>
      </div>
    </main>
  )
}
