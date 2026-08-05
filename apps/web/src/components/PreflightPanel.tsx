// THE CHECK BEFORE THE CAMERA ROLLS — Phase 11 item 6, finally on screen.
//
// The build plan calls this the panel's #1 gap: "room echo, backlight,
// orientation, head cropped, mic source. Nothing in the pipeline addresses the
// actual failures of video #1." Every stage downstream — captions, cuts, zooms,
// loudness — improves a take that was worth keeping. None of them rescue one
// filmed sideways or with no microphone, and by the time anything downstream
// could notice, the only remedy left is asking the creator to film it again.
//
// ── IT REPORTS. IT DOES NOT BLOCK ─────────────────────────────────────────
//
// `PreflightReport.blocking` exists and is deliberately not wired to the record
// button. Phase 11's whole purpose is to stop stranding someone at the camera,
// and a gate they cannot clear — a laptop that reports a square frame, a mic the
// browser will not level until a gesture it has already made — teaches them to
// route around the check rather than to fix the room. The same call
// `UnfilledContainers` made about a stray bracket, for the same reason.
//
// ── "NOT CHECKED" IS DRAWN, NEVER OMITTED ─────────────────────────────────
//
// The engine has four states because three would lie. Framing, lighting and the
// room are `unmeasured` in every browser today (see `preflightSignals.ts` for
// exactly why each one is refused rather than approximated), and a panel that
// hid them would show two green ticks and read as "everything is fine". It is
// not: it is "two things are fine and three were never looked at", and the
// creator is the only one who can check the other three — which they will only
// do if we admit we did not.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, CircleHelp, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import {
  evaluatePreflight, type PreflightCheck, type PreflightReason, type PreflightReport,
} from '../lib/api'
import { measurePreflight } from '../lib/preflightSignals'

/** What each check is called on screen. The engine carries ids, never prose. */
const CHECK_LABEL: Record<PreflightCheck['id'], string> = {
  orientation: 'Phone upright',
  framing: 'You in frame',
  lighting: 'Light on your face',
  room: 'Room sound',
  mic: 'Microphone',
}

/**
 * What to DO about it — an instruction, not a diagnosis.
 *
 * Split by reason rather than by check because the fixes differ inside one
 * check: `subject_backlit` means turn around and `scene_too_dark` means add
 * light, and a creator told only "lighting: warn" has to guess which.
 */
const REASON_FIX: Record<PreflightReason, string> = {
  ok: '',
  unmeasured: 'Not checked — worth a look yourself',
  landscape: 'Turn your phone upright — a sideways take cannot be cropped back',
  near_square: 'A square frame gets cropped. Upright fills more of the screen',
  no_face_found: 'Step into the frame so the camera can see you',
  head_cropped: 'Lower the camera or step back — the top of your head is cut off',
  chin_cropped: 'Raise the camera a little — your chin is out of frame',
  subject_too_far: 'Come closer, or move the camera nearer',
  subject_off_centre: 'Move toward the middle of the frame',
  subject_backlit: 'Turn around — the light is behind you',
  scene_too_dark: 'Add a light, or face a window',
  room_echo: 'The room is echoey. Soft furnishings help, or move somewhere smaller',
  no_audio_track: 'No microphone — check permissions before you record',
  mic_too_quiet: 'Move closer to the mic, or speak up',
  mic_clipping: 'Back off the mic a little — it is peaking',
}

const ICON: Record<PreflightCheck['state'], typeof Check> = {
  ok: Check,
  warn: TriangleAlert,
  fail: CircleAlert,
  unmeasured: CircleHelp,
}
// Tuned for the capture screen's full-bleed dark overlay, which is the only
// place this mounts.
const TONE: Record<PreflightCheck['state'], string> = {
  ok: 'text-teal',
  warn: 'text-amber-300',
  fail: 'text-red-400',
  unmeasured: 'text-white/35',
}

export function PreflightPanel({ streamRef, videoRef }: {
  streamRef: { current: MediaStream | null }
  videoRef: { current: HTMLVideoElement | null }
}) {
  const [report, setReport] = useState<PreflightReport | null>(null)
  const [busy, setBusy] = useState(false)
  // The mic sample holds the microphone open for ~1.2s. Two overlapping runs
  // would fight over it and report the quieter of two windows.
  const running = useRef(false)

  const run = useCallback(async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      const signals = await measurePreflight(streamRef.current, videoRef.current)
      setReport(evaluatePreflight(signals))
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [streamRef, videoRef])

  // Run once the camera is actually delivering frames. `loadedmetadata` is the
  // event that guarantees `videoWidth` is real; running on mount would measure a
  // 0x0 element and report the one check that never needs to be unmeasured.
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (el.videoWidth > 0) { void run(); return }
    const onReady = () => { void run() }
    el.addEventListener('loadedmetadata', onReady)
    return () => { el.removeEventListener('loadedmetadata', onReady) }
  }, [run, videoRef])

  if (!report && !busy) return null

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl bg-black/55 p-3.5 text-white backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-white/50">Before you record</p>
        <button
          type="button" onClick={() => { void run() }} disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs text-white/60 transition-colors hover:text-white disabled:opacity-50"
        >
          {busy
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</>
            : <><RefreshCw className="h-3.5 w-3.5" /> Check again</>}
        </button>
      </div>

      {report && (
        <ul className="mt-3 space-y-2">
          {report.checks.map((c) => {
            const Icon = ICON[c.state]
            return (
              <li key={c.id} className="flex items-start gap-2.5 text-sm">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE[c.state]}`} />
                <span className="min-w-0">
                  <span className={c.state === 'unmeasured' ? 'text-white/45' : ''}>{CHECK_LABEL[c.id]}</span>
                  {c.reason !== 'ok' && (
                    <span className="block text-xs text-white/55">{REASON_FIX[c.reason]}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {report && report.unmeasured.length > 0 && (
        // Said once, plainly. Without this the grey rows read as "pending" —
        // something that will resolve if you wait — rather than "this browser
        // cannot see it, so you are the one checking".
        <p className="mt-3 text-xs text-white/40">
          We can only check the first two automatically. The rest are yours to eyeball.
        </p>
      )}
    </div>
  )
}
