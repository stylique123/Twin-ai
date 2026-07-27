// The Decision -> compiler boundary. The property under test is that NO Director
// field can be dropped silently: every one is consumed, deferred with a stable
// recorded reason, or rejected.
import { describe, it, expect } from 'vitest'
import {
  adaptDirectorDecision, assertMusicNotImplied, DISPOSITION, DEFERRAL_REASONS,
} from '../jobs/directorDecisionAdapter.js'
import { EditPlanError } from '../jobs/editPlanContract.js'
import type { DirectorDecision } from '../jobs/directorContract.js'

function decision(over: Partial<DirectorDecision> = {}): DirectorDecision {
  return {
    schemaVersion: 1,
    selections: [{ candidateIndex: 0, kind: 'filler', selectionEnabled: 0, startCs: 100, endCs: 140 }],
    keptBoundaries: [0, 10460],
    summary: '',
    pacing: 'balanced',
    music: 'none',
    emphasisWordIndices: [25],
    hookTreatment: 'keep',
    hookStartWordIndex: null,
    visualWasteSelections: [{ wasteIndex: 0, classCode: 3, startCs: 500, endCs: 700 }],
    captionPresetId: 'caption-clean-keyword-v1',
    transitionPolicy: 'hard_cuts_only',
    zoomRequests: [{ anchorWordIndex: 26, intensity: 'medium', reasonCode: 'emphasis_word' }],
    ...over,
  } as DirectorDecision
}

describe('every Director field has an explicit disposition', () => {
  it('the disposition map covers exactly the decision keys, with none left over', () => {
    // If a field is added to DirectorDecision, `Record<keyof DirectorDecision, …>`
    // makes the adapter fail to COMPILE. This test additionally proves the map has
    // no stale entries for fields that were removed.
    const declared = Object.keys(DISPOSITION).sort()
    const actual = Object.keys(decision()).sort()
    expect(declared).toEqual(actual)
  })

  it('every disposition is one of the three allowed outcomes', () => {
    for (const [field, d] of Object.entries(DISPOSITION)) {
      expect(['consume', 'defer', 'reject'], `${field}`).toContain(d)
    }
  })

  it('the previously-dropped fields are now named rather than ignored', () => {
    // These five were silently discarded by the reduced CompileDecision.
    for (const f of ['schemaVersion', 'keptBoundaries', 'summary', 'pacing', 'music']) {
      expect(DISPOSITION[f as keyof typeof DISPOSITION], f).toBeDefined()
    }
  })
})

describe('structured detail survives the boundary', () => {
  it('selections and visual waste keep their typed shape, not just indices', () => {
    const { decision: flat, structured } = adaptDirectorDecision(decision())
    expect(flat.selections).toEqual([0])
    // The compiler still gets the indices it consumes today...
    expect(flat.visualWasteSelections).toEqual([0])
    // ...but the typed originals are not lost on the way in.
    expect(structured.selections[0]).toMatchObject({ candidateIndex: 0, kind: 'filler', startCs: 100, endCs: 140 })
    expect(structured.visualWasteSelections[0]).toMatchObject({ wasteIndex: 0, classCode: 3 })
    expect(structured.keptBoundaries).toEqual([0, 10460])
  })
})

describe('deferrals are recorded, never silent', () => {
  it('a music request is deferred with a stable reason', () => {
    const { deferrals } = adaptDirectorDecision(decision({ music: 'energetic' }))
    expect(deferrals).toContainEqual({ field: 'music', reasonCode: DEFERRAL_REASONS.music })
  })

  it('a non-default pacing is deferred with a stable reason', () => {
    const { deferrals } = adaptDirectorDecision(decision({ pacing: 'punchy' }))
    expect(deferrals).toContainEqual({ field: 'pacing', reasonCode: DEFERRAL_REASONS.pacing })
  })

  it('CONTROL: asking for nothing unimplemented produces NO deferrals', () => {
    // Without this, an adapter that emitted deferrals unconditionally would pass
    // both tests above while telling the user nothing useful.
    expect(adaptDirectorDecision(decision()).deferrals).toEqual([])
  })
})

describe('rejections fail closed', () => {
  it('a future schemaVersion is refused, not best-effort adapted', () => {
    expect(() => adaptDirectorDecision(decision({ schemaVersion: 2 }))).toThrow(EditPlanError)
  })

  it('a plan implying music rendered is refused', () => {
    expect(() => assertMusicNotImplied(null)).not.toThrow()
    expect(() => assertMusicNotImplied('energetic')).toThrow(EditPlanError)
    expect(() => assertMusicNotImplied({ trackId: 'x' })).toThrow(EditPlanError)
  })
})
