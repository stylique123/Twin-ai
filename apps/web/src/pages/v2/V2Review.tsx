// Screen 5 — Editing + Final Video Review. Shows the REAL auto-edit job: live
// stage labels emitted by the worker (never a timer), then the finished video
// first, with Download + Publish. On failure: retry / back. Supports captions selector,
// manual refinement panel, and dashboard return navigation.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BottomSheet, { SheetOption } from '../../components/v2/BottomSheet'
import { getGeneration, signEditUrls, fetchEdl, reEditWithEdl, pollEditJob, markPosted } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { loadTimeline } from '../../lib/timelineApi'
import { CAPTION_STYLE_OPTIONS } from '../../lib/types'
import { RefinePanel } from '../../components/RefinePanel'
import { SlidersHorizontal, Loader2 } from 'lucide-react'
import type { SceneTimeline } from '../../lib/timeline'

type Phase = 'rendering' | 'done' | 'failed'

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

  // Posting isn't automated yet (POSTING_LIVE). The honest "publish" is: copy the
  // caption, log the post so it shows in the calendar/history, then send the user
  // to the platform's uploader in a new tab. No dead-end no-op.
  // NOTE: markPosted stores the platform SLUG (youtube/tiktok/instagram/linkedin),
  // not the display label, so the logged post matches every other surface's filters.
  const publishTo = async (p: { label: string; slug: string; url: string }) => {
    if (!videoUrl || publishing) return
    setPublishing(p.label)
    const caption = timeline?.hook ?? ''
    try {
      try { await navigator.clipboard?.writeText(caption) } catch { /* clipboard blocked — ignore */ }
      try { await markPosted({ generationId: id, platform: p.slug, caption }) } catch { /* best-effort log */ }
      window.open(p.url, '_blank', 'noopener')
    } finally {
      setPublishing(null)
      setPublishSheet(false)
      nav('/calendar')
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
  const [refineLoading, setRefineLoading] = useState(false)

  useEffect(() => { loadTimeline(id).then(setTimeline) }, [id])

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

    ;(async () => {
      // No job id (e.g. opened directly) → just try to show an existing render.
      if (!jobId) {
        if (await showFinished()) { setPhase('done') } else { setPhase('failed'); setLabel('No render found for this video.') }
        return
      }
      const job = await pollEditJob(
        jobId,
        (label, pct) => { if (label) setLabel(label); if (pct) setPct(Math.max(5, Math.min(99, pct))) },
        { attempts: 300, shouldStop: () => stopped.current },
      )
      if (stopped.current) return
      if (!job) { setPhase('failed'); setLabel('Still rendering — check your Library shortly.'); return }
      if (job.status === 'failed') { setPhase('failed'); setLabel(job.error || 'The edit failed.'); return }
      const url = job.result?.output_url
      if (url) setVideoUrl(url)
      await showFinished()
      setPct(100); setPhase('done')
    })()

    return () => { stopped.current = true }
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
  const actionsRail = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button disabled={!videoUrl} onClick={downloadVideo}
          className="rounded-2xl bg-cream text-ink font-semibold py-4 disabled:opacity-40 hover:bg-cream/90 active:scale-[0.99] transition-all">Download</button>
        <button disabled={!videoUrl} onClick={() => setPublishSheet(true)}
          className="rounded-2xl bg-emerald-500 text-white font-semibold py-4 disabled:opacity-40 hover:bg-emerald-600 active:scale-[0.99] transition-all">Publish</button>
      </div>

      {timeline && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none lg:flex-wrap">
          {timeline.scenes.map((s) => (
            <div key={s.scene_number} className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/70">Scene {s.scene_number}</div>
          ))}
        </div>
      )}

      {/* Wired Action Toolbar */}
      <div className="flex items-center justify-center gap-6 text-sm text-white/60 lg:flex-col lg:items-stretch lg:gap-2 lg:text-left">
        <button onClick={() => setCaptionSheet(true)} disabled={!takePath || !refineEdl || refineLoading} className="hover:text-white disabled:opacity-30 transition-colors lg:rounded-xl lg:border lg:border-white/10 lg:px-3 lg:py-2.5">Captions</button>

        <button
          onClick={() => setRefineOpen(true)}
          disabled={!takePath || !refineEdl || refineLoading}
          className="flex items-center gap-1.5 hover:text-white disabled:opacity-30 transition-all lg:rounded-xl lg:border lg:border-white/10 lg:px-3 lg:py-2.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Fine-Tune
        </button>

        <button onClick={() => nav('/v2')} className="hover:text-white transition-colors lg:rounded-xl lg:border lg:border-white/10 lg:px-3 lg:py-2.5">Make another</button>
        <button onClick={() => nav('/dashboard')} className="hover:text-white transition-colors font-medium text-coral lg:rounded-xl lg:border lg:border-coral/30 lg:px-3 lg:py-2.5">Dashboard</button>
      </div>
    </div>
  )

  return (
    // Surface-aware shell, matching V2Capture: phone = single centered column;
    // desktop (lg) = a two-pane studio — the video stage on the left, a fixed
    // actions rail on the right. Not the phone layout stretched wide.
    <div className="min-h-[100dvh] w-full bg-ink text-cream overflow-x-hidden">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-screen-sm flex-col lg:max-w-4xl lg:flex-row lg:items-center lg:gap-10 lg:px-8">
        <div className="flex flex-1 flex-col lg:min-w-0 lg:py-6">
          <div className="flex items-center justify-between px-4 pt-4 lg:px-0 lg:pt-0">
            <button onClick={() => nav(`/v2/plan/${id}`)} aria-label="Back" className="h-11 w-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20">←</button>
            <span className="text-sm text-white/70 truncate lg:hidden">Your video</span>
            <button aria-label="Download" disabled={!videoUrl} onClick={downloadVideo} className="h-11 w-11 grid place-items-center rounded-full bg-white/10 disabled:opacity-30 lg:hidden">↓</button>
          </div>

          <div className="relative mx-auto my-3 w-full max-w-[460px] flex-1 max-h-[78vh] aspect-[9/16] rounded-2xl overflow-hidden bg-ink2 shadow-2xl lg:my-0 lg:flex-none lg:h-[82vh] lg:max-h-[82vh] lg:w-auto lg:max-w-none">
            {phase === 'done' && videoUrl ? (
              <video ref={videoRef} src={videoUrl} className="h-full w-full object-cover" autoPlay muted loop playsInline controls />
            ) : phase === 'failed' ? (
              <div className="absolute inset-0 grid place-items-center text-center px-6">
                <div>
                  <p className="text-white/80 font-medium">We couldn't finish the edit</p>
                  <p className="text-xs text-white/50 mt-1">{label}</p>
                  <button onClick={retry} className="mt-4 rounded-xl bg-cream text-ink font-semibold px-5 py-2 text-sm">Re-record & try again</button>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 grid place-items-center text-center px-6">
                <div className="w-full">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-coral mb-2" />
                  <p className="mt-3 text-sm text-white/80">{label}</p>
                  <div className="mt-3 mx-auto h-1.5 w-40 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-white transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ACTIONS RAIL — below the video on phone, a fixed side panel on desktop */}
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 lg:w-[20rem] lg:shrink-0 lg:px-0 lg:py-6">
          {actionsRail}
        </div>
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
        <p className="px-1 pb-2 text-xs text-white/60">We'll copy your caption, log the post to your calendar, and open the uploader. One-tap auto-posting is coming soon.</p>
        {PUBLISH_TARGETS.map((p) => (
          <SheetOption key={p.slug} label={publishing === p.label ? `${p.label} — opening…` : p.label} onPick={() => publishTo(p)} />
        ))}
      </BottomSheet>
    </div>
  )
}
