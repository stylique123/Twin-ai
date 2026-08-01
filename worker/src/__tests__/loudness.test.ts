// Measuring the loudness the encoder actually delivered.
//
// The subject is a pure module, so these run without ffmpeg. The fixtures are
// REAL ffmpeg output captured from the measurements documented in
// jobs/loudness.ts — a hand-written approximation of the format would prove the
// parser handles text nobody will ever feed it.
import { describe, it, expect } from 'vitest'
import {
  parseLoudnormJson, checkLoudness, decibelStringToMilli,
  type LoudnessBounds,
} from '../jobs/loudness.js'
import { EditPlanError } from '../jobs/editPlanContract.js'

function codeOf(fn: () => unknown): string {
  try { fn() } catch (e) { return (e as EditPlanError).code }
  throw new Error('expected a throw, got none')
}

// The catalog's frozen values, restated so a change to the catalog that these
// tests would not survive shows up as a failure here rather than in staging.
const BOUNDS: LoudnessBounds = { maxIntegratedDeviationMilli: 3000, clippingDbtpMilli: 0 }
const TARGETS = { targetLufsMilli: -14000, truePeakCeilingDbtpMilli: -1000 }

/** Verbatim ffmpeg stderr shape: progress chatter, then the report. */
function realReport(inputI: string, inputTp: string): string {
  return [
    'Input #0, mov,mp4,m4a,3gp,3g2,mj2, from \'/tmp/out.mp4\':',
    '  Duration: 00:00:08.00, start: 0.000000, bitrate: 132 kb/s',
    'frame=   79 fps=0.0 q=-0.0 size=N/A time=00:00:02.76 bitrate=N/A speed=43.9x',
    'frame=   90 fps=0.0 q=-0.0 Lsize=N/A time=00:00:02.96 bitrate=N/A speed=18.5x',
    '[Parsed_loudnorm_0 @ 0x55d15fc095c0] ',
    '{',
    `\t"input_i" : "${inputI}",`,
    `\t"input_tp" : "${inputTp}",`,
    '\t"input_lra" : "0.10",',
    '\t"input_thresh" : "-31.80",',
    '\t"output_i" : "-13.99",',
    '\t"output_tp" : "-8.29",',
    '\t"output_lra" : "0.00",',
    '\t"output_thresh" : "-23.99",',
    '\t"normalization_type" : "dynamic",',
    '\t"target_offset" : "-0.01"',
    '}',
  ].join('\n')
}

describe('reading the meter', () => {
  it('parses a real report out of surrounding progress chatter', () => {
    const m = parseLoudnormJson(realReport('-14.04', '-6.80'))
    expect(m).toEqual({ silent: false, integratedLufsMilli: -14040, truePeakDbtpMilli: -6800 })
  })

  it('converts decibel strings to integer milli-units without float drift', () => {
    expect(decibelStringToMilli('-14.04')).toBe(-14040)
    expect(decibelStringToMilli('-0.12')).toBe(-120)
    expect(decibelStringToMilli('0')).toBe(0)
    expect(decibelStringToMilli('-inf')).toBeNull()
    expect(decibelStringToMilli('')).toBeNull()
    expect(decibelStringToMilli(undefined)).toBeNull()
    expect(decibelStringToMilli('1e3')).toBeNull()
  })

  it('reads input_*, not output_* — the file measured is already the render', () => {
    // The fixture's output_i is -13.99 and its input_i is -21.80. Reading the
    // wrong pair would look plausible and be a measurement of a normalisation
    // that will never be applied to anything.
    const m = parseLoudnormJson(realReport('-21.80', '-16.08'))
    expect(m?.integratedLufsMilli).toBe(-21800)
    expect(m?.truePeakDbtpMilli).toBe(-16080)
  })

  it('reports digital silence as SILENT rather than as a parse failure', () => {
    // Verbatim from ffmpeg on an anullsrc track. If `-inf` were treated as
    // unparseable, the loudest possible defect would read as "could not
    // measure" — which is the reading that lets it through.
    const m = parseLoudnormJson(realReport('-inf', '-inf'))
    expect(m).toEqual({ silent: true, integratedLufsMilli: null, truePeakDbtpMilli: null })
  })

  it('takes the LAST report when a graph emitted more than one', () => {
    const text = realReport('-20.00', '-9.00') + '\n' + realReport('-14.04', '-6.80')
    expect(parseLoudnormJson(text)?.integratedLufsMilli).toBe(-14040)
  })

  it('returns null rather than guessing when there is no report', () => {
    expect(parseLoudnormJson('frame= 90 fps=0.0 q=-0.0 Lsize=N/A')).toBeNull()
    expect(parseLoudnormJson('')).toBeNull()
    // A JSON object that is not a loudnorm report must not be mistaken for one.
    expect(parseLoudnormJson('{"some_other":"object"}')).toBeNull()
    // Truncated mid-report: no balanced brace, so nothing is extracted.
    expect(parseLoudnormJson('{\n\t"input_i" : "-14.04",')).toBeNull()
  })
})

describe('the disaster band — what actually fails a render', () => {
  it('SILENCE fails: every upstream stage was built on audio the file lacks', () => {
    const m = parseLoudnormJson(realReport('-inf', '-inf'))!
    expect(codeOf(() => checkLoudness(m, TARGETS, BOUNDS))).toBe('output_audio_invalid')
  })

  it('CLIPPING fails: a true peak at or above the clipping bound', () => {
    const at = { silent: false, integratedLufsMilli: -14000, truePeakDbtpMilli: 0 }
    const over = { silent: false, integratedLufsMilli: -14000, truePeakDbtpMilli: 500 }
    expect(codeOf(() => checkLoudness(at, TARGETS, BOUNDS))).toBe('output_audio_invalid')
    expect(codeOf(() => checkLoudness(over, TARGETS, BOUNDS))).toBe('output_audio_invalid')
  })

  it('GROSS LEVEL ERROR fails, in both directions', () => {
    const quiet = { silent: false, integratedLufsMilli: -20000, truePeakDbtpMilli: -8000 }
    const loud = { silent: false, integratedLufsMilli: -8000, truePeakDbtpMilli: -8000 }
    expect(codeOf(() => checkLoudness(quiet, TARGETS, BOUNDS))).toBe('output_audio_invalid')
    expect(codeOf(() => checkLoudness(loud, TARGETS, BOUNDS))).toBe('output_audio_invalid')
  })
})

describe('what must NOT fail — the renders this pipeline really produces', () => {
  // THIS IS THE POINT OF THE WIDE BOUNDS. Every row is a measurement taken from
  // this encoder chain running single-pass loudnorm against the frozen target
  // (the table in jobs/loudness.ts). If any of these ever throws, the validator
  // has started rejecting videos the pipeline produced correctly — which costs
  // the user their video and is strictly worse than not checking at all.
  const MEASURED: Array<{ what: string; i: number; tp: number }> = [
    { what: 'sine 440 quiet', i: -14040, tp: -6800 },
    { what: 'sine 440 hot', i: -14030, tp: -6800 },
    { what: 'pink noise quiet', i: -14080, tp: -410 },
    { what: 'pink noise hot', i: -14050, tp: -120 },
    { what: 'brown noise', i: -14200, tp: -850 },
    { what: 'white noise', i: -14940, tp: -5340 },
  ]

  for (const row of MEASURED) {
    it(`accepts ${row.what} (${row.i / 1000} LUFS, ${row.tp / 1000} dBTP)`, () => {
      const m = { silent: false, integratedLufsMilli: row.i, truePeakDbtpMilli: row.tp }
      expect(() => checkLoudness(m, TARGETS, BOUNDS)).not.toThrow()
    })
  }

  it('a true peak OVER the frozen ceiling is recorded, never rejected', () => {
    // Pink noise measured -0.12 dBTP against a -1.0 dBTP request: the encoder
    // overshot its own ceiling by 0.88 dB. Enforcing the ceiling literally would
    // destroy this video. The overshoot is reported instead.
    const m = { silent: false, integratedLufsMilli: -14050, truePeakDbtpMilli: -120 }
    const v = checkLoudness(m, TARGETS, BOUNDS)
    expect(v.truePeakOvershootMilli).toBe(880)
    expect(v.integratedDeviationMilli).toBe(-50)
  })

  it('CONTROL: the frozen ±1 LUFS target would NOT have accepted the same set', () => {
    // Proves the wide bound is load-bearing rather than lazy. White noise landed
    // 0.94 LU low — inside ±1, but a hair from it — while the true-peak ceiling
    // is exceeded outright by two of the six. A validator written to the frozen
    // numbers rejects real output; this test fails the day someone tightens
    // them without re-measuring.
    const strict: LoudnessBounds = { maxIntegratedDeviationMilli: 1000, clippingDbtpMilli: -1000 }
    const rejected = MEASURED.filter((r) => {
      const m = { silent: false, integratedLufsMilli: r.i, truePeakDbtpMilli: r.tp }
      try { checkLoudness(m, TARGETS, strict); return false } catch { return true }
    })
    expect(rejected.map((r) => r.what)).toEqual(['pink noise quiet', 'pink noise hot', 'brown noise'])
  })
})
