import { describe, it, expect } from 'vitest'
import {
  evaluatePreflight,
  overallState,
  PREFLIGHT_POLICY_V1,
  type PreflightCheck,
  type PreflightCheckId,
  type PreflightSignals,
} from '../preflight.js'

// A take with nothing wrong with it. Every test starts here and breaks exactly
// one thing, so a failure names its own cause.
const GOOD: PreflightSignals = {
  frame: { widthPx: 1080, heightPx: 1920 },
  face: { xMilli: 400, yMilli: 150, widthMilli: 200, heightMilli: 300 },
  luminance: { subjectMilli: 600, backgroundMilli: 650 },
  audio: { peakMilli: 700, reverbRatioMilli: 200 },
  hasAudioTrack: true,
}

const find = (s: PreflightSignals, id: PreflightCheckId): PreflightCheck => {
  const c = evaluatePreflight(s).checks.find((x) => x.id === id)
  if (!c) throw new Error(`no check ${id}`)
  return c
}

describe('preflight — the clean baseline', () => {
  it('a well-framed, well-lit, audible portrait take passes everything', () => {
    const r = evaluatePreflight(GOOD)
    expect(r.overall).toBe('ok')
    expect(r.blocking).toEqual([])
    expect(r.unmeasured).toEqual([])
    expect(r.checks.map((c) => c.state)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
  })

  it('echoes the raw measurements back so chosen thresholds can be corrected later', () => {
    // The whole reason the policy is allowed to ship with chosen numbers.
    expect(evaluatePreflight(GOOD).measured).toEqual(GOOD)
  })

  it('is pure — the same signals produce an identical report', () => {
    expect(evaluatePreflight(GOOD)).toEqual(evaluatePreflight(GOOD))
  })
})

describe('preflight — "unmeasured" is neither a pass nor a failure', () => {
  it('reports every check as unmeasured when no signals arrive at all', () => {
    const r = evaluatePreflight({})
    expect(r.overall).toBe('unmeasured')
    expect(r.unmeasured).toEqual(['orientation', 'framing', 'lighting', 'room', 'mic'])
    expect(r.blocking).toEqual([])
  })

  it('CONTROL: an empty preflight must never report ok — that is the worst possible lie', () => {
    expect(evaluatePreflight({}).overall).not.toBe('ok')
  })

  it('a missing detector and a detector that found nobody are DIFFERENT answers', () => {
    // The distinction this module exists to preserve. Omitting `face` means
    // nothing looked; `face: null` means it looked and the frame was empty.
    const neverLooked = find({ ...GOOD, face: undefined }, 'framing')
    const lookedFoundNobody = find({ ...GOOD, face: null }, 'framing')
    expect(neverLooked.state).toBe('unmeasured')
    expect(lookedFoundNobody.state).toBe('warn')
    expect(lookedFoundNobody.reason).toBe('no_face_found')
    expect(neverLooked.state).not.toBe(lookedFoundNobody.state)
  })

  it('one unmeasured check does not drag an otherwise-clean take down', () => {
    const r = evaluatePreflight({ ...GOOD, luminance: null })
    expect(r.overall).toBe('ok')
    expect(r.unmeasured).toEqual(['lighting'])
  })

  it('but a real failure still outranks everything, measured or not', () => {
    const r = evaluatePreflight({ frame: { widthPx: 1920, heightPx: 1080 } })
    expect(r.overall).toBe('fail')
  })
})

describe('preflight — orientation', () => {
  it('a landscape frame FAILS: a 9:16 crop cannot recover it', () => {
    const c = find({ ...GOOD, frame: { widthPx: 1920, heightPx: 1080 } }, 'orientation')
    expect(c.state).toBe('fail')
    expect(c.reason).toBe('landscape')
  })

  it('an exactly-square frame warns rather than fails', () => {
    const c = find({ ...GOOD, frame: { widthPx: 1080, heightPx: 1080 } }, 'orientation')
    expect(c.state).toBe('warn')
    expect(c.reason).toBe('near_square')
  })

  it('CONTROL: a normal phone portrait frame is not flagged', () => {
    expect(find({ ...GOOD, frame: { widthPx: 1080, heightPx: 1920 } }, 'orientation').state).toBe('ok')
  })

  it('a degenerate frame is unmeasured, not ok', () => {
    for (const frame of [{ widthPx: 0, heightPx: 1920 }, { widthPx: 1080, heightPx: 0 }, null])
      expect(find({ ...GOOD, frame }, 'orientation').state).toBe('unmeasured')
  })
})

describe('preflight — framing', () => {
  it('a head touching the top edge FAILS', () => {
    const c = find({ ...GOOD, face: { xMilli: 400, yMilli: 0, widthMilli: 200, heightMilli: 300 } }, 'framing')
    expect(c.state).toBe('fail')
    expect(c.reason).toBe('head_cropped')
  })

  it('a chin past the bottom edge FAILS', () => {
    const c = find({ ...GOOD, face: { xMilli: 400, yMilli: 700, widthMilli: 200, heightMilli: 300 } }, 'framing')
    expect(c.state).toBe('fail')
    expect(c.reason).toBe('chin_cropped')
  })

  it('almost-cropped warns — near the edge is not the same as past it', () => {
    const c = find({ ...GOOD, face: { xMilli: 400, yMilli: 10, widthMilli: 200, heightMilli: 300 } }, 'framing')
    expect(c.state).toBe('warn')
    expect(c.reason).toBe('head_cropped')
  })

  it('a distant subject warns', () => {
    const c = find({ ...GOOD, face: { xMilli: 450, yMilli: 400, widthMilli: 100, heightMilli: 100 } }, 'framing')
    expect(c.state).toBe('warn')
    expect(c.reason).toBe('subject_too_far')
  })

  it('a subject hard against one side warns', () => {
    const c = find({ ...GOOD, face: { xMilli: 830, yMilli: 150, widthMilli: 160, heightMilli: 300 } }, 'framing')
    expect(c.state).toBe('warn')
    expect(c.reason).toBe('subject_off_centre')
  })

  it('CONTROL: an off-centre subject still inside the bound is fine', () => {
    // Guards the boundary in the permissive direction, so tightening the policy
    // by accident shows up as a failing test rather than as creator complaints.
    expect(find({ ...GOOD, face: { xMilli: 600, yMilli: 150, widthMilli: 200, heightMilli: 300 } }, 'framing').state).toBe('ok')
  })

  it('cropping is judged before size, because a cropped box\'s height is not trustworthy', () => {
    // Both wrong at once: tiny AND off the top edge. The edge must win.
    const c = find({ ...GOOD, face: { xMilli: 400, yMilli: 0, widthMilli: 60, heightMilli: 60 } }, 'framing')
    expect(c.reason).toBe('head_cropped')
  })
})

describe('preflight — lighting', () => {
  it('a bright window behind the speaker warns as backlit', () => {
    const c = find({ ...GOOD, luminance: { subjectMilli: 300, backgroundMilli: 900 } }, 'lighting')
    expect(c.state).toBe('warn')
    expect(c.reason).toBe('subject_backlit')
  })

  it('an underexposed subject warns as too dark, distinctly from backlit', () => {
    const c = find({ ...GOOD, luminance: { subjectMilli: 80, backgroundMilli: 90 } }, 'lighting')
    expect(c.state).toBe('warn')
    expect(c.reason).toBe('scene_too_dark')
    // The fixes differ — turn around vs. add light — so the reasons must too.
    expect(c.reason).not.toBe('subject_backlit')
  })

  it('CONTROL: a background merely a little brighter than the subject is normal', () => {
    expect(find({ ...GOOD, luminance: { subjectMilli: 600, backgroundMilli: 800 } }, 'lighting').state).toBe('ok')
  })

  it('a dark background behind a lit subject is fine, not "backlit" in reverse', () => {
    expect(find({ ...GOOD, luminance: { subjectMilli: 700, backgroundMilli: 100 } }, 'lighting').state).toBe('ok')
  })
})

describe('preflight — room and mic', () => {
  it('a boomy room warns — no de-reverb exists downstream', () => {
    const c = find({ ...GOOD, audio: { peakMilli: 700, reverbRatioMilli: 800 } }, 'room')
    expect(c.state).toBe('warn')
    expect(c.reason).toBe('room_echo')
  })

  it('no audio track at all FAILS — the whole pipeline is downstream of speech', () => {
    const c = find({ ...GOOD, hasAudioTrack: false }, 'mic')
    expect(c.state).toBe('fail')
    expect(c.reason).toBe('no_audio_track')
  })

  it('a missing audio track fails even when nothing was sampled', () => {
    // Knowable without measuring, so it must not degrade to `unmeasured`.
    const c = find({ hasAudioTrack: false }, 'mic')
    expect(c.state).toBe('fail')
  })

  it('a clipped input warns, and clipping is checked before quietness', () => {
    const c = find({ ...GOOD, audio: { peakMilli: 995, reverbRatioMilli: 200 } }, 'mic')
    expect(c.state).toBe('warn')
    expect(c.reason).toBe('mic_clipping')
  })

  it('a near-silent input warns', () => {
    const c = find({ ...GOOD, audio: { peakMilli: 20, reverbRatioMilli: 200 } }, 'mic')
    expect(c.state).toBe('warn')
    expect(c.reason).toBe('mic_too_quiet')
  })

  it('CONTROL: a healthy level is not flagged in either direction', () => {
    expect(find({ ...GOOD, audio: { peakMilli: 700, reverbRatioMilli: 200 } }, 'mic').state).toBe('ok')
  })
})

describe('preflight — the report shape a caller depends on', () => {
  it('collects every failure into `blocking`, and reports but never blocks on warnings', () => {
    const r = evaluatePreflight({
      frame: { widthPx: 1920, heightPx: 1080 },                                  // fail
      face: { xMilli: 400, yMilli: 150, widthMilli: 200, heightMilli: 300 },     // ok
      luminance: { subjectMilli: 300, backgroundMilli: 900 },                    // warn
      audio: { peakMilli: 700, reverbRatioMilli: 200 },                          // ok
      hasAudioTrack: false,                                                      // fail
    })
    expect(r.overall).toBe('fail')
    expect(r.blocking.map((c) => c.id).sort()).toEqual(['mic', 'orientation'])
  })

  it('every non-unmeasured check reports what it saw AND what it compared against', () => {
    // Without both numbers a warning cannot be acted on or later corrected.
    for (const c of evaluatePreflight(GOOD).checks) {
      expect(c.observed).toBeTypeOf('number')
      expect(c.threshold).toBeTypeOf('number')
    }
  })

  it('overallState ranks fail > warn > ok and ignores unmeasured in between', () => {
    const mk = (state: PreflightCheck['state']): PreflightCheck => ({ id: 'mic', state, reason: 'ok' })
    expect(overallState([mk('ok'), mk('warn'), mk('fail')])).toBe('fail')
    expect(overallState([mk('ok'), mk('warn'), mk('unmeasured')])).toBe('warn')
    expect(overallState([mk('ok'), mk('unmeasured')])).toBe('ok')
    expect(overallState([mk('unmeasured'), mk('unmeasured')])).toBe('unmeasured')
    expect(overallState([])).toBe('unmeasured')
  })

  it('the policy is frozen — a caller cannot mutate the thresholds at runtime', () => {
    expect(Object.isFrozen(PREFLIGHT_POLICY_V1)).toBe(true)
    expect(Object.isFrozen(PREFLIGHT_POLICY_V1.framing)).toBe(true)
  })

  it('accepts an injected policy, so thresholds can be corrected without editing callers', () => {
    const strict = { ...PREFLIGHT_POLICY_V1, room: { maxReverbRatioMilli: 100 } }
    expect(evaluatePreflight(GOOD).checks.find((c) => c.id === 'room')?.state).toBe('ok')
    expect(evaluatePreflight(GOOD, strict).checks.find((c) => c.id === 'room')?.state).toBe('warn')
  })
})
