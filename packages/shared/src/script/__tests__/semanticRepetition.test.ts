import { describe, it, expect } from 'vitest'
import {
  isSubstantiveSoftBeat,
  evaluateSemanticRepetitionTrigger,
  readSemanticRepetitionRepair,
  type SemanticRepetitionBeat,
} from '../semanticRepetition'

const setup = (line: string): SemanticRepetitionBeat => ({ section: 'Setup', line })
const story = (line: string): SemanticRepetitionBeat => ({ section: 'Story', line })
const hook = (line: string): SemanticRepetitionBeat => ({ section: 'Hook', line })
const cta = (line: string): SemanticRepetitionBeat => ({ section: 'CTA', line })
const payoff = (line: string): SemanticRepetitionBeat => ({ section: 'The payoff', line })
const rehook = (line: string): SemanticRepetitionBeat => ({ section: 'Re-hook', line })

describe('what counts as a substantive soft beat', () => {
  it('a real line in a non-craft section is substantive', () => {
    expect(isSubstantiveSoftBeat(setup('I spent three years failing at this.'))).toBe(true)
  })

  it.each([hook, cta, payoff])('a craft-section beat is never substantive', (make) => {
    expect(isSubstantiveSoftBeat(make('Some real spoken words here.'))).toBe(false)
  })

  it('the re-hook is not craft and can be substantive', () => {
    expect(isSubstantiveSoftBeat(rehook('And that changed everything for me.'))).toBe(true)
  })

  it('a blank line is not substantive, even outside a craft section', () => {
    expect(isSubstantiveSoftBeat(setup(''))).toBe(false)
    expect(isSubstantiveSoftBeat(setup('   '))).toBe(false)
  })

  it('a non-string line is not substantive', () => {
    expect(isSubstantiveSoftBeat({ section: 'Setup', line: undefined })).toBe(false)
  })

  it('an out-of-range beat is not substantive', () => {
    expect(isSubstantiveSoftBeat(undefined)).toBe(false)
  })
})

describe('the trigger — 2+ substantive pairs, never the rejected payoff branch', () => {
  it('zero pairs never trigger', () => {
    const beats = [setup('a'), setup('b')]
    const r = evaluateSemanticRepetitionTrigger(beats, [])
    expect(r.trigger).toBe(false)
    expect(r.substantivePairs).toEqual([])
  })

  it('one substantive pair does not trigger — the count must be 2 or more', () => {
    const beats = [
      setup('I used to dread every Monday morning at that job.'),
      story('Every Monday I dreaded going into that same office job.'),
    ]
    const r = evaluateSemanticRepetitionTrigger(beats, [{ a: 0, b: 1 }])
    expect(r.trigger).toBe(false)
    expect(r.substantivePairs).toHaveLength(1)
  })

  it('two substantive pairs trigger — the exact "2+ substantive" condition', () => {
    const beats = [
      setup('I used to dread every Monday morning at that job.'),
      story('Every Monday I dreaded going into that same office job.'),
      setup('The product saved me hours every single week I used it.'),
      story('Every week I used the product it saved me real hours.'),
    ]
    const r = evaluateSemanticRepetitionTrigger(beats, [{ a: 0, b: 1 }, { a: 2, b: 3 }])
    expect(r.trigger).toBe(true)
    expect(r.substantivePairs).toHaveLength(2)
  })

  // ⚠️ THE REJECTED BRANCH. G20: a trigger keyed off the payoff section,
  // measured across counts 1-6, lost its blind test 1-6 and must not ship. A
  // judge reporting many pairs that all touch craft sections (hook/CTA/
  // payoff) must NEVER trigger repair, no matter how many are reported.
  it('any number of craft-only pairs never triggers — this is the branch G20 forbids', () => {
    const beats = [hook('Stop scrolling, you need to hear this.'), cta('Follow for more like this.'),
      payoff('That is the whole secret right there.')]
    const pairs = [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 1, b: 2 }]
    const r = evaluateSemanticRepetitionTrigger(beats, pairs)
    expect(r.trigger).toBe(false)
    expect(r.substantivePairs).toEqual([])
  })

  it('a mixed pair (one craft beat, one substantive beat) does not count', () => {
    const beats = [cta('Follow for more content like this one.'), setup('Real personal substance here.')]
    const r = evaluateSemanticRepetitionTrigger(beats, [{ a: 0, b: 1 }])
    expect(r.trigger).toBe(false)
  })

  it('malformed indices (equal, non-integer, out of range) are ignored, not counted', () => {
    const beats = [setup('a real substantive line here'), setup('another real substantive line')]
    const r = evaluateSemanticRepetitionTrigger(beats, [
      { a: 0, b: 0 },
      { a: 0.5, b: 1 },
      { a: 0, b: 5 },
    ])
    expect(r.substantivePairs).toEqual([])
    expect(r.trigger).toBe(false)
  })
})

/**
 * ⚠️ MUTATION TEST, DOCUMENTED. Ran with the trigger's `>= 2` changed to
 * `>= 1` (the rejected shape the "any single pair" version would take): the
 * "one substantive pair does not trigger" test above failed with
 * `expected false, received true` — proving the >=2 boundary is actually
 * load-bearing rather than decorative. Restored to `>= 2` before commit.
 */
describe('the boundary is exact', () => {
  it('exactly two is the trigger point, one below is not', () => {
    const beats = [setup('one substantive line of real content'), story('two substantive line of real content'),
      setup('three substantive line of real content')]
    const two = evaluateSemanticRepetitionTrigger(beats, [{ a: 0, b: 1 }, { a: 1, b: 2 }])
    const one = evaluateSemanticRepetitionTrigger(beats, [{ a: 0, b: 1 }])
    expect(two.trigger).toBe(true)
    expect(one.trigger).toBe(false)
  })
})

// FIX 8b's reader. The judge writes `beat_audit.semantic_repetition`; nothing
// in the UI read it until this — this is what closes that gap.
describe('readSemanticRepetitionRepair — the UI-facing reader', () => {
  it('reads target and candidates from a landed, triggered repair', () => {
    const beatAudit = {
      semantic_repetition: {
        ran: true, trigger: true, repair_target: 4,
        repair_candidates: ['Rewrite one.', 'Rewrite two.', 'Rewrite three.'],
      },
    }
    expect(readSemanticRepetitionRepair(beatAudit)).toEqual({
      repairTarget: 4,
      repairCandidates: ['Rewrite one.', 'Rewrite two.', 'Rewrite three.'],
    })
  })

  it.each([
    ['no beat_audit at all', undefined],
    ['not an object', 'not an object'],
    ['no semantic_repetition key', {}],
    ['the judge did not trigger', { semantic_repetition: { ran: true, trigger: false, repair_target: null, repair_candidates: null } }],
    ['the repair call failed', { semantic_repetition: { ran: true, trigger: true, repair_target: 4, repair_candidates: null } }],
    ['candidates is not an array', { semantic_repetition: { repair_target: 4, repair_candidates: 'nope' } }],
    ['target is not an integer', { semantic_repetition: { repair_target: 1.5, repair_candidates: ['a', 'b', 'c'] } }],
    ['candidates are all blank', { semantic_repetition: { repair_target: 4, repair_candidates: ['', '  '] } }],
  ])('returns null when %s', (_label, beatAudit) => {
    expect(readSemanticRepetitionRepair(beatAudit)).toBeNull()
  })
})
