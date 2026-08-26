import { describe, it, expect } from 'vitest'
import {
  contentTokens, isDeliberateRestatement, lexicalFloor,
} from '../repetition.js'

const beat = (line: string, section?: string) => ({ line, section })

describe('the beats that restate on purpose are never judged', () => {
  // ⚠️ THE LOAD-BEARING EXEMPTION. #41 was a bug report about the teleprompter
  // DELETING the re-hook beat — it is a feature, and a judge told otherwise
  // would spend its budget flagging the format.
  it.each(['Re-hook', 're-hook', 'REHOOK', 'CTA', 'Call to action'])(
    'section %s restates by design', (section) => {
      expect(isDeliberateRestatement(beat('same promise again', section))).toBe(true)
    })

  // ⚠️ `Payoff` WAS ON THE EXEMPT LIST AND THIS TEST ASSERTED IT. Both were
  // wrong. A payoff is the substance a beat DELIVERS, not a restatement of an
  // earlier one, and production carries scripts with "Payoff 1" and "Payoff 2"
  // as two different payoffs — exempting them would hide exactly the repetition
  // worth finding. Only the two sections whose job is to say something again
  // are exempt.
  it.each(['Hook', 'Proof', 'Setup', 'Story', 'Payoff', 'Payoff 1', 'Payoff 2', ''])(
    'section %s does not', (section) => {
      expect(isDeliberateRestatement(beat('a line', section))).toBe(false)
    })

  // ⚠️ UNLABELLED IS UNKNOWN, NOT DELIBERATE. Treating a missing section as
  // exempt would silently exempt everything the moment labelling stopped.
  it.each([[undefined], [null], [42]])('a non-string section is not exempt (%s)', (section) => {
    expect(isDeliberateRestatement({ line: 'x', section } as never)).toBe(false)
  })

  it('exempt beats are excluded from comparison and reported', () => {
    const f = lexicalFloor([
      beat('we ship faster because the pipeline never blocks', 'Hook'),
      beat('we ship faster because the pipeline never blocks', 'Re-hook'),
    ])
    expect(f.exemptBeats).toEqual([1])
    expect(f.pairs).toEqual([])
    expect(f.comparedBeats).toBe(1)
  })
})

describe('the lexical floor', () => {
  it('finds an exact repeat between two judged beats', () => {
    const line = 'founders underestimate how brutal distribution actually becomes'
    const f = lexicalFloor([beat(line, 'Hook'), beat('something else entirely different here', 'Proof'), beat(line, 'Story')])
    const exact = f.pairs.filter((p) => p.exact)
    expect(exact).toHaveLength(1)
    expect(exact[0]!.overlapMilli).toBe(1000)
  })

  it('scores partial overlap against the smaller beat', () => {
    const f = lexicalFloor([
      beat('distribution underestimate founders brutal', 'Hook'),
      beat('distribution underestimate founders brutal channels audience', 'Proof'),
    ])
    expect(f.pairs[0]!.overlapMilli).toBe(1000)
    expect(f.pairs[0]!.exact).toBe(false)
  })

  // ⚠️ SHORT BEATS ARE REPORTED, NOT SILENTLY DROPPED. A low pair count with a
  // hidden denominator reads as a clean script.
  it('beats too short to compare are named', () => {
    const f = lexicalFloor([beat('Hi there', 'Hook'), beat('Yes', 'Proof')])
    expect(f.tooShortBeats).toEqual([0, 1])
    expect(f.comparedBeats).toBe(0)
    expect(f.pairs).toEqual([])
  })

  it('pairs come back strongest first, and ties are stable', () => {
    const f = lexicalFloor([
      beat('alpha bravo charlie delta echo', 'Hook'),
      beat('alpha bravo charlie delta echo', 'Proof'),
      beat('foxtrot golf hotel india juliet', 'Story'),
    ])
    expect(f.pairs[0]!.overlapMilli).toBeGreaterThanOrEqual(f.pairs[1]!.overlapMilli)
    expect(f.pairs[0]).toMatchObject({ a: 0, b: 1 })
  })

  it('an empty script produces no pairs and no crash', () => {
    expect(lexicalFloor([])).toEqual({ pairs: [], exemptBeats: [], tooShortBeats: [], comparedBeats: 0 })
  })
})

describe('contentTokens', () => {
  // Short words overlap everywhere and carry no topic.
  it('drops words shorter than five letters', () => {
    expect(contentTokens('that with your pipeline blocks')).toEqual(['pipeline', 'blocks'])
  })
  it.each([[null], [undefined], [42], [{}]])('a non-string yields nothing (%s)', (v) => {
    expect(contentTokens(v)).toEqual([])
  })
})

// ── THE CASE THAT PRODUCTION FOUND ──────────────────────────────────────────
//
// Generation cba89a95 shipped with FIVE identical beats. An earlier version of
// lexicalFloor scored it clean, because the repeated line yields three content
// tokens and three is below the partial-overlap threshold — so the most
// repetitive script in the corpus was the one the floor could not see.
describe('an exact duplicate counts at any length (production cba89a95)', () => {
  const PLACEHOLDER = 'Only you can supply this. What would you actually say here?'
  const real = [
    { line: PLACEHOLDER, section: 'Hook' },
    { line: PLACEHOLDER, section: 'Setup' },
    { line: PLACEHOLDER, section: 'Re-hook' },
    { line: PLACEHOLDER, section: 'The Turn' },
    { line: PLACEHOLDER, section: 'CTA' },
  ]

  it('finds the repeat among the beats that are not exempt', () => {
    const f = lexicalFloor(real)
    // Re-hook and CTA restate by design and are never judged.
    expect(f.exemptBeats).toEqual([2, 4])
    const exact = f.pairs.filter((p) => p.exact)
    // Hook, Setup and The Turn are three identical judged beats — three pairs.
    expect(exact).toHaveLength(3)
    expect(exact.every((p) => p.overlapMilli === 1000)).toBe(true)
  })

  it('the short beats are still reported as short', () => {
    expect(lexicalFloor(real).tooShortBeats).toEqual([0, 1, 3])
  })

  // ⚠️ AND SHORTNESS STILL SUPPRESSES *PARTIAL* OVERLAP. Two short beats
  // sharing two words are not 50% similar in any useful sense.
  it('two different short beats produce no pair', () => {
    const f = lexicalFloor([
      { line: 'Seriously. Just soap.', section: 'Pacing Break' },
      { line: 'Stop overcomplicating it.', section: 'The Reveal' },
    ])
    expect(f.pairs).toEqual([])
  })
})
