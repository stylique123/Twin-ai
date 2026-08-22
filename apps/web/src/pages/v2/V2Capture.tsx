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
import { PreflightPanel } from '../../components/PreflightPanel'
import { loadRecordingScript, setWpm, establishDurableRecordingScriptLive, prepareCaptureMode } from '../../lib/api'
import { buildRecordingScript } from '../../lib/api'
import { pickRecorderMime, getGeneration, uploadSourceRecording, newRecordingAttemptId, UploadOnce } from '../../lib/api'
import { buildTeleprompterIntent, captureScriptSha256, sha256Hex, normalizeDialogue } from '../../lib/api'
import type { CaptureUploadPayload } from '../../lib/api'
import { saveTakePointer, clearTakePointer } from '../../lib/savedTake'
import { safeToShow } from '../../lib/api'
import { logSessionEvent } from '../../lib/api'
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
  keepBeforeScene,
  projectAcceptedSegments,
} from '../../lib/timeline'

// The single scene-by-scene recorder — served at BOTH the live `/record/:id`
// route and the V2 `/v2/capture/:id` route, so there is one capture flow for the
// whole app. The only per-route difference is where Back returns to.
export default function V2Capture() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const mode = params.get('mode') === 'upload' ? 'upload' : 'record'
  const nav = useNavigate()
  // Back always returns to the plan (Result) — the single plan screen for the flow.
  const onBack = () => nav(`/result/${id}`)
  return <CaptureGate genId={id} mode={mode} onBack={onBack} />
}

// The ONE capture-mode gate. Both modes route through the shared prepareCaptureMode
// seam (recordingScriptApi): UPLOAD is usable immediately and does ZERO script work
// (Constitution §5.1 — it is not recorded against a script, so a legacy null timeline
// is fine); RECORD uses an already-persisted script directly, or for a legacy null
// script synthesizes from the blueprint → strict-persists → reloads → proves equality
// before the teleprompter is usable. Recording against an in-memory-only or drifted
// script would deterministically fail the create RPC's capture_script_sha_mismatch, so
// a prepare failure blocks recording visibly + retryably — never a lost take.
type CaptureFailure = 'load' | 'persist_failed' | 'reload_failed' | 'mismatch' | 'unexpected'

function CaptureGate({ genId, mode, onBack }: { genId: string; mode: 'upload' | 'record'; onBack: () => void }) {
  const [timeline, setTimeline] = useState<RecordingScript | null>(null)
  const [uploadReady, setUploadReady] = useState(false)
  const [failed, setFailed] = useState<CaptureFailure | null>(null)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let alive = true
    setFailed(null); setTimeline(null); setUploadReady(false)
    ;(async () => {
      try {
        const r = await prepareCaptureMode(mode, {
          loadScript: () => loadRecordingScript(genId),
          synthScript: async () => {
            const g = await getGeneration(genId)
            return g ? buildRecordingScript({ generationId: genId, blueprint: g.blueprint, selectedHook: g.selected_hook }) : null
          },
          establish: (t) => establishDurableRecordingScriptLive(t),
        })
        if (!alive) return
        if (r.ready && r.mode === 'upload') { setUploadReady(true); return }
        if (r.ready && r.mode === 'record') { setTimeline(r.script); return }
        console.warn('capture_prepare_failed', { generationId: genId, reason: r.reason })
        setFailed(r.reason)
      } catch {
        console.warn('capture_prepare_failed', { generationId: genId, reason: 'unexpected' })
        if (alive) setFailed('unexpected')
      }
    })()
    return () => { alive = false }
  }, [genId, mode, nonce])

  if (mode === 'upload') {
    if (uploadReady) return <UploadMode genId={genId} onBack={onBack} />
    return <div className="min-h-[100dvh] grid place-items-center bg-ink text-sand">Loading…</div>
  }
  if (!timeline) {
    if (failed) {
      const copy: Record<CaptureFailure, { title: string; detail: string }> = {
        load: {
          title: "We couldn't load your video plan",
          detail: 'Your script is safe in your Library. Check your connection, then retry.',
        },
        persist_failed: {
          title: "We couldn't save your script for recording",
          detail: 'Twin could not confirm that this script belongs to your signed-in session. Retry once; if it continues, sign in again.',
        },
        reload_failed: {
          title: "We couldn't verify your saved script",
          detail: 'The save could not be read back safely. Retry before recording.',
        },
        mismatch: {
          title: 'Your script changed while opening',
          detail: 'Go back to the plan, review the latest script, then open the teleprompter again.',
        },
        unexpected: {
          title: "We couldn't prepare your script for recording",
          detail: 'A temporary account or connection error interrupted preparation. Retry before recording.',
        },
      }
      const message = copy[failed]
      return (
        <div className="min-h-[100dvh] grid place-items-center bg-ink text-cream px-6">
          <div className="max-w-sm text-center">
            <p className="font-semibold">{message.title}</p>
            <p className="mt-1 text-sm text-white/60">{message.detail}</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={() => setNonce((n) => n + 1)} className="rounded-xl bg-cream text-ink font-semibold px-5 py-2 text-sm">Retry</button>
              <button onClick={onBack} className="rounded-xl border border-white/20 px-5 py-2 text-sm text-cream">Back</button>
            </div>
          </div>
        </div>
      )
    }
    return <div className="min-h-[100dvh] grid place-items-center bg-ink text-sand">Loading…</div>
  }
  return <Teleprompter genId={genId} timeline={timeline} setTimeline={setTimeline} onBack={onBack} />
}

function Teleprompter({ genId, timeline, setTimeline, onBack }: {
  genId: string
  timeline: RecordingScript
  setTimeline: (t: RecordingScript) => void
  onBack: () => void
}) {
  const nav = useNavigate()
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
  // HOW FAR THE UPLOAD ACTUALLY GOT.
  //
  // `uploadSourceRecording` has taken an onProgress callback all along and the
  // teleprompter passed `undefined`, so this screen showed one static sentence
  // from the first byte to the last. A creator watching "Saving to your library…"
  // cannot tell a slow upload from a dead one — and on the run that produced this
  // fix, the take never saved and the screen never said so.
  const [savePct, setSavePct] = useState(0)
  // The last moment bytes moved. A stalled upload is not an error: fetch/XHR on a
  // phone that loses its connection mid-PUT can hang without ever rejecting, which
  // is why 'saving' could outlive the upload entirely. Silence needs its own
  // deadline or it is indistinguishable from progress.
  const progressAtRef = useRef(0)
  // WHY THE REASON IS STATE AND NOT A CONSOLE LINE.
  //
  // `saveSourceOnce` can fail in five distinct places — no recorded scenes, the
  // script SHA, the accepted-window projection, the intent contract, and the
  // upload itself. Every one of them used to land in `.catch(() => 'failed')`,
  // which threw the reason away. The creator saw one sentence telling them to
  // retry, and retrying a provenance mismatch fails identically forever.
  //
  // It is worse than a bad message: the edit handoff below renders only when
  // the save reaches `saved`, so a silent failure here presents as "TwinAI has
  // no editor" — which is what a creator reported, and what the single
  // production source asset stuck in `uploading` with no object behind it is
  // the database's version of. The pipeline was never reached, and nothing on
  // the screen or in the row said why.
  const [saveError, setSaveError] = useState<string | null>(null)

  // One place to record a failed save, so the two callers cannot disagree about
  // what a failure leaves behind. Logged AND surfaced: the log is for us, the
  // sentence is for the creator, and neither substitutes for the other.
  const failSave = (e: unknown) => {
    const msg = e instanceof Error && e.message.trim() ? e.message.trim() : 'The upload did not complete.'
    console.warn('[capture] source save failed', e)
    setSaveError(msg)
    setSaveState('failed')
  }
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
  // NOBODY STARTS SPEAKING ON THE FRAME THE LIGHT GOES RED. The prompter used to
  // count the first word as read at t=0, so the creator was already behind before
  // they had drawn breath, and every word after inherited that debt. A short
  // lead-in is what a human does anyway.
  const PROMPTER_LEAD_IN_SEC = 0.8
  const readSec = Math.max(0, sceneElapsed - PROMPTER_LEAD_IN_SEC)
  const readCount = recording ? Math.floor((readSec / 60) * wpmVal) : -1
  // ONE CLOCK FOR BOTH MOTIONS.
  //
  // Reported from a real recording run: "there's two scrollers — one going down,
  // the other highlighting", and scene 2's prompter "vanished in two seconds".
  // Both are this number. The highlight advances on WORDS-over-WPM; the glide
  // used to advance on the scene's PLANNED seconds. Those are different clocks
  // and they disagree by however much the plan's estimate was wrong.
  //
  // Scene 2 is the worst case and it is not rare: a beat planned at "about 5s"
  // carrying ~45 words of dialogue. The highlight paced it at ~20 seconds. The
  // glide ran the entire text past the read-line in five — so the words scrolled
  // off while the creator was still on the first line of them.
  //
  // The prompter now moves with the reader: progress is the share of the WORDS
  // that should have been spoken, so the word being highlighted is the word at
  // the read-line, by construction rather than by coincidence. The plan's own
  // number still drives the timing bar and the auto-stop cap — this changes what
  // the TEXT does, not what the scene is worth. The glide itself is computed per
  // frame in the rAF tick below, from the same words-over-WPM sum.
  // THE SCENE'S OWN LENGTH, not a second opinion about it.
  //
  // This used to re-derive the estimate from the words right here, ignoring
  // `scene.duration_sec` entirely — a second estimator for a fact the scene
  // already carries. The two agreed only by coincidence, and the moment the
  // adapter's number came from anywhere other than the same words-over-WPM sum
  // (a beat plan's decided target, an edit, a future planner) the screen the
  // creator actually films against would have quietly disagreed with the plan
  // they read. `totalDurationSec` was already summing `duration_sec`, so the
  // total and the per-scene numbers could not both be right.
  const plannedSec = Math.max(1, Math.round(
    typeof scene?.duration_sec === 'number' && scene.duration_sec > 0
      ? scene.duration_sec
      : estimateDurationSec(scene?.dialogue ?? null, timeline.wpm),
  ))
  const estSec = plannedSec

  // THE CAP IS NOT THE TARGET, and conflating them would cut people off.
  //
  // `sceneTimeCapSec` AUTO-STOPS the recording. A beat planned for 6 seconds
  // whose words actually take 14 would stop the creator mid-sentence, and they
  // would have no idea why — the plan being optimistic is our problem to absorb,
  // not theirs to discover while filming.
  //
  // So the cap is sized on whichever is LONGER: what was planned, or what the
  // words on screen genuinely need. The target still guides them; the ceiling
  // just refuses to punish them for following it.
  const spokenSec = Math.max(1, Math.round(estimateDurationSec(scene?.dialogue ?? null, timeline.wpm)))
  const sceneLimit = sceneTimeCapSec(Math.max(plannedSec, spokenSec))

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

  // A SAVE THAT STOPPED IS NOT A SAVE THAT IS SLOW.
  //
  // Reported from the recording run: "Saving to your library…" that never
  // resolved, on a take that never reached the Library. Nothing was wrong with
  // the error handling — `failSave` names five distinct causes. The problem is
  // that a stalled upload produces no error to name. An XHR whose connection
  // dies mid-PUT can sit open indefinitely, so the promise never settles, the
  // catch never runs, and the screen keeps promising something that stopped
  // happening minutes ago.
  //
  // The deadline is on SILENCE, not on total time: a genuinely slow upload keeps
  // firing progress events and is left alone however long it takes. Only an
  // upload where nothing has moved for this long is called stalled.
  //
  // The take itself is never at risk — the Blob is still in memory, Download
  // still works, and Retry reuses the same attempt id so the server resumes the
  // same asset rather than minting a duplicate. So this converts a silent hang
  // into a state with a way out, which is the whole of what it claims to do.
  useEffect(() => {
    if (saveState !== 'saving') return
    const STALL_MS = 45_000
    const h = window.setInterval(() => {
      if (performance.now() - progressAtRef.current < STALL_MS) return
      window.clearInterval(h)
      failSave(new Error('The upload stopped partway. Your take is still on this device — press Retry, or download it to keep it.'))
    }, 2000)
    return () => window.clearInterval(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState])

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
  const wordCount = words.length
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
      // The SAME word clock `readCount` uses — see the note above it. Read
      // per frame from `now` rather than from `sceneElapsed` so the glide stays
      // smooth at 60fps instead of stepping with that state's 100ms tick.
      const el = Math.max(0, (now - start) / 1000 - PROMPTER_LEAD_IN_SEC)
      const prog = wordCount ? Math.min(1, (el / 60) * wpmVal / wordCount) : Math.min(1, el / estSec)
      p.style.transform = `translateY(${readY - prog * travel}px)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [recording, i, estSec, fontIdx, wpmVal, wordCount])

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
        // ⚠️ AFTER THE PERMISSION RESOLVED, NOT BEFORE THE PROMPT. Logging on the
        // attempt would count a creator who denied the permission as one who
        // reached the camera, which is the opposite finding.
        logSessionEvent('camera_opened', { facing })
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.muted = true; void videoRef.current.play() }
      } catch (e) {
        // ⚖️ THE BREAKAGE IS THE EVENT. Without this a creator blocked by a
        // permission dialog and one who simply left both read as "never opened
        // the camera" — same silence, opposite fixes.
        logSessionEvent('client_error', { where: 'getUserMedia', message: e instanceof Error ? e.message : String(e) })
        setCamError(e instanceof Error ? e.message : 'Camera/microphone not available')
      }
    })()
    return () => {
      cancelled = true
      // ⚠️ LEAVING WITH THE RECORDER STILL LIVE IS THE ABORT. finalizeRecording
      // sets the recorder inactive before this runs on a normal finish, so an
      // ACTIVE recorder here means they walked away mid-take — which is exactly
      // the moment a watched session most needs a reason attached to it.
      if (recRef.current && recRef.current.state !== 'inactive') {
        logSessionEvent('recording_aborted', { scenes_closed: segmentsRef.current.length })
      }
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
    if (rec.state === 'inactive') {
      // ⚠️ ONE SESSION, SO THIS FIRES ONCE. The recorder pauses between scenes
      // rather than restarting, and counting resumes as starts would report a
      // four-scene take as four attempts.
      logSessionEvent('recording_started')
      rec.start(250)       // first scene: begin the single session
    }
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
      setSaveState('saving'); setSavePct(0); progressAtRef.current = performance.now()
      setSaveError(null)
      saveSourceOnce(blob)
        .then((r) => { savedTakePathRef.current = r.path; setSaveState('saved') })
        .catch(failSave) // the beforeunload guard still protects
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
    // The recording-script SHA is the ONE canonical snapshot (scriptSnapshot.ts),
    // computed from the FULL, UNFILTERED script (every scene, incl. hidden b-roll) —
    // the SAME canonical the server recomputes from generations.scene_timeline and
    // Boot later pins. NOT the filtered teleprompter subset.
    const scriptSha = await captureScriptSha256({
      generation_id: genId,
      hook: timeline.hook,
      scenes: timeline.scenes.map((s) => ({
        scene_number: s.scene_number, scene_type: s.scene_type,
        dialogue: s.dialogue, show_in_teleprompter: s.show_in_teleprompter,
      })),
    })
    // Project the recorded windows onto the teleprompter scenes through the ONE
    // shared authority: it pairs window k ↔ scene k, verifies the windows are
    // ordered + non-overlapping (rejected bytes fall in the gaps) and the scene
    // numbers unique, and fails closed on any misalignment — so we never upload
    // provenance that doesn't match the take.
    const projected = projectAcceptedSegments(
      segs.map((s) => ({ startMs: Math.round(s.start * 1000), endMs: Math.round(s.end * 1000) })),
      scenes,
    )
    const accepted_segments = []
    for (let idx = 0; idx < projected.length; idx++) {
      const scene = scenes[idx]
      accepted_segments.push({
        scene_number: projected[idx].sceneNumber,
        start_ms: projected[idx].startMs,
        end_ms: projected[idx].endMs,
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
    const intent = await uploadSourceRecording(
      genId,
      attemptIdRef.current,
      { blob, contentType, sizeBytes: blob.size },
      (p) => { progressAtRef.current = performance.now(); setSavePct(p) },
      capture,
    )
    saveTakePointer(genId, { takePath: intent.path, contentType, sourceAssetId: intent.assetId })
    return { path: intent.path }
  })

  // Manual retry after a failed save. Reuses the same attempt id, so the server
  // resumes the same asset/object instead of minting a duplicate.
  const retrySave = () => {
    const blob = reviewBlobRef.current
    if (!blob || saveState === 'saving') return
    setSaveState('saving'); setSavePct(0); progressAtRef.current = performance.now()
    setSaveError(null)
    saveSourceOnce(blob)
      .then((r) => { savedTakePathRef.current = r.path; setSaveState('saved') })
      .catch(failSave)
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
  // Truncate the recorded-scene provenance to entries strictly before `target`
  // through the ONE shared authority (keepBeforeScene), applied identically to all
  // parallel accumulators so they stay 1:1 with the teleprompter scenes.
  const truncateRecordedTo = (target: number) => {
    segmentsRef.current = keepBeforeScene(segmentsRef.current, target)
    boundsRef.current = keepBeforeScene(boundsRef.current, target)
    linesRef.current = keepBeforeScene(linesRef.current, target)
  }
  // Step back to scene `i-1`. Re-recording the target re-appends it, and any scenes
  // recorded AFTER the target's now-discarded take are orphaned, so discard the
  // target scene's window AND every window after it — NOT just the last one (the old
  // pop-one left the target's stale window in place, duplicating a scene at save).
  // The recorder clock is never rewound: the flubbed bytes stay in the single blob.
  const goPrevScene = () => {
    if (i === 0 || recording) return
    const target = i - 1
    truncateRecordedTo(target)
    setBetween(false)
    setI(target)
  }
  // Retake the scene we just finished: same truncation with the target set to the
  // last recorded scene (drops its kept window; the flubbed read stays in the blob).
  // The next startScene reopens the window past the bad read.
  const retakeScene = () => {
    truncateRecordedTo(segmentsRef.current.length - 1)
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
                    {saveState === 'saving' && (savePct > 0 ? `Saving to your library… ${Math.round(savePct * 100)}%` : 'Saving to your library…')}
                    {/* The CAUSE, not just the outcome. Some of these are
                        retryable (the upload dropped) and some are not (the
                        recorded windows do not match the script), and a
                        creator pressing Retry forever on the second kind is
                        the specific harm of collapsing them into one line. */}
                    {saveState === 'failed' && (saveError ?? 'The upload did not complete.')}
                    {saveState === 'idle' && 'Download it to keep it, or record another take.'}
                  </p>
                </div>
              </div>
            )}

            {saveState === 'failed' && (
              <>
                <button onClick={retrySave} className="w-full rounded-2xl bg-coral px-3 py-4 text-center text-sm font-semibold text-ink shadow-glow hover:opacity-90">
                  Retry upload
                </button>
                {/* Never let a failed save read as a missing feature. Twin CAN
                    edit this take; it has not received it yet. Saying so is
                    what stops a creator concluding the editor does not exist
                    and downloading the raw file instead. */}
                <p className="text-center text-[11px] leading-relaxed text-stone">
                  Your take is still here, and Download always works. Twin can edit
                  it as soon as this upload lands.
                </p>
              </>
            )}

            {/* THE HANDOFF THAT WAS MISSING.
                This screen's only exits were "record again", "download raw" and
                "leave" — under a line saying AI editing was being rebuilt. It
                is not: the pipeline runs end to end, and `Result` already owns
                the whole start-an-edit flow (the ready-source check, the stable
                refusal codes, progress, cancel).
                So this ROUTES there rather than calling `startEditorV2` itself.
                A second start seam would be a second place for the idempotency
                key, the ready-source rule and the 503 copy to drift — the exact
                duplication this codebase keeps deleting.
                Shown only once the source is SAVED, because an edit of a take
                that has not finished uploading has nothing to read. */}
            {saveState === 'saved' && (
              <button
                onClick={() => nav(`/result/${genId}`)}
                className="btn-gradient w-full rounded-2xl px-3 py-4 text-center text-sm font-semibold"
              >
                Turn this into a video
                <div className="text-[11px] font-normal opacity-80">Twin edits your take — captions, cuts, export</div>
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
            {(saveState === 'saving' || saveState === 'idle') && (
              // Only while the take is still in flight. The old line said AI
              // editing was being rebuilt and sat here unconditionally, which
              // told a creator with a perfectly editable take that the feature
              // did not exist.
              //
              // `failed` is excluded because "while it uploads" describes an
              // upload that is still happening. Saying it after one stopped is
              // the same class of untruth, just quieter — and it sits directly
              // under the sentence explaining that the upload did not finish.
              <p className="text-center text-[11px] text-stone">Your raw take is kept safe here while it uploads.</p>
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
        <div className="mt-0.5 text-xs text-white/50">{sceneTypeLabel(next?.scene_type)} · about {Math.max(1, Math.round(
          typeof next?.duration_sec === 'number' && next.duration_sec > 0
            ? next.duration_sec
            : estimateDurationSec(next?.dialogue ?? null, timeline.wpm),
        ))}s</div>
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
        {/* A CONTRADICTION IS NOT IMPROVED BY BEING DISPLAYED. This line read
            "None for the creator, as this is a b roll overlay sequence" on a
            scene that hands the creator words to say — so the screen asked him
            to perform a scene it told him he was not in. Where the direction is
            the half that is wrong, showing nothing beats showing both and
            leaving him to work out which to believe. See sceneConsistency.ts;
            the structural fix is the field split in §5c. */}
        {next?.movement && safeToShow({ spoken: !!next.show_in_teleprompter, dialogue: next.dialogue, movement: next.movement }, 'movement') && <div><div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">What to do while you talk</div><p className="text-white/90">{next.movement}</p></div>}
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
            {/* PHASE 11 ITEM 6 — the check that has to happen while the creator
                can still fix it. Shown only on the FIRST scene and only before
                rolling: after a take exists, "your phone is sideways" is no
                longer advice, it is a request to start over, and mid-take it is
                noise over the one thing they are trying to read. It reports and
                never blocks the record button — see PreflightPanel's header. */}
            {!recording && i === 0 && !reviewUrl && (
              <div className="mt-2">
                <PreflightPanel streamRef={streamRef} videoRef={videoRef} />
              </div>
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
