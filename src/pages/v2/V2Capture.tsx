// Screen 4 — Teleprompter or Upload. Distraction-free dark capture, driven by
// the Scene Timeline. Teleprompter shows ONE scene at a time, pauses between
// scenes with "Scene complete → Next", uses WPM presets (never pixels/sec), and
// only walks scenes where show_in_teleprompter is true. Never shows editing UI.
// See PRODUCT_VISION §11.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BottomSheet, { SheetOption } from '../../components/v2/BottomSheet'
import { loadTimeline, setWpm } from '../../lib/timelineApi'
import {
  type SceneTimeline,
  type WpmPreset,
  WPM_PRESETS,
  WPM_LABEL,
  teleprompterScenes,
  estimateDurationSec,
} from '../../lib/timeline'

export default function V2Capture() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const mode = params.get('mode') === 'upload' ? 'upload' : 'record'
  const nav = useNavigate()
  const [timeline, setTimeline] = useState<SceneTimeline | null>(null)

  useEffect(() => { loadTimeline(id).then(setTimeline) }, [id])

  if (!timeline) {
    return <div className="min-h-[100dvh] grid place-items-center bg-stone-900 text-white/60">Loading…</div>
  }
  return mode === 'upload'
    ? <UploadMode timeline={timeline} onDone={() => nav(`/v2/review/${id}`)} onBack={() => nav(`/v2/plan/${id}`)} />
    : <Teleprompter timeline={timeline} setTimeline={setTimeline} onDone={() => nav(`/v2/review/${id}`)} onBack={() => nav(`/v2/plan/${id}`)} />
}

function Teleprompter({ timeline, setTimeline, onDone, onBack }: {
  timeline: SceneTimeline
  setTimeline: (t: SceneTimeline) => void
  onDone: () => void
  onBack: () => void
}) {
  const scenes = useMemo(() => teleprompterScenes(timeline), [timeline])
  const [i, setI] = useState(0)
  const [recording, setRecording] = useState(false)
  const [between, setBetween] = useState(false)
  const [speedSheet, setSpeedSheet] = useState(false)
  const [exitSheet, setExitSheet] = useState(false)

  const scene = scenes[i]
  const last = i >= scenes.length - 1
  const next = scenes[i + 1]

  const finishScene = () => {
    setRecording(false)
    if (last) { onDone(); return }
    setBetween(true)
  }
  const continueNext = () => { setBetween(false); setI((v) => v + 1) }

  const pickSpeed = async (wpm: WpmPreset) => {
    const t = await setWpm(timeline, wpm)
    setTimeline(t)
    setSpeedSheet(false)
  }

  return (
    <div className="min-h-[100dvh] w-full max-w-screen-sm mx-auto bg-stone-950 text-white flex flex-col overflow-x-hidden">
      {/* minimal top bar */}
      <div className="flex items-center justify-between px-4 pt-4 text-sm text-white/60">
        <span>Scene {i + 1} of {scenes.length} · {sceneTypeLabel(scene?.scene_type)}</span>
        <button onClick={() => setExitSheet(true)} aria-label="Exit" className="h-9 w-9 grid place-items-center rounded-full bg-white/10">✕</button>
      </div>

      {/* the one scene */}
      <div className="flex-1 px-6 flex flex-col justify-center">
        {between ? (
          <div className="text-center space-y-3">
            <div className="text-emerald-400 text-lg font-semibold">Scene complete ✓</div>
            <div className="text-white/60 text-sm">Next: {sceneTypeLabel(next?.scene_type)}</div>
            <div className="text-white/40 text-xs">about {Math.round(estimateDurationSec(next?.dialogue ?? null, timeline.wpm))}s</div>
            <button onClick={continueNext} className="mt-4 rounded-2xl bg-white text-stone-900 font-semibold px-6 py-3">Continue</button>
          </div>
        ) : (
          <>
            <p className="text-2xl font-semibold leading-relaxed text-center">{scene?.dialogue}</p>
            <p className="mt-6 text-center text-xs text-white/40">{scene?.camera_framing} · {WPM_LABEL[timeline.wpm]} {WPM_PRESETS[timeline.wpm]} WPM</p>
          </>
        )}
      </div>

      {/* thumb controls */}
      {!between && (
        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 space-y-3">
          <button
            onClick={() => (recording ? finishScene() : setRecording(true))}
            className={`w-full rounded-2xl py-4 font-semibold ${recording ? 'bg-red-500' : 'bg-white text-stone-900'}`}
          >
            {recording ? (last ? 'Stop & finish' : 'Stop & next scene') : 'Record this scene'}
          </button>
          <div className="flex items-center justify-between text-sm text-white/70">
            <button onClick={() => setRecording(false)}>Replay</button>
            <button onClick={finishScene}>Skip →</button>
            <button onClick={() => setSpeedSheet(true)}>Speed</button>
          </div>
        </div>
      )}

      <BottomSheet open={speedSheet} title="Teleprompter speed" onClose={() => setSpeedSheet(false)}>
        {(Object.keys(WPM_PRESETS) as WpmPreset[]).map((k) => (
          <SheetOption key={k} label={`${WPM_LABEL[k]} · ${WPM_PRESETS[k]} WPM`} selected={timeline.wpm === k}
            reason={k === 'natural' ? 'Recommended — relaxed, natural pace.' : undefined}
            onPick={() => pickSpeed(k)} />
        ))}
      </BottomSheet>

      <BottomSheet open={exitSheet} title="Save and exit?" onClose={() => setExitSheet(false)}>
        <p className="text-sm text-stone-500">Your takes so far are kept.</p>
        <button onClick={onBack} className="w-full rounded-2xl bg-stone-900 text-white font-semibold py-3">Save & exit</button>
        <button onClick={() => setExitSheet(false)} className="w-full rounded-2xl border border-stone-300 py-3 font-medium">Keep recording</button>
      </BottomSheet>
    </div>
  )
}

function UploadMode({ timeline, onDone, onBack }: { timeline: SceneTimeline; onDone: () => void; onBack: () => void }) {
  return (
    <div className="min-h-[100dvh] w-full max-w-screen-sm mx-auto bg-stone-950 text-white flex flex-col overflow-x-hidden">
      <div className="flex items-center justify-between px-4 pt-4 text-sm text-white/60">
        <button onClick={onBack} aria-label="Back" className="h-9 w-9 grid place-items-center rounded-full bg-white/10">←</button>
        <span>We'll map your clip to {timeline.scenes.length} scenes</span>
        <span className="w-9" />
      </div>
      <div className="flex-1 px-6 flex flex-col items-center justify-center text-center gap-4">
        <div className="h-40 w-full rounded-2xl border-2 border-dashed border-white/20 grid place-items-center text-white/50">
          Tap to choose a clip
        </div>
        <p className="text-xs text-white/40">We'll detect scene boundaries automatically and line them up with your plan.</p>
      </div>
      <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <button onClick={onDone} className="w-full rounded-2xl bg-white text-stone-900 font-semibold py-4">Map to plan & continue</button>
      </div>
    </div>
  )
}

function sceneTypeLabel(t?: string) {
  switch (t) {
    case 'talking_head': return 'Talking'
    case 'cta': return 'Final action'
    case 'product_demo': return 'Show the product'
    case 'screen_recording': return 'Screen recording'
    default: return 'Scene'
  }
}
