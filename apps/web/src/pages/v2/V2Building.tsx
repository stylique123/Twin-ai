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
  // Honest: this build produces the caption packet + title/cover, not b-roll (b-roll
  // is an edit-time, env-gated feature that isn't on by default).
  { label: 'Writing your captions & title', icon: Captions },
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
  // True while the reference is being scraped/transcribed (step 0 is held the whole
  // time). Drives a slow crawl so the bar never freezes at 12% and reads as stuck.
  const [ingesting, setIngesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  // Set ONLY by the explicit Cancel button — so leaving via the nav (Library,
  // Calendar…) keeps the build running in the background, but Cancel truly stops
  // it (and never spends a credit).
  const cancelled = useRef(false)

  // While a build is in flight, warn before a tab close / refresh (that WOULD lose
  // the in-flight work). In-app navigation is safe — the build keeps running.
  useEffect(() => {
    if (error) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [error])

  // Ease the % bar toward the current step's target so it always creeps forward
  // (never a dead bar), and snaps to 100 the instant the plan is ready.
  //
  // The reference scrape holds step 0 for the whole read; if the bar just sat at
  // 12% it read as frozen ("people think it's stuck"). So while ingesting, step 0
  // gets a SLOW independent crawl up to a ~40% ceiling — always visibly moving,
  // but paced so it doesn't reach the ceiling before the read realistically ends.
  // Once the steps advance, the normal per-step targets take over.
  useEffect(() => {
    if (error) return
    const scraping = active === 0 && ingesting
    const target = scraping ? 40 : STEP_PCT[Math.min(active, STEP_PCT.length - 1)]
    const factor = scraping ? 0.012 : 0.08 // gentler climb during the long read
    const floor = scraping ? 0.12 : 0.4
    const id = setInterval(() => {
      setPct((p) => (p >= target ? p : Math.min(target, p + Math.max(floor, (target - p) * factor))))
    }, 90)
    return () => clearInterval(id)
  }, [active, ingesting, error])

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
    let alive = true
    const startPacing = () => {
      // Guard against a post-unmount start leaking an interval that never clears.
      if (!alive || cancelled.current) return
      setActive(willIngest ? 1 : 0)
      ticker = setInterval(() => { if (alive) setActive((a) => Math.min(a + 1, STEPS.length - 1)) }, 1400)
    }

    ;(async () => {
      try {
        // 1) READING the reference is BEST-EFFORT. A supported link gets truly read
        //    (transcript + structure) for the most tailored script — but if the read
        //    fails, the video is private/unreadable, or the worker is briefly backed
        //    up, we DON'T hard-fail: we build the plan from the reference + the
        //    creator's DNA (pattern mode). A slightly-less-tailored script always
        //    beats "We hit a snag". The wait is also capped so a slow read never
        //    strands the creator for minutes.
        let transcript_id: string | undefined
        if (willIngest) {
          setIngesting(true)
          try {
            const { jobId, transcriptId } = await ingestReference(refUrl)
            transcript_id = transcriptId // cache hit → immediate
            if (!transcript_id) {
              // Poll on a tighter 1.2s cadence so a transcript that finishes early is
              // picked up promptly (was 2.5s → up to 2.5s wasted after it was ready).
              // ~72s ceiling preserved, then we proceed in pattern mode regardless.
              for (let i = 0; i < 60; i++) {
                await new Promise((r) => setTimeout(r, 1200))
                if (cancelled.current) return // explicit Cancel → stop, no spend
                const job = await getJob(jobId)
                if (!job) continue
                if (job.status === 'done' && job.result?.transcript_id) { transcript_id = job.result.transcript_id; break }
                if (job.status === 'failed') break // unreadable → fall through to pattern mode
              }
            }
          } catch (e) {
            // Ingest itself errored — log and build from the reference without it.
            console.warn('[build] reference read failed; using pattern mode', e)
          } finally {
            setIngesting(false)
          }
        }

        if (cancelled.current) return // Cancel pressed during the read → no spend
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
        // The blueprint is saved server-side regardless of navigation, so it's
        // already in the Library. Only route the user there if they're still here.
        if (alive) { setActive(STEPS.length); nav(`/result/${gen.id}`, { replace: true }) }
      } catch (e) {
        if (ticker) clearInterval(ticker)
        if (alive) setError(e instanceof Error ? e.message : 'Something went wrong building your plan.')
      }
    })()

    // Unmount (in-app nav): the build keeps running so it lands in the Library —
    // we only stop the visual ticker. Explicit Cancel is what actually aborts it.
    return () => { alive = false; if (ticker) clearInterval(ticker) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const echo = state.reference_url ? 'From your reference link' : 'From your idea'
  const shownPct = Math.round(pct)
  // Only a supported host is actually watched/transcribed; a described idea or an
  // unsupported link is used as a guide (pattern mode). Keep the first step honest so
  // it never claims to "watch" something it can't read.
  const willRead = !!state.reference_url && isSupportedRef(state.reference_url)
  const stepLabel = (i: number, base: string) =>
    i !== 0 ? base : willRead ? 'Watching your reference' : state.reference_url ? 'Using your reference as a guide' : 'Working from your idea'
  // A voice-not-ready failure has a specific fix (set up your brand voice), not just
  // "try a different reference".
  const isVoiceIssue = /voice/i.test(error ?? '')

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
            {isVoiceIssue ? (
              <>
                <button onClick={() => nav('/brands')} className="btn-gradient mt-6 w-full">Set up your brand voice</button>
                <button onClick={() => nav('/v2', { replace: true })} className="btn-ghost mt-3 w-full">Try a different reference</button>
              </>
            ) : (
              <button onClick={() => nav('/v2', { replace: true })} className="btn-gradient mt-6 w-full">Try a different reference</button>
            )}
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
                    <span className={done ? 'text-sm text-sand' : isActive ? 'text-sm font-medium text-cream' : 'text-sm text-stone'}>{stepLabel(i, s.label)}</span>
                    {isActive && <span className="ml-auto text-[11px] font-medium text-amber">Working…</span>}
                    {done && <span className="ml-auto text-[11px] font-medium text-coral">Done</span>}
                  </li>
                )
              })}
            </ul>

            <p className="mt-6 rounded-card border border-white/8 bg-white/[0.02] px-4 py-3 text-center text-xs leading-relaxed text-stone">
              Usually 30–60 seconds. Leave anytime — we keep building and it lands in your Library.
            </p>
            <button onClick={() => { cancelled.current = true; nav('/v2', { replace: true }) }} className="mt-3 block w-full text-center text-sm text-stone transition-colors hover:text-cream">
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
