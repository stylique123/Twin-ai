// Screen 2 — AI Building (Loading). Makes the wait feel productive: a live step
// list that names what the AI is doing (never a naked spinner), with a skeleton
// of the Plan screen behind it. Runs the real build, then auto-advances to the
// Plan screen the instant the timeline is ready. See PRODUCT_VISION §13.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Sparkles, Check, Loader2, Eye, Wand2, FileText, Clapperboard, Captions } from 'lucide-react'
import { generateBlueprint, ingestReference, getJob } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { Aurora } from '../../components/Aurora'
import { buildTimeline } from '../../lib/timelineAdapter'
import { saveTimeline } from '../../lib/timelineApi'

const STEPS = [
  { label: 'Watching your reference', icon: Eye },
  { label: 'Finding the strongest hook', icon: Wand2 },
  { label: 'Writing your script', icon: FileText },
  { label: 'Planning your shots', icon: Clapperboard },
  { label: 'Setting up captions & B-roll', icon: Captions },
]
// Target progress % per active step, so the bar always shows forward motion and
// the last (long) model call never looks frozen. Index 5 = finished → 100.
const STEP_PCT = [12, 34, 58, 80, 94, 100]

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
  const [pct, setPct] = useState(6)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  // Ease the % bar toward the current step's target so it always creeps forward
  // (never a dead bar), and snaps to 100 the instant the plan is ready.
  useEffect(() => {
    if (error) return
    const target = STEP_PCT[Math.min(active, STEP_PCT.length - 1)]
    const id = setInterval(() => {
      setPct((p) => (p >= target ? p : Math.min(target, p + Math.max(0.4, (target - p) * 0.08))))
    }, 90)
    return () => clearInterval(id)
  }, [active, error])

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
  const shownPct = Math.round(pct)

  return (
    // Full brand canvas, vertically centered — one composed card, no stranded
    // column or dead space. Matches the "Creating your video" render screen.
    <div className="relative grid min-h-[100dvh] w-full place-items-center overflow-clip bg-ink px-5 py-10 text-cream">
      <Aurora className="opacity-70" />
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute left-1/2 top-1/3 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-coral/10 blur-[150px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[18rem] w-[18rem] rounded-full bg-teal/10 blur-[130px]" />
      </div>

      <div className="relative w-full max-w-md">
        {error ? (
          <div className="glass gradient-border p-7 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-coral/15"><Sparkles className="h-5 w-5 text-coral" /></span>
            <h2 className="mt-4 font-display text-2xl">We hit a snag</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone">{error}</p>
            <button onClick={() => nav('/v2', { replace: true })} className="btn-gradient mt-6 w-full">Try a different reference</button>
          </div>
        ) : (
          <div className="glass gradient-border p-6 sm:p-8">
            {/* Signature icon + gentle pulse */}
            <div className="relative mx-auto h-14 w-14">
              <span className="absolute inset-0 animate-ping rounded-2xl bg-signature opacity-30" />
              <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-signature shadow-glow">
                <Sparkles className="h-6 w-6 text-ink" />
              </span>
            </div>

            <h1 className="mt-5 text-center font-display text-2xl tracking-tight">Building your video plan</h1>
            <p className="mt-1 text-center text-sm text-stone">{echo}</p>

            {/* Live progress */}
            <div className="mt-6 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-amber via-coral to-teal transition-[width] duration-200 ease-out" style={{ width: `${shownPct}%` }} />
              </div>
              <span className="w-10 text-right text-sm font-semibold tabular-nums text-cream">{shownPct}%</span>
            </div>

            {/* Steps — done / active / pending */}
            <ul className="mt-6 space-y-3.5">
              {STEPS.map((s, i) => {
                const done = i < active
                const isActive = i === active
                return (
                  <li key={i} className="flex items-center gap-3">
                    {done ? (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-coral"><Check className="h-4 w-4 text-white" /></span>
                    ) : isActive ? (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-coral"><Loader2 className="h-3.5 w-3.5 animate-spin text-coral" /></span>
                    ) : (
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-dashed border-white/15 text-[11px] font-bold text-stone">{i + 1}</span>
                    )}
                    <span className={done ? 'text-sm text-sand' : isActive ? 'text-sm font-medium text-cream' : 'text-sm text-stone'}>{s.label}</span>
                    {isActive && <span className="ml-auto text-[11px] font-medium text-amber">Working…</span>}
                    {done && <span className="ml-auto text-[11px] font-medium text-coral">Done</span>}
                  </li>
                )
              })}
            </ul>

            <p className="mt-6 rounded-card border border-white/8 bg-white/[0.02] px-4 py-3 text-center text-xs leading-relaxed text-stone">
              Usually 30–60 seconds — you can leave this screen, we keep working and it lands in your library.
            </p>
            <button onClick={() => nav('/v2', { replace: true })} className="mt-3 block w-full text-center text-sm text-stone transition-colors hover:text-cream">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
