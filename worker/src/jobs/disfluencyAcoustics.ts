// ACOUSTICALLY-GROUNDED DISFLUENCY EVIDENCE (issue #194).
//
// WHY THIS EXISTS. Phase 5 surfaces filler candidates from Whisper word output.
// Whisper is not a disfluency detector: it normalizes and frequently omits
// filled pauses, and — with a disfluency-context prompt or a confident LM — it
// will happily emit an "um" that nobody said. So an ASR token is a REASON TO
// LOOK, never evidence that a filled pause occurred. Promoting a token straight
// to an automatic cut is how a product deletes a syllable of real speech and
// reports success.
//
// WHAT COUNTS AS EVIDENCE HERE. Signals that do not come from the transcript:
//
//   * Silero VAD overlap — an independent model's opinion that SOUND was made
//     at the timestamp Whisper claims. Independent of Whisper by construction.
//   * The RMS energy curve — filled pauses are typically produced with reduced
//     effort, so a genuine "um" sits BELOW the speaker's own lexical baseline.
//     The comparison is per-recording; an absolute dBFS threshold would just
//     encode the microphone.
//   * Pause context — a filled pause is a hesitation, and hesitations are
//     flanked by hesitation. A token with fluent speech hard against it on both
//     sides is far more likely a real word the ASR misread.
//   * Duration — filled pauses occupy a characteristic band. Something 30ms
//     long is a segmentation artefact; something 1.2s long is a word being
//     held, not a stumble.
//
// COUNTS, NOT A FLOAT. The verdict is a set of discrete codes plus how many
// independent signals SUPPORT it — deliberately the same discipline as
// `dnaProvenance.ts`, which keeps evidence as `{seen, of}` counts rather than a
// confidence number nobody can audit. A float would let four weak signals sum
// to a strong-looking 0.82 and hide which of them actually fired.
//
// TWO CLASSES OF SIGNAL, AND THEY ARE NOT INTERCHANGEABLE. A DISQUALIFIER is a
// veto: it cannot be outvoted, because each one describes a way that acting on
// the candidate would damage real speech. SUPPORTING signals are counted, and
// enough of them together make the candidate acoustically grounded. No amount
// of support overrides a veto.
//
// A PRECONDITION IS NOT EVIDENCE, and getting this wrong is how the first
// version of this file leaked. It counted "Silero hears sound here" and "the
// duration is in the filled-pause band" as SUPPORTING signals — and both are
// true of essentially every word a person says. Two of them together cleared
// the bar, so a fully-voiced, normal-length, fluent "so" scored exactly like a
// filled pause. The eval caught it as two false positives before this shipped.
//
// The rule that came out of that: a signal may only SUPPORT if it distinguishes
// hesitation from ordinary speech. Presence and plausible duration are
// necessary for a candidate to be actionable at all, so they are vetoes when
// absent and worth nothing when present. What actually separates a filled pause
// from a word is that it is quieter than the speaker's own speech, or that it
// is flanked by hesitation.
//
// This module is PURE and deterministic: same inputs, same verdict, no I/O.

/** A half-open interval in milliseconds. */
export interface Interval { startMs: number; endMs: number }

/** The downsampled RMS curve carried by the speech bridge. */
export interface EnergyCurve { windowMs: number; rms: readonly number[] }

export interface DisfluencyAcousticInput {
  /** The candidate token/run interval, as the ASR timed it. */
  startMs: number
  endMs: number
  /** End of the previous lexical word, or null at the start of the recording. */
  prevWordEndMs: number | null
  /** Start of the next lexical word, or null at the end of the recording. */
  nextWordStartMs: number | null
  vadSegments: readonly Interval[]
  energy: EnergyCurve
  /**
   * The speaker's own lexical energy baseline for this recording (median RMS
   * across words). Per-recording on purpose — an absolute threshold measures
   * the microphone rather than the speech.
   */
  speechBaselineRms: number
}

export interface DisfluencyAcousticVerdict {
  /**
   * Discrete, auditable codes for the signals that DISTINGUISH hesitation from
   * ordinary speech. Only these count toward `supporting`.
   */
  codes: string[]
  /** How many distinguishing signals fired. */
  supporting: number
  /**
   * Preconditions that were satisfied. Reported because a reviewer reading a
   * candidate wants to know the VAD agreed — but scored at zero, because every
   * spoken word satisfies them and evidence that never discriminates is not
   * evidence. Kept separate from `codes` so the distinction cannot quietly
   * erode back into the count.
   */
  preconditions: string[]
  /** Vetoes. Non-empty means the candidate is refused outright. */
  disqualifying: string[]
  /** No veto AND at least MIN_ACOUSTIC_SUPPORT distinguishing signals. */
  acousticallyGrounded: boolean
}

// ── thresholds, each with the reason it is that number ───────────────────────

/** Silero must hear speech across at least this fraction of the interval. */
export const MIN_VAD_SPEECH_FRACTION = 0.5
/**
 * Tolerated overlap with a neighbouring lexical word. Whisper word boundaries
 * routinely wobble by a frame or two; beyond this, a cut would clip a real word.
 */
export const MAX_NEIGHBOUR_OVERLAP_MS = 30
/**
 * A filled pause is quieter than the speaker's own lexical speech. 0.8 is
 * deliberately lenient — this is one vote among several, not a gate, and a
 * strict ratio would reject emphatic hesitation ("UM, no").
 */
export const FILLER_ENERGY_RATIO = 0.8
/** A neighbouring gap this long reads as hesitation rather than fluent speech. */
export const HESITATION_GAP_MS = 150
/**
 * The filled-pause duration band. Below the floor is a segmentation artefact;
 * above the ceiling the speaker is holding a word, which is not a stumble and
 * not ours to remove.
 */
export const FILLED_PAUSE_MIN_MS = 80
export const FILLED_PAUSE_MAX_MS = 600
/**
 * How many disfluency-distinguishing signals make a candidate acoustically
 * grounded.
 *
 * TWO, meaning BOTH of them: quieter than this speaker's own lexical speech AND
 * flanked by hesitation. There are only two supporting signals, so this is a
 * conjunction — chosen after the eval showed that requiring one let fluent
 * speech through, because plenty of ordinary words are briefly quiet and plenty
 * sit next to a natural pause. Together they are specific to hesitation.
 *
 * The cost is honest and accepted: a LOUD filled pause with no flanking pause
 * ("UM, no —") is not caught. Leaving an audible "um" in a video is the
 * cheapest error available here; cutting a syllable out of a real sentence is
 * the most expensive.
 */
export const MIN_ACOUSTIC_SUPPORT = 2

/** Milliseconds of `intervals` that overlap [sMs, eMs). */
export function speechOverlapMs(sMs: number, eMs: number, intervals: readonly Interval[]): number {
  if (eMs <= sMs) return 0
  let total = 0
  for (const v of intervals) {
    const lo = Math.max(sMs, v.startMs)
    const hi = Math.min(eMs, v.endMs)
    if (hi > lo) total += hi - lo
  }
  return total
}

/** Mean RMS across the energy windows spanning [sMs, eMs). */
export function meanRms(sMs: number, eMs: number, energy: EnergyCurve): number {
  const w = energy.windowMs
  if (!(w > 0) || energy.rms.length === 0 || eMs <= sMs) return 0
  const a = Math.max(0, Math.floor(sMs / w))
  const b = Math.min(energy.rms.length, Math.max(a + 1, Math.ceil(eMs / w)))
  let sum = 0
  let n = 0
  for (let i = a; i < b; i++) { sum += energy.rms[i] ?? 0; n++ }
  return n > 0 ? sum / n : 0
}

/**
 * The speaker's lexical energy baseline: the MEDIAN mean-RMS across words.
 *
 * Median rather than mean, because a single shouted word or one clipped frame
 * would drag an average and quietly re-tune every threshold that hangs off it.
 */
export function speechBaseline(words: readonly Interval[], energy: EnergyCurve): number {
  const vals = words
    .map((w) => meanRms(w.startMs, w.endMs, energy))
    .filter((v) => v > 0)
    .sort((a, b) => a - b)
  if (vals.length === 0) return 0
  const mid = vals.length >> 1
  return vals.length % 2 === 1 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2
}

/**
 * Score one filler candidate on acoustics alone. The transcript is not an input
 * here, deliberately: this function cannot be persuaded by a token.
 */
export function scoreDisfluency(input: DisfluencyAcousticInput): DisfluencyAcousticVerdict {
  const { startMs, endMs, vadSegments, energy, speechBaselineRms } = input
  const codes: string[] = []
  const preconditions: string[] = []
  const disqualifying: string[] = []

  const durationMs = Math.max(0, endMs - startMs)

  // ── VETO 1: nothing was audibly there ──────────────────────────────────────
  // Whisper claims a token at this timestamp. If an independent VAD hears
  // mostly nothing, the token is the ASR's invention and there is no filled
  // pause to remove.
  // Presence is a PRECONDITION, not evidence — every spoken word has it — so it
  // vetoes when absent and scores nothing when present.
  const overlap = durationMs > 0 ? speechOverlapMs(startMs, endMs, vadSegments) / durationMs : 0
  if (overlap < MIN_VAD_SPEECH_FRACTION) disqualifying.push('no_vad_speech_at_token')
  else preconditions.push('vad_speech_at_token')

  // ── VETO 2: cutting here would clip a real word ────────────────────────────
  const prevOverlap = input.prevWordEndMs === null ? 0 : input.prevWordEndMs - startMs
  const nextOverlap = input.nextWordStartMs === null ? 0 : endMs - input.nextWordStartMs
  if (prevOverlap > MAX_NEIGHBOUR_OVERLAP_MS || nextOverlap > MAX_NEIGHBOUR_OVERLAP_MS) {
    disqualifying.push('overlaps_lexical_neighbour')
  }

  // ── VETO 3: outside the filled-pause duration band ─────────────────────────
  // Above the ceiling this is a held word, and removing it changes what the
  // person said rather than tidying how they said it. Below the floor it is a
  // segmentation artefact — there is no syllable that short to remove.
  // Being INSIDE the band earns nothing: so is almost every word.
  if (durationMs > FILLED_PAUSE_MAX_MS) disqualifying.push('too_long_for_filled_pause')
  if (durationMs < FILLED_PAUSE_MIN_MS) disqualifying.push('too_short_for_filled_pause')

  // ── SUPPORT 1: quieter than this speaker's own lexical speech ──────────────
  if (speechBaselineRms > 0) {
    const here = meanRms(startMs, endMs, energy)
    if (here > 0 && here <= speechBaselineRms * FILLER_ENERGY_RATIO) {
      codes.push('energy_below_speech_baseline')
    }
  }

  // ── SUPPORT 2: flanked by hesitation ───────────────────────────────────────
  const gapBefore = input.prevWordEndMs === null ? Infinity : startMs - input.prevWordEndMs
  const gapAfter = input.nextWordStartMs === null ? Infinity : input.nextWordStartMs - endMs
  if (gapBefore >= HESITATION_GAP_MS || gapAfter >= HESITATION_GAP_MS) {
    codes.push('hesitation_pause_adjacent')
  }

  return {
    codes,
    supporting: codes.length,
    preconditions,
    disqualifying,
    acousticallyGrounded: disqualifying.length === 0 && codes.length >= MIN_ACOUSTIC_SUPPORT,
  }
}
