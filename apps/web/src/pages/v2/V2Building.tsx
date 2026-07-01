// Screen 2 — AI Building (Loading). Makes the wait feel productive: a live step
// list that names what the AI is doing (never a naked spinner), with a skeleton
// of the Plan screen behind it. Runs the real build, then auto-advances to the
// Plan screen the instant the timeline is ready. See PRODUCT_VISION §13.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import StepList from '../../components/v2/StepList'
import { Skeleton, QuietButton } from '../../components/v2/Primitives'
import { generateBlueprint } from '../../lib/api'
import { buildTimeline } from '../../lib/timelineAdapter'
import { saveTimeline } from '../../lib/timelineApi'

const STEPS = [
  { label: 'Watching your reference' },
  { label: 'Finding the strongest hook' },
  { label: 'Writing your script' },
  { label: 'Planning your shots' },
  { label: 'Setting up captions and B-roll' },
]

interface BuildState {
  reference_url?: string
  reference_note?: string
  tone?: 'understated' | 'balanced' | 'punchy'
  delivery?: 'on_camera' | 'voiceover'
}

export default function V2Building() {
  const nav = useNavigate()
  const loc = useLocation()
  const state = (loc.state || {}) as BuildState
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // No input (e.g. refresh) → go back to Create.
    if (!state.reference_url && !state.reference_note) {
      nav('/v2', { replace: true })
      return
    }
    if (started.current) return
    started.current = true

    // Pace the visible steps while the real build runs underneath.
    const ticker = setInterval(() => setActive((a) => Math.min(a + 1, STEPS.length - 1)), 1400)

    ;(async () => {
      try {
        const gen = await generateBlueprint({
          reference_url: state.reference_url || '',
          reference_note: state.reference_note || '',
          fidelity: 'balanced',
          tone: state.tone,
          delivery: state.delivery,
        })
        const timeline = buildTimeline({
          generationId: gen.id,
          blueprint: gen.blueprint,
          selectedHook: gen.selected_hook,
          platform: gen.blueprint?.reference_read?.platform,
        })
        await saveTimeline(timeline)
        clearInterval(ticker)
        setActive(STEPS.length)
        nav(`/v2/plan/${gen.id}`, { replace: true })
      } catch (e) {
        clearInterval(ticker)
        setError(e instanceof Error ? e.message : 'Something went wrong building your plan.')
      }
    })()

    return () => clearInterval(ticker)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const echo = state.reference_url ? 'From your reference link' : 'From your idea'

  return (
    <div className="relative min-h-[100dvh] w-full max-w-screen-sm mx-auto bg-gradient-to-b from-ink to-ink2 text-cream overflow-x-hidden">
      {/* Skeleton of the Plan screen behind the loader */}
      <div className="absolute inset-0 opacity-[0.12] p-4 space-y-3 pointer-events-none">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>

      <div className="relative px-5 pt-10 pb-8">
        <h1 className="text-xl font-bold">Building your video plan</h1>
        <p className="text-sm text-white/60 mt-1">{echo}</p>

        <div className="mt-8">
          {error ? (
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="font-medium">We hit a snag</p>
              <p className="text-sm text-white/70 mt-1">{error}</p>
              <button onClick={() => nav('/v2', { replace: true })} className="mt-3 rounded-xl bg-cream text-ink font-semibold px-4 py-2 text-sm hover:bg-white">
                Try a different reference
              </button>
            </div>
          ) : (
            <StepList steps={STEPS} activeIndex={active} />
          )}
        </div>

        <p className="text-xs text-white/50 mt-8">Usually 30–60 seconds. We keep working even if you leave.</p>
        {!error && (
          <div className="mt-6">
            <QuietButton onClick={() => nav('/v2', { replace: true })}>Cancel</QuietButton>
          </div>
        )}
      </div>
    </div>
  )
}
