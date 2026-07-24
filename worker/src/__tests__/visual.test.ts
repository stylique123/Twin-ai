import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

import { loadAnalysisRules } from '../jobs/editorManifest.js'
import { PermanentJobError } from '../errors.js'
import type { VisualBridgeOutput, VisualFacts } from '../jobs/editorVisual.js'

const { buildVisualAnalysis, coarseIntervalMs, roundUpTo, computeBlankIntervals } = await import('../jobs/editorVisual.js')

const { rules, boundsSha256 } = loadAnalysisRules()

describe('coarse sampling schedule (single producer)', () => {
  it('roundUpTo rounds up to the multiple', () => {
    expect(roundUpTo(1, 500)).toBe(500)
    expect(roundUpTo(500, 500)).toBe(500)
    expect(roundUpTo(501, 500)).toBe(1000)
  })
  it('interval = max(2000, roundUpTo(ceil(durationMs/900), 500))', () => {
    expect(coarseIntervalMs(10_000, rules)).toBe(2000)      // short clip: floor wins
    expect(coarseIntervalMs(1_800_000, rules)).toBe(2000)   // 30 min: exactly 2000
    expect(coarseIntervalMs(2_700_000, rules)).toBe(3000)   // beyond: rounds up to 500ms grid
    // Sample count never exceeds 900.
    for (const d of [10_000, 900_000, 1_800_000, 2_700_000]) {
      expect(Math.ceil(d / coarseIntervalMs(d, rules))).toBeLessThanOrEqual(900)
    }
  })
})

const facts: VisualFacts = { durationMs: 10_000, displayWidth: 1080, displayHeight: 1920, rotation: 90 }

const bridge = (over: Partial<VisualBridgeOutput> = {}): VisualBridgeOutput => ({
  fps: 30,
  coarseSamples: 5,
  fineSamples: 3,
  faceSamples: 5,
  motion: [{ timeMs: 2000, diff: 0.05 }, { timeMs: 4000, diff: 0.42 }],
  lumaCurve: [
    { timeMs: 0, luma: 0.5 }, { timeMs: 2000, luma: 0.5 }, { timeMs: 4000, luma: 0.5 },
    { timeMs: 6000, luma: 0.5 }, { timeMs: 8000, luma: 0.5 },
  ],
  shotBoundaries: [{ timeMs: 3500, score: 0.42, evidenceCodes: ['luma_diff_threshold', 'fine_refined'] }],
  faces: [{ timeMs: 0, detections: [{ x: 100, y: 200, width: 300, height: 400, score: 0.91 }] }],
  faceCoverage: { samplesWithFace: 1, samplesTotal: 5 },
  model: {
    repository: 'opencv/opencv_zoo', ref: '47534e27c9851bb1128ccc0102f1145e27f23f98',
    artifactSha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    manifestSha256: 'a'.repeat(64), verified: true, opencvVersion: '4.10.0',
  },
  ...over,
})

describe('buildVisualAnalysis', () => {
  it('builds the evidence-only contract with display-space facts and pinned provenance', () => {
    const r = buildVisualAnalysis({ id: 'a1', content_sha256: 'h1' }, bridge(), facts,
      { intervalMs: 2000, rules, boundsSha256, requirePinnedModel: true }) as Record<string, any>
    expect(r.visualVersion).toBe('visual-2')
    expect(r.rotation).toBe(90)
    expect(r.displayWidth).toBe(1080)
    expect(r.sampling).toEqual({ coarseIntervalMs: 2000, coarseSamples: 5, fineSamples: 3, faceSamples: 5 })
    expect(r.shotBoundaries).toHaveLength(1)
    // visual-2: per-sample luma curve is carried through; a well-lit clip has no
    // blank intervals.
    expect(r.lumaCurve).toHaveLength(5)
    expect(r.blankIntervals).toEqual([])
    expect(r.provenance.detector).toBe('yunet')
    expect(r.provenance.detectorScoreThreshold).toBe(0.6)
    expect(r.provenance.modelVerified).toBe(true)
    expect(r.provenance.rulesSha256).toBe(boundsSha256)
    // No decision fields anywhere (evidence only — face* naming, no zoom/cleanup).
    const s = JSON.stringify(r)
    expect(s).not.toMatch(/safeZoomWindows|cleanupRecommendations|subject[A-Z]/)
  })

  it('fails closed on an unverified / missing model pin', () => {
    for (const model of [undefined, { ...bridge().model!, verified: false }, { ...bridge().model!, artifactSha256: null }]) {
      let err: unknown
      try {
        buildVisualAnalysis({ id: 'a1', content_sha256: 'h1' }, bridge({ model: model as VisualBridgeOutput['model'] }), facts,
          { intervalMs: 2000, rules, boundsSha256, requirePinnedModel: true })
      } catch (e) { err = e }
      expect(err).toBeInstanceOf(PermanentJobError)
      expect((err as PermanentJobError).code).toBe('model_pin_failed')
    }
  })

  it('rejects bridge output that exceeds the frozen sampling bounds', () => {
    let err: unknown
    try {
      buildVisualAnalysis({ id: 'a1', content_sha256: 'h1' }, bridge({ coarseSamples: 901 }), facts,
        { intervalMs: 2000, rules, boundsSha256, requirePinnedModel: true })
    } catch (e) { err = e }
    expect((err as PermanentJobError).code).toBe('visual_bounds_exceeded')
  })

  it('surfaces merged near-black / frozen blank intervals (visual-2 evidence)', () => {
    // samples every 2000ms; near-black at 2000..6000, plus a frozen tail.
    const lumaCurve = [
      { timeMs: 0, luma: 0.5 },
      { timeMs: 2000, luma: 0.02 }, { timeMs: 4000, luma: 0.03 }, { timeMs: 6000, luma: 0.01 },
      { timeMs: 8000, luma: 0.5 },
    ]
    const motion = [
      { timeMs: 2000, diff: 0.3 }, { timeMs: 4000, diff: 0.3 }, { timeMs: 6000, diff: 0.3 },
      { timeMs: 8000, diff: 0.3 },
    ]
    // near-black but MOVING (motion 0.3) → recorded as evidence but NOT selectable waste
    // (corroboration missing): dark_motion, selectableWaste false.
    const { intervals } = computeBlankIntervals(lumaCurve, motion, rules)
    expect(intervals).toHaveLength(1)
    expect(intervals[0]).toEqual({ startMs: 2000, endMs: 6000, evidenceCodes: ['near_black'], classification: 'dark_motion', selectableWaste: false })

    const r = buildVisualAnalysis({ id: 'a1', content_sha256: 'h1' }, bridge({ lumaCurve, motion }), facts,
      { intervalMs: 2000, rules, boundsSha256, requirePinnedModel: true }) as Record<string, any>
    expect(r.blankIntervals).toEqual([{ startMs: 2000, endMs: 6000, evidenceCodes: ['near_black'], classification: 'dark_motion', selectableWaste: false }])
  })

  it('corroborated dead air (dark AND static together) IS selectable waste', () => {
    // dark (luma ~0.02) AND frozen (motion ~0) at the same samples → dead_air, selectable.
    const lumaCurve = [
      { timeMs: 0, luma: 0.5 },
      { timeMs: 2000, luma: 0.02 }, { timeMs: 4000, luma: 0.01 }, { timeMs: 6000, luma: 0.02 },
      { timeMs: 8000, luma: 0.5 },
    ]
    const motion = [
      { timeMs: 2000, diff: 0.002 }, { timeMs: 4000, diff: 0.003 }, { timeMs: 6000, diff: 0.001 }, { timeMs: 8000, diff: 0.3 },
    ]
    const { intervals } = computeBlankIntervals(lumaCurve, motion, rules)
    expect(intervals).toEqual([{ startMs: 2000, endMs: 6000, evidenceCodes: ['near_black', 'frozen'], classification: 'dead_air', selectableWaste: true }])
  })

  it('does not flag a lone blank sample or a sub-threshold run', () => {
    // one near-black sample (count < 2) and a two-sample run shorter than minBlankDurationMs.
    const lumaCurve = [
      { timeMs: 0, luma: 0.5 }, { timeMs: 2000, luma: 0.01 }, { timeMs: 4000, luma: 0.5 },
    ]
    const motion = [{ timeMs: 2000, diff: 0.3 }, { timeMs: 4000, diff: 0.3 }]
    expect(computeBlankIntervals(lumaCurve, motion, rules).intervals).toEqual([])
  })

  it('a static talking head (frozen, NORMAL brightness) is NEVER auto-called waste', () => {
    // normal luma (0.5) + low motion = a person holding still while talking. It is
    // recorded as `static_hold` evidence but is NOT selectable waste (no corroboration).
    const lumaCurve = [
      { timeMs: 0, luma: 0.5 }, { timeMs: 2000, luma: 0.5 }, { timeMs: 4000, luma: 0.5 },
      { timeMs: 6000, luma: 0.5 },
    ]
    // motion at 2000..6000 is at/below frozenMotionMax (0.01).
    const motion = [
      { timeMs: 2000, diff: 0.005 }, { timeMs: 4000, diff: 0.008 }, { timeMs: 6000, diff: 0.002 },
    ]
    const { intervals } = computeBlankIntervals(lumaCurve, motion, rules)
    expect(intervals).toEqual([{ startMs: 2000, endMs: 6000, evidenceCodes: ['frozen'], classification: 'static_hold', selectableWaste: false }])
  })

  it('fails LOUD when the payload would exceed the cap (never truncates evidence)', () => {
    const big = bridge({
      faces: Array.from({ length: 120 }, (_, i) => ({
        timeMs: i, detections: Array.from({ length: 20 }, () => ({
          x: 123456789012, y: 567890123456, width: 108019201080, height: 192010801920, score: 0.9999,
        })),
      })),
      faceSamples: 120,
      motion: Array.from({ length: 899 }, (_, i) => ({ timeMs: i * 2000, diff: 0.1234 })),
      shotBoundaries: Array.from({ length: 240 }, (_, i) => ({
        timeMs: i * 100, score: 0.4242,
        evidenceCodes: ['luma_diff_threshold', 'fine_refined', 'padding-padding-padding-padding'],
      })),
    })
    let err: unknown
    try {
      buildVisualAnalysis({ id: 'a1', content_sha256: 'h1' }, big, facts,
        { intervalMs: 2000, rules, boundsSha256, requirePinnedModel: true })
    } catch (e) { err = e }
    expect((err as PermanentJobError).code).toBe('visual_component_too_large')
  })
})
