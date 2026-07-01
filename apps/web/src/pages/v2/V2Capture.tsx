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
import type { ComponentType } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom'
import { ChevronLeft, FlipHorizontal, Gauge, Minus, Plus, SwitchCamera, Type } from 'lucide-react'
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
  sceneTimeCapSec,
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
  // Separate from camError on purpose: this is an upload/enqueue failure (e.g. out
  // of credits), not a camera problem. Mixing the two into one state previously
  // meant a credits error could render under the "Camera needed to record" heading.
  const [editError, setEditError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // Teleprompter feel: font size (S/M/L/XL) + a per-scene timing clock so the script
  // can advance word-by-word in step with the chosen WPM.
  const FONT_PX = [24, 30, 38, 48]
  const [fontIdx, setFontIdx] = useState(1)
  const [sceneElapsed, setSceneElapsed] = useState(0)
  const [mirror, setMirror] = useState(false)   // flip horizontally for teleprompter glass
  const [countdown, setCountdown] = useState(0)  // 3-2-1 before a scene starts
  const [facing, setFacing] = useState<'user' | 'environment'>('user') // front / back camera
  const [reviewUrl, setReviewUrl] = useState<string | null>(null) // raw take to review after recording
  const [camNonce, setCamNonce] = useState(0)    // bump to re-acquire the camera (Re-record)

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
  const reviewBlobRef = useRef<Blob | null>(null) // the raw recorded take, kept for review
  const liveRef = useRef(false)        // true ONLY while a scene is actively recording (race guard)
  const finishRef = useRef<() => void>(() => {}) // latest finishScene, callable from the timer
  const promptScrollRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)

  const scene = scenes[i]
  const last = i >= scenes.length - 1
  const next = scenes[i + 1]

  // Running-prompter timing: how many words SHOULD be read by now at the chosen WPM,
  // and the scene's estimated length — drives the word highlight + the timing bar.
  const words = useMemo(() => (scene?.dialogue || '').split(/\s+/).filter(Boolean), [scene])
  const wpmVal = WPM_PRESETS[timeline.wpm]
  const readCount = recording ? Math.floor((sceneElapsed / 60) * wpmVal) : -1
  const estSec = Math.max(1, Math.round(estimateDurationSec(scene?.dialogue ?? null, timeline.wpm)))
  // Hard per-scene cap (shared with mobile — @twinai/shared): when a read runs past
  // it we auto-stop → the Retake/Next card, so a scene can never record forever.
  const sceneLimit = sceneTimeCapSec(estSec)

  // Tick a per-scene clock only while actively recording THIS scene, and auto-stop
  // the scene the moment it hits its time cap.
  useEffect(() => {
    if (!recording) { setSceneElapsed(0); return }
    const t0 = performance.now()
    setSceneElapsed(0)
    const h = window.setInterval(() => {
      const el = (performance.now() - t0) / 1000
      setSceneElapsed(el)
      if (el >= sceneLimit) finishRef.current()   // cap reached → close this scene
    }, 100)
    return () => window.clearInterval(h)
  }, [recording, i, sceneLimit])

  // Real teleprompter motion: the whole script GLIDES UPWARD (translateY on the text
  // block) past a fixed read-line, regardless of length — not a word-by-word jump.
  // Idle: parked with the first lines at the read-line. Recording: travels up over
  // the scene's estimated time. Mirror is folded into the same transform so it's
  // always accurate.
  //
  // The box/text are measured INSIDE the rAF tick (not once at effect start): after
  // the between-scene card unmounts and remounts the prompter, the new scene's
  // element may not be laid out the instant the effect fires — measuring per frame
  // means EVERY scene scrolls, not just the first hook. A floor on travel keeps even
  // a short scene visibly gliding upward.
  useEffect(() => {
    const p = textRef.current, box = promptScrollRef.current
    if (!p || !box) return
    const mir = mirror ? ' scaleX(-1)' : ''
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const readY = box.clientHeight * 0.5         // read-line at the middle — text starts lower
      if (!recording) { p.style.transform = `translateY(${readY}px)${mir}`; return }
      const travel = Math.max(p.offsetHeight + readY, box.clientHeight * 0.9) // always a visible glide
      const prog = Math.min(1, (now - start) / 1000 / estSec)
      p.style.transform = `translateY(${readY - prog * travel}px)${mir}`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [recording, i, estSec, mirror, fontIdx])

  // Acquire the camera (front or back); re-acquire when the creator flips it. Flipping
  // is only offered before recording starts (see the Flip control), so tearing down
  // the recorder here is safe.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } },
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
      recRef.current = null // a flipped camera needs a fresh recorder bound to the new stream
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [facing, camNonce])

  // Free the raw-take object URL when it changes or on unmount (no blob leak).
  useEffect(() => () => { if (reviewUrl) URL.revokeObjectURL(reviewUrl) }, [reviewUrl])

  const ensureRecorder = () => {
    if (recRef.current || !streamRef.current) return
    const rec = new MediaRecorder(streamRef.current, { mimeType: pickRecorderMime() || undefined })
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunksRef.current.push(ev.data) }
    recRef.current = rec
  }

  // A 3-2-1 countdown before the scene actually records, so the creator can get set
  // (and it never clips the first word).
  const beginScene = () => { if (!camError && !recording) setCountdown(3) }
  useEffect(() => {
    if (countdown <= 0) return
    const h = window.setTimeout(() => {
      if (countdown === 1) { setCountdown(0); startScene() }
      else setCountdown((c) => c - 1)
    }, 800)
    return () => window.clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown])

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
    liveRef.current = true
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

  // Close the current scene. On the last scene, stop everything and go to review —
  // we DON'T auto-upload/edit; the creator sees their raw take first and chooses.
  // The liveRef guard makes this safe against a manual-stop + auto-stop double fire.
  const finishScene = () => {
    if (!liveRef.current) return
    liveRef.current = false
    closeScene()
    if (!last) { setBetween(true); return }
    void finalizeRecording()
  }
  // keep the timer's auto-stop pointing at the latest closure
  useEffect(() => { finishRef.current = finishScene })

  // Stop the recorder + CAMERA and capture the raw take. The blob promise is
  // timeout-guarded and the tracks are stopped right after, so the camera light can
  // never stay on / "record for an hour" if a MediaRecorder onstop never fires.
  const finalizeRecording = async () => {
    const rec = recRef.current
    const blob: Blob = await new Promise((resolve) => {
      const make = () => new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'video/webm' })
      if (!rec || rec.state === 'inactive') { resolve(make()); return }
      const to = window.setTimeout(() => resolve(make()), 4000)
      rec.onstop = () => { window.clearTimeout(to); resolve(make()) }
      try { rec.stop() } catch { window.clearTimeout(to); resolve(make()) }
    })
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recRef.current = null
    reviewBlobRef.current = blob
    setRecording(false)
    setReviewUrl(URL.createObjectURL(blob))
  }

  // Review action: hand the raw take to the SAME tested auto-edit path (captions,
  // cuts, b-roll). Only now does the upload + edit job start.
  const startAiEdit = async () => {
    const blob = reviewBlobRef.current
    if (!blob) return
    setEditError(null)
    setUploading(true)
    try {
      const bounds = boundsRef.current
      const total = bounds.length
      const lines = linesRef.current
      const segments = segmentsRef.current.filter((s) => s.end > s.start)
      // Per-scene keep-windows + spoken line → the worker trims+concats the kept
      // windows (dropping flubbed/retaken reads) and captions each per scene.
      const shots = total > 1
        ? { bounds, total, lines, ...(segments.length > 1 ? { segments } : {}) }
        : undefined
      const { jobId } = await autoEditTake(genId, { blob, contentType: blob.type || 'video/webm' }, shots)
      onJob(jobId)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Could not start the edit')
      setUploading(false)
    }
  }

  // Review action: download the raw take as-is (no edit).
  const downloadRaw = () => {
    if (!reviewUrl) return
    const a = document.createElement('a')
    a.href = reviewUrl
    a.download = `twinai-take.${reviewBlobRef.current?.type.includes('mp4') ? 'mp4' : 'webm'}`
    document.body.appendChild(a); a.click(); a.remove()
  }

  // Review action: throw the take away and re-record from scene 1 (re-acquires camera).
  const reRecord = () => {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl)
    reviewBlobRef.current = null
    chunksRef.current = []
    boundsRef.current = []
    linesRef.current = []
    segmentsRef.current = []
    activeMsRef.current = 0
    sceneStartSecRef.current = 0
    setReviewUrl(null)
    setBetween(false)
    setRecording(false)
    setI(0)
    setCamError(null)
    setEditError(null)
    setCamNonce((n) => n + 1)
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

  // Review screen — the recorded take plays here FIRST (camera already off), then the
  // creator picks what to do. We never auto-throw them into an editing spinner; the
  // edit only starts when they tap AI edit. Same surface-aware shell as the recorder.
  if (reviewUrl) {
    return (
      <div className="min-h-[100dvh] w-full bg-ink text-cream overflow-x-hidden">
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-screen-sm flex-col lg:max-w-4xl lg:flex-row lg:items-center lg:gap-10 lg:px-8">
          <div className="flex flex-1 flex-col lg:py-6">
            <div className="px-4 pt-4 text-sm text-white/60 lg:px-0 lg:pt-0">
              Your take · {scenes.length} scene{scenes.length > 1 ? 's' : ''}
            </div>
            <div className="relative mx-auto my-3 w-full max-w-[460px] flex-1 max-h-[78vh] aspect-[9/16] rounded-2xl overflow-hidden bg-black lg:my-0 lg:flex-none lg:h-[82vh] lg:max-h-[82vh] lg:w-auto lg:max-w-none">
              <video src={reviewUrl} controls autoPlay loop playsInline className="absolute inset-0 h-full w-full object-contain bg-black" />
            </div>
          </div>
          <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1 space-y-3 lg:w-[20rem] lg:shrink-0 lg:px-0 lg:py-6">
            {editError ? (
              <div className="rounded-2xl border border-coral/40 bg-coral/10 p-4 text-center lg:text-left">
                <p className="text-sm font-semibold text-coral">Couldn't start the edit</p>
                <p className="text-xs text-white/70 mt-1">{editError}</p>
              </div>
            ) : (
              <p className="text-sm text-white/70 text-center lg:text-left">Happy with the take? Send it to the AI editor for captions, cuts & b-roll — or keep the raw clip.</p>
            )}
            <button onClick={startAiEdit} className="w-full rounded-2xl bg-cream text-ink font-semibold py-4 hover:bg-white">✨ AI edit — captions, cuts &amp; b-roll</button>
            <button onClick={downloadRaw} className="w-full rounded-2xl border border-white/20 text-cream py-3 font-medium hover:bg-white/10">Download raw video</button>
            <button onClick={reRecord} className="w-full rounded-2xl border border-white/20 text-cream py-3 font-medium hover:bg-white/10">Re-record</button>
            <button onClick={onBack} className="w-full rounded-2xl py-2 text-sm text-white/50 hover:text-white">Save &amp; exit</button>
          </div>
        </div>
      </div>
    )
  }

  // The between-scene "Next up" card — shown in the control rail (right on desktop,
  // below the camera on phone). Pure UI over data already in `next`.
  const nextCard = (
    <div className="text-left space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
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
        <button onClick={retakeScene} className="flex-1 rounded-2xl bg-white/10 border border-white/30 text-white font-semibold py-3 hover:bg-white/20">Retake scene</button>
        <button onClick={continueNext} className="flex-1 rounded-2xl bg-cream text-ink font-semibold py-3 hover:bg-white">Next scene</button>
      </div>
      <p className="text-white/40 text-[11px] text-center">Flubbed it? Retake re-reads the scene you just finished.</p>
    </div>
  )

  // The live control deck — record button + size/speed/mirror/camera. On desktop the
  // controls stack into a labelled panel; on phone they wrap into a compact row.
  const canFlipCamera = !recording && activeMsRef.current === 0
  const recordLabel = recording ? (last ? 'Stop & finish' : 'Stop & next scene') : countdown > 0 ? `Starting in ${countdown}…` : 'Record this scene'
  const recordBtnClass = `w-full rounded-2xl py-4 font-semibold disabled:opacity-40 ${recording ? 'bg-red-500 text-white' : 'bg-cream text-ink hover:bg-white'}`

  const controlDeck = (
    <div className="space-y-3">
      <button onClick={() => (recording ? finishScene() : beginScene())} disabled={!!camError || countdown > 0} className={`${recordBtnClass} lg:hidden`}>
        {recordLabel}
      </button>
      {/* MOBILE — a compact wrap of pill buttons, touch-target sized. */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm lg:hidden">
        <button onClick={() => i > 0 && setI((v) => v - 1)} disabled={i === 0 || recording} className="rounded-full border border-white/15 px-3 py-1.5 text-white/85 hover:bg-white/10 disabled:opacity-30">← Previous scene</button>
        <div className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1">
          <span className="px-1 text-xs text-white/45">Text size</span>
          <span className="inline-flex gap-1">
            <button onClick={() => setFontIdx((v) => Math.max(0, v - 1))} disabled={fontIdx === 0} aria-label="Smaller text" className="h-6 w-6 grid place-items-center rounded-full bg-white/10 disabled:opacity-30 text-xs font-bold">A−</button>
            <button onClick={() => setFontIdx((v) => Math.min(FONT_PX.length - 1, v + 1))} disabled={fontIdx === FONT_PX.length - 1} aria-label="Larger text" className="h-6 w-6 grid place-items-center rounded-full bg-white/10 disabled:opacity-30 text-sm font-bold">A+</button>
          </span>
        </div>
        <button onClick={() => setSpeedSheet(true)} className="rounded-full border border-white/15 px-3 py-1.5 text-white/85 hover:bg-white/10">Speed · {wpmVal} wpm</button>
        <button onClick={() => setMirror((m) => !m)} className={`rounded-full border px-3 py-1.5 hover:bg-white/10 ${mirror ? 'border-teal text-teal' : 'border-white/15 text-white/85'}`}>Mirror: {mirror ? 'on' : 'off'}</button>
        {canFlipCamera && (
          <button onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} className="rounded-full border border-white/15 px-3 py-1.5 text-white/85 hover:bg-white/10">{facing === 'user' ? 'Front camera' : 'Back camera'} · flip</button>
        )}
      </div>

      {/* DESKTOP — a real control panel: primary action, then a grouped settings
          list (icon + label + control per row), the way a desktop capture tool
          reads — not the mobile pill row stretched wide. */}
      <div className="hidden lg:block lg:space-y-4">
        <button onClick={() => (recording ? finishScene() : beginScene())} disabled={!!camError || countdown > 0} className={recordBtnClass}>
          {recordLabel}
        </button>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] divide-y divide-white/10 overflow-hidden">
          <PanelRow icon={ChevronLeft} label="Previous scene">
            <button onClick={() => i > 0 && setI((v) => v - 1)} disabled={i === 0 || recording} className="text-xs font-medium text-white/70 hover:text-cream disabled:opacity-30 disabled:hover:text-white/70">
              Scene {i + 1} of {scenes.length}
            </button>
          </PanelRow>
          <PanelRow icon={Type} label="Text size">
            <div className="inline-flex items-center gap-2">
              <button onClick={() => setFontIdx((v) => Math.max(0, v - 1))} disabled={fontIdx === 0} aria-label="Smaller text" className="h-6 w-6 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"><Minus className="h-3 w-3" /></button>
              <span className="w-4 text-center text-xs tabular-nums text-white/70">{fontIdx + 1}</span>
              <button onClick={() => setFontIdx((v) => Math.min(FONT_PX.length - 1, v + 1))} disabled={fontIdx === FONT_PX.length - 1} aria-label="Larger text" className="h-6 w-6 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"><Plus className="h-3 w-3" /></button>
            </div>
          </PanelRow>
          <PanelRow icon={Gauge} label="Speed">
            <button onClick={() => setSpeedSheet(true)} className="text-xs font-medium text-white/70 hover:text-cream">{WPM_LABEL[timeline.wpm]} · {wpmVal} wpm</button>
          </PanelRow>
          <PanelRow icon={FlipHorizontal} label="Mirror">
            <Toggle on={mirror} onClick={() => setMirror((m) => !m)} />
          </PanelRow>
          {canFlipCamera && (
            <PanelRow icon={SwitchCamera} label="Camera">
              <button onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} className="text-xs font-medium text-white/70 hover:text-cream">{facing === 'user' ? 'Front' : 'Back'}</button>
            </PanelRow>
          )}
        </div>
      </div>
    </div>
  )

  return (
    // Surface-aware shell: phone = single centered column; desktop (lg) = a two-pane
    // studio — a tall camera stage on the left, a fixed control rail on the right.
    // This is NOT the phone layout stretched wide; each surface gets its own grid.
    <div className="min-h-[100dvh] w-full bg-ink text-cream overflow-x-hidden">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-screen-sm flex-col lg:max-w-5xl lg:flex-row lg:items-center lg:gap-10 lg:px-8">
        {/* MAIN STAGE — header + live camera with the teleprompter on the glass */}
        <div className="flex flex-1 flex-col lg:min-w-0 lg:py-6">
          <div className="flex items-center justify-between px-4 pt-4 text-sm text-white/60 lg:px-0 lg:pt-0">
            <span>Scene {i + 1} of {scenes.length} · {sceneTypeLabel(scene?.scene_type)}</span>
            <button onClick={() => setExitSheet(true)} aria-label="Exit" className="h-11 w-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20">✕</button>
          </div>

          {/* live camera preview behind the prompter text — a clean 9:16 frame that fills
              available height on phone and becomes a viewport-tall portrait on desktop. */}
          <div className="relative mx-auto my-3 w-full max-w-[460px] flex-1 max-h-[78vh] aspect-[9/16] rounded-2xl overflow-hidden bg-black lg:my-0 lg:flex-none lg:h-[82vh] lg:max-h-[82vh] lg:w-auto lg:max-w-none">
            <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover opacity-60" />
            <div className="absolute inset-0 flex flex-col justify-center px-6">
              {camError ? (
                <div className="text-center text-white/80">
                  <p className="font-medium">Camera needed to record</p>
                  <p className="text-xs text-white/50 mt-1">{camError}</p>
                </div>
              ) : between ? (
                <div className="text-center text-white/85">
                  <div className="text-emerald-400 text-lg font-semibold">Scene {i + 1} complete ✓</div>
                  <p className="text-xs text-white/50 mt-1">Review the next scene{' '}<span className="lg:hidden">below</span><span className="hidden lg:inline">on the right</span>, then continue.</p>
                </div>
              ) : (
                <div className="w-full">
                  {/* read-line teleprompter: the script glides UP past a fixed line, with
                      a soft fade top + bottom. The transform is driven by the effect above. */}
                  <div ref={promptScrollRef} className="relative mx-auto max-w-[36rem] h-[44vh] overflow-hidden px-2 [mask-image:linear-gradient(to_bottom,transparent,#000_16%,#000_84%,transparent)]">
                    <p ref={textRef} className="absolute inset-x-0 top-0 text-center font-semibold leading-[1.5] drop-shadow will-change-transform" style={{ fontSize: FONT_PX[fontIdx] }}>
                      {words.map((w, idx) => (
                        <span
                          key={idx}
                          className={!recording ? 'text-cream' : idx < readCount ? 'text-cream/40' : idx === readCount ? 'text-teal' : 'text-cream'}
                        >
                          {w}{' '}
                        </span>
                      ))}
                    </p>
                  </div>
                  {/* pace readout + a thin timing bar toward the scene's auto-stop cap */}
                  <p className="mt-3 text-center text-xs text-white/45">
                    {scene?.camera_framing} · {WPM_LABEL[timeline.wpm]} {wpmVal} wpm{recording ? ` · ${Math.floor(sceneElapsed)}s / ${sceneLimit}s` : ` · ~${estSec}s · stops at ${sceneLimit}s`}
                  </p>
                  {recording && (
                    <div className="mt-2 mx-auto h-1 w-40 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-red-400 transition-[width] duration-100 ease-linear" style={{ width: `${Math.min(100, (sceneElapsed / sceneLimit) * 100)}%` }} />
                    </div>
                  )}
                </div>
              )}
            </div>
            {recording && <div className="absolute top-3 left-3 flex items-center gap-1.5 text-xs"><span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />REC</div>}
            {countdown > 0 && (
              <div className="absolute inset-0 grid place-items-center bg-black/50 backdrop-blur-sm">
                <span className="text-7xl font-display font-bold text-cream tabular-nums">{countdown}</span>
              </div>
            )}
          </div>
        </div>

        {/* CONTROL RAIL — below the camera on phone, a fixed side panel on desktop */}
        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1 lg:w-[20rem] lg:shrink-0 lg:px-0 lg:py-6">
          {between ? nextCard : controlDeck}
        </div>
      </div>

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
    <div className="min-h-[100dvh] w-full max-w-screen-sm mx-auto bg-ink text-cream flex flex-col overflow-x-hidden lg:max-w-2xl">
      <div className="flex items-center justify-between px-4 pt-4 text-sm text-white/60 lg:px-0 lg:pt-6">
        <button onClick={onBack} aria-label="Back" className="h-11 w-11 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 lg:h-10 lg:w-10">←</button>
        <span>Upload your clip</span>
        <span className="w-11 lg:w-10" />
      </div>
      <div className="flex-1 px-6 flex flex-col items-center justify-center text-center gap-4 lg:px-0">
        <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button onClick={() => inputRef.current?.click()} disabled={busy}
          className="h-44 w-full rounded-2xl border-2 border-dashed border-white/20 grid place-items-center text-white/60 hover:border-white/40 hover:text-white/80 disabled:opacity-50 lg:h-64">
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

// Desktop settings-panel row: icon + label on the left, a compact control on the
// right — the layout a real desktop tool uses (Descript/CapCut-style sidebar),
// not a touch-target pill stretched wide.
function PanelRow({ icon: Icon, label, children }: { icon: ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
      <span className="flex items-center gap-2.5 text-sm text-white/85">
        <Icon className="h-4 w-4 text-white/50" />
        {label}
      </span>
      {children}
    </div>
  )
}

// A real switch control (mouse-precise), not a colored-border button — reads
// unambiguously as on/off at a glance, the way a desktop settings panel would.
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-teal' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  )
}
