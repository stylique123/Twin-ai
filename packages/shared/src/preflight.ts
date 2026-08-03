// PREFLIGHT — the decision half of the check that runs BEFORE the camera rolls.
//
// Phase 11 item 6, named in docs/twinai-master-build-plan.md as the panel's #1
// gap: "room echo, backlight, orientation, head cropped, mic source. Nothing in
// the pipeline addresses the actual failures of video #1." Every stage that
// exists today — captions, cuts, zooms, loudness — improves a take that was
// worth keeping. None of them rescue one that was filmed sideways, backlit, or
// with the speaker's forehead out of frame. That is a check, and it has to
// happen while the creator can still fix it: afterwards the only remedy is
// asking them to film it again.
//
// PURE AND DEPENDENCY-FREE, ON PURPOSE. This module takes already-measured
// numbers and returns verdicts. It touches no MediaStream, opens no camera and
// reads no DOM, so it is testable without a browser and its thresholds can be
// argued about in isolation. The browser-side measurement that produces
// `PreflightSignals` is a separate, later piece — the same split that landed
// scriptAlignment.ts as an engine before anything wired it in.
//
// ── THE THREE-STATE RULE, WHICH IS THE POINT OF THIS FILE ──────────────────
// A check is `ok`, `warn`, `fail`, or `unmeasured`. `unmeasured` is NOT a pass
// and NOT a failure: it means nothing looked, or the signal did not arrive.
//
// This repository already learned this the expensive way and wrote it down. In
// the Phase-10 notes: a designed `unknown` state was read as a fault, an alarm
// was raised on it, and a revert was applied on correlation rather than
// understanding — "a state named `unknown` is not automatically a failure".
// Collapsing "we did not check" into "fine" is the same error pointed the other
// way, and it is the more dangerous direction here: a preflight that silently
// reports all-clear because the detector never ran teaches the creator to trust
// a check that is not happening.
//
// ── THE NUMBERS BELOW ARE CHOSEN, NOT MEASURED, AND SAY SO ─────────────────
// The master build plan records three separate times this project set a
// threshold from recollection and was wrong by a wide margin: a 50-minute CI cap
// against a real 77 minutes; a 25% hook-trim threshold against a real legitimate
// 28.7% case; an 80ms caption-tail guard against a real 93-120ms shortfall. The
// plan's own words: "Picking a number from recollection is precisely the mistake
// already made three times on this project."
//
// So none of these are presented as measured. They are declared in one frozen
// policy object, each labelled with WHY it has the value it has, and — the part
// that matters — every report echoes back the raw measurements that produced it
// (`PreflightReport.measured`). That is how loudness and cut-density were fixed:
// ship the estimate, record what actually happens, correct from real takes.
// Without the echo these become permanent guesses with no expiry date.
//
// FIXED-POINT `Milli` UNITS (0..1000) match the existing editor contracts
// (`MIN_CONTRAST_RATIO_MILLI`, `maxTrimFractionMilli`, `similarityMilli`) and
// keep every threshold an integer, so a policy object compares exactly.

export type PreflightState = 'ok' | 'warn' | 'fail' | 'unmeasured'

/** Stable identifiers — a UI maps these to copy; they never carry prose. */
export type PreflightCheckId = 'orientation' | 'framing' | 'lighting' | 'room' | 'mic'

/**
 * A machine-readable reason. Deliberately finer-grained than the check id: the
 * fix for `subject_backlit` (turn around) and `scene_too_dark` (add light) are
 * different instructions, and a UI that only knew "lighting: warn" would have
 * to guess which to show.
 */
export type PreflightReason =
  | 'ok'
  | 'unmeasured'
  // orientation
  | 'landscape' | 'near_square'
  // framing
  | 'no_face_found' | 'head_cropped' | 'chin_cropped' | 'subject_too_far' | 'subject_off_centre'
  // lighting
  | 'subject_backlit' | 'scene_too_dark'
  // room
  | 'room_echo'
  // mic
  | 'no_audio_track' | 'mic_too_quiet' | 'mic_clipping'

export interface PreflightCheck {
  id: PreflightCheckId
  state: PreflightState
  reason: PreflightReason
  /** The measurement that decided it, echoed for correction. Absent when unmeasured. */
  observed?: number
  /** The policy value it was compared against. Absent when unmeasured. */
  threshold?: number
}

/** A face box in fixed-point fractions of the frame (0..1000 on each axis). */
export interface FaceBoxMilli {
  xMilli: number
  yMilli: number
  widthMilli: number
  heightMilli: number
}

export interface PreflightSignals {
  /** Video track dimensions. Absent → orientation is unmeasured. */
  frame?: { widthPx: number; heightPx: number } | null
  /**
   * `null` means the detector RAN and found nobody — a real, reportable answer.
   * Omitting the field entirely means no detector ran, which is `unmeasured`.
   * These must not collapse: "nobody is on camera" and "we never looked" call
   * for different responses, and only one of them is the creator's problem.
   */
  face?: FaceBoxMilli | null
  /** Mean luminance of the subject region vs. the surrounding frame (0..1000). */
  luminance?: { subjectMilli: number; backgroundMilli: number } | null
  /**
   * `reverbRatioMilli` — late (reflected) energy over direct energy. Higher is
   * a boomier room. `peakMilli` is the loudest sample observed while sampling.
   */
  audio?: { peakMilli: number; reverbRatioMilli: number } | null
  /** Absent/false → the stream carries no audio track at all. */
  hasAudioTrack?: boolean
}

export interface PreflightPolicy {
  readonly orientation: {
    /** Vertical delivery is 1080x1920; a landscape take cannot be rescued by a crop. */
    readonly minPortraitAspectMilli: number
  }
  readonly framing: {
    readonly minFaceHeightMilli: number
    readonly maxCentreOffsetMilli: number
    readonly minHeadroomMilli: number
  }
  readonly lighting: {
    readonly maxBackgroundExcessMilli: number
    readonly minSubjectLuminanceMilli: number
  }
  readonly room: { readonly maxReverbRatioMilli: number }
  readonly mic: { readonly minPeakMilli: number; readonly clippingPeakMilli: number }
}

/**
 * FROZEN v1. Every value is a starting point chosen from reasoning stated here,
 * NOT a measurement — see the header. Correct them from `PreflightReport.measured`
 * once real takes exist, and move the justification from "chosen because" to
 * "measured across N takes" when they do.
 */
export const PREFLIGHT_POLICY_V1: PreflightPolicy = Object.freeze({
  orientation: Object.freeze({
    // 1000 = exactly square. Output is 1080x1920 (aspect 1778 in these units),
    // so anything at or below square is landscape-ish and cannot be recovered:
    // cropping a landscape frame to 9:16 throws away most of the subject.
    // Set at square rather than at 1778 because a slightly-narrow portrait take
    // is still usable, and refusing it would block a legitimate recording.
    minPortraitAspectMilli: 1000,
  }),
  framing: Object.freeze({
    // A face shorter than a fifth of the frame reads as "filmed from across the
    // room" on a phone screen. Chosen; the honest bound is whatever real takes
    // show creators actually produce.
    minFaceHeightMilli: 200,
    // Distance of the face centre from the frame's horizontal centre. A talking
    // head hard against one edge is nearly always an accident.
    maxCentreOffsetMilli: 300,
    // Gap between the top of the frame and the top of the head. Zero means the
    // head is touching or past the edge, which is `head_cropped` and is checked
    // separately; this catches "almost cropped".
    minHeadroomMilli: 20,
  }),
  lighting: Object.freeze({
    // Backlighting is the classic phone-video failure: a window behind the
    // speaker drives the exposure down and the face goes to silhouette. The
    // number is how much brighter the background may be before that happens.
    maxBackgroundExcessMilli: 250,
    // Below this the subject is underexposed regardless of the background.
    minSubjectLuminanceMilli: 150,
  }),
  room: Object.freeze({
    // Late-to-direct energy. A bare-walled room is the second classic failure
    // and it is unfixable in post — no de-reverb exists in this pipeline.
    maxReverbRatioMilli: 400,
  }),
  mic: Object.freeze({
    // Too quiet to normalise cleanly: the loudness stage raises the noise floor
    // with the voice.
    minPeakMilli: 100,
    // At/above this the take is already clipped, and clipping cannot be undone.
    clippingPeakMilli: 990,
  }),
})

export interface PreflightReport {
  checks: PreflightCheck[]
  /** Worst state across all checks. `unmeasured` never worsens it — see `overallState`. */
  overall: PreflightState
  /** Checks at `fail`. A caller may choose to block on these; this module does not. */
  blocking: PreflightCheck[]
  /** Checks nothing looked at. Surfaced so "not checked" cannot read as "fine". */
  unmeasured: PreflightCheckId[]
  /** Raw inputs echoed back, so chosen thresholds can be corrected from real takes. */
  measured: PreflightSignals
}

const ok = (id: PreflightCheckId, observed?: number, threshold?: number): PreflightCheck =>
  ({ id, state: 'ok', reason: 'ok', ...(observed !== undefined ? { observed } : {}), ...(threshold !== undefined ? { threshold } : {}) })

const unmeasured = (id: PreflightCheckId): PreflightCheck => ({ id, state: 'unmeasured', reason: 'unmeasured' })

const bad = (
  id: PreflightCheckId, state: 'warn' | 'fail', reason: PreflightReason, observed: number, threshold: number,
): PreflightCheck => ({ id, state, reason, observed, threshold })

function checkOrientation(s: PreflightSignals, p: PreflightPolicy): PreflightCheck {
  const f = s.frame
  if (!f || !(f.widthPx > 0) || !(f.heightPx > 0)) return unmeasured('orientation')
  const aspectMilli = Math.round((f.heightPx / f.widthPx) * 1000)
  if (aspectMilli < p.orientation.minPortraitAspectMilli) {
    return bad('orientation', 'fail', 'landscape', aspectMilli, p.orientation.minPortraitAspectMilli)
  }
  // Exactly square passes the portrait bar but is still worth flagging: it is
  // usually a webcam default rather than a choice, and it will be cropped.
  if (aspectMilli === p.orientation.minPortraitAspectMilli) {
    return bad('orientation', 'warn', 'near_square', aspectMilli, p.orientation.minPortraitAspectMilli)
  }
  return ok('orientation', aspectMilli, p.orientation.minPortraitAspectMilli)
}

function checkFraming(s: PreflightSignals, p: PreflightPolicy): PreflightCheck {
  // `undefined` (absent, or spread in as undefined) = no detector ran.
  // `null` = the detector ran and the frame held nobody.
  //
  // Keyed on the VALUE, not on `'face' in s`. Property-presence looks like the
  // natural test and is wrong: `{...signals, face: undefined}` — the ordinary
  // way a caller drops a field — still satisfies `in`, so an unmeasured frame
  // would report as "nobody on camera". That is the exact conflation this
  // module exists to prevent, and it would have shipped reading correctly.
  const face = s.face
  if (face === undefined) return unmeasured('framing')
  // The detector ran and found nobody. A warning, not a failure: the creator may
  // be filming a product or a whiteboard, and refusing to record that would be
  // this module overruling a legitimate choice it cannot see.
  if (!face) return { id: 'framing', state: 'warn', reason: 'no_face_found' }

  const top = face.yMilli
  const bottom = face.yMilli + face.heightMilli
  // Touching or past an edge means the head is already out of frame. Checked
  // before the softer bounds because it is the one the creator most wants to
  // know, and because a cropped box's height is not trustworthy.
  if (top <= 0) return bad('framing', 'fail', 'head_cropped', top, 0)
  if (bottom >= 1000) return bad('framing', 'fail', 'chin_cropped', bottom, 1000)
  if (top < p.framing.minHeadroomMilli) {
    return bad('framing', 'warn', 'head_cropped', top, p.framing.minHeadroomMilli)
  }
  if (face.heightMilli < p.framing.minFaceHeightMilli) {
    return bad('framing', 'warn', 'subject_too_far', face.heightMilli, p.framing.minFaceHeightMilli)
  }
  const centreOffset = Math.abs(face.xMilli + Math.round(face.widthMilli / 2) - 500)
  if (centreOffset > p.framing.maxCentreOffsetMilli) {
    return bad('framing', 'warn', 'subject_off_centre', centreOffset, p.framing.maxCentreOffsetMilli)
  }
  return ok('framing', face.heightMilli, p.framing.minFaceHeightMilli)
}

function checkLighting(s: PreflightSignals, p: PreflightPolicy): PreflightCheck {
  const l = s.luminance
  if (!l) return unmeasured('lighting')
  const excess = l.backgroundMilli - l.subjectMilli
  // Backlight first: a silhouette against a window is both the more common
  // failure and the more confusing one, because the frame looks bright.
  if (excess > p.lighting.maxBackgroundExcessMilli) {
    return bad('lighting', 'warn', 'subject_backlit', excess, p.lighting.maxBackgroundExcessMilli)
  }
  if (l.subjectMilli < p.lighting.minSubjectLuminanceMilli) {
    return bad('lighting', 'warn', 'scene_too_dark', l.subjectMilli, p.lighting.minSubjectLuminanceMilli)
  }
  return ok('lighting', l.subjectMilli, p.lighting.minSubjectLuminanceMilli)
}

function checkRoom(s: PreflightSignals, p: PreflightPolicy): PreflightCheck {
  const a = s.audio
  if (!a) return unmeasured('room')
  if (a.reverbRatioMilli > p.room.maxReverbRatioMilli) {
    return bad('room', 'warn', 'room_echo', a.reverbRatioMilli, p.room.maxReverbRatioMilli)
  }
  return ok('room', a.reverbRatioMilli, p.room.maxReverbRatioMilli)
}

function checkMic(s: PreflightSignals, p: PreflightPolicy): PreflightCheck {
  // No audio track is a hard failure and is knowable without sampling: a silent
  // recording cannot be captioned, cut, or normalised — the entire pipeline is
  // downstream of speech.
  if (s.hasAudioTrack === false) return { id: 'mic', state: 'fail', reason: 'no_audio_track' }
  const a = s.audio
  if (!a) return unmeasured('mic')
  if (a.peakMilli >= p.mic.clippingPeakMilli) {
    return bad('mic', 'warn', 'mic_clipping', a.peakMilli, p.mic.clippingPeakMilli)
  }
  if (a.peakMilli < p.mic.minPeakMilli) {
    return bad('mic', 'warn', 'mic_too_quiet', a.peakMilli, p.mic.minPeakMilli)
  }
  return ok('mic', a.peakMilli, p.mic.minPeakMilli)
}

/**
 * Worst-of, with one deliberate asymmetry: `unmeasured` does NOT worsen the
 * overall state. It is reported separately (`report.unmeasured`) so a caller can
 * show "we could not check X" without that reading as "X is wrong" — but it also
 * must never be quietly upgraded to `ok`. When EVERY check is unmeasured the
 * overall state is `unmeasured`, because reporting `ok` for a preflight that
 * measured nothing at all is the single most misleading thing this could do.
 */
export function overallState(checks: PreflightCheck[]): PreflightState {
  if (checks.length === 0) return 'unmeasured'
  if (checks.some((c) => c.state === 'fail')) return 'fail'
  if (checks.some((c) => c.state === 'warn')) return 'warn'
  if (checks.every((c) => c.state === 'unmeasured')) return 'unmeasured'
  return 'ok'
}

/**
 * Evaluate every preflight check. Pure: same signals in, same report out.
 *
 * This module never decides whether recording may proceed — it reports. The
 * caller owns that policy, because "block the creator" is a product decision
 * and the cost of a false block (someone cannot film at all) is much higher
 * than the cost of a false warning.
 */
export function evaluatePreflight(
  signals: PreflightSignals,
  policy: PreflightPolicy = PREFLIGHT_POLICY_V1,
): PreflightReport {
  const checks = [
    checkOrientation(signals, policy),
    checkFraming(signals, policy),
    checkLighting(signals, policy),
    checkRoom(signals, policy),
    checkMic(signals, policy),
  ]
  return {
    checks,
    overall: overallState(checks),
    blocking: checks.filter((c) => c.state === 'fail'),
    unmeasured: checks.filter((c) => c.state === 'unmeasured').map((c) => c.id),
    measured: signals,
  }
}
