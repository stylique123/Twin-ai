import { describe, expect, it } from 'vitest'
import {
  CandidatePoolError,
  PROHIBITED_EVIDENCE_TYPES,
  buildCandidatePool,
  poolContains,
  prohibitedCoverage,
} from '../transferCandidates'
import { PROHIBITED_TRANSFERS } from '../creativeTransferPlan'
import { citableEvidence, normalizeReferenceEvidence } from '../referenceEvidence'

const REF = 'ref-1'
const REF2 = 'ref-2'
const ANA = 'ana-1'
const ANA2 = 'ana-2'

/** A reference whose analysis includes a CTA and a why-it-works claim. */
function evidenceFor(referenceId: string, analysisId: string) {
  return normalizeReferenceEvidence({
    referenceId,
    analysisId,
    // The stored analysis exactly as worker/src/structure.ts produces it.
    structure: {
      format_label: 'talking head with proof beat',
      hook_window_sec: 3,
      beats: [
        { beat: 'unresolved question', at_sec: 0, goal: 'stop the scroll' },
        { beat: 'proof', at_sec: 8, goal: 'earn belief' },
        { beat: 'resolution', at_sec: 30, goal: 'land the point' },
      ],
      cta: 'buy the programme today',
      why_it_works: ['this format reliably doubles retention'],
      words_per_min: 150,
    },
    transcript: {
      platform: 'instagram', language: 'en', durationSec: 42,
      words: [{ start: 0, end: 0.4 }, { start: 0.4, end: 0.9 }, { start: 1.0, end: 1.5 }],
    },
  })
}

const EV = evidenceFor(REF, ANA)
const POOL = buildCandidatePool({ [REF]: EV })

describe('§7 Step 3: prohibited material is removed from the candidate pool', () => {
  it('the pool is not empty — the filter is not vacuous', () => {
    expect(POOL.byReference[REF].length).toBeGreaterThan(0)
  })

  it('a stated CTA is excluded as an offer', () => {
    const cta = EV.items.find((i) => i.type === 'stated_cta')
    expect(cta).toBeDefined()
    const ex = POOL.excluded.find((e) => e.evidenceId === cta!.evidenceId)
    expect(ex?.reason).toBe('prohibited_category')
    expect(ex?.prohibition).toBe('offer')
  })

  it('a why-it-works claim is excluded as a factual claim', () => {
    const claim = EV.items.find((i) => i.type === 'why_it_works_claim')
    expect(claim).toBeDefined()
    const ex = POOL.excluded.find((e) => e.evidenceId === claim!.evidenceId)
    expect(ex?.reason).toBe('prohibited_category')
    expect(ex?.prohibition).toBe('factual_claims')
  })

  // THE POINT OF THE WHOLE MODULE. Not "the planner declined to use it" —
  // unreachable. The validator is the second line, not the only one.
  it('HOSTILE: a prohibited evidence id is UNREACHABLE, not merely unselected', () => {
    let checked = 0
    for (const item of EV.items) {
      if (PROHIBITED_EVIDENCE_TYPES[item.type] === undefined) continue
      checked += 1
      expect(poolContains(POOL, item.evidenceId)).toBe(false)
    }
    // Without this the assertion above is skipped entirely on a fixture that
    // happens to carry no prohibited item, and a green test would mean only
    // that the loop never ran.
    expect(checked, 'the fixture carries no prohibited evidence — this test proved nothing')
      .toBe(Object.keys(PROHIBITED_EVIDENCE_TYPES).length)
  })

  it('CONTROL: a permitted evidence id IS reachable', () => {
    const beat = EV.items.find((i) => i.type === 'narrative_beat' && i.kind !== 'unknown')
    expect(beat).toBeDefined()
    expect(poolContains(POOL, beat!.evidenceId)).toBe(true)
  })

  it('every exclusion carries a reason — nothing is dropped silently', () => {
    const citable = new Set(citableEvidence(EV).map((i) => i.evidenceId))
    const kept = new Set(POOL.byReference[REF].map((i) => i.evidenceId))
    for (const item of EV.items) {
      const accounted = kept.has(item.evidenceId)
        || POOL.excluded.some((e) => e.evidenceId === item.evidenceId)
      expect(accounted, `${item.evidenceId} (${item.type}) is unaccounted for`).toBe(true)
    }
    // …and the two sets do not overlap.
    for (const e of POOL.excluded) expect(kept.has(e.evidenceId)).toBe(false)
    expect(kept.size + POOL.excluded.length).toBe(EV.items.length)
    void citable
  })

  it('unmeasured (`unknown`) evidence is excluded as absent, not as rejected', () => {
    const unknowns = EV.items.filter((i) => i.kind === 'unknown')
    expect(unknowns.length).toBeGreaterThan(0)
    for (const u of unknowns) {
      const ex = POOL.excluded.find((e) => e.evidenceId === u.evidenceId)
      expect(ex?.reason).toBe('unknown_value')
      expect(ex?.prohibition).toBeNull()
    }
  })
})

describe('the pool cannot misattribute one reference to another', () => {
  it('HOSTILE: evidence filed under the wrong key is refused', () => {
    const other = evidenceFor(REF2, ANA2)
    expect(() => buildCandidatePool({ [REF]: other })).toThrow(/is labelled ref-2/)
  })

  it('CONTROL: correctly filed evidence for two references builds both pools', () => {
    const pool = buildCandidatePool({ [REF]: EV, [REF2]: evidenceFor(REF2, ANA2) })
    expect(Object.keys(pool.byReference).sort()).toEqual([REF, REF2])
    expect(pool.byReference[REF2].length).toBeGreaterThan(0)
  })

  it('a non-object evidence map is refused', () => {
    // @ts-expect-error deliberately wrong shape
    expect(() => buildCandidatePool([])).toThrow(CandidatePoolError)
  })
})

describe('coverage is reported honestly, not overclaimed', () => {
  it('names every frozen prohibition', () => {
    expect(prohibitedCoverage().map((c) => c.prohibition).sort())
      .toEqual([...PROHIBITED_TRANSFERS].sort())
  })

  // The filter maps evidence TYPES onto prohibitions. Most prohibitions have no
  // evidence type at all, and this asserts the module says so rather than
  // implying the whole §6 list is enforced here.
  it('reports the prohibitions it does NOT filter here', () => {
    const unfiltered = prohibitedCoverage().filter((c) => !c.filteredHere).map((c) => c.prohibition)
    expect(unfiltered).toContain('creator_identity')
    expect(unfiltered).toContain('voice_or_likeness')
    expect(unfiltered).toContain('copyrighted_expression')
  })

  it('…and the ones it does', () => {
    const filtered = prohibitedCoverage().filter((c) => c.filteredHere).map((c) => c.prohibition).sort()
    expect(filtered).toEqual(['factual_claims', 'offer'])
  })
})
