// Screen 4 — Teleprompter or Upload. REAL capture, driven by the Recording Script.
//
// Teleprompter records ONE continuous MediaRecorder session, pausing between
// scenes (so the output is a single valid clip with no dead air between scenes).
// The finished take is autosaved to the private `takes` bucket the moment
// recording ends. AI editing is being rebuilt — this screen only records, saves
// and lets the creator download their raw take.
//
// Only talking scenes (show_in_teleprompter) are recorded. Takes are preserved
// in-memory across back/exit.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, FlipHorizontal, Gauge, Minus, Plus, SwitchCamera, Sparkles, RotateCcw, UploadCloud, Film, X } from 'lucide-react'
import BottomSheet, { SheetOption } from '../../components/v2/BottomSheet'
import { loadRecordingScript, setWpm } from '../../lib/api'
import { buildRecordingScript } from '../../lib/api'
import { pickRecorderMime, getGeneration, uploadSourceRecording, newRecordingAttemptId, UploadOnce } from '../../lib/api'
import { buildTeleprompterIntent, captureScriptSha256, sha256Hex, normalizeDialogue } from '../../lib/api'
import type { CaptureUploadPayload } from '../../lib/api'
import { saveTakePointer, clearTakePointer } from '../../lib/savedTake'
import { cn } from '../../lib/cn'
import { Aurora } from '../../components/Aurora'
import {
  type RecordingScript,
  type RecordingScene,
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
  const [timeline, setTimeline] = useState<RecordingScript | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadNonce, setLoadNonce] = useState(0) // bump to retry the load

  // Load the persisted Recording Script; if there isn't one (e.g. a blueprint made via
  // the classic Studio flow), synthesize it from the blueprint in-memory so every
  // generation is recordable here. A throw OR an unresolvable generation flips to
  // an error card with Retry — never the "Loading…" screen forever.
  useEffect(() => {
    let alive = true
    setLoadFailed(false)
    ;(async () => {
      try {
        let tl = await loadRecordingScript(id)
        if (!tl) {
          const g = await getGeneration(id)
          if (g) tl = buildRecordingScript({ generationId: id, blueprint: g.blueprint, selectedHook: g.selected_hook })
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
    ? <UploadMode genId={id} onBack={onBack} />
    : <Teleprompter genId={id} timeline={timeline} setTimeline={setTimeline} onBack={onBack} />
}

function Teleprompter({ genId, timeline, setTimeline, onBack }: {
  genId: string
  timeline: RecordingScript
  setTimeline: (t: RecordingScript) => void
  onBack: () => void
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
  // reviewed but not yet safely autosaved server-side. beforeunload only fires on
  // real browser unloads, not SPA navigation.
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
  // 'saving' → autosave upload in flight · 'saved' → take is in the takes bucket ·
  // 'failed' → autosave failed (Download is the only way to keep the take).
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
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
  // recording ended, so a refresh doesn't lose it.
  const savedTakePathRef = useRef<string | null>(null)
  // ONE upload per take: autosave/confirm/navigation all share this operation
  // (editor-v2 source-asset contract). reset() only on an explicit re-record.
  const uploadOnceRef = useRef(new UploadOnce<{ path: string }>())
  // The take's recording-attempt identity. Minted once per take; retries reuse
  // it (the DB converges them onto ONE asset); a re-record mints a new one.
  const attemptIdRef = useRef<string | null>(null)
  const liveRef = useRef(false)        // true ONLY while a scene is actively recording (race guard)
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
  // finished take is being reviewed but isn't autosaved server-side yet.
  useEffect(() => { dirtyRef.current = recording || (!!reviewUrl && saveState !== 'saved') }, [recording, reviewUrl, saveState])

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
    // Autosave server-side immediately (best-effort, non-blocking) through the
    // ONE shared upload (editor-v2 source-asset flow: intent → bytes → finalize →
    // worker validation). The database record — not localStorage — is what makes
    // the take recoverable after refresh and on other devices. A real recorder
    // error or an empty blob is not worth persisting.
    if (!recErrRef.current && blob.size >= MIN_TAKE_BYTES) {
      setSaveState('saving')
      saveSourceOnce(blob)
        .then((r) => { savedTakePathRef.current = r.path; setSaveState('saved') })
        .catch(() => setSaveState('failed')) // the beforeunload guard still protects
    }
  }

  // The single upload operation for this take. Every caller (autosave, the
  // retry button) shares it — concurrent calls can never create a second
  // storage object. There is NO legacy-bucket fallback: the source-asset flow
  // is the only write path for new recordings, so on failure we keep the Blob
  // and retry the SAME attempt (same asset, same stable path) — never a second
  // persistence system the editor can't find.
  const saveSourceOnce = (blob: Blob) => uploadOnceRef.current.run(async () => {
    const contentType = blob.type || 'video/webm'
    attemptIdRef.current ??= newRecordingAttemptId()
    // Source Capture Intent (Constitution §5.1) — MANDATORY for a teleprompter
    // take. segmentsRef[i] is the accepted window for scenes[i] (filtered
    // teleprompter scenes, in order; retakes/go-backs already popped the rejected
    // reads). We build + validate it against the shared contract and NEVER upload
    // without it — a provenance failure surfaces as a retryable save error (the
    // raw blob stays in reviewBlobRef), so we neither lose the recording NOR
    // silently strip provenance and recreate the retake defect.
    const segs = segmentsRef.current
    if (!segs.length) throw new Error('No recorded scenes to save — record at least one scene.')
    const scriptSha = await captureScriptSha256({
      generation_id: genId,
      hook: timeline.hook,
      scenes: scenes.map((s) => ({ scene_number: s.scene_number, dialogue: s.dialogue, show_in_teleprompter: s.show_in_teleprompter })),
    })
    const accepted_segments = []
    for (let idx = 0; idx < segs.length; idx++) {
      const scene = scenes[idx]
      if (!scene) throw new Error('Could not match a recorded scene to the script — please re-record.')
      accepted_segments.push({
        scene_number: scene.scene_number,
        start_ms: Math.round(segs[idx].start * 1000),
        end_ms: Math.round(segs[idx].end * 1000),
        intended_dialogue_sha256: await sha256Hex(normalizeDialogue(scene.dialogue ?? '')),
      })
    }
    // Validate the client INPUT against the shared contract before uploading; a
    // contract failure throws → the save fails retryably, never an upload
    // without provenance. The server-authority fields (sourceAssetId,
    // recordedAt) are assigned by the create RPC, so the browser never supplies
    // them (Constitution §10D).
    await buildTeleprompterIntent({
      generationId: genId,
      clientAttemptId: attemptIdRef.current,
      recordingScriptSha256: scriptSha,
      segments: accepted_segments.map((a) => ({ sceneNumber: a.scene_number, startMs: a.start_ms, endMs: a.end_ms, dialogue: '' })),
    })
    const capture: CaptureUploadPayload = { origin: 'teleprompter', recording_script_sha256: scriptSha, recorder_clock: 'mediarecorder-active-time-ms', accepted_segments }
    const intent = await uploadSourceRecording(genId, attemptIdRef.current, { blob, contentType, sizeBytes: blob.size }, undefined, capture)
    saveTakePointer(genId, { takePath: intent.path, contentType, sourceAssetId: intent.assetId })
    return { path: intent.path }
  })

  // Manual retry after a failed save. Reuses the same attempt id, so the server
  // resumes the same asset/object instead of minting a duplicate.
  const retrySave = () => {
    const blob = reviewBlobRef.current
    if (!blob || saveState === 'saving') return
    setSaveState('saving')
    saveSourceOnce(blob)
      .then((r) => { savedTakePathRef.current = r.path; setSaveState('saved') })
      .catch(() => setSaveState('failed'))
  }

  // A real few-second webm/mp4 take is tens of KB minimum; anything under this is
  // an empty/failed recording (no chunks, a recorder error, a 0-byte blob).
  const MIN_TAKE_BYTES = 2048

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
    uploadOnceRef.current.reset() // a NEW take is a NEW asset/upload
    attemptIdRef.current = null   // …with a NEW recording-attempt identity
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
    setSaveState('idle')
    setCamNonce((n) => n + 1)
  }

  const continueNext = () => { setBetween(false); setI((v) => v + 1) }
  // Step back one scene. If the scene we're returning to was already committed
  // (its boundary/window/line are recorded), pop those trailing entries exactly
  // like retakeScene does — otherwise re-recording it would APPEND a duplicate
  // window and the scene would appear twice in the take's records.
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
  // in the blob) and re-open the SAME scene. The next startScene reopens the window
  // past the bad read.
  const retakeScene = () => {
    segmentsRef.current.pop()
    boundsRef.current.pop()
    linesRef.current.pop()
    setBetween(false)
  }

  const pickSpeed = async (wpm: WpmPreset) => { setTimeline(await setWpm(timeline, wpm)); setSpeedSheet(false) }

  // Review screen — the recorded take plays here (camera already off) while the
  // autosave runs in the background. AI editing is being rebuilt, so the actions
  // are: record again, download the raw take, or head back to the studio.
  if (reviewUrl) {
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
            {recErrRef.current ? (
              <div className="rounded-2xl border border-coral/40 bg-coral/10 p-4">
                <p className="text-sm font-semibold text-coral">Something went wrong while recording</p>
                <p className="text-xs text-white/70 mt-1">{recErrRef.current} Please re-record this take.</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-coral/40 bg-coral/10"><Sparkles className="h-4 w-4 text-coral" /></span>
                <div>
                  <p className="text-sm font-semibold text-cream">Your recording looks good.</p>
                  <p className="text-xs text-stone">
                    {saveState === 'saved' && 'Saved to your library — safe even if you close this tab.'}
                    {saveState === 'saving' && 'Saving to your library…'}
                    {saveState === 'failed' && 'Source not saved — retry the upload, or use Download to keep a copy.'}
                    {saveState === 'idle' && 'Download it to keep it, or record another take.'}
                  </p>
                </div>
              </div>
            )}

            {saveState === 'failed' && (
              <button onClick={retrySave} className="w-full rounded-2xl bg-coral px-3 py-4 text-center text-sm font-semibold text-ink shadow-glow hover:opacity-90">
                Retry upload
              </button>
            )}

            <button onClick={reRecord} className="w-full rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-4 text-center hover:bg-white/[0.08]">
              <RotateCcw className="mx-auto h-4 w-4 text-cream" />
              <div className="mt-1 text-sm font-semibold text-cream">Record again</div>
              <div className="text-[11px] text-stone">Try a new take</div>
            </button>
            <button onClick={downloadRaw} className="w-full rounded-2xl border border-white/15 py-3 text-sm font-medium text-cream hover:bg-white/10">Download raw video</button>
            <button onClick={onBack} className="w-full py-2 text-sm text-white/50 hover:text-white">
              {saveState === 'saved' ? 'Back to studio' : 'Exit without keeping this take'}
            </button>
            <p className="text-center text-[11px] text-stone">AI editing is being rebuilt — for now your raw take is kept safe here.</p>
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

function UploadMode({ genId, onBack }: { genId: string; onBack: () => void }) {
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(-1)        // 0..1 upload progress, -1 = not started/indeterminate
  const [file, setFile] = useState<File | null>(null)
  const [drag, setDrag] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)
  // One recording attempt per PICKED FILE: retrying the same file reuses the
  // same attempt id, so the server resumes the same asset/object instead of
  // minting a duplicate. Picking a different file is a new attempt.
  const attemptRef = useRef<{ key: string; id: string } | null>(null)

  const onFile = async (f: File | undefined) => {
    if (!f || busy) return
    if (!f.type.startsWith('video/')) { setErr('That’s not a video file — pick an MP4 or MOV.'); return }
    setFile(f); setBusy(true); setErr(null); setPct(0); cancelRef.current = false
    try {
      // One durable upload through the editor-v2 source-asset flow (intent →
      // signed PUT → finalize → worker validation). The progress callback
      // drives the real % bar so a big upload never looks frozen. No legacy
      // fallback: on failure the user retries the SAME attempt — the file is
      // still in their hands, and a second persistence system would leave
      // recordings the editor can't find.
      const contentType = f.type || 'video/mp4'
      const key = `${f.name}:${f.size}:${f.lastModified}`
      if (attemptRef.current?.key !== key) attemptRef.current = { key, id: newRecordingAttemptId() }
      // Uploaded sources carry an EXPLICIT upload-origin capture intent (no
      // accepted windows) — the editor uses evidence-based inference, never
      // mistaking a real upload for lost teleprompter provenance.
      const capture: CaptureUploadPayload = { origin: 'upload', recording_script_sha256: null, recorder_clock: 'none', accepted_segments: [] }
      const intent = await uploadSourceRecording(genId, attemptRef.current.id, { blob: f, contentType, sizeBytes: f.size }, (p) => setPct(p), capture)
      if (cancelRef.current) return
      saveTakePointer(genId, { takePath: intent.path, contentType, sourceAssetId: intent.assetId })
      onBack()
    } catch (e) {
      if (!cancelRef.current) { setErr(e instanceof Error ? e.message : 'Source not saved — retry the upload.'); setBusy(false) }
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
              <p className="mt-2 max-w-sm text-sm text-stone">MP4 or MOV · saved privately with this video's plan.</p>
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
              <p className="mt-3 text-center text-xs text-stone">{showPct ? 'Uploading your clip…' : 'Upload complete — saving…'}</p>
            </div>
          )}

          {err && <p className="mt-4 text-center text-sm text-coral">{err}</p>}
        </div>
      </div>
    </div>
  )
}

function sceneTypeLabel(t?: RecordingScene['scene_type']) {
  switch (t) {
    case 'talking_head': return 'Talking'
    case 'cta': return 'Final action'
    case 'product_demo': return 'Show the product'
    case 'screen_recording': return 'Screen recording'
    default: return 'Scene'
  }
}

