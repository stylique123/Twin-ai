// Track C · Batch A.5 controls.
//
// Two claims carry the weight:
//   1. A provider-authored number cannot be filed as a measurement. The stored
//      `words_per_min` is the model's echo of a hint, and the real value is
//      recomputed server-side from word timings.
//   2. A cited evidence id must have been ISSUED. §6 forbids the model from
//      creating one, and a derived id makes a fabricated citation detectable
//      rather than merely forbidden.
import { describe, it, expect } from 'vitest'
import {
  normalizeReferenceEvidence, validateNormalizedEvidence, assertEvidenceIdsAreIssued,
  citableEvidence, issueEvidenceId, EvidenceError,
  MISSING_EVIDENCE_TYPES, type NormalizeInput, type NormalizedReferenceEvidenceV1,
} from '../referenceEvidence.js'

const REF = 'ref-1'
const ANA = 'ana-1'
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** 200 words over 60 s = exactly 200 wpm, so the measurement is checkable by hand. */
const words = (n = 200, span = 60): Array<{ start: number; end: number }> =>
  Array.from({ length: n }, (_, i) => ({ start: (i * span) / n, end: (i * span) / n + 0.2 }))

const input = (over: Partial<NormalizeInput> = {}): NormalizeInput => ({
  referenceId: REF,
  analysisId: ANA,
  structure: {
    format_label: 'The Trust Builder',
    hook_window_sec: 2.5,
    why_it_works: ['opens an unresolved loop', 'payoff lands before the scroll point'],
    beats: [
      { at_sec: 0, beat: 'cold open claim', goal: 'stop the scroll' },
      { at_sec: 6.5, beat: 'proof', goal: 'earn belief' },
    ],
    cta: 'comment PLAN',
    words_per_min: 200,
  },
  transcript: { platform: 'instagram', language: 'en', durationSec: 61.2, words: words() },
  ...over,
})

const byType = (ev: NormalizedReferenceEvidenceV1, t: string) => ev.items.filter((i) => i.type === t)

describe('the four kinds are kept apart', () => {
  it('transcript facts are observed or measured; provider output is interpreted', () => {
    const ev = validateNormalizedEvidence(normalizeReferenceEvidence(input()))
    expect(byType(ev, 'reference_platform')[0].kind).toBe('observed')
    expect(byType(ev, 'reference_language')[0].kind).toBe('observed')
    expect(byType(ev, 'reference_duration_sec')[0].kind).toBe('measured')
    expect(byType(ev, 'measured_words_per_minute')[0].kind).toBe('measured')
    for (const t of ['format_label', 'hook_window_sec', 'stated_cta', 'why_it_works_claim', 'narrative_beat']) {
      for (const i of byType(ev, t)) expect(i.kind, `${t} should be interpretation`).toBe('interpreted')
    }
  })

  it('every §3 gap is recorded as UNKNOWN with a reason, not omitted', () => {
    // "We did not look" and "there is nothing there" must not be the same shape.
    const ev = normalizeReferenceEvidence(input())
    for (const t of MISSING_EVIDENCE_TYPES) {
      const i = byType(ev, t)[0]
      expect(i, `${t} missing entirely`).toBeDefined()
      expect(i.kind).toBe('unknown')
      expect(i.value).toBeNull()
      expect(i.unknownReason).toMatch(/brand_default or reject/)
    }
  })

  it('unknown evidence is never citable', () => {
    const ev = normalizeReferenceEvidence(input())
    const citable = citableEvidence(ev)
    expect(citable.length).toBeGreaterThan(0)
    for (const i of citable) expect(i.kind).not.toBe('unknown')
    expect(citable.length).toBe(ev.items.length - MISSING_EVIDENCE_TYPES.length)
  })

  it('MUTATION: an unknown carrying a value is refused', () => {
    const ev = clone(normalizeReferenceEvidence(input()))
    const u = ev.items.find((i) => i.kind === 'unknown')!
    u.value = 'something'
    expect(() => validateNormalizedEvidence(ev)).toThrow(/unknown but carries a value/)
  })

  it('MUTATION: an unknown with no reason is refused', () => {
    const ev = clone(normalizeReferenceEvidence(input()))
    ev.items.find((i) => i.kind === 'unknown')!.unknownReason = null
    expect(() => validateNormalizedEvidence(ev)).toThrow(/unknown with no reason/)
  })
})

// ------------------------------------------------- the words_per_min finding
describe('a provider-authored number cannot be laundered into a measurement', () => {
  it('structure.words_per_min is filed as INTERPRETED, and the real value is recomputed', () => {
    const ev = normalizeReferenceEvidence(input())
    const stated = byType(ev, 'stated_words_per_minute')[0]
    const measured = byType(ev, 'measured_words_per_minute')[0]
    expect(stated.kind).toBe('interpreted')
    expect(stated.sourcePath).toBe('structure.words_per_min')
    expect(measured.kind).toBe('measured')
    // 200 words over 60 s. Computed here, not taken from the provider.
    expect(measured.value).toBe(200)
    expect(measured.sourcePath).toBe('derived:transcript.words')
  })

  it('a disagreement between the echo and the measurement is RECORDED', () => {
    // The provider ignored the hint and wrote its own number.
    const i = input()
    ;(i.structure as Record<string, unknown>).words_per_min = 320
    const ev = validateNormalizedEvidence(normalizeReferenceEvidence(i))
    const c = ev.conflicts.find((x) => x.type === 'stated_words_per_minute')
    expect(c, 'the echo diverged from the measurement and nothing recorded it').toBeDefined()
    expect(c!.candidates).toHaveLength(2)
    expect(c!.candidates.map((x) => x.kind).sort()).toEqual(['interpreted', 'measured'])
    expect(c!.note).toMatch(/echo of a hint/)
  })

  it('AGREEMENT is not a conflict — a faithful echo stays quiet', () => {
    // Otherwise every reference would carry noise and the real divergence would
    // be invisible. 200 measured vs 205 stated is inside the rounding band.
    const i = input()
    ;(i.structure as Record<string, unknown>).words_per_min = 205
    expect(normalizeReferenceEvidence(i).conflicts).toHaveLength(0)
  })

  it('with no word timings there is NO measurement at all, and no conflict is invented', () => {
    // The honest answer when the instrument is absent. The echo remains, still
    // labelled as interpretation.
    const ev = normalizeReferenceEvidence(input({
      transcript: { platform: 'instagram', language: 'en', durationSec: 61.2, words: null },
    }))
    expect(byType(ev, 'measured_words_per_minute')).toHaveLength(0)
    expect(ev.conflicts).toHaveLength(0)
    expect(byType(ev, 'stated_words_per_minute')[0].kind).toBe('interpreted')
  })

  it('MUTATION: filing a structure-sourced item as `measured` is refused', () => {
    // THE control on the rule. If a future edit relabelled the echo, this fires.
    const ev = clone(normalizeReferenceEvidence(input()))
    ev.items.find((i) => i.type === 'stated_words_per_minute')!.kind = 'measured'
    expect(() => validateNormalizedEvidence(ev)).toThrow(/Model output is interpretation, not measurement/)
  })

  it('MUTATION: filing a structure-sourced item as `observed` is refused too', () => {
    const ev = clone(normalizeReferenceEvidence(input()))
    ev.items.find((i) => i.type === 'format_label')!.kind = 'observed'
    expect(() => validateNormalizedEvidence(ev)).toThrow(/filed as observed/)
  })

  it('CONTROL ON THE CONTROLS: the unmutated evidence validates', () => {
    expect(() => validateNormalizedEvidence(normalizeReferenceEvidence(input()))).not.toThrow()
  })
})

// ------------------------------------------------------ server-issued ids
describe('evidence ids are issued by the server and citations are checkable', () => {
  it('ids are deterministic for the same analysis', () => {
    const a = normalizeReferenceEvidence(input())
    const b = normalizeReferenceEvidence(input())
    expect(b.items.map((i) => i.evidenceId)).toEqual(a.items.map((i) => i.evidenceId))
  })

  it('ids name their analysis, so two analyses cannot collide', () => {
    const a = normalizeReferenceEvidence(input())
    const b = normalizeReferenceEvidence(input({ analysisId: 'ana-2' }))
    const overlap = new Set(a.items.map((i) => i.evidenceId))
    for (const i of b.items) expect(overlap.has(i.evidenceId), `${i.evidenceId} collided`).toBe(false)
  })

  it('a real citation passes the membership gate', () => {
    const ev = normalizeReferenceEvidence(input())
    const ids = citableEvidence(ev).slice(0, 3).map((i) => i.evidenceId)
    expect(ids.length).toBe(3)
    expect(() => assertEvidenceIdsAreIssued(ev, ids)).not.toThrow()
  })

  it('MUTATION: a FABRICATED citation is refused', () => {
    // §6: the model cannot create evidence ids. This is what makes that
    // enforceable rather than aspirational — the id is derived, so the server
    // can recompute the legal set and reject anything outside it.
    const ev = normalizeReferenceEvidence(input())
    expect(() => assertEvidenceIdsAreIssued(ev, ['ev:ana-1:narrative_beat:99']))
      .toThrow(/was not issued/)
    expect(() => assertEvidenceIdsAreIssued(ev, ['totally-made-up']))
      .toThrow(/was not issued/)
    // A well-formed id from ANOTHER analysis is still not issued for this one.
    expect(() => assertEvidenceIdsAreIssued(ev, [issueEvidenceId('ana-2', 'stated_cta', 0)]))
      .toThrow(/was not issued/)
  })

  it('a hostile analysis id cannot smuggle structure into an evidence id', () => {
    expect(() => issueEvidenceId('ana:1', 'stated_cta', 0)).toThrow(EvidenceError)
    expect(() => issueEvidenceId('../etc', 'stated_cta', 0)).toThrow(EvidenceError)
    expect(() => issueEvidenceId('ana-1', 'stated_cta', -1)).toThrow(EvidenceError)
  })

  it('MUTATION: duplicate ids are refused', () => {
    const ev = clone(normalizeReferenceEvidence(input()))
    ev.items[1].evidenceId = ev.items[0].evidenceId
    expect(() => validateNormalizedEvidence(ev)).toThrow(/duplicate evidence id/)
  })

  it('MUTATION: an item naming a different analysis is refused', () => {
    const ev = clone(normalizeReferenceEvidence(input()))
    ev.items[0].analysisId = 'ana-2'
    expect(() => validateNormalizedEvidence(ev)).toThrow(/different analysis/)
  })
})

describe('a missing analysis degrades honestly', () => {
  it('no structure and no transcript still yields the unknown set', () => {
    const ev = validateNormalizedEvidence(normalizeReferenceEvidence({
      referenceId: REF, analysisId: ANA, structure: null, transcript: null,
    }))
    expect(ev.items).toHaveLength(MISSING_EVIDENCE_TYPES.length)
    expect(citableEvidence(ev)).toHaveLength(0)
    // Nothing citable means no dimension can transfer, which is the correct
    // outcome for a reference nobody analysed.
  })

  it('identifiers are required', () => {
    expect(() => normalizeReferenceEvidence({ referenceId: '', analysisId: ANA, structure: null, transcript: null }))
      .toThrow(EvidenceError)
    expect(() => normalizeReferenceEvidence({ referenceId: REF, analysisId: '  ', structure: null, transcript: null }))
      .toThrow(EvidenceError)
  })
})
