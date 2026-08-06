// DECLARED CLIPS — Phase 12 item 13, pointed at the slots the script declares.
//
// `[SHOW: the settings page]` is Phase 12 item 11's deliberate marker, and
// `containerResolution.ts` already classifies it as a declared clip rather than
// a gap — it survives the resolver on purpose. Until now nothing read the other
// end of that: the markers were parsed, kept, and shown to nobody.
//
// ── THE LIST IS THE FILMED SCRIPT'S, NOT THIS COMPONENT'S ────────────────
//
// Every slot comes from the canonical RecordingScript — the same script the
// editor above edits and the teleprompter scrolls — via `declaredSlots`. There
// is no second parser, no "common things creators capture", no suggested list.
// If the script does not declare a slot, no slot appears, so the way to add one
// is to edit the script directly above this on the same screen. A capture
// surface with its own idea of what to record would be a second source of truth
// about the video, competing with the one the creator is about to film.
//
// ── TWO MEDIA, TWO FLAGS, AND THEY GATE IN OPPOSITE DIRECTIONS ───────────
//
// A slot says HOW it is captured, and getting that wrong is not cosmetic: every
// declared clip used to be a screen recording by definition, so a jeweller
// asking to show a product box was handed a share-your-screen picker.
//
//   screen  → `can_record_screen`, `isExplicitlyTrue`. Silence HIDES it —
//             `capabilities.ts` names this exact feature as its example of one
//             that must not appear until asked for.
//   camera  → `can_film_objects`, `isExplicitlyFalse`. Silence SHOWS it, and
//             that inversion is deliberate: an unnecessary shot on a list is
//             friction, a missing one is a video the creator cannot make, and
//             those costs are not symmetric.
//   unknown → shown, and ASKED. The marker did not say and the words cannot be
//             read to find out, so the creator answers in one tap.
//
// Routing every slot through one flag gets both halves backwards, which is why
// the medium is resolved before the gate rather than after.
//
// ASKING is deliberately NOT this component's job. The question layer owns every
// question and every capability write; a second surface asking the same question
// would mean two implementations of the three-state logic, done differently, and
// the flag would be written from two places with no agreement about which is
// authoritative. This is a CONSUMER: it reads the resolved flag and shows
// nothing when the answer has not arrived.
//
// ── AND THE CLIP CARRIES NO AUDIO ────────────────────────────────────────
//
// `getDisplayMedia` is asked for video only. The composition model discards a
// clip's audio (see EditPlanV1 v7), so capturing system audio would record a
// creator's meeting, music or notifications into an object we then throw away —
// a privacy cost with no benefit, and one the browser would have shown them a
// checkbox for.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MonitorPlay, Square, Check, TriangleAlert, Play, X, Camera } from 'lucide-react'
import { declaredSlots } from '../lib/declaredClips'
import {
  listGenerationClips, uploadClipRecording, newRecordingAttemptId,
  loadCapabilities, loadRecordingScript, signTakeUrl,
  isExplicitlyTrue, isExplicitlyFalse, pickClipMime, baseClipMime,
  type MediaAsset, type RecordingScript, type ResolvedCapabilities, type ClipSlot,
} from '../lib/api'

type SlotState =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'uploading'; fraction: number }
  | { kind: 'error'; message: string }

export function DeclaredClips({ generationId }: { generationId: string }) {
  // LOADED THROUGH THE CANONICAL LOADER, the same one the script editor uses.
  // `loadRecordingScript` validates the persisted `scene_timeline` against this
  // generation and returns null for anything malformed or foreign, so this
  // surface can never derive slots from a script belonging to something else.
  // Null — still loading, or no script — yields no slots, which is the honest
  // answer rather than a fallback to the model's plan.
  const [script, setScript] = useState<RecordingScript | null>(null)
  const slots = useMemo(() => declaredSlots(script), [script])
  const [caps, setCaps] = useState<ResolvedCapabilities | null>(null)
  const [clips, setClips] = useState<MediaAsset[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [state, setState] = useState<SlotState>({ kind: 'idle' })
  // The clip currently being watched back, if any. Signed ON DEMAND rather than
  // on load: signing every clip every time this screen renders is work nobody
  // asked for, and a 24-hour URL minted for something the creator never opens.
  const [preview, setPreview] = useState<{ label: string; url: string } | null>(null)
  // A creator's answer for a slot whose marker did not say how to shoot it.
  // Held for this screen only: the durable home for it is the script itself
  // (`clip_medium` on the scene), and writing it there is a script edit — which
  // belongs beside the script editor rather than inside a capture button.
  const [answered, setAnswered] = useState<Map<string, 'screen' | 'camera'>>(new Map())
  const recorder = useRef<MediaRecorder | null>(null)
  // One shared file input for every camera slot; `pendingUpload` says which slot
  // opened it. One input per slot would be a DOM node per row for a control the
  // creator uses once.
  const fileInput = useRef<HTMLInputElement | null>(null)
  const pendingUpload = useRef<string | null>(null)
  // The attempt id is kept PER LABEL and reused across retries of the same
  // capture, which is the whole idempotency story: a failed upload retried
  // converges on the one asset the first attempt created instead of leaving a
  // second half-uploaded row behind.
  const attempts = useRef<Map<string, string>>(new Map())

  const refreshClips = useCallback(async () => {
    setClips(await listGenerationClips(generationId))
  }, [generationId])

  useEffect(() => {
    let stopped = false
    void (async () => {
      const [loaded, resolved] = await Promise.all([
        loadRecordingScript(generationId).catch(() => null),
        loadCapabilities(generationId),
      ])
      if (stopped) return
      setScript(loaded)
      setCaps(resolved)
      if (loaded && declaredSlots(loaded).length > 0) void refreshClips()
    })()
    return () => { stopped = true }
  }, [generationId, refreshClips])

  // Stop any live capture if this screen goes away. A share indicator left
  // running after the creator navigated on is the kind of thing that makes
  // someone distrust a product permanently.
  useEffect(() => () => {
    recorder.current?.stream.getTracks().forEach((t) => { t.stop() })
    recorder.current = null
  }, [])

  const slotOf = useCallback((label: string): ClipSlot | null => {
    const slot = slots.find((s) => s.label.toLowerCase() === label.toLowerCase())
    return slot ? { label: slot.label, sceneNumber: slot.sceneNumber } : null
  }, [slots])

  const clipFor = useCallback((label: string): MediaAsset | undefined => (
    clips.find((c) => (c.clip_label ?? '').toLowerCase() === label.toLowerCase())
  ), [clips])

  const capture = async (label: string) => {
    setState({ kind: 'idle' })
    // CLOSE ANY PREVIEW OF THE CLIP BEING REPLACED. Re-recording mints a new
    // asset at a new path, so a preview left open would keep playing the
    // capture that is being thrown away — and "Record again" followed by the
    // OLD footage still on screen reads as the re-record having failed.
    if (preview?.label.toLowerCase() === label.toLowerCase()) setPreview(null)
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
    // ASK THE BROWSER WHAT IT CAN RECORD rather than assuming webm. Safari
    // produces mp4 and nothing else, so a hardcoded type is a recorder that
    // throws after the creator has already chosen a window to share — and a
    // recorder started on an unsupported type produces an EMPTY blob, which the
    // server refuses as a size violation once the whole recording is done.
    const mimeType = pickClipMime(MediaRecorder)
    if (!mimeType) {
      stream.getTracks().forEach((t) => { t.stop() })
      setState({ kind: 'error', message: 'This browser cannot record the screen. Try Chrome, Edge or Safari on a desktop.' })
      return
    }
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, { mimeType })
    } catch {
      stream.getTracks().forEach((t) => { t.stop() })
      setState({ kind: 'error', message: 'This browser cannot record the screen. Try Chrome, Edge or Safari on a desktop.' })
      return
    }
    recorder.current = rec
    setActive(label)
    setState({ kind: 'recording' })

    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    rec.onstop = () => {
      stream.getTracks().forEach((t) => { t.stop() })
      recorder.current = null
      const blob = new Blob(chunks, { type: mimeType })
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

  const chooseFootage = async (file: File) => {
    const label = pendingUpload.current
    pendingUpload.current = null
    if (!label) return
    if (preview?.label.toLowerCase() === label.toLowerCase()) setPreview(null)
    setActive(label)
    await send(label, file)
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
        // The BARE type. `video/webm;codecs=vp9` is what the Blob carries and
        // what the create RPC's CHECK would refuse — the codec is the encoder's
        // property, not the file's kind.
        { contentType: baseClipMime(blob.type), blob, sizeBytes: blob.size },
        // THE SLOT, not just its name. The scene number is what lets the
        // compiler put this clip over the line it was recorded for; a capture
        // stored with only a label can be watched back and never appears in the
        // video. `null` when the script no longer declares this slot — the clip
        // is still worth keeping, it just has nowhere to go.
        slotOf(label),
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

  /**
   * Watch back what was actually captured.
   *
   * THE MOST LIKELY MISTAKE IN A SCREEN CAPTURE IS SHARING THE WRONG THING —
   * the other window, the whole desktop, a tab that had already navigated away.
   * Nothing about the upload can detect that: the bytes are valid, the duration
   * is real, the probe passes, and the creator finds out when they watch the
   * finished video. One tap to check is the only thing that catches it.
   *
   * Offered while the clip is still being measured too, deliberately. The bytes
   * are already uploaded and the question "did I share the right window?" is
   * answerable immediately — waiting for a probe that cannot answer it would
   * just delay the discovery.
   */
  const watch = async (label: string) => {
    const clip = clipFor(label)
    if (!clip) return
    const url = await signTakeUrl(clip.storage_path)
    if (!url) {
      setState({ kind: 'error', message: 'Could not open that capture — try again in a moment.' })
      return
    }
    setPreview({ label, url })
  }

  /** The medium in force for a slot: the creator's answer if they gave one,
   *  otherwise whatever the marker declared. */
  const mediumFor = (slot: { label: string; medium: string }): string =>
    answered.get(slot.label.toLowerCase()) ?? slot.medium

  // PER-SLOT GATING, because the two flags point in opposite directions. A
  // single component-level gate on `can_record_screen` — which is what this
  // was — hid every CAMERA slot behind a question about screens.
  const visible = caps
    ? slots.filter((slot) => {
        const m = mediumFor(slot)
        if (m === 'screen') return isExplicitlyTrue(caps.can_record_screen)
        // Silence SHOWS a camera shot. Only an explicit "I cannot film objects"
        // removes it, because a missing shot costs a video and a surplus one
        // costs a glance.
        if (m === 'camera') return !isExplicitlyFalse(caps.can_film_objects)
        return true
      })
    : []
  if (visible.length === 0) return null

  return (
    <div className="rounded-card border border-white/8 bg-white/[0.02] p-4">
      <input
        ref={fileInput}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Cleared so choosing the SAME file twice still fires a change event —
          // otherwise a creator who picks the wrong clip, then re-picks the
          // right one, gets nothing.
          e.target.value = ''
          if (file) void chooseFootage(file)
        }}
      />
      <div className="flex items-start gap-2">
        <MonitorPlay className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sand" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-cream">
            {visible.length === 1
              ? 'Your script asks you to show one thing'
              : `Your script asks you to show ${visible.length} things`}
          </p>

            <ul className="mt-2 space-y-2">
              {visible.map((slot) => {
                const existing = clipFor(slot.label)
                const medium = mediumFor(slot)
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
                    {existing && !(active === slot.label && state.kind === 'recording') && (
                      <button
                        type="button"
                        className="btn-ghost !py-1 !text-[11px]"
                        onClick={() => { void watch(slot.label) }}
                      >
                        <Play className="h-3 w-3" /> Check it
                      </button>
                    )}
                    {/* UNKNOWN IS ASKED, NOT GUESSED. The marker did not say how
                        to shoot this, and the label's words cannot be read to
                        find out — "the settings page" looks like a screen and
                        "my necklace" looks like an object, but reading them that
                        way is the inference this whole path refuses. One tap
                        from the person who knows what they are pointing at. */}
                    {medium === 'unknown' ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-[11px] text-stone">Show it</span>
                        <button
                          type="button"
                          className="btn-ghost !py-1 !text-[11px]"
                          onClick={() => setAnswered((m) => new Map(m).set(slot.label.toLowerCase(), 'screen'))}
                        >
                          <MonitorPlay className="h-3 w-3" /> on my screen
                        </button>
                        <button
                          type="button"
                          className="btn-ghost !py-1 !text-[11px]"
                          onClick={() => setAnswered((m) => new Map(m).set(slot.label.toLowerCase(), 'camera'))}
                        >
                          <Camera className="h-3 w-3" /> on camera
                        </button>
                      </span>
                    ) : medium === 'camera' ? (
                      // A CAMERA SLOT IS NOT A BROWSER CAPTURE. It is a shot the
                      // creator films on the device that can actually see the
                      // thing — usually the phone in their hand, not the tab
                      // they are reading this in. So the offer is to bring the
                      // footage, and the same clip pipeline stores it.
                      <button
                        type="button"
                        className="btn-ghost !py-1 !text-[11px]"
                        onClick={() => { pendingUpload.current = slot.label; fileInput.current?.click() }}
                        disabled={busy || (state.kind !== 'idle' && state.kind !== 'error')}
                      >
                        {busy && state.kind === 'uploading'
                          ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                          : <><Camera className="h-3 w-3" /> {existing ? 'Replace footage' : 'Add footage'}</>}
                      </button>
                    ) : active === slot.label && state.kind === 'recording' ? (
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

          {preview && (
            <div className="mt-3 rounded-card border border-white/10 bg-black/40 p-2">
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <p className="min-w-0 truncate text-[11px] text-sand">“{preview.label}”</p>
                <button
                  type="button"
                  className="shrink-0 text-stone transition-colors hover:text-cream"
                  onClick={() => setPreview(null)}
                  aria-label="Close the preview"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* `key` on the URL so switching clips REPLACES the element rather
                  than reusing it — a reused <video> keeps the previous source
                  buffered and can show the wrong clip for a moment, which is
                  precisely the confusion this preview exists to remove. */}
              <video
                key={preview.url}
                src={preview.url}
                controls
                className="max-h-64 w-full rounded"
              />
              <p className="mt-2 px-1 text-[11px] leading-relaxed text-stone">
                Not the right window? Record it again — the new capture replaces this one.
              </p>
            </div>
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
          <p className="mt-3 text-[11px] leading-relaxed text-stone">
            Captures are saved to this video and checked. Twin does not cut them into
            the edit yet — for now they are yours to use, and the slots stay marked
            in your script.
          </p>
        </div>
      </div>
    </div>
  )
}
