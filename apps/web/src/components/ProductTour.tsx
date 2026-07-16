import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, ArrowLeft, Wand2, LayoutGrid, LibraryBig, Settings, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { markTourSeen } from '../lib/api'
import { cn } from '../lib/cn'

// First-run product tour. Shown ONCE PER ACCOUNT: the "seen" flag lives on the
// profile row (profiles.tour_seen_at), so a new browser or device never replays
// it. localStorage stays as a same-session guard only, covering the moment
// between opening the tour and the profile refetch landing.
const TOUR_KEY = 'twinai_tour_v2'

type Step = {
  route: string
  icon: typeof Wand2
  badge: string
  title: string
  body: string
}

// One short line per tab. No sales copy: say what the screen is for and move on.
const STEPS: Step[] = [
  {
    route: '/dashboard',
    icon: LayoutDashboard,
    badge: 'Dashboard',
    title: 'Your home base',
    body: 'What you made and how it performs.',
  },
  {
    route: '/app',
    icon: Wand2,
    badge: 'Studio',
    title: 'Paste a link, get a script',
    body: 'Drop a TikTok, Reel or Short. You get a script in your voice, ready to shoot.',
  },
  {
    route: '/gallery',
    icon: LayoutGrid,
    badge: 'Gallery',
    title: 'Ideas when you need them',
    body: 'Formats that work. Tap Remix to turn one into your script.',
  },
  {
    route: '/history',
    icon: LibraryBig,
    badge: 'Library',
    title: 'Everything you make',
    body: 'Scripts, videos and covers are saved here.',
  },
  {
    route: '/settings',
    icon: Settings,
    badge: 'Voice',
    title: 'Tune how you sound',
    body: 'Your voice profile shapes every script. Edit it anytime.',
  },
]

export function ProductTour() {
  const nav = useNavigate()
  const { session, profile } = useAuth()
  const [step, setStep] = useState<number | null>(null)

  // Open once per ACCOUNT. The DB flag is written the instant the tour opens (not
  // when it finishes) so a refresh mid-tour never replays it anywhere.
  useEffect(() => {
    if (!session || !profile?.onboarded) return
    if (profile.tour_seen_at) return
    try {
      if (localStorage.getItem(TOUR_KEY)) return
      localStorage.setItem(TOUR_KEY, '1')
    } catch { /* storage off — the DB flag below still prevents replays */ }
    setStep(0)
    void markTourSeen().catch(() => {})
  }, [session, profile?.onboarded, profile?.tour_seen_at])

  // Navigate to the step's route so they actually SEE the page being explained.
  useEffect(() => {
    if (step !== null) nav(STEPS[step].route)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const close = () => setStep(null)

  if (step === null) return null
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Dim backdrop; clicking out skips. The page stays visible behind it. */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-ink/70 backdrop-blur-[2px]"
        onClick={close}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.99 }}
          transition={{ duration: 0.25 }}
          className="relative -mt-6 w-full max-w-sm rounded-panel border border-white/12 bg-ink2 p-6 shadow-[0_40px_120px_-20px_rgba(0,0,0,.9)]"
        >
          <button
            onClick={close}
            aria-label="Skip tour"
            className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-full text-stone transition-colors hover:bg-white/5 hover:text-cream"
          >
            <X className="h-4 w-4" />
          </button>

          <span className="inline-flex items-center gap-2 rounded-full bg-amber/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber">
            <s.icon className="h-3.5 w-3.5" /> {s.badge}
          </span>

          <h3 className="mt-3.5 font-display text-2xl leading-tight tracking-tight text-cream">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-sand">{s.body}</p>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className={cn('h-1.5 rounded-full transition-all duration-300', i === step ? 'w-6 bg-amber' : 'w-1.5 bg-white/20 hover:bg-white/40')}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} className="btn-ghost px-3 text-sm">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              )}
              <button onClick={() => (last ? close() : setStep(step + 1))} className="btn-gradient text-sm">
                {last ? 'Start creating' : 'Next'} {!last && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
