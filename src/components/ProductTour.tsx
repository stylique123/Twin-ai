import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, ArrowLeft, Wand2, LayoutGrid, LibraryBig, Settings, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/cn'

// First-run product tour. A friendly step-through that navigates to each part of
// the app and explains it, with Skip / Back / Next. Shown ONCE (localStorage flag)
// to a logged-in, onboarded user. Mounted at the app root so it survives the
// route changes it triggers.
const TOUR_KEY = 'twinai_tour_v1'

const STEPS = [
  { route: '/dashboard', icon: Sparkles, title: 'Welcome to TwinAI 👋', body: "A 20-second tour. Paste a video you love → get it in YOUR voice → record, edit, post. Here's how it all works." },
  { route: '/app', icon: Wand2, title: 'The Studio', body: 'Paste any TikTok, Reel or Short. We read the real clip and write a shootable script in your voice. One link = one remix.' },
  { route: '/gallery', icon: LayoutGrid, title: 'The Gallery', body: 'Proven formats scored for your niche, plus a playbook of what to make next. Tap any card to see why it works, then remix it in one tap.' },
  { route: '/history', icon: LibraryBig, title: 'Your Library', body: 'Every script and finished video you make lives here — re-open, re-edit, or publish any of them.' },
  { route: '/settings', icon: Settings, title: 'Your DNA & plan', body: 'Tune your Creator DNA (how every script sounds), see your plan, and upgrade any time.' },
  { route: '/dashboard', icon: Sparkles, title: "You're ready 🎬", body: 'Paste your first link and make something — you have free remixes to start. Have fun!' },
]

export function ProductTour() {
  const nav = useNavigate()
  const { session, profile } = useAuth()
  const [step, setStep] = useState<number | null>(null)

  // Start once, after the user is logged in + onboarded.
  useEffect(() => {
    if (!session || !profile?.onboarded) return
    try { if (!localStorage.getItem(TOUR_KEY)) setStep(0) } catch { /* storage off */ }
  }, [session, profile?.onboarded])

  // Navigate to the step's route so they actually SEE the page being explained.
  useEffect(() => {
    if (step !== null) nav(STEPS[step].route)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const done = () => {
    try { localStorage.setItem(TOUR_KEY, '1') } catch { /* ignore */ }
    setStep(null)
  }

  if (step === null) return null
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 sm:p-6">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25 }}
          className="glass pointer-events-auto w-full max-w-md p-5 shadow-lift"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber/15"><s.icon className="h-5 w-5 text-amber" /></span>
            <div className="min-w-0 flex-1">
              <h3 className="font-heading text-cream">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone">{s.body}</p>
            </div>
            <button onClick={done} aria-label="Close tour" className="text-stone transition-colors hover:text-cream"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all duration-300', i === step ? 'w-5 bg-amber' : 'w-1.5 bg-white/20')} />)}
            </div>
            <div className="flex items-center gap-2">
              {step > 0 && <button onClick={() => setStep(step - 1)} className="btn-ghost px-3 text-sm"><ArrowLeft className="h-4 w-4" /></button>}
              <button onClick={() => (last ? done() : setStep(step + 1))} className="btn-gradient text-sm">
                {last ? 'Get started' : 'Next'} {!last && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {!last && <button onClick={done} className="mt-2 w-full text-center text-xs text-stone transition-colors hover:text-cream">Skip tour</button>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
