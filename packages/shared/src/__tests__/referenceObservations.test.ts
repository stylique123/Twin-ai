// THE GATE'S PRIMARY INPUT, AND WHERE IT COMES FROM.
//
// ⚠️ `compatibilityVerdicts` HAS NEVER RUN IN PRODUCTION, because `observed`
// was produced by nothing. This is the reader that produces it, and these are
// the rules that keep it from ruling on things nobody measured.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readReferenceObservations, compatibilityVerdicts } from '../compatibilityGate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

const full = {
  beats: [{ at_sec: 0, beat: 'hook', goal: 'stop the scroll' }],
  observations: { shows_product: true, makes_product_claims: true, broll_heavy: false, energy: 'high' },
}

describe('readReferenceObservations — observed means measured', () => {
  it('a structure with no observations block observes only the spine', () => {
    // ⚠️ THE MIGRATION CASE, AND THE ONE THAT MATTERS MOST. Every reference read
    // before this field existed lands here. Reading absent as `false` would tell
    // the gate those videos demonstrate no product — a claim nobody made about
    // hundreds of already-read references.
    const input = readReferenceObservations({ beats: full.beats })
    expect(input.observed).toEqual(['hook_mechanism', 'structure', 'sequencing', 'pacing'])
    expect(input.observed).not.toContain('product_demonstration')
    expect(input.referenceShowsProduct).toBeUndefined()
    // And the gate must SAY so rather than defaulting.
    const v = compatibilityVerdicts(input).find((x) => x.dimension === 'product_demonstration')
    expect(v?.verdict).toBe('NOT_OBSERVED')
  })

  it('`false` is an observation and `undefined` is not', () => {
    // The distinction the whole three-state discipline rests on: "we looked and
    // there is no product" is a finding; "nobody looked" is not.
    const looked = readReferenceObservations({
      beats: full.beats,
      observations: { shows_product: false, makes_product_claims: false, broll_heavy: false, energy: 'calm' },
    })
    expect(looked.observed).toContain('product_demonstration')
    expect(looked.referenceShowsProduct).toBe(false)
  })

  it('a non-boolean is nobody looking, not a value to coerce', () => {
    // The model is schema-constrained, but this row can also arrive from an old
    // derivation, a partial write, or hand-editing. A truthy string must not
    // become `true`.
    const junk = readReferenceObservations({
      beats: full.beats,
      observations: { shows_product: 'yes' as unknown as boolean, energy: 'loud' },
    })
    expect(junk.observed).not.toContain('product_demonstration')
    expect(junk.referenceShowsProduct).toBeUndefined()
    expect(junk.referenceEnergy).toBeNull()
  })

  it('an empty beat list has not measured the spine', () => {
    // A structure derivation that found no beats read nothing about sequencing.
    expect(readReferenceObservations({ beats: [] }).observed).toEqual([])
  })

  it('energy needs BOTH sides, because the dimension is a comparison', () => {
    const refOnly = readReferenceObservations(full)
    expect(refOnly.observed).not.toContain('performance_energy')
    const both = readReferenceObservations(full, 'calm')
    expect(both.observed).toContain('performance_energy')
    // And a genuine mismatch must reach the gate as a rejection.
    expect(compatibilityVerdicts(both).find((x) => x.dimension === 'performance_energy')?.verdict)
      .toBe('REJECT')
  })

  it('never claims to have seen a room, a lens, or a face', () => {
    // ⚖️ A TRANSCRIPT CANNOT SEE. `setting`, `camera_work` and `creator_identity`
    // are absent from every reading, however complete the observations block —
    // ruling on them would put a verdict on something nobody looked at.
    const input = readReferenceObservations(full, 'high')
    for (const d of ['setting', 'camera_work', 'creator_identity']) {
      expect(input.observed).not.toContain(d)
    }
  })

  it('the whole reading survives a null structure', () => {
    // Reference ingest can fail, and `structure` is nullable in the column.
    const input = readReferenceObservations(null)
    expect(input.observed).toEqual([])
    expect(compatibilityVerdicts(input).every((v) => v.verdict === 'NOT_OBSERVED')).toBe(true)
  })
})

// ── THE CROSS-PACKAGE CONTRACT ──────────────────────────────────────────────
describe('worker ↔ shared: the field names must be the same field names', () => {
  const WORKER = readFileSync(join(REPO, 'worker/src/structure.ts'), 'utf8')

  it('every observation this reader looks for is one the worker writes', () => {
    // ⚠️ THE WORKER CANNOT IMPORT @twinai/shared AND SHARED CANNOT IMPORT THE
    // WORKER, so nothing but this test connects the writer to the reader. A
    // rename on either side is silent: the column keeps its old keys, the reader
    // finds nothing, and every dimension quietly becomes NOT_OBSERVED — the gate
    // would report itself blind and CI would stay green.
    for (const key of ['shows_product', 'makes_product_claims', 'broll_heavy', 'energy']) {
      expect(WORKER, key).toContain(`${key}:`)
    }
    // Required in the model's schema, so it cannot answer three of four.
    expect(WORKER).toMatch(/\['shows_product', 'makes_product_claims', 'broll_heavy', 'energy'\]/)
    // And asked for in the prompt — a schema field with no instruction is a
    // field the model fills by guessing.
    expect(WORKER).toContain('observations: what this video DEPENDS ON')
  })
})
