// THE MEASURED PART OF ISSUE #194.
//
// #194 asks for an acoustically-grounded detector "with measured recall/
// precision on a labeled set", and for a documented bar met before
// `autoFillerRemoval` can change. A detector without a measurement is the thing
// the issue exists to prevent, so the measurement lives here and FAILS THE
// BUILD if it regresses.
//
// ── WHAT THIS SET IS, AND WHAT IT IS NOT ─────────────────────────────────────
//
// These are HAND-LABELLED SYNTHETIC TRACES: word intervals, Silero-style VAD
// segments and an RMS curve, built to encode the acoustic situations the
// detector must separate. They are NOT real recordings.
//
// So the numbers below characterise the DETECTOR — that its vetoes fire, that
// its supporting signals combine as intended, that a plausible-looking ASR
// token with no acoustic backing is refused. They do not and cannot license
// turning `autoFillerRemoval` on. That needs the same harness run over real
// labelled human audio, which is exactly what the pre-beta recording gate
// (#193/#204) starts collecting.
//
// Saying that plainly is the point. A green suite here reads like permission,
// and it is not permission.
import { describe, expect, it } from 'vitest'
import {
  scoreDisfluency, speechBaseline,
  FILLED_PAUSE_MAX_MS, MIN_ACOUSTIC_SUPPORT,
  type EnergyCurve, type Interval,
} from '../jobs/disfluencyAcoustics.js'

const WINDOW_MS = 100

/** Build an RMS curve where [startMs,endMs) windows take `level`. */
function curve(spans: Array<{ startMs: number; endMs: number; level: number }>, totalMs: number): EnergyCurve {
  const n = Math.ceil(totalMs / WINDOW_MS)
  const rms = new Array<number>(n).fill(0)
  for (const s of spans) {
    const a = Math.floor(s.startMs / WINDOW_MS)
    const b = Math.min(n, Math.ceil(s.endMs / WINDOW_MS))
    for (let i = a; i < b; i++) rms[i] = s.level
  }
  return { windowMs: WINDOW_MS, rms }
}

interface Case {
  name: string
  /** Ground truth: is this genuinely a removable filled pause? */
  isFiller: boolean
  startMs: number
  endMs: number
  prevWordEndMs: number | null
  nextWordStartMs: number | null
  vad: Interval[]
  energy: EnergyCurve
  baseline: number
}

// A speaker whose lexical speech sits at RMS 0.40.
const LEX = 0.40
const QUIET = 0.22   // a genuine filled pause: reduced effort
const LOUD = 0.44    // as loud as real speech

/**
 * THE LABELLED SET.
 *
 * Positives are filled pauses in the situations they actually occur in.
 * Negatives are the ways a naive token-driven detector gets it wrong — which is
 * the failure mode #194 names, so they carry the most weight here.
 */
const CASES: Case[] = [
  // ── genuine filled pauses ──────────────────────────────────────────────────
  {
    name: 'classic "um" — quiet, bracketed by pauses, mid-band duration',
    isFiller: true,
    startMs: 1000, endMs: 1300, prevWordEndMs: 700, nextWordStartMs: 1600,
    vad: [{ startMs: 980, endMs: 1320 }],
    energy: curve([{ startMs: 1000, endMs: 1300, level: QUIET }], 2000), baseline: LEX,
  },
  {
    name: 'short "uh" after a long hesitation',
    isFiller: true,
    startMs: 2000, endMs: 2160, prevWordEndMs: 1500, nextWordStartMs: 2400,
    vad: [{ startMs: 1990, endMs: 2170 }],
    energy: curve([{ startMs: 2000, endMs: 2200, level: QUIET }], 3000), baseline: LEX,
  },
  {
    name: 'run of "um uh" — longer but still inside the band',
    isFiller: true,
    startMs: 500, endMs: 1050, prevWordEndMs: 300, nextWordStartMs: 1300,
    vad: [{ startMs: 490, endMs: 1060 }],
    energy: curve([{ startMs: 500, endMs: 1100, level: QUIET }], 2000), baseline: LEX,
  },
  {
    name: 'filled pause at the very start of the recording',
    isFiller: true,
    startMs: 0, endMs: 260, prevWordEndMs: null, nextWordStartMs: 600,
    vad: [{ startMs: 0, endMs: 270 }],
    energy: curve([{ startMs: 0, endMs: 300, level: QUIET }], 1500), baseline: LEX,
  },
  {
    name: 'filled pause at the very end of the recording',
    isFiller: true,
    startMs: 4000, endMs: 4300, prevWordEndMs: 3600, nextWordStartMs: null,
    vad: [{ startMs: 3990, endMs: 4310 }],
    energy: curve([{ startMs: 4000, endMs: 4300, level: QUIET }], 4500), baseline: LEX,
  },
  {
    name: 'emphatic "UM" — loud, but bracketed and in-band',
    isFiller: true,
    startMs: 1000, endMs: 1350, prevWordEndMs: 600, nextWordStartMs: 1700,
    vad: [{ startMs: 990, endMs: 1360 }],
    energy: curve([{ startMs: 1000, endMs: 1400, level: LOUD }], 2500), baseline: LEX,
  },
  {
    name: 'quiet in-band filler with only a trailing pause',
    isFiller: true,
    startMs: 1200, endMs: 1450, prevWordEndMs: 1180, nextWordStartMs: 1700,
    vad: [{ startMs: 1190, endMs: 1460 }],
    energy: curve([{ startMs: 1200, endMs: 1500, level: QUIET }], 2200), baseline: LEX,
  },
  {
    name: 'quiet in-band filler with only a leading pause',
    isFiller: true,
    startMs: 1500, endMs: 1780, prevWordEndMs: 1200, nextWordStartMs: 1795,
    vad: [{ startMs: 1490, endMs: 1790 }],
    energy: curve([{ startMs: 1500, endMs: 1800, level: QUIET }], 2400), baseline: LEX,
  },

  // ── the ways a token-driven detector goes wrong ───────────────────────────
  {
    name: 'HALLUCINATED token — Whisper says "um", VAD hears nothing',
    isFiller: false,
    startMs: 1000, endMs: 1300, prevWordEndMs: 700, nextWordStartMs: 1600,
    vad: [], // the recording is silent here
    energy: curve([], 2000), baseline: LEX,
  },
  {
    name: 'hallucinated token with only a sliver of speech under it',
    isFiller: false,
    startMs: 1000, endMs: 1400, prevWordEndMs: 700, nextWordStartMs: 1700,
    vad: [{ startMs: 1000, endMs: 1080 }], // 20% overlap — under the veto
    energy: curve([{ startMs: 1000, endMs: 1100, level: QUIET }], 2000), baseline: LEX,
  },
  {
    name: 'mis-heard real word — fluent speech hard against it on both sides',
    isFiller: false,
    startMs: 1000, endMs: 1070, prevWordEndMs: 995, nextWordStartMs: 1075,
    vad: [{ startMs: 980, endMs: 1090 }],
    energy: curve([{ startMs: 900, endMs: 1200, level: LEX }], 2000), baseline: LEX,
  },
  {
    name: 'boundary wobble — token overlaps the previous word by 80ms',
    isFiller: false,
    startMs: 1000, endMs: 1300, prevWordEndMs: 1080, nextWordStartMs: 1600,
    vad: [{ startMs: 980, endMs: 1320 }],
    energy: curve([{ startMs: 1000, endMs: 1300, level: QUIET }], 2000), baseline: LEX,
  },
  {
    name: 'boundary wobble — token overlaps the NEXT word by 90ms',
    isFiller: false,
    startMs: 1000, endMs: 1300, prevWordEndMs: 700, nextWordStartMs: 1210,
    vad: [{ startMs: 980, endMs: 1320 }],
    energy: curve([{ startMs: 1000, endMs: 1300, level: QUIET }], 2000), baseline: LEX,
  },
  {
    name: 'held word — 900ms, far past the filled-pause ceiling',
    isFiller: false,
    startMs: 1000, endMs: 1900, prevWordEndMs: 600, nextWordStartMs: 2200,
    vad: [{ startMs: 990, endMs: 1910 }],
    energy: curve([{ startMs: 1000, endMs: 1900, level: QUIET }], 2500), baseline: LEX,
  },
  {
    name: 'segmentation artefact — 40ms, below the floor, no pause, full energy',
    isFiller: false,
    startMs: 1000, endMs: 1040, prevWordEndMs: 990, nextWordStartMs: 1050,
    vad: [{ startMs: 970, endMs: 1080 }],
    energy: curve([{ startMs: 900, endMs: 1200, level: LEX }], 2000), baseline: LEX,
  },
  {
    name: 'meaningful "so" mid-sentence — full energy, no hesitation, in-band',
    isFiller: false,
    startMs: 1000, endMs: 1180, prevWordEndMs: 990, nextWordStartMs: 1190,
    vad: [{ startMs: 950, endMs: 1250 }],
    energy: curve([{ startMs: 900, endMs: 1300, level: LEX }], 2000), baseline: LEX,
  },
  {
    name: 'meaningful "like" as a verb — full energy, tight neighbours',
    isFiller: false,
    startMs: 2000, endMs: 2200, prevWordEndMs: 1990, nextWordStartMs: 2210,
    vad: [{ startMs: 1950, endMs: 2260 }],
    energy: curve([{ startMs: 1900, endMs: 2300, level: LEX }], 3000), baseline: LEX,
  },
  {
    name: 'held word that is also quiet — ceiling veto must beat two supports',
    isFiller: false,
    startMs: 1000, endMs: 1800, prevWordEndMs: 500, nextWordStartMs: 2100,
    vad: [{ startMs: 990, endMs: 1810 }],
    energy: curve([{ startMs: 1000, endMs: 1800, level: QUIET }], 2500), baseline: LEX,
  },
  {
    name: 'hallucination that is otherwise perfect — no VAD must still veto',
    isFiller: false,
    startMs: 1000, endMs: 1250, prevWordEndMs: 500, nextWordStartMs: 1800,
    vad: [],
    energy: curve([{ startMs: 1000, endMs: 1300, level: QUIET }], 2200), baseline: LEX,
  },
  {
    // LEARNED FROM THE STAGING MATRIX, not from thinking about it.
    //
    // The Phase 5 harness synthesizes its fixture with espeak at a fixed
    // amplitude and reads it as continuous prose, so its "um" had no energy
    // drop and no flanking hesitation. The detector refused it and S12 failed —
    // correctly. That fixture contained the WORD "um", not a filled pause, and
    // the only thing marking it as a disfluency was the ASR token.
    //
    // Kept as a permanent negative so nobody "fixes" this by accepting a token
    // with no prosody behind it. The harness now synthesizes a real one.
    name: 'flat-amplitude TTS "um" in fluent prose — a token, not a filled pause',
    isFiller: false,
    startMs: 1000, endMs: 1250, prevWordEndMs: 990, nextWordStartMs: 1260,
    vad: [{ startMs: 900, endMs: 1400 }],
    energy: curve([{ startMs: 800, endMs: 1500, level: LEX }], 2000), baseline: LEX,
  },
  {
    name: 'clipping neighbour AND quiet AND bracketed — veto still wins',
    isFiller: false,
    startMs: 1000, endMs: 1300, prevWordEndMs: 1200, nextWordStartMs: 1900,
    vad: [{ startMs: 980, endMs: 1320 }],
    energy: curve([{ startMs: 1000, endMs: 1300, level: QUIET }], 2200), baseline: LEX,
  },
]

function run(c: Case) {
  return scoreDisfluency({
    startMs: c.startMs, endMs: c.endMs,
    prevWordEndMs: c.prevWordEndMs, nextWordStartMs: c.nextWordStartMs,
    vadSegments: c.vad, energy: c.energy, speechBaselineRms: c.baseline,
  })
}

// ── THE BAR ──────────────────────────────────────────────────────────────────
//
// PRECISION IS THE ONE THAT MATTERS and it is set to 1.0. A false positive is a
// cut through real speech, shipped to a creator's audience; a false negative is
// an "um" left in a video. Those costs are not comparable, so the bar is not
// symmetric. Recall is set below 1.0 deliberately: a detector tuned to catch
// every filled pause is a detector that has started guessing.
const PRECISION_BAR = 1.0
const RECALL_BAR = 0.75

describe('#194 — acoustically-grounded disfluency detector, measured', () => {
  it('meets the documented bar on the labelled set', () => {
    let tp = 0, fp = 0, fn = 0, tn = 0
    const misses: string[] = []
    for (const c of CASES) {
      const grounded = run(c).acousticallyGrounded
      if (grounded && c.isFiller) tp++
      else if (grounded && !c.isFiller) { fp++; misses.push(`FALSE POSITIVE: ${c.name}`) }
      else if (!grounded && c.isFiller) { fn++; misses.push(`missed: ${c.name}`) }
      else tn++
    }
    const precision = tp + fp === 0 ? 1 : tp / (tp + fp)
    const recall = tp + fn === 0 ? 1 : tp / (tp + fn)

    // Reported, not just asserted — the issue asks for measured numbers.
    // eslint-disable-next-line no-console
    console.log(
      `\n  #194 detector on ${CASES.length} labelled synthetic cases\n` +
      `    precision ${precision.toFixed(3)}  (tp=${tp} fp=${fp})\n` +
      `    recall    ${recall.toFixed(3)}  (tp=${tp} fn=${fn})\n` +
      `    tn=${tn}\n` +
      (misses.length ? `    ${misses.join('\n    ')}\n` : ''),
    )

    expect(precision).toBeGreaterThanOrEqual(PRECISION_BAR)
    expect(recall).toBeGreaterThanOrEqual(RECALL_BAR)
  })

  it('never fires on a token with no independent acoustic support', () => {
    // The single most important property: Whisper alone cannot cause a cut.
    for (const c of CASES.filter((x) => x.vad.length === 0)) {
      const v = run(c)
      expect(v.acousticallyGrounded).toBe(false)
      expect(v.disqualifying).toContain('no_vad_speech_at_token')
    }
  })

  it('a veto cannot be outvoted by supporting signals', () => {
    // Quiet, bracketed and 800ms long: two supports, one ceiling veto.
    const held = CASES.find((c) => c.name.startsWith('held word that is also quiet'))!
    const v = run(held)
    expect(v.supporting).toBeGreaterThanOrEqual(MIN_ACOUSTIC_SUPPORT)
    expect(v.disqualifying).toContain('too_long_for_filled_pause')
    expect(v.acousticallyGrounded).toBe(false)
  })

  it('the duration ceiling is exclusive at the boundary', () => {
    const at = (durMs: number) => run({
      ...CASES[0], startMs: 1000, endMs: 1000 + durMs,
      prevWordEndMs: 500, nextWordStartMs: 1000 + durMs + 400,
      vad: [{ startMs: 990, endMs: 1000 + durMs + 10 }],
      energy: curve([{ startMs: 1000, endMs: 1000 + durMs + 100, level: QUIET }], 4000),
    })
    expect(at(FILLED_PAUSE_MAX_MS).disqualifying).not.toContain('too_long_for_filled_pause')
    expect(at(FILLED_PAUSE_MAX_MS + 1).disqualifying).toContain('too_long_for_filled_pause')
  })

  it('energy is judged against THIS speaker, not an absolute level', () => {
    // The same waveform is a filler for a loud speaker and not for a quiet one.
    // An absolute dBFS threshold would encode the microphone instead.
    const shared = {
      startMs: 1000, endMs: 1300, prevWordEndMs: 980, nextWordStartMs: 1320,
      vadSegments: [{ startMs: 990, endMs: 1310 }],
      energy: curve([{ startMs: 1000, endMs: 1300, level: 0.25 }], 2000),
    }
    expect(scoreDisfluency({ ...shared, speechBaselineRms: 0.60 }).codes)
      .toContain('energy_below_speech_baseline')
    expect(scoreDisfluency({ ...shared, speechBaselineRms: 0.26 }).codes)
      .not.toContain('energy_below_speech_baseline')
  })

  it('the baseline is a median, so one shouted word cannot move it', () => {
    const e = curve([
      { startMs: 0, endMs: 100, level: 0.40 },
      { startMs: 100, endMs: 200, level: 0.40 },
      { startMs: 200, endMs: 300, level: 0.40 },
      { startMs: 300, endMs: 400, level: 9.0 }, // a clipped frame
    ], 400)
    const words: Interval[] = [
      { startMs: 0, endMs: 100 }, { startMs: 100, endMs: 200 },
      { startMs: 200, endMs: 300 }, { startMs: 300, endMs: 400 },
    ]
    expect(speechBaseline(words, e)).toBeLessThan(1)
  })
})
