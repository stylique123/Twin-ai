// MEASURING THE ROOM — the browser half of Phase 11 item 6.
//
// `preflight.ts` in @twinai/shared is the DECISION half: pure, dependency-free,
// takes numbers and returns verdicts. Its header names this piece as "a separate,
// later piece" and it never arrived, so the engine has sat fully tested with no
// caller since it landed. This is the caller.
//
// ── WHAT IS MEASURED, AND WHAT IS DELIBERATELY NOT ────────────────────────
//
// MEASURED, from real signals:
//   orientation  the video track's own reported dimensions.
//   mic          whether an audio track exists at all, and the loudest sample
//                observed over a short listening window.
//
// NOT MEASURED, and reported as `unmeasured` rather than guessed:
//   framing      needs a face box. `FaceDetector` exists in one browser behind
//                a flag; shipping a centre-of-frame proxy would mean reporting
//                "your head is cropped" from an assumption about where the head
//                is. The check would be wrong exactly when the creator is not
//                centred, which is the case it exists to catch.
//   lighting     the policy compares SUBJECT luminance against BACKGROUND, and
//                without a face box there is no subject region. Mean-frame
//                brightness is a different measurement wearing this one's name:
//                a backlit creator against a bright window and a well-lit
//                creator in a bright room have the same frame mean.
//   room         reverb is late reflected energy over direct energy, which needs
//                a decay measurement against a known excitation. A number
//                derived from ambient noise instead would be a room score that
//                moves when a truck passes.
//
// That split is the whole reason the engine has four states rather than three.
// A preflight that reported all-clear because nothing looked would teach a
// creator to trust a check that is not happening — and `unmeasured` is what
// stops "we did not check" being drawn as a green tick. The UI must render it
// as "not checked", never omit it.
//
// ── WHY THE MIC WINDOW IS SHORT, AND WHAT IT COSTS ────────────────────────
//
// Listening for ~1.2s catches the two failures worth catching before a take:
// no audio track at all (a permission granted for video only, or a headset that
// disappeared) and a level so low the creator is off-mic. It does NOT catch a
// mic that is fine at rest and clips when they get animated — that is a real
// gap and the reason `mic` reports the PEAK it saw rather than a verdict alone.
import type { PreflightSignals } from '@twinai/shared'

/** How long to listen before reporting a level. Long enough for a spoken word,
 *  short enough that nobody waits for it. */
export const MIC_SAMPLE_MS = 1200

/** Fixed-point 0..1000, matching every threshold in `PREFLIGHT_POLICY_V1`. */
const toMilli = (unit: number): number => Math.max(0, Math.min(1000, Math.round(unit * 1000)))

/**
 * The video track's frame size.
 *
 * Read from `getSettings()` FIRST and the `<video>` element second. The element
 * reports what it is currently painting, which is 0x0 until the first frame
 * decodes — and a preflight that ran a moment early would report `unmeasured`
 * on the one check that never needs to be.
 */
export function frameOf(
  stream: MediaStream | null,
  video?: { videoWidth: number; videoHeight: number } | null,
): PreflightSignals['frame'] {
  const track = stream?.getVideoTracks()[0]
  const s = track?.getSettings?.()
  if (s && typeof s.width === 'number' && typeof s.height === 'number' && s.width > 0 && s.height > 0) {
    return { widthPx: s.width, heightPx: s.height }
  }
  if (video && video.videoWidth > 0 && video.videoHeight > 0) {
    return { widthPx: video.videoWidth, heightPx: video.videoHeight }
  }
  // Absent, not zero: the engine reads a missing frame as `unmeasured` and a
  // zero-sized one would divide into a nonsense aspect ratio.
  return null
}

/** Is there an audio track, and is it live? A track that exists but has ended
 *  (unplugged headset) is not an audio source, and reporting `true` for it
 *  would tell the creator their mic is fine while nothing is recording. */
export function hasLiveAudio(stream: MediaStream | null): boolean {
  return (stream?.getAudioTracks() ?? []).some((t) => t.readyState === 'live' && t.enabled)
}


/**
 * Sample the loudest thing the mic hears in a short window.
 *
 * Returns `null` when the level cannot be observed — no context, no track, a
 * suspended context the browser will not resume without a gesture. Null is
 * `unmeasured`, and that matters: a silent room and a dead microphone produce
 * the same zero, so reporting 0 from a probe that never ran would be a
 * `mic_silent` verdict about a mic nobody listened to.
 */
export async function samplePeakMilli(
  stream: MediaStream,
  makeContext: () => AudioContext = () => new AudioContext(),
  windowMs: number = MIC_SAMPLE_MS,
): Promise<number | null> {
  if (!hasLiveAudio(stream)) return null
  let ctx: AudioContext
  try { ctx = makeContext() } catch { return null }
  try {
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
    if (ctx.state !== 'running') return null
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    let peak = 0
    const started = performance.now()
    // Poll rather than await one read: a peak is the loudest sample across the
    // window, and one buffer is 46ms of it.
    while (performance.now() - started < windowMs) {
      analyser.getFloatTimeDomainData(buf)
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i])
        if (v > peak) peak = v
      }
      await new Promise((r) => { setTimeout(r, 40) })
    }
    source.disconnect()
    analyser.disconnect()
    return toMilli(peak)
  } catch {
    return null
  } finally {
    // The context holds the mic open; leaving it running would keep the
    // recording indicator lit after a check the creator did not ask to repeat.
    void ctx.close().catch(() => {})
  }
}

/**
 * Everything this browser can honestly say about the setup.
 *
 * The omitted keys are the contract: `face`, `luminance` and the reverb half of
 * `audio` are absent because nothing measured them, and the engine turns each
 * absence into `unmeasured` rather than a pass.
 */
export async function measurePreflight(
  stream: MediaStream | null,
  video?: { videoWidth: number; videoHeight: number } | null,
  makeContext?: () => AudioContext,
): Promise<PreflightSignals> {
  const frame = frameOf(stream, video)
  const hasAudioTrack = hasLiveAudio(stream)
  const peakMilli = stream ? await samplePeakMilli(stream, makeContext) : null
  return {
    ...(frame ? { frame } : {}),
    hasAudioTrack,
    // THE PEAK ALONE. `audio`'s two halves are independently optional, so a
    // measured level travels without a fabricated reverb ratio and the room
    // check reports `unmeasured` — which is the truth, since nothing here can
    // hear a room. Before that split this had to choose between sending
    // `reverbRatioMilli: 0` (a green "room sounds fine" tick for a room nobody
    // listened to) and dropping a level it had genuinely measured.
    ...(peakMilli === null ? {} : { audio: { peakMilli } }),
  }
}
