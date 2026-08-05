// §1.1's rule, held: every row carries its evidence, and the nine things we
// never look at are ALWAYS shown.
//
// The failure this guards is specific: a shorter list on a reference we happened
// to extract less from would let absence look like completeness — which is the
// thing §1.1 calls "worse than no trust screen".
import { describe, expect, it } from 'vitest'
import {
  KIND_LABEL, NOT_OBSERVED_SOURCE, notObservedRows, transferRows, transferSummary,
} from '../creativeTransferRows'
import { MISSING_EVIDENCE_TYPES, type NormalizedReferenceEvidenceV1 } from '../referenceEvidence'

const item = (over: Record<string, unknown>) => ({
  evidenceId: 'e1', referenceId: 'r1', analysisId: 'a1',
  type: 'format_label', kind: 'interpreted', value: 'The Trust Builder',
  sourcePath: 'structure.format_label', atSec: null, unknownReason: null, ...over,
})

const set = (items: unknown[]): NormalizedReferenceEvidenceV1 =>
  ({ items, conflicts: [] } as unknown as NormalizedReferenceEvidenceV1)

describe('the gaps are always shown', () => {
  it('with NO evidence at all, every unlooked-at thing still appears', () => {
    const rows = transferRows(null)
    expect(rows).toHaveLength(MISSING_EVIDENCE_TYPES.length)
    expect(rows.every((r) => r.kind === 'unknown')).toBe(true)
    expect(rows.every((r) => r.source === NOT_OBSERVED_SOURCE)).toBe(true)
  })

  it('and they are still all there when plenty WAS extracted', () => {
    const rows = transferRows(set([
      item({}), item({ evidenceId: 'e2', type: 'reference_platform', kind: 'observed', value: 'tiktok' }),
    ]))
    expect(notObservedRows(rows)).toHaveLength(MISSING_EVIDENCE_TYPES.length)
  })

  it('a NOT OBSERVED row never carries a value', () => {
    // A value on a row that says we did not look is the fabricated row.
    for (const r of notObservedRows(transferRows(null))) expect(r.value).toBeNull()
  })
})

describe('the kind is the point, and there are four of them', () => {
  it("a model's reading of the transcript is not labelled OBSERVED", () => {
    // §1.1's own example table says "Story structure OBSERVED from transcript
    // beats". referenceEvidence.ts files narrative_beat as `interpreted`, and
    // the finer distinction is the more honest one — collapsing it back to two
    // states would commit §1.1's over-claim while implementing §1.1.
    const rows = transferRows(set([
      item({ type: 'narrative_beat', kind: 'interpreted', value: 'setup', sourcePath: 'structure.beats[0]' }),
    ]))
    const beat = rows.find((r) => r.type === 'narrative_beat')!
    expect(KIND_LABEL[beat.kind]).toBe('INTERPRETED')
    expect(beat.source).toMatch(/not something we measured/i)
  })

  it('a computed number says it was computed', () => {
    const rows = transferRows(set([
      item({ type: 'measured_words_per_minute', kind: 'measured', value: 148, sourcePath: 'derived:transcript.words' }),
    ]))
    expect(rows.find((r) => r.type === 'measured_words_per_minute')!.source)
      .toMatch(/computed from the transcript/i)
  })

  it('and a read-off-the-file fact says that instead', () => {
    const rows = transferRows(set([
      item({ type: 'reference_platform', kind: 'observed', value: 'tiktok', sourcePath: 'transcript.platform' }),
    ]))
    expect(rows.find((r) => r.type === 'reference_platform')!.source).toMatch(/read directly/i)
  })

  it('every row has a source sentence — there is no evidence-free row', () => {
    const rows = transferRows(set([item({}), item({ evidenceId: 'e2', type: 'stated_cta', value: 'link in bio' })]))
    for (const r of rows) expect(r.source.length).toBeGreaterThan(10)
  })
})

describe('one row per type', () => {
  it('many beats collapse to one story-structure row', () => {
    const rows = transferRows(set([
      item({ evidenceId: 'e1', type: 'narrative_beat', value: 'hook' }),
      item({ evidenceId: 'e2', type: 'narrative_beat', value: 'setup' }),
      item({ evidenceId: 'e3', type: 'narrative_beat', value: 'payoff' }),
    ]))
    expect(rows.filter((r) => r.type === 'narrative_beat')).toHaveLength(1)
  })
})

describe('the summary counts and never scores', () => {
  it('states what was read and what was not', () => {
    const s = transferSummary(transferRows(set([item({})])))
    expect(s).toMatch(/1 thing read from this reference/)
    expect(s).toMatch(new RegExp(`${MISSING_EVIDENCE_TYPES.length} we did not look at`))
  })

  it('nothing read says so plainly', () => {
    expect(transferSummary(transferRows(null))).toMatch(/have not read anything/i)
  })

  it('no summary reads as a rating', () => {
    // A confidence percentage on a trust screen is the joke that writes itself.
    const bad = /\d+\s*%|\bscore\b|\bconfidence\b/i
    expect(transferSummary(transferRows(null))).not.toMatch(bad)
    expect(transferSummary(transferRows(set([item({})])))).not.toMatch(bad)
  })
})
