// DECLARED CLIPS — Phase 12 item 13, pointed at the slots the script declares.
//
// `[SHOW: the settings page]` is Phase 12 item 11's deliberate marker, and
// `containerResolution.ts` already classifies it as a declared clip rather than
// a gap — it survives the resolver on purpose. Until now nothing read the other
// end of that: the markers were parsed, kept, and shown to nobody.
//
// ── THE LIST IS THE SCRIPT'S, NOT THIS COMPONENT'S ───────────────────────
//
// Every slot here comes from `resolveScript(...).declaredClips`. There is no
// second parser, no "common things creators capture", no suggested list. If the
// script does not declare a slot, no slot appears — which means the way to add
// one is to edit the script, in the editor sitting directly above this on the
// same screen, and the marker the model wrote is the same marker the capture
// fills. A capture surface with its own idea of what to record would be a
// second source of truth about the video, competing with the script the creator
// is about to read aloud.
//
// ── THE GATE, AND WHY UNSET IS NOT A CLOSED DOOR ─────────────────────────
//
// §2.2's `can_record_screen` decides whether this appears, through
// `isExplicitlyTrue` — a feature that must not show up until it is asked for.
// But UNSET is not `false`, and treating it as one would hide this from every
// account that predates the question (which is every existing account). So:
//
//   true   → the capture surface.
//   unset  → the QUESTION, right here, answering into the same brand default
//            onboarding writes. That is what makes the gate openable rather
//            than permanently shut for everyone who signed up before it existed.
//   false  → nothing. They said no; asking again on every plan screen is nagging
//            a creator with the answer they already gave.
//
// ── AND THE CLIP CARRIES NO AUDIO ────────────────────────────────────────
//
// `getDisplayMedia` is asked for video only. The composition model discards a
// clip's audio (see EditPlanV1 v7), so capturing system audio would record a
// creator's meeting, music or notifications into an object we then throw away —
// a privacy cost with no benefit, and one the browser would have shown them a
// checkbox for.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MonitorPlay, Square, Check, TriangleAlert } from 'lucide-react'
import { declaredSlots } from '../lib/declaredClips'
import {
  listGenerationClips, uploadClipRecording, newRecordingAttemptId,
  loadCapabilities, saveCapabilityDefaults, listBrandVoices,
  isExplicitlyTrue, isExplicitlyFalse,
  type Blueprint, type MediaAsset, type ResolvedCapabilities,
} from '../lib/api'

type SlotState =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'uploading'; fraction: number }
  | { kind: 'error'; message: string }

export function DeclaredClips({ generationId, blueprint, hook }: {
  generationId: string
  blueprint: Blueprint
  hook: string | null
}) {
  const slots = useMemo(() => declaredSlots(blueprint, hook), [blueprint, hook])
  const [caps, setCaps] = useState<ResolvedCapabilities | null>(null)
  const [clips, setClips] = useState<MediaAsset[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [state, setState] = useState<SlotState>({ kind: 'idle' })
  const [answering, setAnswering] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  // The attempt id is kept PER LABEL and reused across retries of the same
  // capture, which is the whole idempotency story: a failed upload retried
  // converges on the one asset the first attempt created instead of leaving a
  // second half-uploaded row behind.
  const attempts = useRef<Map<string, string>>(new Map())

  const refreshClips = useCallback(async () => {
    setClips(await listGenerationClips(generationId))
  }, [generationId])

  useEffect(() => {
    if (slots.length === 0) return
    let stopped = false
    void (async () => {
      const resolved = await loadCapabilities(generationId)
      if (!stopped) setCaps(resolved)
    })()
    void refreshClips()
    return () => { stopped = true }
  }, [generationId, refreshClips, slots.length])

  // Stop any live capture if this screen goes away. A share indicator left
  // running after the creator navigated on is the kind of thing that makes
  // someone distrust a product permanently.
  useEffect(() => () => {
    recorder.current?.stream.getTracks().forEach((t) => { t.stop() })
    recorder.current = null
  }, [])

  const clipFor = useCallback((label: string): MediaAsset | undefined => (
    clips.find((c) => (c.clip_label ?? '').toLowerCase() === label.toLowerCase())
  ), [clips])

  const answerYes = async () => {
    setAnswering(true)
    try {
      // The brand the answer belongs to — the same default `loadCapabilities`
      // reads back, so a yes here is a yes the gate can see.
      const voices = await listBrandVoices()
      const voiceId = (voices.find((v) => v.is_default) ?? voices[0])?.id
      if (voiceId) await saveCapabilityDefaults(voiceId, { can_record_screen: true })
      setCaps(await loadCapabilities(generationId))
    } catch {
      setState({ kind: 'error', message: 'Could not save that — try again.' })
    } finally {
      setAnswering(false)
    }
  }

  const capture = async (label: string) => {
    setState({ kind: 'idle' })
    let stream: MediaStream
    try {
      // Video only. See the header: the clip's audio is discarded downstream, so
      // asking for it would capture a creator's meeting for nothing.
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
    } catch {
      // A cancelled picker is NOT an error — it is a creator changing their
      // mind, and the most common outcome of pressing this button. Saying
      // "capture failed" to someone who chose to stop is telling them something
      // false about their own action.
      return
    }
    const chunks: Blob[] = []
    // WebM is what every browser that implements getDisplayMedia records, and it
    // is one of the three MIME types the clip create RPC accepts. No fallback
    // guess: if MediaRecorder refuses it, the capture fails visibly rather than
    // uploading bytes under a content type the server was not told about.
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, { mimeType: 'video/webm' })
    } catch {
      stream.getTracks().forEach((t) => { t.stop() })
      setState({ kind: 'error', message: 'This browser cannot record the screen. Try Chrome or Edge on a desktop.' })
      return
    }
    recorder.current = rec
    setActive(label)
    setState({ kind: 'recording' })

    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    rec.onstop = () => {
      stream.getTracks().forEach((t) => { t.stop() })
      recorder.current = null
      const blob = new Blob(chunks, { type: 'video/webm' })
      void send(label, blob)
    }
    // Ending the share from the BROWSER's own bar is a stop, not a crash. Without
    // this the recorder keeps running against a dead track and the creator is
    // left with a button that does nothing.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (rec.state !== 'inactive') rec.stop()
    })
    rec.start()
  }

  const stop = () => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }

  const send = async (label: string, blob: Blob) => {
    setState({ kind: 'uploading', fraction: 0 })
    const attemptId = attempts.current.get(label) ?? newRecordingAttemptId()
    attempts.current.set(label, attemptId)
    try {
      await uploadClipRecording(
        generationId, attemptId,
        { contentType: 'video/webm', blob, sizeBytes: blob.size },
        label,
        (fraction) => { setState({ kind: 'uploading', fraction }) },
      )
      // A NEW capture of this slot is a new attempt. Clearing it here — after
      // the upload landed — is what makes "record it again" produce a second
      // asset rather than colliding with the descriptor of the first.
      attempts.current.delete(label)
      setActive(null)
      setState({ kind: 'idle' })
      await refreshClips()
    } catch (e) {
      // The attempt id is deliberately KEPT on failure, so pressing the button
      // again retries the same capture rather than starting a new one.
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Could not save that capture.' })
    }
  }

  if (slots.length === 0) return null
  if (caps && isExplicitlyFalse(caps.can_record_screen)) return null

  const unanswered = caps !== null && !isExplicitlyTrue(caps.can_record_screen)

  return (
    <div className="rounded-card border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-start gap-2">
        <MonitorPlay className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sand" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-cream">
            {slots.length === 1
              ? 'Your script asks you to show one thing'
              : `Your script asks you to show ${slots.length} things`}
          </p>

          {unanswered ? (
            // The gate, openable. See the header: unset is not a closed door, and
            // for every account older than the question it is the only state.
            <div className="mt-2">
              <p className="text-[11px] leading-relaxed text-sand">
                Twin can capture these from your screen. Can you record your screen?
              </p>
              <button
                type="button"
                className="btn-ghost mt-2 !py-1.5 !text-[11px]"
                onClick={() => { void answerYes() }}
                disabled={answering}
              >
                {answering ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Yes, I can record my screen
              </button>
              <p className="mt-2 text-[11px] leading-relaxed text-stone">
                If you cannot, leave this — the slots stay in your script as notes for whatever
                you film instead. We have not assumed either way.
              </p>
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {slots.map((slot) => {
                const existing = clipFor(slot.label)
                const busy = active === slot.label && state.kind !== 'idle' && state.kind !== 'error'
                return (
                  <li key={slot.label} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-sand">
                      <span className="text-stone">Scene {slot.sceneNumber}: </span>
                      “{slot.label}”
                      {existing && (
                        <span className="ml-2 inline-flex items-center gap-1 text-teal">
                          {existing.status === 'ready'
                            ? <><Check className="h-3 w-3" /> captured</>
                            : <><Loader2 className="h-3 w-3 animate-spin" /> checking it</>}
                        </span>
                      )}
                    </span>
                    {active === slot.label && state.kind === 'recording' ? (
                      <button type="button" className="btn-ghost !py-1 !text-[11px]" onClick={stop}>
                        <Square className="h-3 w-3" /> Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost !py-1 !text-[11px]"
                        onClick={() => { void capture(slot.label) }}
                        disabled={busy || (state.kind !== 'idle' && state.kind !== 'error')}
                      >
                        {busy && state.kind === 'uploading'
                          ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                          : <><MonitorPlay className="h-3 w-3" /> {existing ? 'Record again' : 'Record screen'}</>}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {state.kind === 'error' && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-coral">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {state.message}
            </p>
          )}

          {/* SAID RATHER THAN IMPLIED. A creator who captures three clips and
              then watches a finished video with none of them in it would have no
              way to tell whether they did something wrong. They did not: the
              editor does not place clips yet, and the plan's composition section
              (schema v7) is where that will be recorded when it does. */}
          {!unanswered && (
            <p className="mt-3 text-[11px] leading-relaxed text-stone">
              Captures are saved to this video and checked. Twin does not cut them into
              the edit yet — for now they are yours to use, and the slots stay marked
              in your script.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
