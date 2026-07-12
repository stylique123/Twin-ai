// Screen 2 — AI Building (Loading). Makes the wait feel productive: a live step
// list that names what the AI is doing (never a naked spinner), with a skeleton
// of the Plan screen behind it. Runs the real build, then auto-advances to the
// Plan screen the instant the timeline is ready. See PRODUCT_VISION §13.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import StepList from '../../components/v2/StepList'
import { Skeleton, QuietButton } from '../../components/v2/Primitives'
import { generateBlueprint, ingestReference, getJob } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { buildTimeline } from '../../lib/timelineAdapter'
import { saveTimeline } from '../../lib/timelineApi'

const STEPS = [
  { label: 'Watching your reference' },
  { label: 'Finding the strongest hook' },
  { label: 'Writing your script' },
  { label: 'Planning your shots' },
  { label: 'Setting up captions and B-roll' },
]

// The hosts ingest-reference can actually fetch + transcribe (mirrors its
// SSRF allow-list). A link to one of these gets truly READ; anything else
// (or a described idea) falls back to pattern-mode generation.
const SUPPORTED = ['tiktok.com', 'instagram.com', 'youtube.com', 'youtu.be']
function isSupportedRef(url: string): boolean {
  try {
    const h = new URL(url.trim()).hostname.toLowerCase()
    return SUPPORTED.some((d) => h === d || h.endsWith('.' + d))
  } catch {
    return false
  }
}

interface BuildState {
  reference_url?: string
  reference_note?: string
  fidelity?: 'close' | 'balanced' | 'loose'
  tone?: 'understated' | 'balanced' | 'punchy'
}

export default function V2Building() {
  const nav = useNavigate()
  const loc = useLocation()
  const { refreshProfile } = useAuth()
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

    const refUrl = (state.reference_url || '').trim()
    const willIngest = !!refUrl && isSupportedRef(refUrl)
    let ticker: ReturnType<typeof setInterval> | null = null
    // Advance the visible steps AFTER the reference is read (steps 1..4 track the
    // blueprint write). During a real ingest we hold on step 0 ("Watching your
    // reference") — which is now literally true.
    const startPacing = () => {
      setActive(willIngest ? 1 : 0)
      ticker = setInterval(() => setActive((a) => Math.min(a + 1, STEPS.length - 1)), 1400)
    }

    ;(async () => {
      try {
        // 1) Actually READ the reference video when it's a supported link, so the
        //    blueprint is built from the real clip (transcript + structure), not a
        //    blind guess. Unsupported links / described ideas skip straight to write.
        let transcript_id: string | undefined
        if (willIngest) {
          const { jobId, transcriptId } = await ingestReference(refUrl)
          transcript_id = transcriptId // cache hit → immediate
          if (!transcript_id) {
            for (let i = 0; i < 80; i++) {
              await new Promise((r) => setTimeout(r, 2500))
              const job = await getJob(jobId)
              if (!job) continue
              if (job.status === 'done' && job.result?.transcript_id) { transcript_id = job.result.transcript_id; break }
              if (job.status === 'failed') throw new Error(job.error || 'We couldn’t read that video. Try another link — you weren’t charged.')
            }
            if (!transcript_id) throw new Error('Reading the video is taking longer than usual. Try again in a moment — you weren’t charged.')
          }
        }

        startPacing()
        const gen = await generateBlueprint({
          reference_url: refUrl,
          reference_note: state.reference_note || '',
          fidelity: state.fidelity ?? 'balanced',
          tone: state.tone,
          ...(transcript_id ? { transcript_id } : {}),
        })
        // A recreation was just spent — refresh so the remixes-left counter is
        // accurate everywhere (AppShell / Dashboard / Settings), not one behind.
        void refreshProfile()
        const timeline = buildTimeline({
          generationId: gen.id,
          blueprint: gen.blueprint,
          selectedHook: gen.selected_hook,
          platform: gen.blueprint?.reference_read?.platform,
        })
        await saveTimeline(timeline)
        if (ticker) clearInterval(ticker)
        setActive(STEPS.length)
        nav(`/v2/plan/${gen.id}`, { replace: true })
      } catch (e) {
        if (ticker) clearInterval(ticker)
        setError(e instanceof Error ? e.message : 'Something went wrong building your plan.')
      }
    })()

    return () => { if (ticker) clearInterval(ticker) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const echo = state.reference_url ? 'From your reference link' : 'From your idea'

  return (
    <div className="relative min-h-[100dvh] w-full max-w-screen-sm mx-auto bg-gradient-to-b from-ink to-ink2 text-cream overflow-x-hidden lg:max-w-2xl">
      {/* Skeleton of the Plan screen behind the loader */}
      <div className="absolute inset-0 opacity-[0.12] p-4 space-y-3 pointer-events-none lg:p-0 lg:pt-24">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>

      <div className="relative px-5 pt-10 pb-8 lg:px-0 lg:pt-16">
        <h1 className="text-xl font-bold lg:text-2xl">Building your video plan</h1>
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
