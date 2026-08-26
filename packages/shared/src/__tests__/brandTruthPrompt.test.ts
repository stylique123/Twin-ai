import { describe, it, expect } from 'vitest'
import { businessFactLines, businessFactProvenanceCounts, DNA_BUSINESS_FACTS } from '../brandTruthPrompt.js'
import type { BrandTruthSnapshotV1, TruthField } from '../brandTruth.js'

function field(value: string | null, authoritative: boolean): TruthField<string> {
  return value === null
    ? { value: null, provenance: null, confidenceMilli: 0, absenceReason: 'not_produced_by_synthesis', authoritative: false }
    : { value, provenance: authoritative ? 'user_asserted' : 'inferred', confidenceMilli: authoritative ? 1000 : 500, absenceReason: null, authoritative }
}

function snap(bt: Record<string, TruthField<string>>): BrandTruthSnapshotV1 {
  return { businessTruth: bt } as unknown as BrandTruthSnapshotV1
}

describe('businessFactLines', () => {
  it('marks a creator-asserted fact as theirs', () => {
    const [line] = businessFactLines(snap({ offer: field('A 6-week course', true) }))
    expect(line.stated).toBe(true)
    expect(line.line).toContain('they told us this')
    expect(line.line).not.toContain('guessed')
  })

  // ⚠️ THE LOAD-BEARING CASE. On production, `audiencePain` and `dreamOutcome`
  // were a model guess for 34 of 34 voices that had them, and the prompt said so
  // nowhere. If this assertion is ever relaxed, that state is back.
  it('marks a synthesized fact as a guess, and says not to state it as fact', () => {
    const [line] = businessFactLines(snap({ audiencePain: field('They feel invisible online', false) }))
    expect(line.stated).toBe(false)
    expect(line.line).toContain('Twin guessed this')
    expect(line.line).toContain('do not state it as a fact about them')
  })

  // ⚠️ AUTHORITY, NOT PRESENCE. A confident inference is still an inference.
  // Reading `provenance` or truthiness instead of `authoritative` would pass
  // every other test in this file and fail exactly here.
  it('a high-confidence inference is still a guess', () => {
    const f = field('Busy founders', false)
    f.confidenceMilli = 999
    const [line] = businessFactLines(snap({ audience: f }))
    expect(line.stated).toBe(false)
  })

  it('skips absent and blank fields rather than rendering empties', () => {
    expect(businessFactLines(snap({ offer: field(null, false) }))).toEqual([])
    expect(businessFactLines(snap({ offer: field('   ', true) }))).toEqual([])
  })

  it('returns nothing for a null snapshot, which is a real state', () => {
    expect(businessFactLines(null)).toEqual([])
  })

  it('renders in the declared order so a prompt diff stays readable', () => {
    const bt: Record<string, TruthField<string>> = {}
    for (const [f] of DNA_BUSINESS_FACTS) bt[f] = field(`v-${f}`, false)
    expect(businessFactLines(snap(bt)).map((l) => l.field)).toEqual(DNA_BUSINESS_FACTS.map(([f]) => f))
  })
})

describe('businessFactProvenanceCounts', () => {
  // ⚠️ BOTH NUMBERS. Two guesses out of two is a different script from two of five.
  it('reports stated, guessed and total together', () => {
    const lines = businessFactLines(snap({
      offer: field('A 6-week course', true),
      audience: field('Busy founders', false),
      audiencePain: field('They feel invisible', false),
    }))
    expect(businessFactProvenanceCounts(lines)).toEqual({ stated: 1, guessed: 2, total: 3 })
  })

  it('is all zeros when there is nothing to label', () => {
    expect(businessFactProvenanceCounts([])).toEqual({ stated: 0, guessed: 0, total: 0 })
  })
})
