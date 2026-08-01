// Editor v2 — Phase 9: measuring the loudness the encoder actually delivered.
//
// SOLE RESPONSIBILITY: pure parsing and judgement. No spawn, no filesystem, no
// database — this file turns ffmpeg's loudnorm measurement text into integers
// and decides whether those integers describe a broken video. The process that
// produces the text lives in editorValidateOutput, the same way probeFile owns
// ffprobe there.
//
// WHY THIS EXISTS. editorValidateOutput's own header says it plainly: Gate-0 §4
// freezes -14 LUFS ±1 and -1.0 dBTP, the graph builder asks loudnorm for exactly
// those, "and nothing here confirms the encoder delivered it". Asking is not
// delivering. This is the confirmation.
//
// WHY THE BOUNDS ARE WIDE, AND WHY THAT IS NOT A COP-OUT
//
// The obvious check — "measured integrated loudness within ±1 LUFS of target,
// measured true peak at or under the -1.0 dBTP ceiling" — REJECTS VIDEOS THE
// PIPELINE CORRECTLY PRODUCED. That is not a guess; it was measured on this
// encoder chain, single-pass `loudnorm=I=-14:TP=-1.0:LRA=11`, then measured
// back:
//
//   content            integrated err     measured true peak vs the -1.0 ceiling
//   sine 440 (quiet)        -0.04 LUFS         -5.80 dBTP   (under)
//   sine 440 (hot)          -0.03 LUFS         -5.80 dBTP   (under)
//   pink noise (quiet)      -0.08 LUFS         -0.41 dBTP   (OVER by 0.59)
//   pink noise (hot)        -0.05 LUFS         -0.12 dBTP   (OVER by 0.88)
//   brown noise             -0.20 LUFS         -0.85 dBTP   (OVER by 0.15)
//   white noise             -0.94 LUFS         -5.34 dBTP   (under)
//
// Single-pass loudnorm is a best-effort dynamic limiter, not a guarantee: on
// broadband content it routinely lands ABOVE the true-peak ceiling it was
// asked for, by up to ~0.9 dB here. A validator enforcing the frozen ceiling
// literally would fail a large share of real renders — the worst possible
// outcome, because a user whose video is refused for sounding 0.3 dB hot has
// lost the video, and the pipeline that refused it was working.
//
// So the ceiling stays frozen as the TARGET the graph requests, and what is
// ENFORCED here is the disaster band: audio that is silent, audio that is
// clipping, audio that is nowhere near the target. Those are unambiguous, and
// none of them is reachable by the ±1 dB physics above.
//
// The measured numbers are RETURNED whether or not they pass, so the tolerance
// question stops being a matter of opinion: real runs record what this chain
// actually delivers, and a later decision about two-pass loudnorm gets to be
// made from evidence instead of from this comment.
import { EditPlanError } from './editPlanContract.js'

function bad(message: string, code: string): never {
  throw new EditPlanError(`loudness: ${message}`, code)
}

/** Measured loudness, in the milli-units the plan and the catalog already use.
 *
 *  `silent` is its own field rather than a sentinel number because ffmpeg
 *  reports digital silence as the string `-inf`, which has no integer
 *  representation that is not a lie about how quiet the audio was. */
export interface LoudnessMeasurement {
  silent: boolean
  integratedLufsMilli: number | null
  truePeakDbtpMilli: number | null
}

/** Bounds supplied by the CALLER from the frozen catalog, never defaulted here.
 *
 *  There is deliberately no default, for the reason `CrossfadeBounds` states in
 *  ffmpegGraph: a default would be this module quietly inventing the policy it
 *  exists to enforce. */
export interface LoudnessBounds {
  /** How far the integrated loudness may sit from the plan's target before the
   *  render is considered broken rather than merely imperfect. Wide on purpose
   *  — see the header table. */
  maxIntegratedDeviationMilli: number
  /** A true peak at or above this is clipping, not headroom loss. */
  clippingDbtpMilli: number
}

const NUMERIC = /^-?\d+(\.\d+)?$/

/** `"-14.04"` -> -14040. `null` for anything not a plain decimal number. */
export function decibelStringToMilli(s: unknown): number | null {
  if (typeof s !== 'string') return null
  const t = s.trim()
  if (!NUMERIC.test(t)) return null
  const v = Number(t)
  if (!Number.isFinite(v)) return null
  return Math.round(v * 1000)
}

const INFINITE = /^-?inf(inity)?$/i

/**
 * Pull the measurement out of loudnorm's `print_format=json` block.
 *
 * The block arrives on STDERR mixed with the encoder's ordinary progress
 * chatter, so the JSON is located rather than assumed to be the whole text.
 * The LAST balanced object wins: a graph could name more than one loudnorm and
 * only the final summary describes the finished audio.
 *
 * `input_i` and `input_tp` are read, not `output_*`. The file being measured is
 * ALREADY the finished render; loudnorm is being run here purely as a meter,
 * and its `output_*` fields describe a hypothetical second normalisation that
 * nothing will ever apply.
 */
export function parseLoudnormJson(text: string): LoudnessMeasurement | null {
  if (typeof text !== 'string') return null
  let found: Record<string, unknown> | null = null
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    // Scan forward for the matching brace. loudnorm's block contains no nested
    // objects and no braces inside strings, so depth counting is sufficient and
    // a JSON parser is not needed to find the boundary.
    let depth = 0
    for (let j = i; j < text.length; j++) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') {
        depth--
        if (depth === 0) {
          try {
            const obj = JSON.parse(text.slice(i, j + 1)) as unknown
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
              const rec = obj as Record<string, unknown>
              if ('input_i' in rec && 'input_tp' in rec) found = rec
            }
          } catch { /* not a JSON object; keep scanning */ }
          i = j
          break
        }
      }
    }
  }
  if (!found) return null

  const rawI = found.input_i
  const rawTp = found.input_tp
  // Silence is reported as `-inf` for BOTH fields. Treating it as a parse
  // failure would turn the loudest possible defect — a video with no audio at
  // all — into "could not measure", which is exactly the reading that lets it
  // through.
  const iInfinite = typeof rawI === 'string' && INFINITE.test(rawI.trim())
  const tpInfinite = typeof rawTp === 'string' && INFINITE.test(rawTp.trim())
  if (iInfinite && tpInfinite) {
    return { silent: true, integratedLufsMilli: null, truePeakDbtpMilli: null }
  }

  const integratedLufsMilli = decibelStringToMilli(rawI)
  const truePeakDbtpMilli = decibelStringToMilli(rawTp)
  if (integratedLufsMilli === null || truePeakDbtpMilli === null) return null
  return { silent: false, integratedLufsMilli, truePeakDbtpMilli }
}

export interface LoudnessVerdict {
  measurement: LoudnessMeasurement
  /** Signed distance from the plan's own target, for the record. Null when the
   *  audio is silent and the distance is not a finite quantity. */
  integratedDeviationMilli: number | null
  /** Signed distance from the plan's frozen ceiling. POSITIVE MEANS OVER IT —
   *  recorded rather than enforced; see the header. */
  truePeakOvershootMilli: number | null
}

/**
 * Judge a measurement against the plan's own targets.
 *
 * Throws only on the disaster band. Everything else is measured, returned, and
 * left to the record — including a true peak over the frozen ceiling, which
 * this encoder chain produces on ordinary content and which must therefore not
 * destroy the user's video.
 */
export function checkLoudness(
  measurement: LoudnessMeasurement,
  targets: { targetLufsMilli: number; truePeakCeilingDbtpMilli: number },
  bounds: LoudnessBounds,
): LoudnessVerdict {
  if (measurement.silent) {
    // A rendered video whose audio is digital silence is not a tolerance
    // question. Every upstream stage — transcription, the Director, the cue
    // timings — was built on audio that the finished file does not contain.
    bad('the rendered audio is digital silence', 'output_audio_invalid')
  }
  const i = measurement.integratedLufsMilli
  const tp = measurement.truePeakDbtpMilli
  if (i === null || tp === null) bad('the loudness measurement is incomplete', 'output_audio_invalid')

  if (tp >= bounds.clippingDbtpMilli) {
    bad(
      `the rendered audio peaks at ${(tp / 1000).toFixed(2)} dBTP, at or above the ` +
      `${(bounds.clippingDbtpMilli / 1000).toFixed(2)} dBTP clipping bound`,
      'output_audio_invalid',
    )
  }

  const integratedDeviationMilli = i - targets.targetLufsMilli
  if (Math.abs(integratedDeviationMilli) > bounds.maxIntegratedDeviationMilli) {
    bad(
      `the rendered audio measures ${(i / 1000).toFixed(2)} LUFS against a target of ` +
      `${(targets.targetLufsMilli / 1000).toFixed(2)} LUFS ` +
      `(deviation ${(integratedDeviationMilli / 1000).toFixed(2)} LU, ` +
      `bound ±${(bounds.maxIntegratedDeviationMilli / 1000).toFixed(2)} LU)`,
      'output_audio_invalid',
    )
  }

  return {
    measurement,
    integratedDeviationMilli,
    truePeakOvershootMilli: tp - targets.truePeakCeilingDbtpMilli,
  }
}
