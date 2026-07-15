// Screen 5 — Editing + Final Video Review. Shows the REAL auto-edit job: live
// stage labels emitted by the worker (never a timer), then the finished video
// first, with Download + Publish. On failure: retry / back. Supports captions selector,
// manual refinement panel, and dashboard return navigation.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BottomSheet, { SheetOption } from '../../components/v2/BottomSheet'
import {
  getGeneration, signEditUrls, signTakeUrl, getJob, fetchEdl, reEditWithEdl, pollEditJob, markPosted,
  listConnections, schedulePost, publishPost, type PlatformConnection,
} from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { loadTimeline } from '../../lib/timelineApi'
import { CAPTION_STYLE_OPTIONS } from '../../lib/types'
import { RefinePanel } from '../../components/RefinePanel'
import { POSTING_LIVE } from '../../lib/brand'
import { SlidersHorizontal, Loader2, Check, Pencil, Captions, Copy, Share, Download, Lock } from 'lucide-react'
import type { SceneTimeline } from '../../lib/timeline'

// The processing checklist (mock parity): the worker reports a live stage label +
// pct; we map pct onto these named steps so the wait reads as visible progress,
// never a bare spinner. Labels mirror what the pipeline actually does.
const PROC_STEPS = [
  { t: 'Analyzing speech', d: 'Detecting words and pauses' },
  { t: 'Cutting the dead air', d: 'Removing pauses and flubs' },
  { t: 'Generating captions', d: 'Accurate, synced captions' },
  { t: 'Adding B-roll & emphasis', d: 'Finding the right moments' },
  { t: 'Finalizing & rendering', d: 'Bringing everything together' },
]

// 'timeout' is DISTINCT from 'failed': the client stopped polling but the worker
// (whose max render time is longer than our poll window) is very likely still
// working and the video will land in the Library. We must not tell the creator it
// failed or invite them to re-record a job that's still succeeding.
type Phase = 'rendering' | 'done' | 'failed' | 'timeout'

export default function V2Review() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const jobId = params.get('job')
  const nav = useNavigate()
  const { refreshProfile } = useAuth()

  // A paid edit may have just been charged at enqueue — refresh once so the
  // remixes-left counter reflects the spend instead of lagging a reload behind.
  useEffect(() => { void refreshProfile() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [timeline, setTimeline] = useState<SceneTimeline | null>(null)
  const [phase, setPhase] = useState<Phase>('rendering')
  const [label, setLabel] = useState('Starting the edit…')
  const [pct, setPct] = useState(5)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [captionSheet, setCaptionSheet] = useState(false)
  const [publishSheet, setPublishSheet] = useState(false)
  const [publishing, setPublishing] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const stopped = useRef(false)

  // Force a real file download from the signed storage URL. Supabase signed URLs
  // honor a `download` query param (sets Content-Disposition: attachment), which
  // works cross-origin where the <a download> attribute alone does not.
  const downloadVideo = () => {
    if (!videoUrl) return
    const href = videoUrl + (videoUrl.includes('?') ? '&' : '?') + 'download=twinai-video.mp4'
    const a = document.createElement('a')
    a.href = href
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // One-tap auto-posting: if the platform is connected (Calendar → Connected
  // accounts), actually post the finished render via the `social` edge function
  // (real TikTok/IG/LinkedIn/YouTube adapters). If it isn't connected yet, fall
  // back to the honest manual path — copy the caption, log the post, open the
  // platform's uploader — so there's never a dead-end no-op either way.
  // NOTE: platform is stored as the SLUG (youtube/tiktok/instagram/linkedin),
  // not the display label, so the logged post matches every other surface's filters.
  const [connections, setConnections] = useState<PlatformConnection[]>([])
  const [publishError, setPublishError] = useState<string | null>(null)
  useEffect(() => { if (POSTING_LIVE) void listConnections().then(setConnections).catch(() => {}) }, [])
  const connectionFor = (slug: string) => connections.find((c) => c.platform === slug && c.status === 'connected')

  const publishTo = async (p: { label: string; slug: string; url: string }) => {
    if (!videoUrl || publishing) return
    setPublishing(p.label)
    setPublishError(null)
    const caption = timeline?.hook ?? ''
    const conn = connectionFor(p.slug)
    try {
      if (conn) {
        const post = await schedulePost({ generationId: id, platform: p.slug, scheduledFor: new Date().toISOString(), caption })
        const r = await publishPost(post.id)
        if (!r.ok) { setPublishError(r.error ?? `Couldn't post to ${p.label}.`); return }
        setPublishSheet(false)
        nav('/calendar')
        return
      }
      // Not connected — manual path (never a dead end). Open the uploader FIRST,
      // synchronously in the tap gesture: after an await, Safari/Chrome treat
      // window.open as a popup and block it (the share dead-end bug).
      window.open(p.url, '_blank', 'noopener')
      try { await navigator.clipboard?.writeText(caption) } catch { /* clipboard blocked — ignore */ }
      try { await markPosted({ generationId: id, platform: p.slug, caption }) } catch { /* best-effort log */ }
      setPublishSheet(false)
      nav('/calendar')
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : `Couldn't post to ${p.label}.`)
    } finally {
      setPublishing(null)
    }
  }
  const PUBLISH_TARGETS = [
    { label: 'TikTok', slug: 'tiktok', url: 'https://www.tiktok.com/upload' },
    { label: 'Reels', slug: 'instagram', url: 'https://www.instagram.com/' },
    { label: 'YouTube Shorts', slug: 'youtube', url: 'https://www.youtube.com/upload' },
    { label: 'LinkedIn', slug: 'linkedin', url: 'https://www.linkedin.com/feed/' },
  ]

  // Refine & EDL sync states
  const [refineOpen, setRefineOpen] = useState(false)
  const [refineEdl, setRefineEdl] = useState<any>(null)
  const [takePath, setTakePath] = useState<string | null>(null)
  const [takeUrl, setTakeUrl] = useState<string | null>(null)
  const [refineLoading, setRefineLoading] = useState(false)

  useEffect(() => { loadTimeline(id).then(setTimeline) }, [id])

  // Fetch the raw take path up front (independent of the edit job) so the creator
  // can download their original footage the WHOLE time — while it's rendering, or
  // if the edit fails — instead of it being stranded behind a pending/broken edit.
  useEffect(() => { getGeneration(id).then((g) => { if (g?.take_path) setTakePath(g.take_path) }).catch(() => {}) }, [id])
  useEffect(() => { if (takePath) signTakeUrl(takePath).then(setTakeUrl).catch(() => {}) }, [takePath])

  // Real status polling: read the worker's live progress, then the finished video.
  useEffect(() => {
    stopped.current = false

    const showFinished = async () => {
      // Prefer the generation's stored edit_path (signed); else the job output_url.
      const g = await getGeneration(id)
      if (g) {
        setTakePath(g.take_path || null)
        if (g.edl_path) {
          setRefineLoading(true)
          try {
            const edl = await fetchEdl(g.edl_path)
            setRefineEdl(edl)
          } catch (e) {
            console.error('Failed to load EDL', e)
          } finally {
            setRefineLoading(false)
          }
        }
        if (g.edit_path) {
          const urls = await signEditUrls([g.edit_path])
          if (urls[g.edit_path]) { setVideoUrl(urls[g.edit_path]); return true }
        }
      }
      return false
    }

    // Browsers throttle setTimeout in a backgrounded/inactive tab, so the poll
    // loop can stall for minutes even after the render finished — the reported
    // "10-minute stall that cleared the instant I refocused the tab". Re-check the
    // job immediately on refocus so a finished render appears at once.
    const onVisible = async () => {
      if (document.visibilityState !== 'visible' || stopped.current || !jobId) return
      const job = await getJob(jobId).catch(() => null)
      if (!job || stopped.current) return
      if (job.status === 'failed') { stopped.current = true; setPhase('failed'); setLabel(job.error || 'The edit failed.'); return }
      if (job.status === 'done' && (await showFinished())) { stopped.current = true; setPct(100); setPhase('done') }
    }
    document.addEventListener('visibilitychange', onVisible)

    // Synthetic "creep": the worker spends its first seconds downloading the take +
    // loading models before it emits any real pct, so the bar would otherwise sit
    // frozen at 5% and read as stuck. Nudge it up slowly (capped at 90%) so there's
    // always visible motion; real progress overrides via Math.max above.
    const creep = setInterval(() => {
      if (stopped.current) return
      setPct((prev) => (prev < 90 ? prev + Math.max(0.4, (90 - prev) * 0.03) : prev))
    }, 1400)

    ;(async () => {
      // No job id (e.g. opened directly) → just try to show an existing render.
      if (!jobId) {
        if (await showFinished()) { setPhase('done') } else { setPhase('failed'); setLabel('No render found for this video.') }
        return
      }
      const job = await pollEditJob(
        jobId,
        // Never let real progress jump BACKWARD (the worker's first pct can be < a
        // synthetic value); take the max with what's already shown.
        (label, pct) => { if (label) setLabel(label); if (pct) setPct((prev) => Math.max(prev, Math.min(99, pct))) },
        { attempts: 300, shouldStop: () => stopped.current },
      )
      if (stopped.current) return
      // Poll window elapsed but no terminal state — it's still rendering, not failed.
      if (!job) { setPhase('timeout'); setLabel("This one is taking longer than usual. We'll keep rendering it and it'll appear in your library — you don't need to wait here."); return }
      if (job.status === 'failed') { setPhase('failed'); setLabel(job.error || 'The edit failed.'); return }
      const url = job.result?.output_url
      if (url) setVideoUrl(url)
      const finished = (await showFinished()) || !!url
      setPct(100)
      // Only call it done when a real video actually resolved; otherwise be honest.
      if (finished) { setPhase('done') }
      else { setPhase('failed'); setLabel('The edit finished but the video did not come through. Check your library in a moment.') }
    })()

    return () => { stopped.current = true; clearInterval(creep); document.removeEventListener('visibilitychange', onVisible) }
  }, [id, jobId])

  const retry = () => nav(`/v2/capture/${id}?mode=record`)

  // Wire up Caption selection remake trigger
  const applyCaptionStyle = async (styleId: string) => {
    if (!refineEdl || !takePath) return
    setCaptionSheet(false)
    setPhase('rendering')
    setLabel('Re-rendering caption style…')
    setPct(10)

    const nextEdl = {
      ...refineEdl,
      captions: {
        ...refineEdl.captions,
        style: styleId,
      },
    }

    try {
      const newJobId = await reEditWithEdl(id, takePath, nextEdl)
      setParams(new URLSearchParams({ job: newJobId }))
    } catch (e) {
      setPhase('failed')
      setLabel(e instanceof Error ? e.message : 'Could not re-render.')
    }
  }

  const handleRefineApplied = (newJobId: string) => {
    setPhase('rendering')
    setLabel('Re-rendering visual edits…')
    setPct(5)
    setParams(new URLSearchParams({ job: newJobId }))
  }

  // The actions rail — Download/Publish, the caption/fine-tune/navigate toolbar, and
  // the scene chip strip. Shared content, laid out below the video on phone and in a
  // fixed side rail on desktop (matching V2Capture's two-pane convention).
  const canRefine = !!takePath && !!refineEdl && !refineLoading
  const actionsRail = (
    <div className="space-y-4">
      {/* PRIMARY editing step — the finished video is done, so "Edit your video" is
          the clear next action: it opens the simplified editing options (fix captions,
          look, music, remove a moment). Prominent, not a small tile. */}
      <button onClick={() => setRefineOpen(true)} disabled={!canRefine}
        className="w-full rounded-2xl border border-coral/40 bg-coral/10 p-4 text-left transition-colors hover:bg-coral/[0.16] disabled:opacity-35">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-coral/20"><Pencil className="h-4 w-4 text-coral" /></span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-cream">Edit your video</div>
            <div className="text-[11px] text-stone">Fix captions, change the look, music &amp; more — free</div>
          </div>
        </div>
      </button>

      {/* Quick style + start another, secondary */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setCaptionSheet(true)} disabled={!canRefine}
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-3 text-center transition-colors hover:bg-white/[0.07] disabled:opacity-35">
          <Captions className="mx-auto h-4 w-4 text-cream" />
          <div className="mt-1 text-xs font-semibold text-cream">Caption style</div>
        </button>
        <button onClick={() => nav('/v2')}
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-3 text-center transition-colors hover:bg-white/[0.07]">
          <Copy className="mx-auto h-4 w-4 text-cream" />
          <div className="mt-1 text-xs font-semibold text-cream">New video</div>
        </button>
      </div>

      {/* Primary: share, then download (mock parity) */}
      <button disabled={!videoUrl} onClick={() => setPublishSheet(true)} className="btn-gradient w-full !py-4 text-base disabled:opacity-40">
        <Share className="h-4 w-4" /> Export &amp; share
      </button>
      <button disabled={!videoUrl} onClick={downloadVideo} className="btn-ghost w-full !py-3.5 disabled:opacity-40">
        <Download className="h-4 w-4" /> Download to device
      </button>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-stone">
        <Lock className="h-3 w-3" /> Your video is private. Only you can see it.
      </p>

      <button onClick={() => nav('/dashboard')} className="w-full text-center text-sm text-stone transition-colors hover:text-cream lg:text-left">
        ← Back to dashboard
      </button>
    </div>
  )

  // Live checklist during the render: map the worker's real pct onto named steps
  // so the wait shows visible movement (mock parity), while `label` stays the
  // worker's actual current stage line.
  const activeStep = Math.min(PROC_STEPS.length - 1, Math.floor((pct / 100) * PROC_STEPS.length))
  const processingCard = (
    <div className="w-full rounded-panel border border-white/10 bg-ink2/70 p-6">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signature shadow-glow">
        <SlidersHorizontal className="h-6 w-6 text-ink" />
      </div>
      <h2 className="mt-5 text-center font-display text-2xl">Creating your video</h2>
      <p className="mt-1 text-center text-sm text-stone">This usually takes 1–2 minutes.</p>
      <div className="mt-5 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-amber to-coral transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-semibold text-cream">{pct}%</span>
      </div>
      <ul className="mt-6 space-y-4">
        {PROC_STEPS.map((s, i) => {
          const state = i < activeStep ? 'done' : i === activeStep ? 'now' : 'todo'
          return (
            <li key={s.t} className="flex items-center gap-3">
              {state === 'done' ? (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-coral"><Check className="h-4 w-4 text-white" /></span>
              ) : state === 'now' ? (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-coral"><Loader2 className="h-3.5 w-3.5 animate-spin text-coral" /></span>
              ) : (
                <span className="h-7 w-7 shrink-0 rounded-full border-2 border-dashed border-white/15" />
              )}
              <div className="min-w-0 flex-1">
                <div className={state === 'todo' ? 'text-sm font-medium text-stone' : 'text-sm font-medium text-cream'}>{s.t}</div>
                <div className="text-xs text-stone">{state === 'now' ? label : s.d}</div>
              </div>
              <span className={state === 'done' ? 'text-xs font-medium text-coral' : state === 'now' ? 'text-xs font-medium text-amber' : 'text-xs text-stone'}>
                {state === 'done' ? 'Completed' : state === 'now' ? 'In progress' : 'Pending'}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-6 rounded-card border border-white/8 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-stone">
        💡 Good things take a little time. You can leave this screen — we keep working, and the finished video lands in your Library.
      </p>
    </div>
  )

  return (
    // Surface-aware shell, matching V2Capture: phone = single centered column;
    // desktop (lg) = a two-pane studio — the video stage on the left, a fixed
    // actions rail on the right. Not the phone layout stretched wide.
    <div className="min-h-[100dvh] w-full bg-ink text-cream overflow-x-hidden">
      <div className={`mx-auto flex min-h-[100dvh] w-full max-w-screen-sm flex-col lg:max-w-4xl ${phase === 'rendering' ? 'lg:max-w-2xl' : 'lg:flex-row lg:items-center lg:gap-10'} lg:px-8`}>
        <div className="flex flex-1 flex-col lg:min-w-0 lg:py-6">
          <div className="flex items-center justify-between px-4 pt-4 lg:px-0 lg:pt-0">
            <button onClick={() => nav(`/result/${id}`)} aria-label="Back" className="inline-flex h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm hover:bg-white/20">← <span className="hidden sm:inline">Back to studio</span></button>
            <span className="text-sm text-white/70 truncate">{phase === 'rendering' ? 'Processing your video' : 'Final video'}</span>
            <button aria-label="Download" disabled={!videoUrl} onClick={downloadVideo} className="h-11 w-11 grid place-items-center rounded-full bg-white/10 disabled:opacity-30 lg:hidden">↓</button>
          </div>

          {/* Celebration header once the render lands (mock parity). */}
          {phase === 'done' && (
            <div className="px-4 pt-5 text-center lg:px-0">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-signature shadow-glow">
                <Check className="h-6 w-6 text-ink" />
              </div>
              <h1 className="mt-3 font-display text-3xl">Your video is <span className="gradient-text">ready!</span></h1>
              <p className="mt-1 text-sm text-stone">Great job — it's edited, captioned and ready to share.</p>
            </div>
          )}

          {phase === 'rendering' ? (
            <div className="flex flex-1 items-center px-4 py-6 lg:px-0">{processingCard}</div>
          ) : (
            <div className="relative mx-auto my-4 w-full max-w-[460px] flex-1 max-h-[72vh] aspect-[9/16] rounded-2xl overflow-hidden bg-ink2 shadow-2xl lg:my-0 lg:mt-4 lg:flex-none lg:h-[74vh] lg:max-h-[74vh] lg:w-auto lg:max-w-none">
              {phase === 'done' && videoUrl ? (
                // object-contain: never crop a render that isn't exactly 9:16 (matches
                // the capture review player).
                <video ref={videoRef} src={videoUrl} className="h-full w-full object-contain bg-black" autoPlay muted loop playsInline controls />
              ) : phase === 'timeout' ? (
                <div className="absolute inset-0 grid place-items-center text-center px-6">
                  <div>
                    <p className="text-white/80 font-medium">Still rendering…</p>
                    <p className="text-xs text-white/50 mt-1">{label}</p>
                    <button onClick={() => nav('/history')} className="mt-4 rounded-xl bg-cream text-ink font-semibold px-5 py-2 text-sm">Go to my remixes</button>
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 grid place-items-center text-center px-6">
                  <div>
                    <p className="text-white/80 font-medium">We couldn't finish the edit</p>
                    <p className="text-xs text-white/50 mt-1">{label}</p>
                    <button onClick={retry} className="mt-4 rounded-xl bg-cream text-ink font-semibold px-5 py-2 text-sm">Re-record & try again</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Raw take is downloadable in EVERY non-done phase (rendering / timeout /
              failed) so the original footage is never stranded behind the edit. */}
          {takeUrl && phase !== 'done' && (
            <div className="px-4 pb-3 text-center lg:px-0">
              <a href={takeUrl + (takeUrl.includes('?') ? '&' : '?') + 'download=twinai-take.mp4'} className="inline-flex items-center gap-1.5 text-xs text-white/60 transition-colors hover:text-white">
                <Download className="h-3.5 w-3.5" /> Download your raw take
              </a>
            </div>
          )}
        </div>

        {/* ACTIONS RAIL — only over a real finished video (never timeout/failed). */}
        {phase === 'done' && (
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 lg:w-[20rem] lg:shrink-0 lg:px-0 lg:py-6">
            {actionsRail}
          </div>
        )}
      </div>

      {/* Wired Subtitle Style Sheet */}
      <BottomSheet open={captionSheet} title="Caption style" onClose={() => setCaptionSheet(false)}>
        {CAPTION_STYLE_OPTIONS.map((style) => (
          <SheetOption
            key={style.id}
            label={style.label}
            selected={refineEdl?.captions?.style === style.id}
            onPick={() => applyCaptionStyle(style.id)}
          />
        ))}
      </BottomSheet>

      {/* Manual Visual Refinement Editor Modal */}
      <RefinePanel
        open={refineOpen}
        edl={refineEdl}
        loading={refineLoading}
        generationId={id}
        takePath={takePath}
        onClose={() => setRefineOpen(false)}
        onApplied={handleRefineApplied}
      />

      <BottomSheet open={publishSheet} title="Publish to" onClose={() => setPublishSheet(false)}>
        <p className="px-1 pb-2 text-xs text-white/60">
          {POSTING_LIVE
            ? 'Connected accounts post automatically. Anything else copies your caption, logs the post, and opens the uploader.'
            : "We'll copy your caption, log the post to your calendar, and open the uploader. One-tap auto-posting is coming soon."}
        </p>
        {publishError && <p className="px-1 pb-2 text-xs text-coral">{publishError}</p>}
        {PUBLISH_TARGETS.map((p) => {
          const connected = POSTING_LIVE && !!connectionFor(p.slug)
          const label = publishing === p.label
            ? (connected ? `Posting to ${p.label}…` : `${p.label} — opening…`)
            : connected ? `${p.label} · Connected — post now` : p.label
          return <SheetOption key={p.slug} label={label} onPick={() => publishTo(p)} />
        })}
      </BottomSheet>
    </div>
  )
}
