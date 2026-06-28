// Screen 4 — Teleprompter or Upload. REAL capture, driven by the Scene Timeline.
//
// Teleprompter records ONE continuous MediaRecorder session, pausing between
// scenes (so the output is a single valid clip with no dead air between scenes).
// At each scene boundary we record the cumulative active-recording time → these
// become `shots.bounds`, and each scene's spoken line becomes `shots.lines`. On
// finish we hand the take + shots to the SAME tested auto-edit path the V1 record
// flow uses (autoEditTake), so the worker builds captions PER SEGMENT from the
// timeline lines and cuts at the timeline scene boundaries — no re-guessing.
//
// Only talking scenes (show_in_teleprompter) are recorded; silent b-roll is added
// by the editor as cutaways. Takes are preserved in-memory across back/exit.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BottomSheet, { SheetOption } from '../../components/v2/BottomSheet'
import { loadTimeline, setWpm } from '../../lib/timelineApi'
import { autoEditTake } from '../../lib/api'
import {
  type SceneTimeline,
  type Scene,
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
    ? <UploadMode genId={id} onBack={() => nav(`/v2/plan/${id}`)} onJob={(job) => nav(`/v2/review/${id}?job=${job}`)} />
    : <Teleprompter genId={id} timeline={timeline} setTimeline={setTimeline}
        onBack={() => nav(`/v2/plan/${id}`)} onJob={(job) => nav(`/v2/review/${id}?job=${job}`)} />
}

function Teleprompter({ genId, timeline, setTimeline, onBack, onJob }: {
  genId: string
  timeline: SceneTimeline
  setTimeline: (t: SceneTimeline) => void
  onBack: () => void
  onJob: (jobId: string) => void
}) {
  const scenes = useMemo(() => teleprompterScenes(timeline), [timeline])
  const [i, setI] = useState(0)
  const [recording, setRecording] = useState(false)
  const [between, setBetween] = useState(false)
  const [speedSheet, setSpeedSheet] = useState(false)
  const [exitSheet, setExitSheet] = useState(false)
  const [camError, setCamError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const activeMsRef = useRef(0)        // cumulative ACTIVE (un-paused) recording time
  const segStartRef = useRef(0)        // perf.now() when current active segment began
  const boundsRef = useRef<number[]>([]) // cumulative seconds at each scene boundary
  const linesRef = useRef<string[]>([])  // spoken line per recorded scene

  const scene = scenes[i]
  const last = i >= scenes.length - 1
  const next = scenes[i + 1]

  // Acquire the camera once, show a live preview.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: true,
        })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; void videoRef.current.play() }
      } catch (e) {
        setCamError(e instanceof Error ? e.message : 'Camera/microphone not available')
      }
    })()
    return () => {
      cancelled = true
      try { recRef.current?.state !== 'inactive' && recRef.current?.stop() } catch { /* */ }
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const ensureRecorder = () => {
    if (recRef.current || !streamRef.current) return
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      .find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || 'video/webm'
    const rec = new MediaRecorder(streamRef.current, { mimeType: mime })
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunksRef.current.push(ev.data) }
    recRef.current = rec
  }

  const startScene = () => {
    if (camError) return
    ensureRecorder()
    const rec = recRef.current
    if (!rec) return
    if (rec.state === 'inactive') rec.start(250)       // first scene: begin the single session
    else if (rec.state === 'paused') rec.resume()       // later scene: resume same session
    segStartRef.current = performance.now()
    setRecording(true)
  }

  // Pause recording at a scene boundary, record the cumulative time + the line.
  const closeScene = () => {
    const rec = recRef.current
    if (rec && rec.state === 'recording') {
      activeMsRef.current += performance.now() - segStartRef.current
      rec.pause()
    }
    boundsRef.current.push(Math.round((activeMsRef.current / 1000) * 1000) / 1000)
    linesRef.current.push((scene?.dialogue || scene?.caption_text || '').trim())
    setRecording(false)
  }

  const finishScene = async () => {
    closeScene()
    if (!last) { setBetween(true); return }
    await finishAll()
  }

  const finishAll = async () => {
    setUploading(true)
    try {
      const rec = recRef.current
      const blob: Blob = await new Promise((resolve) => {
        if (!rec || rec.state === 'inactive') { resolve(new Blob(chunksRef.current, { type: 'video/webm' })); return }
        rec.onstop = () => resolve(new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'video/webm' }))
        try { rec.stop() } catch { resolve(new Blob(chunksRef.current, { type: 'video/webm' })) }
      })
      streamRef.current?.getTracks().forEach((t) => t.stop())
      const bounds = boundsRef.current
      const total = bounds.length
      const lines = linesRef.current
      // Timeline-driven: per-segment cut bounds + spoken line per scene → the worker
      // builds captions from THESE lines, cut at THESE boundaries. Falls back to
      // whole-clip auto-edit if we somehow have <2 segments.
      const shots = total > 1 ? { bounds, total, lines } : undefined
      const { jobId } = await autoEditTake(genId, { blob, contentType: blob.type || 'video/webm' }, shots)
      onJob(jobId)
    } catch (e) {
      setCamError(e instanceof Error ? e.message : 'Could not start the edit')
      setUploading(false)
    }
  }

  const continueNext = () => { setBetween(false); setI((v) => v + 1) }
  const replayScene = () => { /* keep take; let the user re-read — boundary is recorded on Stop&next */ setRecording(false) }

  const pickSpeed = async (wpm: WpmPreset) => { setTimeline(await setWpm(timeline, wpm)); setSpeedSheet(false) }

  if (uploading) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-stone-950 text-white">
        <div className="text-center">
          <div className="h-10 w-10 mx-auto rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p className="mt-3 text-sm text-white/70">Uploading your take and starting the edit…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] w-full max-w-screen-sm mx-auto bg-stone-950 text-white flex flex-col overflow-x-hidden">
      <div className="flex items-center justify-between px-4 pt-4 text-sm text-white/60">
        <span>Scene {i + 1} of {scenes.length} · {sceneTypeLabel(scene?.scene_type)}</span>
        <button onClick={() => setExitSheet(true)} aria-label="Exit" className="h-11 w-11 grid place-items-center rounded-full bg-white/10">✕</button>
      </div>

      {/* live camera preview behind the prompter text */}
      <div className="relative flex-1 mx-4 my-3 rounded-2xl overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 flex flex-col justify-center px-6">
          {camError ? (
            <div className="text-center text-white/80">
              <p className="font-medium">Camera needed to record</p>
              <p className="text-xs text-white/50 mt-1">{camError}</p>
            </div>
          ) : between ? (
            <div className="text-center space-y-3">
              <div className="text-emerald-400 text-lg font-semibold">Scene complete ✓</div>
              <div className="text-white/70 text-sm">Next: {sceneTypeLabel(next?.scene_type)}</div>
              <div className="text-white/40 text-xs">about {Math.round(estimateDurationSec(next?.dialogue ?? null, timeline.wpm))}s</div>
              <button onClick={continueNext} className="mt-2 rounded-2xl bg-white text-stone-900 font-semibold px-6 py-3">Continue</button>
            </div>
          ) : (
            <>
              <p className="text-2xl font-semibold leading-relaxed text-center drop-shadow">{scene?.dialogue}</p>
              <p className="mt-5 text-center text-xs text-white/50">{scene?.camera_framing} · {WPM_LABEL[timeline.wpm]} {WPM_PRESETS[timeline.wpm]} WPM</p>
            </>
          )}
        </div>
        {recording && <div className="absolute top-3 left-3 flex items-center gap-1.5 text-xs"><span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />REC</div>}
      </div>

      {!between && (
        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1 space-y-3">
          <button
            onClick={() => (recording ? finishScene() : startScene())}
            disabled={!!camError}
            className={`w-full rounded-2xl py-4 font-semibold disabled:opacity-40 ${recording ? 'bg-red-500' : 'bg-white text-stone-900'}`}
          >
            {recording ? (last ? 'Stop & finish' : 'Stop & next scene') : 'Record this scene'}
          </button>
          <div className="flex items-center justify-between text-sm text-white/70 px-1">
            <button onClick={() => i > 0 && setI((v) => v - 1)} disabled={i === 0} className="disabled:opacity-30 py-2 px-1">Previous</button>
            <button onClick={replayScene} className="py-2 px-1">Replay</button>
            <button onClick={() => setSpeedSheet(true)} className="py-2 px-1">Speed</button>
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
        <p className="text-sm text-stone-500">Your recorded scenes so far are kept on this device until you finish.</p>
        <button onClick={onBack} className="w-full rounded-2xl bg-stone-900 text-white font-semibold py-3">Save & exit</button>
        <button onClick={() => setExitSheet(false)} className="w-full rounded-2xl border border-stone-300 py-3 font-medium">Keep recording</button>
      </BottomSheet>
    </div>
  )
}

function UploadMode({ genId, onBack, onJob }: { genId: string; onBack: () => void; onJob: (jobId: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setErr(null)
    try {
      // No shots → the worker runs PySceneDetect on the clip and maps segments.
      const { jobId } = await autoEditTake(genId, { blob: file, contentType: file.type || 'video/webm' })
      onJob(jobId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh] w-full max-w-screen-sm mx-auto bg-stone-950 text-white flex flex-col overflow-x-hidden">
      <div className="flex items-center justify-between px-4 pt-4 text-sm text-white/60">
        <button onClick={onBack} aria-label="Back" className="h-11 w-11 grid place-items-center rounded-full bg-white/10">←</button>
        <span>Upload your clip</span>
        <span className="w-11" />
      </div>
      <div className="flex-1 px-6 flex flex-col items-center justify-center text-center gap-4">
        <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button onClick={() => inputRef.current?.click()} disabled={busy}
          className="h-44 w-full rounded-2xl border-2 border-dashed border-white/20 grid place-items-center text-white/60 disabled:opacity-50">
          {busy ? 'Uploading…' : 'Tap to choose a clip'}
        </button>
        <p className="text-xs text-white/40">We detect scene boundaries automatically and line them up with your plan.</p>
        {err && <p className="text-xs text-red-400">{err}</p>}
      </div>
    </div>
  )
}

function sceneTypeLabel(t?: Scene['scene_type']) {
  switch (t) {
    case 'talking_head': return 'Talking'
    case 'cta': return 'Final action'
    case 'product_demo': return 'Show the product'
    case 'screen_recording': return 'Screen recording'
    default: return 'Scene'
  }
}
