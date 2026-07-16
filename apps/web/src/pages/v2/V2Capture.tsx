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
import { ChevronLeft, FlipHorizontal, Gauge, Minus, Plus, SwitchCamera, Sparkles, RotateCcw, Wand2, Zap, Waves, Mountain, UploadCloud, Film, X } from 'lucide-react'
import BottomSheet, { SheetOption } from '../../components/v2/BottomSheet'
import { loadTimeline, setWpm } from '../../lib/timelineApi'
import { buildTimeline } from '../../lib/timelineAdapter'
import { autoEditTake, autoEditFromPath, uploadTakeToBucket, pickRecorderMime, getGeneration, updateGenerationChoice, type TakeShots } from '../../lib/api'
import { saveTakePointer, clearTakePointer } from '../../lib/savedTake'
import { cn } from '../../lib/cn'
import { Aurora } from '../../components/Aurora'
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

// The single scene-by-scene recorder — served at BOTH the live `/record/:id`
// route and the V2 `/v2/capture/:id` route, so there is one capture flow for the
// whole app. The only per-route difference is where Back returns to.
export default function V2Capture() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const mode = params.get('mode') === 'upload' ? 'upload' : 'record'
  const nav = useNavigate()
  const [timeline, setTimeline] = useState<SceneTimeline | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadNonce, setLoadNonce] = useState(0) // bump to retry the load

  // Load the persisted Scene Timeline; if there isn't one (e.g. a blueprint made via
  // the classic Studio flow), synthesize it from the blueprint in-memory so every
  // generation is recordable here. A throw OR an unresolvable generation flips to
  // an error card with Retry — never the "Loading…" screen forever.
  useEffect(() => {
    let alive = true
    setLoadFailed(false)
    ;(async () => {
      try {
        let tl = await loadTimeline(id)
        if (!tl) {
          const g = await getGeneration(id)
          if (g) tl = buildTimeline({ generationId: id, blueprint: g.blueprint, selectedHook: g.selected_hook })
        }
        if (!alive) return
        if (tl) setTimeline(tl)
        else setLoadFailed(true)
      } catch {
        if (alive) setLoadFailed(true)
      }
    })()
    return () => { alive = false }
  }, [id, loadNonce])

  // Back always returns to the plan (Result) — the single plan screen for the flow.
  const onBack = () => nav(`/result/${id}`)
  // The finished video + live render progress now live on the single studio page
  // (Result), not a separate review screen — hand the edit job off there.
  const onJob = (job: string) => nav(`/result/${id}?job=${job}`)

  if (!timeline) {
    if (loadFailed) {
      return (
        <div className="min-h-[100dvh] grid place-items-center bg-ink text-cream px-6">
          <div className="max-w-sm text-center">
            <p className="font-semibold">We couldn't load your video plan</p>
            <p className="mt-1 text-sm text-white/60">Check your connection and try again — your script is safe in your Library.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => setLoadNonce((n) => n + 1)} className="rounded-xl bg-cream text-ink font-semibold px-5 py-2 text-sm">Retry</button>
              <button onClick={onBack} className="rounded-xl border border-white/20 px-5 py-2 text-sm text-cream">Back</button>
            </div>
          </div>
        </div>
      )
    }
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
  // Mirror into a ref so the recording timer can read it without re-subscribing.
  useEffect(() => { exitSheetRef.current = exitSheet }, [exitSheet])

  // Guard against losing a recording to an accidental refresh / tab close / phone
  // lock: warn (native "Leave site?" prompt) whenever a take is being recorded or
  // reviewed but hasn't been handed to the edit yet. (A finished take is also
  // autosaved server-side so it can be resumed, but the warning still prevents the
  // surprise.) beforeunload only fires on real browser unloads, not SPA navigation.
  const dirtyRef = useRef(false)
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])
  const [camError, setCamError] = useState<string | null>(null)
  // Separate from camError on purpose: this is an upload/enqueue failure (e.g. out
  // of credits), not a camera problem. Mixing the two into one state previously
  // meant a credits error could render under the "Camera needed to record" heading.
  const [editError, setEditError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState<number>(-1) // 0..1, or -1 indeterminate
  // Review-screen edit-style picker (mock parity). The choice is REAL: the worker
  // reads generations.edit_style (punchy → high-energy cuts, clean/cinematic →
  // calm pacing), so we persist it right before enqueueing the edit.
  const [styleOpen, setStyleOpen] = useState(false)
  const [editStyle, setEditStyle] = useState<'punchy' | 'clean' | 'cinematic'>('punchy')
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
  // Set if the MediaRecorder itself errors mid-take (codec hiccup, disk pressure,
  // backgrounded tab) — so a truncated/empty take is caught instead of silently
  // shipped. Cleared on a fresh re-record.
  const recErrRef = useRef<string | null>(null)
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
  // Autosave: the `takes`-bucket path the finished take was uploaded to the instant
  // recording ended, so a refresh before the edit is confirmed doesn't lose it and
  // startAiEdit can enqueue from this path with NO re-upload.
  const savedTakePathRef = useRef<string | null>(null)
  // Set once the edit is enqueued, so a slow autosave that resolves afterwards can't
  // re-write a resume pointer for a take that's already being edited.
  const editStartedRef = useRef(false)
  const liveRef = useRef(false)        // true ONLY while a scene is actively recording (race guard)
  const confirmBusyRef = useRef(false) // double-tap guard on the review Continue (double-charge bug)
  const uploadCancelRef = useRef(false) // creator cancelled the upload — ignore its result
  const wakeLockRef = useRef<{ release?: () => Promise<void> } | null>(null) // keep the screen awake mid-take
  const exitSheetRef = useRef(false)   // freeze the auto-advance while "Discard this take?" is open
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
  // Hard per-scene cap (sceneTimeCapSec, @twinai/shared): when a read runs past it
  // we auto-stop → the Retake/Next card, so a scene can never record forever.
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
      // Cap reached → close this scene. Except while the exit sheet is open —
      // auto-advancing BEHIND a "Discard this take?" modal is disorienting.
      if (el >= sceneLimit && !exitSheetRef.current) finishRef.current()
    }, 100)
    return () => window.clearInterval(h)
  }, [recording, i, sceneLimit])

  // A take is "dirty" (worth warning about on unload) while recording, or while a
  // finished take is being reviewed but hasn't been sent to the edit yet.
  useEffect(() => { dirtyRef.current = recording || !!reviewUrl }, [recording, reviewUrl])

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
    // Text is never mirrored (it must stay readable). Mirror flips the CAMERA
    // preview instead (see the <video> transform) — the natural "selfie mirror".
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const readY = box.clientHeight * 0.6         // read-line a touch below middle — text starts lower, sits in a comfortable eye-line
      if (!recording) { p.style.transform = `translateY(${readY}px)`; return }
      const travel = Math.max(p.offsetHeight + readY, box.clientHeight * 0.9) // always a visible glide
      const prog = Math.min(1, (now - start) / 1000 / estSec)
      p.style.transform = `translateY(${readY - prog * travel}px)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [recording, i, estSec, fontIdx])

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
      // Never leave the screen pinned awake after the recorder is gone.
      void wakeLockRef.current?.release?.().catch(() => {})
      wakeLockRef.current = null
    }
  }, [facing, camNonce])

  // Free the raw-take object URL when it changes or on unmount (no blob leak).
  useEffect(() => () => { if (reviewUrl) URL.revokeObjectURL(reviewUrl) }, [reviewUrl])

  const ensureRecorder = () => {
    if (recRef.current || !streamRef.current) return
    const rec = new MediaRecorder(streamRef.current, { mimeType: pickRecorderMime() || undefined })
    rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunksRef.current.push(ev.data) }
    // A recorder that dies mid-session otherwise just stops emitting chunks with
    // zero signal — the creator would lose a good take silently. Capture it so
    // review/upload can refuse and prompt a re-record.
    rec.onerror = (ev) => {
      recErrRef.current =
        (ev as unknown as { error?: { message?: string } })?.error?.message ||
        'The recorder stopped unexpectedly.'
      liveRef.current = false
    }
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
    // Keep the screen awake for the whole take — a phone auto-locking mid-read
    // suspends the camera/recorder and silently kills the recording. Best-effort.
    if (!wakeLockRef.current) {
      try {
        void (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release?: () => Promise<void> }> } })
          .wakeLock?.request('screen').then((l) => { wakeLockRef.current = l }).catch(() => {})
      } catch { /* unsupported browser — fine */ }
    }
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
    void wakeLockRef.current?.release?.().catch(() => {})
    wakeLockRef.current = null
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
    // Autosave the take server-side immediately (best-effort, non-blocking): upload
    // the bytes to the `takes` bucket and stash a local pointer so a refresh / phone
    // lock before the creator confirms the edit can RESUME instead of losing it. A
    // real recorder error or an empty blob is not worth persisting.
    if (!recErrRef.current && blob.size >= MIN_TAKE_BYTES) {
      const contentType = blob.type || 'video/webm'
      const shots = buildShots()
      uploadTakeToBucket(genId, { blob, contentType })
        .then((takePath) => {
          savedTakePathRef.current = takePath
          // If the edit already started while this upload was in flight, don't write a
          // resume pointer for a take that's already being edited.
          if (!editStartedRef.current) saveTakePointer(genId, { takePath, contentType, shots })
        })
        .catch(() => { /* best-effort — the beforeunload guard still protects */ })
    }
  }

  // The per-scene shots contract, built from the recorded bounds/lines/windows.
  // Shared by autosave and startAiEdit so a resumed edit gets identical scene sync.
  const buildShots = (): TakeShots | undefined => {
    // boundsRef holds each scene's cumulative END second, e.g. [5, 11, 18]. The worker
    // expects `total` = clip DURATION and `bounds` = INTERIOR cuts only (it re-appends
    // the end itself). segments are explicit keep-windows (drop flubbed/retaken reads).
    const rawBounds = boundsRef.current
    const sceneCount = rawBounds.length
    const totalSec = rawBounds[rawBounds.length - 1] ?? 0
    const interiorBounds = rawBounds.slice(0, -1)
    const lines = linesRef.current
    const segments = segmentsRef.current.filter((s) => s.end > s.start)
    return sceneCount > 1
      ? { bounds: interiorBounds, total: totalSec, lines, ...(segments.length > 1 ? { segments } : {}) }
      : undefined
  }

  // Review action: hand the raw take to the SAME tested auto-edit path (captions,
  // cuts, b-roll). Only now does the upload + edit job start.
  // A real few-second webm/mp4 take is tens of KB minimum; anything under this is
  // an empty/failed recording (no chunks, a recorder error, a 0-byte blob). Refuse
  // it BEFORE upload so it can't burn the worker's whole retry cycle and come back
  // as an opaque "the edit failed".
  const MIN_TAKE_BYTES = 2048

  const startAiEdit = async () => {
    const blob = reviewBlobRef.current
    if (!blob) return
    if (recErrRef.current) {
      setEditError(`${recErrRef.current} Please re-record this take.`)
      return
    }
    if (blob.size < MIN_TAKE_BYTES) {
      setEditError('That recording came through empty — nothing was captured. Please re-record.')
      return
    }
    setEditError(null)
    uploadCancelRef.current = false
    editStartedRef.current = true
    setUploading(true)
    try {
      // Per-scene keep-windows + spoken line → the worker trims+concats the kept
      // windows (dropping flubbed/retaken reads) and captions each per scene.
      const shots = buildShots()
      // If autosave already uploaded this take, enqueue from that path — no second
      // upload of the same bytes. Otherwise upload now (autosave failed / not done).
      let jobId: string
      if (savedTakePathRef.current) {
        setUploadPct(-1)
        ;({ jobId } = await autoEditFromPath(genId, savedTakePathRef.current, shots))
      } else {
        setUploadPct(-1)
        ;({ jobId } = await autoEditTake(genId, { blob, contentType: blob.type || 'video/webm' }, shots, (f) => setUploadPct(f)))
      }
      if (uploadCancelRef.current) return // creator backed out — take is still in memory on the review screen
      clearTakePointer(genId) // consumed — the edit job owns the take now
      onJob(jobId)
    } catch (e) {
      if (!uploadCancelRef.current) setEditError(e instanceof Error ? e.message : 'Could not start the edit')
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
    // The previous take is being thrown away — drop its autosave pointer so Resume
    // never offers a discarded recording. (The orphaned bucket object is harmless.)
    clearTakePointer(genId)
    savedTakePathRef.current = null
    editStartedRef.current = false
    reviewBlobRef.current = null
    recErrRef.current = null
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
  // Step back one scene. If the scene we're returning to was already committed
  // (its boundary/window/line are recorded), pop those trailing entries exactly
  // like retakeScene does — otherwise re-recording it would APPEND a duplicate
  // window and the scene would appear twice in the final edit.
  const goPrevScene = () => {
    if (i === 0 || recording) return
    if (boundsRef.current.length >= i) {
      segmentsRef.current.pop()
      boundsRef.current.pop()
      linesRef.current.pop()
    }
    setBetween(false)
    setI((v) => v - 1)
  }
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
    const pctLabel = uploadPct >= 0 && uploadPct < 1 ? `Uploading your take… ${Math.round(uploadPct * 100)}%` : 'Uploading your take and starting the edit…'
    return (
      <div className="min-h-[100dvh] grid place-items-center bg-ink text-cream px-6">
        <div className="text-center w-full max-w-xs">
          <div className="h-10 w-10 mx-auto rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p className="mt-3 text-sm text-white/70">{pctLabel}</p>
          {uploadPct >= 0 && (
            <div className="mt-3 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-white transition-all" style={{ width: `${Math.max(3, Math.round(uploadPct * 100))}%` }} />
            </div>
          )}
          {/* Escape hatch: a stalled upload must never trap the creator on a spinner
              (refreshing would destroy the in-memory take). Cancel returns to the
              review screen with the recording intact. */}
          <button
            onClick={() => {
              uploadCancelRef.current = true
              setUploading(false)
              // Back to review, take not consumed — restore the resume pointer so a
              // refresh here still recovers it.
              editStartedRef.current = false
              if (savedTakePathRef.current) {
                saveTakePointer(genId, { takePath: savedTakePathRef.current, contentType: reviewBlobRef.current?.type || 'video/webm', shots: buildShots() })
              }
            }}
            className="mt-5 text-xs text-white/50 hover:text-white"
          >Cancel and go back to my recording</button>
        </div>
      </div>
    )
  }

  // Review screen — the recorded take plays here FIRST (camera already off), then the
  // creator picks what to do. We never auto-throw them into an editing spinner; the
  // edit only starts when they confirm an edit style (mock parity: Review your
  // recording → Auto edit → Choose edit style → Continue).
  if (reviewUrl) {
    const EDIT_STYLES = [
      { id: 'punchy' as const, label: 'Punchy', popular: true, note: 'Fast-paced, high-energy edits. Great for social media.', icon: Zap, tint: 'from-coral/30 to-coral/5 text-coral' },
      { id: 'clean' as const, label: 'Clean', popular: false, note: 'Clean cuts, natural pacing, and a professional look.', icon: Waves, tint: 'from-teal/25 to-teal/5 text-teal' },
      { id: 'cinematic' as const, label: 'Cinematic', popular: false, note: 'Story-driven edits with smooth pacing and mood.', icon: Mountain, tint: 'from-amber/25 to-amber/5 text-amber' },
    ]
    const confirmEdit = async () => {
      // Double-tap guard: two rapid taps here used to fire TWO uploads + TWO paid
      // enqueues (the persist await below opened a re-entry window).
      if (confirmBusyRef.current || uploading) return
      confirmBusyRef.current = true
      try {
        // Persist the pick (worker reads it), then enqueue — best-effort persist,
        // the edit itself must never be blocked by the choice write.
        try { await updateGenerationChoice(genId, { edit_style: editStyle }) } catch { /* optimistic */ }
        await startAiEdit()
      } finally {
        confirmBusyRef.current = false
      }
    }
    return (
      <div className="min-h-[100dvh] w-full bg-ink text-cream overflow-x-hidden">
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-screen-sm flex-col lg:max-w-4xl lg:flex-row lg:items-start lg:gap-10 lg:px-8 lg:py-8">
          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between px-4 pt-4 lg:px-0 lg:pt-0">
              <button onClick={onBack} className="inline-flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm hover:bg-white/20">← <span className="hidden sm:inline">Back to studio</span></button>
              <div className="text-center">
                <div className="font-semibold text-cream">Review your recording</div>
                <div className="text-xs text-stone">How did it go?</div>
              </div>
              <span className="w-10" />
            </div>
            <div className="relative mx-auto my-3 w-full max-w-[460px] flex-1 max-h-[62vh] aspect-[9/16] rounded-2xl overflow-hidden bg-black lg:my-4 lg:flex-none lg:h-[74vh] lg:max-h-[74vh] lg:w-auto lg:max-w-none">
              <video src={reviewUrl} controls autoPlay loop playsInline className="absolute inset-0 h-full w-full object-contain bg-black" />
            </div>
          </div>

          <div className="px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-1 space-y-3 lg:w-[22rem] lg:shrink-0 lg:px-0 lg:pt-14">
            {editError ? (
              <div className="rounded-2xl border border-coral/40 bg-coral/10 p-4">
                <p className="text-sm font-semibold text-coral">Couldn't start the edit</p>
                <p className="text-xs text-white/70 mt-1">{editError}</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-coral/40 bg-coral/10"><Sparkles className="h-4 w-4 text-coral" /></span>
                <div>
                  <p className="text-sm font-semibold text-cream">Your recording looks good.</p>
                  <p className="text-xs text-stone">Ready to turn this into a high-performing video.</p>
                </div>
              </div>
            )}

            {!styleOpen ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={reRecord} className="rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-4 text-center hover:bg-white/[0.08]">
                    <RotateCcw className="mx-auto h-4 w-4 text-cream" />
                    <div className="mt-1 text-sm font-semibold text-cream">Record again</div>
                    <div className="text-[11px] text-stone">Try a new take</div>
                  </button>
                  <button onClick={() => setStyleOpen(true)} className="btn-gradient !rounded-2xl !px-3 !py-4 text-center !block">
                    <Wand2 className="mx-auto h-4 w-4" />
                    <div className="mt-1 text-sm font-semibold">Auto edit</div>
                    <div className="text-[11px] opacity-80">Continue to edit style</div>
                  </button>
                </div>
                <button onClick={downloadRaw} className="w-full rounded-2xl border border-white/15 py-3 text-sm font-medium text-cream hover:bg-white/10">Download raw video</button>
                {/* Honest exit: the take lives only in this tab's memory — leaving discards
                    it. The old label promised "edit later", which was never true. */}
                <button onClick={onBack} className="w-full py-2 text-sm text-white/50 hover:text-white">Exit without saving this take</button>
              </>
            ) : (
              <div className="rounded-panel border border-white/10 bg-ink2/80 p-4">
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 lg:hidden" />
                <h3 className="text-center font-display text-xl">Choose edit style</h3>
                <p className="mt-0.5 text-center text-xs text-stone">This decides how we cut and pace your video.</p>
                <div className="mt-4 space-y-2.5">
                  {EDIT_STYLES.map((s) => {
                    const active = editStyle === s.id
                    return (
                      <button key={s.id} onClick={() => setEditStyle(s.id)}
                        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${active ? 'border-coral/60 bg-coral/[0.06]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${s.tint}`}><s.icon className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-semibold text-cream">
                            {s.label}
                            {s.popular && <span className="rounded-full bg-coral/15 px-2 py-0.5 text-[10px] font-bold text-coral">Popular</span>}
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-stone">{s.note}</span>
                        </span>
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${active ? 'border-coral' : 'border-white/25'}`}>
                          {active && <span className="h-2.5 w-2.5 rounded-full bg-coral" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <button onClick={confirmEdit} className="btn-gradient mt-4 w-full !py-3.5">Continue</button>
                <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11px] text-stone">🔒 You can change this later with Edit video.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // The between-scene "Next up" card — shown in the control rail (right on desktop,
  // below the camera on phone). Pure UI over data already in `next`.
  const nextCard = (
    // Strong, opaque card so it reads clearly OVER the live camera (the old near-
    // transparent panel was unreadable). A full "how to set up the next scene" brief.
    <div className="max-h-[82vh] space-y-4 overflow-y-auto rounded-3xl border border-white/15 bg-black/55 p-6 text-left shadow-2xl backdrop-blur-2xl">
      <div className="text-center">
        <div className="text-sm font-semibold text-emerald-400">Scene {i + 1} complete ✓</div>
        <div className="mt-1 font-display text-xl text-white">Next · Scene {i + 2} of {scenes.length}</div>
        <div className="mt-0.5 text-xs text-white/50">{sceneTypeLabel(next?.scene_type)} · about {Math.round(estimateDurationSec(next?.dialogue ?? null, timeline.wpm))}s</div>
        {/* Reassure the creator the camera did NOT turn off — it's just paused between
            scenes (the recorder pauses, the camera stream stays live). */}
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Camera on · paused between scenes
        </div>
      </div>

      {/* What they'll actually say next — so they can prep the delivery. */}
      {next?.dialogue && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-white/45">Your line — say this</div>
          <p className="text-[15px] leading-snug text-white">“{next.dialogue.length > 200 ? next.dialogue.slice(0, 200) + '…' : next.dialogue}”</p>
        </div>
      )}

      {/* A proper "set up your next scene" guide — where to be, what's around you,
          how to frame, and what to do while you talk. */}
      <div className="space-y-3 text-sm">
        <div className="text-[10px] font-bold uppercase tracking-wider text-white/45">Set up your shot 👇</div>
        {next?.background && <div><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">Where to be / background</div><p className="text-white/90">{next.background}</p></div>}
        {next?.camera_framing && <div><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">How to sit &amp; frame yourself</div><p className="text-white/90">{next.camera_framing}</p></div>}
        {next?.movement && <div><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">What to do while you talk</div><p className="text-white/90">{next.movement}</p></div>}
        {next?.purpose && <div><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">Why this scene matters</div><p className="text-white/90">{next.purpose}</p></div>}
      </div>

      {/* Switch camera between scenes (front / back) — the take is paused here. */}
      <button onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10">
        <SwitchCamera className="h-4 w-4" /> Use {facing === 'user' ? 'back' : 'front'} camera
      </button>

      <div className="flex gap-2 pt-1">
        <button onClick={retakeScene} className="flex-1 rounded-2xl border border-white/25 bg-white/10 py-3 font-semibold text-white hover:bg-white/20">Retake scene</button>
        <button onClick={continueNext} className="flex-1 rounded-2xl bg-cream py-3 font-semibold text-ink hover:bg-white">Next scene</button>
      </div>
      <p className="text-center text-[11px] text-white/40">Flubbed it? Retake re-reads the scene you just finished.</p>
    </div>
  )

  // Full-bleed teleprompter: the camera fills the whole screen and the script
  // glides OVER it, with slim floating bars top + bottom — the professional
  // teleprompter look, identical on phone and desktop (desktop just scales up).
  const canFlipCamera = !recording && activeMsRef.current === 0
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`
  const remaining = Math.max(0, sceneLimit - sceneElapsed)

  return (
    <>
      <div className="fixed inset-0 overflow-hidden bg-black text-white select-none">
        {/* Full-bleed camera. Mirror flips the PREVIEW (natural selfie), not the text. */}
        <video ref={videoRef} playsInline muted
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: mirror ? 'scaleX(-1)' : undefined }} />
        {/* Legibility scrim — darker at top + bottom so the bars and script read over any footage. */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/70" />

        {/* TOP BAR — exit · scene/timer · flip */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(0.6rem,env(safe-area-inset-top))] pb-3">
          <button onClick={() => setExitSheet(true)} aria-label="Exit" className="grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur-md transition-colors hover:bg-black/60">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 rounded-full bg-black/40 px-3.5 py-1.5 text-[13px] tabular-nums backdrop-blur-md">
            {recording && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
            <span className="font-semibold">Scene {i + 1}/{scenes.length}</span>
            <span className="text-white/30">·</span>
            {recording
              ? <><span className="text-white/80">{clock(sceneElapsed)}</span><span className="text-red-300">-{clock(remaining)}</span></>
              : <span className="text-white/60">{sceneTypeLabel(scene?.scene_type)}</span>}
          </div>
          {canFlipCamera ? (
            <button onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Flip camera" className="grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur-md transition-colors hover:bg-black/60">
              <SwitchCamera className="h-5 w-5" />
            </button>
          ) : <span className="h-10 w-10" />}
        </div>

        {/* CENTER — camera error / between-scene card / the scrolling script */}
        {camError ? (
          <div className="absolute inset-0 z-10 grid place-items-center px-8 text-center">
            <div>
              <p className="font-semibold">Camera needed to record</p>
              <p className="mt-1 text-sm text-white/60">{camError}</p>
            </div>
          </div>
        ) : between ? (
          <div className="absolute inset-0 z-10 grid place-items-center px-4">
            <div className="w-full max-w-md">{nextCard}</div>
          </div>
        ) : (
          <div className="absolute inset-0 z-10 flex items-center px-5 sm:px-10">
            {/* the script glides UP past a fixed read-line, soft-faded top + bottom */}
            <div ref={promptScrollRef} className="relative mx-auto h-[54vh] w-full max-w-3xl overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_14%,#000_86%,transparent)]">
              <p ref={textRef} className="absolute inset-x-0 top-0 text-center font-bold leading-[1.3] [text-shadow:0_2px_20px_rgba(0,0,0,0.65)] will-change-transform" style={{ fontSize: FONT_PX[fontIdx] }}>
                {words.map((w, idx) => (
                  <span key={idx} className={recording && idx < readCount ? 'text-white/35' : 'text-white'}>{w}{' '}</span>
                ))}
              </p>
            </div>
          </div>
        )}

        {/* COUNTDOWN */}
        {countdown > 0 && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-black/50 backdrop-blur-sm">
            <span className="font-display text-8xl font-bold tabular-nums">{countdown}</span>
          </div>
        )}

        {/* BOTTOM BAR — one floating control pill (hidden on the between-scene beat, which has its own buttons) */}
        {!between && (
          <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {recording && (
              <div className="mx-auto mb-2 h-1 w-full max-w-2xl overflow-hidden rounded-full bg-white/15">
                <div className="h-full bg-red-400 transition-[width] duration-100 ease-linear" style={{ width: `${Math.min(100, (sceneElapsed / sceneLimit) * 100)}%` }} />
              </div>
            )}
            <div className="mx-auto flex w-full max-w-2xl items-center gap-1.5 rounded-2xl bg-black/55 p-2 backdrop-blur-xl">
              <button onClick={goPrevScene} disabled={i === 0 || recording} aria-label="Previous scene" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white/85 transition-colors hover:bg-white/10 disabled:opacity-30">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button onClick={() => setFontIdx((v) => Math.max(0, v - 1))} disabled={fontIdx === 0 || recording} aria-label="Smaller text" className="grid h-11 w-9 shrink-0 place-items-center rounded-xl text-white/85 transition-colors hover:bg-white/10 disabled:opacity-30">
                <Minus className="h-4 w-4" />
              </button>
              <button onClick={() => setFontIdx((v) => Math.min(FONT_PX.length - 1, v + 1))} disabled={fontIdx === FONT_PX.length - 1 || recording} aria-label="Larger text" className="grid h-11 w-9 shrink-0 place-items-center rounded-xl text-white/85 transition-colors hover:bg-white/10 disabled:opacity-30">
                <Plus className="h-4 w-4" />
              </button>

              {/* the primary record / stop button — centered, prominent */}
              <button onClick={() => (recording ? finishScene() : beginScene())} disabled={!!camError || countdown > 0}
                className={cn('mx-auto flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-40',
                  recording ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-white text-ink hover:bg-white/90')}>
                {recording
                  ? <><span className="h-3 w-3 rounded-[3px] bg-white" /><span className="truncate">{last ? 'Stop & finish' : 'Stop & next'}</span></>
                  : countdown > 0 ? 'Starting…' : <><span className="h-3 w-3 rounded-full bg-red-500" />Record</>}
              </button>

              <button onClick={() => setSpeedSheet(true)} disabled={recording} aria-label="Teleprompter speed" className="flex h-11 shrink-0 items-center gap-1 rounded-xl px-2.5 text-white/85 transition-colors hover:bg-white/10 disabled:opacity-30">
                <Gauge className="h-4 w-4" /><span className="text-sm tabular-nums">{wpmVal}</span>
              </button>
              <button onClick={() => { if (!recording) setMirror((m) => !m) }} disabled={recording} aria-label="Mirror preview" className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors hover:bg-white/10 disabled:opacity-30', mirror ? 'text-teal' : 'text-white/85')}>
                <FlipHorizontal className="h-5 w-5" />
              </button>
            </div>
            {!recording && scene?.camera_framing && (
              <p className="mx-auto mt-2 max-w-2xl truncate text-center text-[11px] text-white/50">{scene.camera_framing} · ~{estSec}s</p>
            )}
          </div>
        )}
      </div>

      <BottomSheet open={speedSheet} title="Teleprompter speed" onClose={() => setSpeedSheet(false)}>
        {(Object.keys(WPM_PRESETS) as WpmPreset[]).map((k) => (
          <SheetOption key={k} label={`${WPM_LABEL[k]} · ${WPM_PRESETS[k]} WPM`} selected={timeline.wpm === k}
            reason={k === 'natural' ? 'Recommended — relaxed, natural pace.' : undefined}
            onPick={() => pickSpeed(k)} />
        ))}
      </BottomSheet>

      <BottomSheet open={exitSheet} title="Discard this take?" onClose={() => setExitSheet(false)}>
        <p className="text-sm text-sand">Leaving now discards the scenes you've recorded — they aren't saved until you finish the take. Your plan and script are safe in your Library.</p>
        <button onClick={onBack} className="w-full rounded-2xl bg-coral text-white font-semibold py-3">Discard &amp; exit</button>
        <button onClick={() => setExitSheet(false)} className="w-full rounded-2xl border border-white/25 text-cream py-3 font-medium">Keep recording</button>
      </BottomSheet>
    </>
  )
}

function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`
  return `${Math.round(n / 1e3)} KB`
}

function UploadMode({ genId, onBack, onJob }: { genId: string; onBack: () => void; onJob: (jobId: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(-1)        // 0..1 upload progress, -1 = not started/indeterminate
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)

  const onFile = async (f: File | undefined) => {
    if (!f || busy) return
    if (!f.type.startsWith('video/')) { setErr('That’s not a video file — pick an MP4 or MOV.'); return }
    setFile(f); setBusy(true); setErr(null); setPct(0); cancelRef.current = false
    try {
      // No shots → the worker runs PySceneDetect on the clip and maps segments.
      // The progress callback drives the real % bar so a big upload never looks
      // frozen (the "it took 5 minutes with no feedback" complaint).
      const { jobId } = await autoEditTake(genId, { blob: f, contentType: f.type || 'video/mp4' }, undefined, (p) => setPct(p))
      if (cancelRef.current) return
      onJob(jobId)
    } catch (e) {
      if (!cancelRef.current) { setErr(e instanceof Error ? e.message : 'Upload failed — try again.'); setBusy(false) }
    }
  }

  const uploading = busy
  const showPct = pct >= 0 && pct < 1
  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-ink text-cream flex flex-col">
      {/* Ambient depth so the screen isn't a dead black void — matches the Create /
          Building screens' signature glow. */}
      <Aurora className="opacity-70" />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-coral/10 blur-[150px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[18rem] w-[18rem] rounded-full bg-teal/10 blur-[130px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-xl items-center justify-between px-4 pt-4 text-sm text-white/60 lg:pt-6">
        <button onClick={onBack} aria-label="Back" className="h-11 w-11 grid place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20">←</button>
        <span className="font-medium text-cream">Upload your clip</span>
        <span className="w-11" />
      </div>

      {/* One centered card with real presence — not a small box stranded in black. */}
      <div className="relative flex-1 grid place-items-center px-5 pb-16">
        <div className="w-full max-w-xl">
          <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

          {!uploading ? (
            <button
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]) }}
              className={cn(
                'group flex w-full flex-col items-center justify-center rounded-3xl border px-8 py-16 text-center backdrop-blur-sm transition-all',
                drag ? 'border-coral/60 bg-coral/[0.08]' : 'border-white/12 bg-white/[0.04] hover:border-coral/40 hover:bg-white/[0.06]',
              )}
            >
              <span className={cn('grid h-20 w-20 place-items-center rounded-3xl shadow-glow transition-transform group-hover:scale-105',
                drag ? 'bg-coral/25' : 'bg-signature')}>
                <UploadCloud className={cn('h-9 w-9', drag ? 'text-coral' : 'text-ink')} />
              </span>
              <p className="mt-6 font-display text-2xl">Drop a clip, or tap to browse</p>
              <p className="mt-2 max-w-sm text-sm text-stone">MP4 or MOV · we detect the scenes and line them up with your plan.</p>
            </button>
          ) : (
            <div className="w-full rounded-3xl border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-signature-soft"><Film className="h-5 w-5 text-cream" /></span>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-cream">{file?.name ?? 'Your clip'}</p>
                  <p className="text-xs text-stone">{file ? fmtBytes(file.size) : ''}{showPct ? ` · ${Math.round(pct * 100)}%` : ' · finishing up…'}</p>
                </div>
                <button onClick={() => { cancelRef.current = true; setBusy(false); setPct(-1); setFile(null) }} aria-label="Cancel upload" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className={cn('h-full rounded-full bg-gradient-to-r from-amber via-coral to-teal transition-[width] duration-200 ease-out', !showPct && 'animate-pulse')}
                  style={{ width: showPct ? `${Math.max(4, Math.round(pct * 100))}%` : '100%' }} />
              </div>
              <p className="mt-3 text-center text-xs text-stone">{showPct ? 'Uploading your clip…' : 'Upload complete — starting your edit…'}</p>
            </div>
          )}

          {err && <p className="mt-4 text-center text-sm text-coral">{err}</p>}
        </div>
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

