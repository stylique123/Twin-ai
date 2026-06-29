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
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import BottomSheet, { SheetOption } from '../../components/v2/BottomSheet'
import { loadTimeline, setWpm } from '../../lib/timelineApi'
import { buildTimeline } from '../../lib/timelineAdapter'
import { autoEditTake, pickRecorderMime, getGeneration } from '../../lib/api'
import {
  type SceneTimeline,
  type Scene,
  type WpmPreset,
  WPM_PRESETS,
  WPM_LABEL,
  teleprompterScenes,
  estimateDurationSec,
} from '../../lib/timeline'

// The single scene-by-scene recorder for the web — served at BOTH the live
// `/record/:id` route and the V2 `/v2/capture/:id` route, so web and mobile share
// one capture flow (mobile's recorder mirrors this exact model). The only per-route
// difference is where Back returns to.
export default function V2Capture() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const mode = params.get('mode') === 'upload' ? 'upload' : 'record'
  const nav = useNavigate()
  const inV2Flow = useLocation().pathname.startsWith('/v2')
  const [timeline, setTimeline] = useState<SceneTimeline | null>(null)

  // Load the persisted Scene Timeline; if there isn't one (e.g. a blueprint made via
  // the classic Studio flow), synthesize it from the blueprint in-memory — the SAME
  // fallback the mobile recorder uses, so every generation is recordable here.
  useEffect(() => {
    let alive = true
    ;(async () => {
      let tl = await loadTimeline(id)
      if (!tl) {
        const g = await getGeneration(id)
        if (g) tl = buildTimeline({ generationId: id, blueprint: g.blueprint, selectedHook: g.selected_hook })
      }
      if (alive) setTimeline(tl)
    })()
    return () => { alive = false }
  }, [id])

  // Back returns to the blueprint (classic flow) or the V2 plan screen (V2 flow).
  // The finished-video screen (V2Review) is shared by both.
  const onBack = () => nav(inV2Flow ? `/v2/plan/${id}` : `/result/${id}`)
  const onJob = (job: string) => nav(`/v2/review/${id}?job=${job}`)

  if (!timeline) {
    return <div className="min-h-[100dvh] grid place-items-center bg-ink text-sand">Loading…</div>
  }
  return mode === 'upload'
    ? <UploadMode genId={id} onBack={onBack} onJob={onJob} />
    : <Teleprompter genId={id} timeline={timeline} setTimeline={setTimeline} onBack={onBack} onJob={onJob} />
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
  // Per-scene keep-windows in ACTIVE-recording seconds (= the blob's playback
  // timeline, since pause/resume leaves no gap). On Retake we drop the flubbed
  // window and re-read; the worker trims+concats these and captions each per scene.
  const segmentsRef = useRef<{ start: number; end: number; line: string }[]>([])
  const sceneStartSecRef = useRef(0)   // current scene's window start (active seconds)

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
    const rec = new MediaRecorder(streamRef.current, { mimeType: pickRecorderMime() || undefined })
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
    // This scene's kept window opens at the current cumulative active time. (After a
    // Retake, that's past the flubbed read — so the bad take is dropped.)
    sceneStartSecRef.current = Math.round((activeMsRef.current / 1000) * 1000) / 1000
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
    const end = Math.round((activeMsRef.current / 1000) * 1000) / 1000
    const line = (scene?.dialogue || scene?.caption_text || '').trim()
    boundsRef.current.push(end)
    linesRef.current.push(line)
    segmentsRef.current.push({ start: sceneStartSecRef.current, end, line })
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
      const segments = segmentsRef.current.filter((s) => s.end > s.start)
      // Timeline-driven: per-scene keep-windows + spoken line → the worker trims+concats
      // the kept windows (dropping any retaken/flubbed read) and builds captions from
      // THESE lines per scene. bounds/lines kept for back-compat. Falls back to
      // whole-clip auto-edit if we somehow have <2 segments.
      const shots = total > 1
        ? { bounds, total, lines, ...(segments.length > 1 ? { segments } : {}) }
        : undefined
      const { jobId } = await autoEditTake(genId, { blob, contentType: blob.type || 'video/webm' }, shots)
      onJob(jobId)
    } catch (e) {
      setCamError(e instanceof Error ? e.message : 'Could not start the edit')
      setUploading(false)
    }
  }

  const continueNext = () => { setBetween(false); setI((v) => v + 1) }
  // Retake the scene we just finished: drop its kept window (the flubbed read stays
  // in the blob but is trimmed out by the worker) and re-open the SAME scene. The
  // next startScene reopens the window past the bad read.
  const retakeScene = () => {
    segmentsRef.current.pop()
    boundsRef.current.pop()
    linesRef.current.pop()
    setBetween(false)
  }
  const replayScene = () => { /* keep take; let the user re-read — boundary is recorded on Stop&next */ setRecording(false) }

  const pickSpeed = async (wpm: WpmPreset) => { setTimeline(await setWpm(timeline, wpm)); setSpeedSheet(false) }

  if (uploading) {
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-ink text-cream">
        <div className="text-center">
          <div className="h-10 w-10 mx-auto rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p className="mt-3 text-sm text-white/70">Uploading your take and starting the edit…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] w-full max-w-screen-sm mx-auto bg-ink text-cream flex flex-col overflow-x-hidden">
      <div className="flex items-center justify-between px-4 pt-4 text-sm text-white/60">
        <span>Scene {i + 1} of {scenes.length} · {sceneTypeLabel(scene?.scene_type)}</span>
        <button onClick={() => setExitSheet(true)} aria-label="Exit" className="h-11 w-11 grid place-items-center rounded-full bg-white/10">✕</button>
      </div>

      {/* live camera preview behind the prompter text — a clean centered 9:16 frame
          (so on desktop it's a tidy portrait card, not a stretched/black-band fill). */}
      <div className="relative mx-auto my-3 w-full max-w-[460px] flex-1 max-h-[78vh] aspect-[9/16] rounded-2xl overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 flex flex-col justify-center px-6">
          {camError ? (
            <div className="text-center text-white/80">
              <p className="font-medium">Camera needed to record</p>
              <p className="text-xs text-white/50 mt-1">{camError}</p>
            </div>
          ) : between ? (
            <div className="text-left space-y-3 bg-black/55 border border-white/10 rounded-2xl p-5 backdrop-blur">
              <div className="text-emerald-400 text-base font-semibold text-center">Scene {i + 1} complete ✓</div>
              <div className="text-center">
                <div className="text-white font-semibold">Next · Scene {i + 2} of {scenes.length} — {sceneTypeLabel(next?.scene_type)}</div>
                <div className="text-white/40 text-xs mt-0.5">about {Math.round(estimateDurationSec(next?.dialogue ?? null, timeline.wpm))}s</div>
              </div>
              <div className="space-y-1.5 text-sm text-white/90">
                {next?.camera_framing && <p><span className="text-emerald-400 text-xs font-semibold">Positioning  </span>{next.camera_framing}</p>}
                {next?.background && <p><span className="text-emerald-400 text-xs font-semibold">Background  </span>{next.background}</p>}
                {next?.purpose && <p><span className="text-emerald-400 text-xs font-semibold">This scene  </span>{next.purpose}</p>}
                {next?.movement && <p><span className="text-emerald-400 text-xs font-semibold">Movement  </span>{next.movement}</p>}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={retakeScene} className="flex-1 rounded-2xl bg-white/10 border border-white/30 text-white font-semibold py-3">Retake scene</button>
                <button onClick={continueNext} className="flex-1 rounded-2xl bg-cream text-ink font-semibold py-3">Next scene</button>
              </div>
              <p className="text-white/40 text-[11px] text-center">Flubbed it? Retake re-reads the scene you just finished.</p>
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
            className={`w-full rounded-2xl py-4 font-semibold disabled:opacity-40 ${recording ? 'bg-red-500 text-white' : 'bg-cream text-ink'}`}
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
        <p className="text-sm text-sand">Your recorded scenes so far are kept on this device until you finish.</p>
        <button onClick={onBack} className="w-full rounded-2xl bg-cream text-ink font-semibold py-3">Save & exit</button>
        <button onClick={() => setExitSheet(false)} className="w-full rounded-2xl border border-white/25 text-cream py-3 font-medium">Keep recording</button>
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
    <div className="min-h-[100dvh] w-full max-w-screen-sm mx-auto bg-ink text-cream flex flex-col overflow-x-hidden">
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
