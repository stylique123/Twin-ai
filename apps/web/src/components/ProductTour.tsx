import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, ArrowLeft, Wand2, LayoutGrid, LibraryBig, Settings, Sparkles, CreditCard } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/cn'

// First-run product tour. A friendly, guided walk-through that visits each part of
// the app and explains — in one plain line — what you do there. Shown EXACTLY ONCE
// (a localStorage flag set the moment it opens, so a refresh mid-tour never replays
// it), to a logged-in, onboarded user. Mounted at the app root so it survives the
// route changes it triggers.
const TOUR_KEY = 'twinai_tour_v2'

type Step = {
  route: string
  icon: typeof Wand2
  badge: string
  title: string
  body: string
  // A concrete "do this → get that" line, so the tour teaches, not just greets.
  doThis?: string
}

const STEPS: Step[] = [
  {
    route: '/dashboard',
    icon: Sparkles,
    badge: 'Welcome',
    title: 'Welcome to TwinAI 👋',
    body: "Here's the whole idea in 20 seconds: you paste a video you love, we rewrite it in YOUR voice, then you record, edit and post — all in one window. Let's take a quick look around.",
    doThis: 'This is your home base — what you\'ve made and what\'s working.',
  },
  {
    route: '/app',
    icon: Wand2,
    badge: 'Studio',
    title: 'Paste a link, get a script',
    body: "Drop any TikTok, Reel or Short here. We watch the real clip, decode why it worked, and write you a shootable script — hooks, beats, shot list, caption — all in your voice.",
    doThis: 'Paste one link → get a full, ready-to-shoot script.',
  },
  {
    route: '/gallery',
    icon: LayoutGrid,
    badge: 'Gallery',
    title: 'Never stare at a blank page',
    body: "Proven formats, scored for your niche. Tap any card to see exactly why it worked — then hit Remix and it becomes your next script in one click.",
    doThis: 'Stuck for ideas? Pick a winning format → remix it as yours.',
  },
  {
    route: '/history',
    icon: LibraryBig,
    badge: 'Library',
    title: 'Everything you make, in one place',
    body: "Every script and finished video lives here. Re-open one to edit it, record it, or grab the caption and post.",
    doThis: 'Come back any time to re-edit or publish past work.',
  },
  {
    route: '/settings',
    icon: Settings,
    badge: 'Your DNA',
    title: 'Tune how you sound',
    body: "Your Creator DNA decides how every script reads — your niche, audience and voice. View it, edit it, or refresh it whenever your content shifts.",
    doThis: 'Edit your DNA → every future script matches your voice.',
  },
  {
    route: '/settings',
    icon: CreditCard,
    badge: 'Plan',
    title: 'Upgrade when it\'s working',
    body: "Start on free remixes. When you\'re ready for more — no watermark, more videos, analytics — open your plan, compare them side by side, and add a card in seconds.",
    doThis: 'Hit Upgrade → compare plans → pay. That\'s it.',
  },
  {
    route: '/dashboard',
    icon: Sparkles,
    badge: 'You\'re set',
    title: "That\'s the whole loop 🎬",
    body: "Paste → script → record → edit → post. You\'ve got free remixes to start — go make your first one. Have fun.",
    doThis: 'Ready when you are. Paste your first link.',
  },
]

export function ProductTour() {
  const nav = useNavigate()
  const { session, profile } = useAuth()
  const [step, setStep] = useState<number | null>(null)

  // Start once — and ONLY once, ever. We write the "seen" flag the instant the tour
  // opens (not when it finishes), so closing the tab or refreshing halfway through
  // never makes it replay on the next login. It will never show on a return visit.
  useEffect(() => {
    if (!session || !profile?.onboarded) return
    try {
      if (localStorage.getItem(TOUR_KEY)) return
      localStorage.setItem(TOUR_KEY, '1')
      setStep(0)
    } catch { /* storage off — just skip the tour */ }
  }, [session, profile?.onboarded])

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
      {/* Dim, blurred backdrop so the tour reads as a guided overlay (and clicking
          out skips it). The page stays visible behind it. */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-ink/70 backdrop-blur-[2px]"
        onClick={close}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.3 }}
          // Solid (not transparent) card, larger, centred and lifted slightly above
          // dead-centre so it never feels buried.
          className="relative -mt-8 w-full max-w-lg rounded-panel border border-white/12 bg-ink2 p-7 shadow-[0_40px_120px_-20px_rgba(0,0,0,.9)] sm:p-8"
        >
          {/* Persistent, obvious Skip — always top-right, labelled, not a tiny line. */}
          <button
            onClick={close}
            className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-stone transition-colors hover:border-white/20 hover:text-cream"
          >
            Skip tour <X className="h-3.5 w-3.5" />
          </button>

          <span className="inline-flex items-center gap-2 rounded-full bg-amber/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber">
            <s.icon className="h-3.5 w-3.5" /> {s.badge}
          </span>

          <h3 className="mt-4 font-display text-2xl leading-tight tracking-tight text-cream sm:text-3xl">{s.title}</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-sand">{s.body}</p>

          {s.doThis && (
            <div className="mt-4 flex items-start gap-2.5 rounded-card border border-teal/20 bg-teal/[0.06] px-4 py-3">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
              <p className="text-sm font-medium text-cream">{s.doThis}</p>
            </div>
          )}

          <div className="mt-7 flex items-center justify-between gap-3">
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

          <p className="mt-4 text-center text-xs text-stone">
            Step {step + 1} of {STEPS.length} · this only shows once
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
