import { describe, expect, it } from 'vitest'

process.env.SUPABASE_URL ||= 'https://stub.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-service-role-key'

const { buildVisualWasteStream, buildDirectorSummaries } = await import('../jobs/editorDirector.js')
const { MAX_SUMMARY_BYTES, MAX_VISUAL_WASTE, VISUAL_WASTE_CLASSES } = await import('../jobs/directorContract.js')
const { canonicalJson } = await import('../jobs/editorManifest.js')

describe('§3.5 runtime wiring: visual-waste stream from the pinned visual component', () => {
  it('maps blank intervals to compact tuples; ONLY dead_air is selectable (never a guess)', () => {
    const visual = {
      blankIntervals: [
        { startMs: 2000, endMs: 4000, classification: 'dead_air', selectableWaste: true },
        { startMs: 6000, endMs: 8000, classification: 'static_hold', selectableWaste: false },
        { startMs: 9000, endMs: 10000, classification: 'dark_motion', selectableWaste: false },
      ],
    }
    const stream = buildVisualWasteStream(visual)
    expect(stream).toEqual([
      [200, 400, VISUAL_WASTE_CLASSES.indexOf('dead_air'), 1],
      [600, 800, VISUAL_WASTE_CLASSES.indexOf('static_hold'), 0],
      [900, 1000, VISUAL_WASTE_CLASSES.indexOf('dark_motion'), 0],
    ])
  })

  it('is empty (never invented) when the component has no intervals or is absent', () => {
    expect(buildVisualWasteStream(null)).toEqual([])
    expect(buildVisualWasteStream({})).toEqual([])
    expect(buildVisualWasteStream({ blankIntervals: [] })).toEqual([])
  })

  it('drops malformed intervals and caps at MAX_VISUAL_WASTE', () => {
    const many = Array.from({ length: MAX_VISUAL_WASTE + 20 }, (_, i) => ({
      startMs: i * 10, endMs: i * 10 + 10, classification: 'dead_air', selectableWaste: true,
    }))
    many.push({ startMs: 50, endMs: 10, classification: 'dead_air', selectableWaste: true }) // reversed → dropped
    many.push({ startMs: 0, endMs: 100, classification: 'mystery', selectableWaste: false } as never) // unknown class → dropped
    expect(buildVisualWasteStream({ blankIntervals: many }).length).toBe(MAX_VISUAL_WASTE)
  })
})

describe('§3.5 runtime wiring: bounded director summaries', () => {
  const visual = { shotBoundaries: [{}, {}, {}], faceCoverage: { samplesWithFace: 4, samplesTotal: 5 }, blankIntervals: [] }
  const audio = { integratedLufs: -16.2, truePeakDbtp: -1.1, noiseFloorDb: -60, snrDb: 40 }
  // The hook component's REAL persisted shape. `matchedTokenRatio` lives
  // inside `scriptAlignment` — see editorHook.ts, and hook.test.ts, which has
  // been pinning that truth from the producer's side the whole time. This
  // fixture used to carry it flat, invented from what the reader expected, and
  // that is why the reader read the wrong path for so long with a green suite.
  const hook = {
    spokenOpening: { firstWordStartMs: 120, wordCount: 8 },
    scriptAlignment: { scriptHookTokenCount: 8, matchedTokenRatio: 0.75 },
  }

  it('projects compact facts + the allowed catalogs + frozen features, well under the cap', () => {
    const vw = buildVisualWasteStream({ blankIntervals: [{ startMs: 0, endMs: 2000, classification: 'dead_air', selectableWaste: true }] })
    const s = buildDirectorSummaries({ colorsSource: 'none' }, visual, audio, hook, vw) as Record<string, any>
    expect(s.visual.shotCount).toBe(3)
    expect(s.visual.selectableWasteCount).toBe(1)
    expect(s.visual.faceCoverage).toEqual({ withFace: 4, total: 5 })
    expect(s.audio.integratedLufs).toBe(-16.2)
    expect(s.hook.firstWordStartMs).toBe(120)
    // THE REGRESSION. This was null on every Director call ever made, so the
    // model never knew whether the creator said the hook they were shown —
    // the fact hookTreatment most depends on.
    expect(s.hook.matchedTokenRatio).toBe(0.75)
    expect(s.catalogs.captionPresets).toContain('caption-clean-keyword-v1')
    expect(s.features).toEqual({ autoFillerRemoval: false })
    expect(Buffer.byteLength(canonicalJson(s), 'utf8')).toBeLessThan(MAX_SUMMARY_BYTES)
  })

  it('emits null for absent numeric facts (honest — never a fabricated measurement)', () => {
    const s = buildDirectorSummaries(null, null, null, null, []) as Record<string, any>
    expect(s.audio).toEqual({ integratedLufs: null, truePeakDbtp: null, noiseFloorDb: null, snrDb: null })
    expect(s.hook).toEqual({ firstWordStartMs: null, wordCount: null, matchedTokenRatio: null })
    expect(s.visual.faceCoverage).toBeNull()
    expect(s.visual.shotCount).toBe(0)
  })

  it('CONTROL: a FLAT matchedTokenRatio is ignored — that shape is not what the analyzer writes', () => {
    // Without this, a future edit could re-accept the invented shape and the
    // suite would go green against a component production never emits.
    const flat = { spokenOpening: { firstWordStartMs: 120, wordCount: 8 }, matchedTokenRatio: 0.75 }
    const s = buildDirectorSummaries({ colorsSource: 'none' }, null, null, flat, []) as Record<string, any>
    expect(s.hook.matchedTokenRatio).toBeNull()
  })

  it('a take with no script hook to compare against reports null, not zero', () => {
    // editorHook.ts leaves scriptAlignment null when there was no snapshot
    // hook. "We could not check" must stay distinct from "they said none of it".
    const noScript = { spokenOpening: { firstWordStartMs: 120, wordCount: 8 }, scriptAlignment: null }
    const s = buildDirectorSummaries({ colorsSource: 'none' }, null, null, noScript, []) as Record<string, any>
    expect(s.hook.matchedTokenRatio).toBeNull()
    expect(s.hook.wordCount).toBe(8)
  })

  it('a hook the creator did not say at all reports 0, which is a measurement', () => {
    const missed = {
      spokenOpening: { firstWordStartMs: 120, wordCount: 8 },
      scriptAlignment: { scriptHookTokenCount: 8, matchedTokenRatio: 0 },
    }
    const s = buildDirectorSummaries({ colorsSource: 'none' }, null, null, missed, []) as Record<string, any>
    expect(s.hook.matchedTokenRatio).toBe(0)
  })
})
