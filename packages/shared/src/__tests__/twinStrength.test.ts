import { describe, it, expect } from 'vitest'
import { twinStrength, strengthSentence } from '../twinStrength'

const item = (kind: string, text = 'something', source: string | null = 'transcript') =>
  ({ kind, text, source })

describe('what the twin actually knows', () => {
  it('counts only the kinds that can carry a beat', () => {
    const s = twinStrength([
      item('experience'), item('claim'), item('topic'), item('style_note'),
    ])
    expect(s.substance).toBe(2)
  })

  // ⚠️ EXPERIENCE IS BROKEN OUT BECAUSE IT IS THE PREDICTOR — the kind that
  // makes a script non-generic, and the one captions never produce.
  it('names experiences separately from everything else', () => {
    const s = twinStrength([item('experience'), item('example'), item('claim')])
    expect(s.experiences).toBe(2)
    expect(s.substance).toBe(3)
  })

  // ⚠️ "A BARE INTEGER IS NOT A FIGURE" is the existing, deliberate rule — "3
  // ways to do X" is a count and asserts nothing. My first version of this test
  // used "40 grand", which that rule correctly does not match. THE TEST WAS
  // WRONG. A figure needs a measurement word or a currency mark.
  it('counts a figure only when it sits in a substance kind', () => {
    const s = twinStrength([
      item('experience', 'It cost me $40k'),
      item('topic', 'top 10 dropshipping products'),
    ])
    expect(s.figures).toBe(1)
  })

  // ⚖️ AND A BARE COUNT STILL IS NOT ONE, even inside an experience.
  it('a bare integer in an experience is not a number the creator can assert', () => {
    expect(twinStrength([item('experience', '3 ways I fixed it')]).figures).toBe(0)
  })
})

describe('three states, never two', () => {
  // ⚠️ AN EMPTY STORE HAS NOT BEEN MEASURED — it is not a store that measured
  // badly, and the difference is the whole honesty of this feature.
  it.each([[[]], [null], [undefined]])('%s reports unmeasured, not weak', (rows) => {
    const s = twinStrength(rows as never)
    expect(s.sourceRecorded).toBeNull()
    expect(s.spokenShare).toBeNull()
  })

  // ⚖️ A STORE SCANNED BEFORE `source` EXISTED cannot be judged either.
  it('items with no source at all report false, not zero share', () => {
    const s = twinStrength([item('experience', 'x', null), item('claim', 'y', '')])
    expect(s.sourceRecorded).toBe(false)
    expect(s.spokenShare).toBeNull()
  })

  // ⚠️ 0/0 IS NOT 0%. Rendering a share over zero known sources would report a
  // measured absence where there was no measurement.
  it('the spoken share is computed only over items that record one', () => {
    const s = twinStrength([
      item('experience', 'x', 'transcript'),
      item('claim', 'y', 'caption'),
      item('claim', 'z', null),
    ])
    expect(s.spokenShare).toBe(0.5)
  })

  it('an answered question counts as spoken', () => {
    expect(twinStrength([item('experience', 'x', 'asked')]).spokenShare).toBe(1)
  })
})

describe('the sentence a creator reads', () => {
  it('an unmeasured store says so and asks for nothing it cannot justify', () => {
    const s = strengthSentence(twinStrength([]))
    expect(s.headline).toBe('Your twin has not learned anything yet.')
    expect(s.nudge).not.toBe('')
  })

  it('a store with no usable substance says what is missing', () => {
    const s = strengthSentence(twinStrength([item('topic', 'a', 'caption')]))
    expect(s.headline).toContain('nothing it can say out loud yet')
  })

  it('names stories and numbers, in plain words', () => {
    const s = strengthSentence(twinStrength([
      item('experience', 'I lost 4 clients'),
      item('experience', 'the year I quit'),
      item('claim', 'most people get this wrong'),
    ]))
    expect(s.headline).toBe('Your twin knows 2 real stories and 1 number from you.')
  })

  it('gets the singular right', () => {
    expect(strengthSentence(twinStrength([item('experience', 'one thing')])).headline)
      .toBe('Your twin knows 1 real story from you.')
  })

  // ⚖️ NO NUDGE IS A REAL ANSWER. Inventing a next step for a creator who has
  // done the work is how a helpful meter becomes a nagging one.
  it('stops asking once the creator has enough', () => {
    const rows = Array.from({ length: 5 }, (_, i) => item('experience', `story ${i}`))
    expect(strengthSentence(twinStrength(rows)).nudge).toBe('')
  })

  it('asks for one story when there are none', () => {
    expect(strengthSentence(twinStrength([item('claim', 'a')])).nudge)
      .toContain('One story of your own')
  })

  // ⚠️ NO SCORE, NO PERCENTAGE, NO THEATRE. "87% ready" implies a measurement
  // nobody took and invites optimising a number we invented.
  it.each([
    [[]],
    [[item('experience', 'x')]],
    [[item('claim', 'y'), item('experience', 'z with 12 things')]],
  ])('never renders a percentage or a score for %#', (rows) => {
    const s = strengthSentence(twinStrength(rows as never))
    expect(`${s.headline} ${s.nudge}`).not.toMatch(/%|score|rating|\bout of\b/i)
  })

  // ⚠️ AND IT NEVER NAMES TWIN'S OWN MACHINERY.
  it.each([
    [[]],
    [[item('claim', 'a', null)]],
    [[item('experience', 'a'), item('experience', 'b'), item('experience', 'c')]],
  ])('says nothing about how Twin works for %#', (rows) => {
    const s = strengthSentence(twinStrength(rows as never))
    expect(`${s.headline} ${s.nudge}`.toLowerCase())
      .not.toMatch(/substance|kind|source|transcript|caption|beat|blueprint|entity/)
  })

  // ⚖️ AND IT NEVER CALLS A TWIN WEAK.
  it.each([[[]], [[item('claim', 'a', null)]]])('never says weak or poor for %#', (rows) => {
    const s = strengthSentence(twinStrength(rows as never))
    expect(`${s.headline} ${s.nudge}`.toLowerCase()).not.toMatch(/weak|poor|bad|empty twin/)
  })
})

// ⚠️ G8 — THE FAILURE THIS SUITE EXISTS TO CATCH. Before `productFacts`, a
// creator with product facts and zero creator_knowledge rows read "has not
// learned anything yet" — false, and undetectable by every test above, which
// all pass `undefined`/0 for the new count and would keep passing if it were
// silently dropped from `twinStrength`'s return value or never reached
// `strengthSentence`.
describe('product facts count toward the twin, separately from stories (G8)', () => {
  it('a negative return value is impossible', () => {
    // twinStrength always returns 0 or a positive integer for productFacts.
    expect(twinStrength([], -5).productFacts).toBe(0)
  })

  it('a non-finite count is treated as zero, not NaN', () => {
    expect(twinStrength([], Number.NaN).productFacts).toBe(0)
    expect(twinStrength([], Number.POSITIVE_INFINITY).productFacts).toBe(0)
  })

  it('a fractional count is floored', () => {
    expect(twinStrength([], 2.9).productFacts).toBe(2)
  })

  // ⚠️ THE CASE THAT WAS SILENTLY WRONG. An empty creator_knowledge store with
  // real product facts must not read "has not learned anything yet" — that
  // sentence was a claim about the creator's work, and it was false.
  it('an empty creator_knowledge store with product facts does not say "learned nothing"', () => {
    const s = strengthSentence(twinStrength([], 4))
    expect(s.headline.toLowerCase()).not.toContain('has not learned anything')
    expect(s.headline).toContain('4 facts')
  })

  it('zero product facts renders exactly the pre-G8 sentence — no regression for every real creator today', () => {
    const withZero = strengthSentence(twinStrength([], 0))
    const withDefault = strengthSentence(twinStrength([]))
    expect(withZero).toEqual(withDefault)
    expect(withDefault.headline).toBe('Your twin has not learned anything yet.')
  })

  it('substance is zero but product facts exist — still not "nothing it can say"', () => {
    const s = strengthSentence(twinStrength([item('claim', 'a')], 3))
    expect(s.headline).not.toBe('Your twin knows about your work, but nothing it can say out loud yet.')
    expect(s.headline).toContain('3 product facts')
  })

  it('product facts join the normal sentence, last, only when present', () => {
    const withFacts = strengthSentence(twinStrength([item('experience', 'a')], 2))
    expect(withFacts.headline).toBe('Your twin knows 1 real story and 2 product facts from you.')
    const withoutFacts = strengthSentence(twinStrength([item('experience', 'a')], 0))
    expect(withoutFacts.headline).not.toContain('product fact')
  })

  // ⚖️ SAME DISCIPLINE AS EVERY OTHER FIELD ABOVE: no score, no internal name.
  it('never renders a percentage, a score, or Twin\'s own vocabulary for a product-rich twin', () => {
    const s = strengthSentence(twinStrength([], 7))
    expect(`${s.headline} ${s.nudge}`).not.toMatch(/%|score|rating|\bout of\b/i)
    expect(`${s.headline} ${s.nudge}`.toLowerCase())
      .not.toMatch(/substance|kind|source|entity|extracted/)
  })
})
