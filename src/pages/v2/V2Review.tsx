// Screen 5 — Editing + Final Video Review. Shows the REAL auto-edit job: live
// stage labels emitted by the worker (never a timer), then the finished video
// first, with Download + Publish. On failure: retry / back. No teleprompter, no
// recording UI, no script document. See PRODUCT_VISION §12,§14.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BottomSheet, { SheetOption } from '../../components/v2/BottomSheet'
import { getGeneration, getJob, signEditUrls } from '../../lib/api'
import { loadTimeline } from '../../lib/timelineApi'
import type { SceneTimeline } from '../../lib/timeline'

type Phase = 'rendering' | 'done' | 'failed'

export default function V2Review() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const jobId = params.get('job')
  const nav = useNavigate()

  const [timeline, setTimeline] = useState<SceneTimeline | null>(null)
  const [phase, setPhase] = useState<Phase>('rendering')
  const [label, setLabel] = useState('Starting the edit…')
  const [pct, setPct] = useState(5)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [captionSheet, setCaptionSheet] = useState(false)
  const [publishSheet, setPublishSheet] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const stopped = useRef(false)

  useEffect(() => { loadTimeline(id).then(setTimeline) }, [id])

  // Real status polling: read the worker's live progress, then the finished video.
  useEffect(() => {
    stopped.current = false

    const showFinished = async () => {
      // Prefer the generation's stored edit_path (signed); else the job output_url.
      const g = await getGeneration(id)
      if (g?.edit_path) {
        const urls = await signEditUrls([g.edit_path])
        if (urls[g.edit_path]) { setVideoUrl(urls[g.edit_path]); return true }
      }
      return false
    }

    ;(async () => {
      // No job id (e.g. opened directly) → just try to show an existing render.
      if (!jobId) {
        if (await showFinished()) { setPhase('done') } else { setPhase('failed'); setLabel('No render found for this video.') }
        return
      }
      for (let i = 0; i < 300 && !stopped.current; i++) {
        const job = await getJob(jobId)
        if (job) {
          if (job.status === 'failed') { setPhase('failed'); setLabel(job.error || 'The edit failed.'); return }
          if (job.status === 'done') {
            const url = job.result?.output_url
            if (url) setVideoUrl(url)
            else await showFinished()
            setPct(100); setPhase('done'); return
          }
          const p = job.result?.progress
          if (p?.label) setLabel(p.label)
          if (typeof p?.pct === 'number') setPct(Math.max(5, Math.min(99, p.pct)))
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      if (!stopped.current) { setPhase('failed'); setLabel('Still rendering — check your Library shortly.') }
    })()

    return () => { stopped.current = true }
  }, [id, jobId])

  const retry = () => nav(`/v2/capture/${id}?mode=record`)

  return (
    <div className="min-h-[100dvh] w-full max-w-screen-sm mx-auto bg-stone-950 text-white flex flex-col overflow-x-hidden">
      <div className="flex items-center justify-between px-4 pt-4">
        <button onClick={() => nav(`/v2/plan/${id}`)} aria-label="Back" className="h-11 w-11 grid place-items-center rounded-full bg-white/10">←</button>
        <span className="text-sm text-white/70 truncate">Your video</span>
        <button aria-label="Download" disabled={!videoUrl} onClick={() => videoUrl && window.open(videoUrl, '_blank')} className="h-11 w-11 grid place-items-center rounded-full bg-white/10 disabled:opacity-30">↓</button>
      </div>

      <div className="px-4 pt-3">
        <div className="relative aspect-[9/16] w-full rounded-2xl overflow-hidden bg-stone-900">
          {phase === 'done' && videoUrl ? (
            <video ref={videoRef} src={videoUrl} className="h-full w-full object-cover" autoPlay muted loop playsInline controls />
          ) : phase === 'failed' ? (
            <div className="absolute inset-0 grid place-items-center text-center px-6">
              <div>
                <p className="text-white/80 font-medium">We couldn't finish the edit</p>
                <p className="text-xs text-white/50 mt-1">{label}</p>
                <button onClick={retry} className="mt-4 rounded-xl bg-white text-stone-900 font-semibold px-5 py-2 text-sm">Re-record & try again</button>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center text-center px-6">
              <div className="w-full">
                <div className="h-10 w-10 mx-auto rounded-full border-2 border-white/20 border-t-white animate-spin" />
                <p className="mt-3 text-sm text-white/80">{label}</p>
                <div className="mt-3 mx-auto h-1.5 w-40 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-white transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {timeline && (
        <div className="px-4 pt-3 flex gap-2 overflow-x-auto">
          {timeline.scenes.map((s) => (
            <div key={s.scene_number} className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/70">{s.scene_number}</div>
          ))}
        </div>
      )}

      <div className="flex-1" />

      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button disabled={!videoUrl} onClick={() => videoUrl && window.open(videoUrl, '_blank')}
            className="rounded-2xl bg-white text-stone-900 font-semibold py-4 disabled:opacity-40">Download</button>
          <button disabled={!videoUrl} onClick={() => setPublishSheet(true)}
            className="rounded-2xl bg-emerald-500 text-white font-semibold py-4 disabled:opacity-40">Publish</button>
        </div>
        <div className="flex items-center justify-center gap-5 text-sm text-white/60">
          <button onClick={() => setCaptionSheet(true)}>Captions</button>
          <button onClick={() => nav('/v2')}>Make another</button>
        </div>
      </div>

      <BottomSheet open={captionSheet} title="Caption style" onClose={() => setCaptionSheet(false)}>
        {[['Fast captions', 'Recommended — word-by-word, high energy.'], ['Classic', ''], ['Big word', ''], ['None', '']].map(([l, r], idx) => (
          <SheetOption key={idx} label={l} reason={r || undefined} selected={idx === 0} onPick={() => setCaptionSheet(false)} />
        ))}
      </BottomSheet>

      <BottomSheet open={publishSheet} title="Publish to" onClose={() => setPublishSheet(false)}>
        {['TikTok', 'Reels', 'YouTube Shorts', 'LinkedIn'].map((p) => (
          <SheetOption key={p} label={p} onPick={() => setPublishSheet(false)} />
        ))}
      </BottomSheet>
    </div>
  )
}
