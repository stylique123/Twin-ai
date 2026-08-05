// RECORDING YOUR SCREEN — Phase 12 item 13.
//
// `getDisplayMedia` → `MediaRecorder` → 0107's clip RPCs. No camera involved,
// which is why this is buildable and testable while the rest of Phase 11 waits
// for a real take.
//
// ── WHO SEES THE BUTTON, AND WHY IT IS THE OPPOSITE RULE ─────────────────
//
// `can_record_screen` gates the offer with `isExplicitlyTrue` — the button
// appears only for a creator who has SAID they record their screen.
//
// That is the reverse of the footage checklist, and `capabilities.ts` had
// already decided it: `isExplicitlyTrue`'s own doc names "a screen-recording
// clip type nobody can use" as its example of a feature that must not appear
// until asked for. The asymmetry runs the other way here. A missing footage
// checklist costs a creator a video they cannot make; a screen-record button on
// a talking-head creator's plan screen is an affordance for something they do
// not do, and silence is not a request for it.
//
// So an unanswered flag hides this, and the fix is asking the question — not
// showing the button to everyone and hoping.
//
// ── ONE ATTEMPT ID PER RECORDING ─────────────────────────────────────────
//
// Minted when recording STOPS, not when it starts, and reused for every retry
// of those same bytes — so a failed upload retried three times converges on one
// row rather than leaving three half-uploaded clips. Starting a NEW recording
// mints a NEW id, because that is a different clip.
//
// ── THE PICKER CAN BE CANCELLED, AND THAT IS NOT AN ERROR ────────────────
//
// `getDisplayMedia` rejects with NotAllowedError when the creator closes the
// share dialog. Reporting "we could not start recording" for a deliberate
// cancel is how a UI teaches people that its errors are noise.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, MonitorUp, Square, TriangleAlert } from 'lucide-react'
import {
  baseMime, clipErrorMessage, createClipIntent, finalizeClip, newRecordingAttemptId,
  pickClipMime, uploadToSignedTarget,
} from '../lib/api'

type Phase = 'idle' | 'recording' | 'saving'

export function ScreenClipRecorder({ generationId, label, onSaved }: {
  generationId: string
  /** The declared slot this fills — `[SHOW: the settings page]`. Null for an
   *  unattached clip, which 0106 treats as a legitimate state. */
  label?: string | null
  onSaved?: () => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)

  // Stop the stream on unmount, ALWAYS. A live `getDisplayMedia` track keeps the
  // browser's "sharing your screen" banner up after the component is gone,
  // which looks exactly like the app still watching.
  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])
  useEffect(() => stopTracks, [stopTracks])

  useEffect(() => {
    if (phase !== 'recording') return
    const id = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250)
    return () => clearInterval(id)
  }, [phase])

  const save = useCallback(async (blob: Blob) => {
    setPhase('saving')
    // Minted HERE, once, for these bytes. Every retry below reuses it.
    const attemptId = newRecordingAttemptId()
    try {
      const contentType = baseMime(blob.type || 'video/webm')
      const intent = await createClipIntent({
        generationId,
        recordingAttemptId: attemptId,
        contentType,
        sizeBytes: blob.size,
        label: label ?? null,
      })
      await uploadToSignedTarget(
        { bucket: intent.bucket, path: intent.path, token: intent.token,
          signedUrl: intent.signed_url, contentType },
        { contentType, blob },
      )
      await finalizeClip(intent.asset_id, blob.size)
      setPhase('idle')
      setError(null)
      onSaved?.()
    } catch (e) {
      setPhase('idle')
      setError(clipErrorMessage(e instanceof Error ? e.message : String(e)))
    }
  }, [generationId, label, onSaved])

  const start = async () => {
    setError(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      setError('This browser cannot record a screen. Try Chrome or Edge on a desktop.')
      return
    }
    const mime = pickClipMime(MediaRecorder)
    if (mime === null) {
      // Said BEFORE the recording rather than after: an unsupported type yields
      // an empty blob, which the server refuses — having made the creator
      // perform the whole thing first.
      setError('This browser cannot record video. Try Chrome or Edge on a desktop.')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    } catch (e) {
      // Closing the share dialog is a DECISION, not a failure.
      const name = (e as { name?: string })?.name
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        setError('We could not start the screen recording.')
      }
      return
    }
    streamRef.current = stream
    chunksRef.current = []
    const rec = new MediaRecorder(stream, { mimeType: mime })
    recorderRef.current = rec
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      stopTracks()
      const blob = new Blob(chunksRef.current, { type: baseMime(mime) })
      chunksRef.current = []
      if (blob.size === 0) { setPhase('idle'); setError('That recording came out empty.'); return }
      void save(blob)
    }
    // The creator can also stop sharing from the browser's own banner, which
    // ends the track without touching our button. Treated as a stop, or the
    // recording would run on against a dead track and save nothing.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (rec.state === 'recording') rec.stop()
    })
    startedAtRef.current = Date.now()
    setElapsedMs(0)
    rec.start(1000)
    setPhase('recording')
  }

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  const secs = Math.floor(elapsedMs / 1000)
  return (
    <div className="space-y-2">
      {phase === 'idle' && (
        <button
          type="button"
          onClick={start}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-cream transition hover:bg-white/10"
        >
          <MonitorUp className="h-3.5 w-3.5" /> Record my screen
        </button>
      )}
      {phase === 'recording' && (
        <button
          type="button"
          onClick={stop}
          className="inline-flex items-center gap-1.5 rounded-full border border-coral/40 bg-coral/10 px-3 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral/20"
        >
          <Square className="h-3 w-3 fill-current" /> Stop ({Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')})
        </button>
      )}
      {phase === 'saving' && (
        <span className="inline-flex items-center gap-1.5 text-xs text-stone">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving your clip…
        </span>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-coral">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  )
}
