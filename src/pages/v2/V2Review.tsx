// Screen 5 — Editing + Final Video Review. The finished video plays first, calm
// and complete (never feels like the workflow restarted). A scene scrubber lets
// the user jump + tweak per scene; Download and Publish are the two equal
// primary actions. Teleprompter never appears here. See PRODUCT_VISION §12,§14.
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BottomSheet, { SheetOption } from '../../components/v2/BottomSheet'
import { getGeneration, signEditUrls } from '../../lib/api'
import { loadTimeline } from '../../lib/timelineApi'
import type { SceneTimeline } from '../../lib/timeline'
import type { Generation } from '../../lib/types'

export default function V2Review() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [gen, setGen] = useState<Generation | null>(null)
  const [timeline, setTimeline] = useState<SceneTimeline | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [captionSheet, setCaptionSheet] = useState(false)
  const [publishSheet, setPublishSheet] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    ;(async () => {
      const [g, t] = await Promise.all([getGeneration(id), loadTimeline(id)])
      setGen(g)
      setTimeline(t)
      if (g?.edit_path) {
        const urls = await signEditUrls([g.edit_path])
        setVideoUrl(urls[g.edit_path] ?? null)
      }
    })()
  }, [id])

  const rendering = !!gen && !gen.edit_path

  return (
    <div className="min-h-[100dvh] w-full max-w-screen-sm mx-auto bg-stone-950 text-white flex flex-col overflow-x-hidden">
      <div className="flex items-center justify-between px-4 pt-4">
        <button onClick={() => nav(`/v2/plan/${id}`)} aria-label="Back" className="h-9 w-9 grid place-items-center rounded-full bg-white/10">←</button>
        <span className="text-sm text-white/70 truncate">Your video</span>
        <button aria-label="Download" onClick={() => videoUrl && window.open(videoUrl, '_blank')} className="h-9 w-9 grid place-items-center rounded-full bg-white/10">↓</button>
      </div>

      {/* hero video */}
      <div className="px-4 pt-3">
        <div className="relative aspect-[9/16] w-full rounded-2xl overflow-hidden bg-stone-900">
          {videoUrl ? (
            <video ref={videoRef} src={videoUrl} className="h-full w-full object-cover" autoPlay muted loop playsInline controls />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              {rendering ? <RenderProgress /> : <span className="text-white/40 text-sm">Preparing preview…</span>}
            </div>
          )}
        </div>
      </div>

      {/* scene scrubber */}
      {timeline && (
        <div className="px-4 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {timeline.scenes.map((s) => (
            <div key={s.scene_number} className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/70">
              {s.scene_number}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {/* two equal primary actions */}
      <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button disabled={!videoUrl} onClick={() => videoUrl && window.open(videoUrl, '_blank')}
            className="rounded-2xl bg-white text-stone-900 font-semibold py-4 disabled:opacity-40">Download</button>
          <button disabled={!videoUrl} onClick={() => setPublishSheet(true)}
            className="rounded-2xl bg-emerald-500 text-white font-semibold py-4 disabled:opacity-40">Publish</button>
        </div>
        <div className="flex items-center justify-center gap-4 text-sm text-white/60">
          <button onClick={() => setCaptionSheet(true)}>Captions</button>
          <button onClick={() => nav('/v2')}>Make another</button>
        </div>
      </div>

      <BottomSheet open={captionSheet} title="Caption style" onClose={() => setCaptionSheet(false)}>
        {[['Fast captions', 'Recommended — word-by-word, high energy.'], ['Classic', ''], ['Big word', ''], ['None', '']].map(([l, r], i) => (
          <SheetOption key={i} label={l} reason={r || undefined} selected={i === 0} onPick={() => setCaptionSheet(false)} />
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

function RenderProgress() {
  const steps = ['Cutting scenes', 'Adding captions', 'Mixing music']
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % steps.length), 1500)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="text-center">
      <div className="h-10 w-10 mx-auto rounded-full border-2 border-white/20 border-t-white animate-spin" />
      <p className="mt-3 text-sm text-white/70">{steps[i]}…</p>
    </div>
  )
}
