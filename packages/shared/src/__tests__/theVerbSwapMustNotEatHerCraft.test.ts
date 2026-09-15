// THE OWNER'S CONDITION, VERBATIM, IS THE TEST: "validate the verb-swap
// against the eight good scripts before merging — if it flags anything in
// those, the rule is wrong. Oxford hollow, saddle stitch and signatures have
// no verb form and must survive."
//
// ⚠️ THE EIGHT GOOD SCRIPTS ARE NOT IN THIS REPOSITORY, AND THE FOUR THAT ARE
// WOULD INVERT THE CONDITION. `eval/fixtures/live-runs` holds FOUR runs and
// they are the expected-RED borrowing baseline — fixtures chosen because they
// reproduce reference speech. Passing the verb-swap over those and requiring
// silence would be asserting cleanliness of the samples selected for being
// dirty, on a different axis, which proves nothing either way.
//
// ⚖️ SO THIS VALIDATES THE HALF THAT IS AVAILABLE, AND SAYS WHICH HALF. The
// report quotes good lines verbatim, and those quotes ARE good-script text: a
// smaller sample than eight scripts and drawn from the same session. Every one
// must come back clean, alongside the three craft terms named directly. The
// remaining half needs the scripts themselves and is not claimed here.
import { describe, expect, it } from 'vitest'
import {
  nominalisationsIn, hasNominalisation,
  NOMINALISING_SUFFIXES, CRAFT_EXEMPT, OBSERVED_NOMINALISATIONS,
} from '../nominalisation'

// ── THE THREE THE OWNER NAMED ────────────────────────────────────────────────
describe("the craft terms the owner named must survive", () => {
  const NAMED = ['Oxford hollow', 'saddle stitch', 'signatures']
  for (const term of NAMED) {
    it(`"${term}" is not flagged`, () => {
      expect(nominalisationsIn(term)).toEqual([])
    })
  }

  it('and they survive inside a real sentence, not just alone', () => {
    const line = 'I cut the old glued binding off, take the pages apart into '
      + 'signatures, and sew those signatures back together by hand on tapes.'
    expect(nominalisationsIn(line)).toEqual([])
  })

  it('an Oxford hollow sentence from the same account stays clean', () => {
    expect(hasNominalisation('The Oxford hollow is why it can be opened flat.')).toBe(false)
  })
})

// ── THE GOOD LINES THE REPORT QUOTES ────────────────────────────────────────
//
// ⚖️ THESE ARE THE AVAILABLE STAND-IN FOR THE EIGHT SCRIPTS, AND ONLY THAT.
// Quoted verbatim from the session report's "what is genuinely working" and
// its good/weak table.
describe('every good line the report quotes comes back clean', () => {
  const GOOD = [
    'It goes in the bin. That is the actual end of it.',
    'I stood there holding a sheet pan.',
    'I do not really know why.',
    'I am not going to promise you it lasts forever. I am telling you it can be '
      + 'opened, repaired and rebound again.',
    'nobody dismisses a broken Bible here.',
    'I did not lose speed. I lost the exact thing people were paying for.',
    'it can be opened flat',
    'I started rebinding Bibles because I could not find anyone who would do it properly',
    'most people think a rebind is a new cover',
    'I sew the pages into signatures.',
    'a factory one splits and it is rubbish, mine comes back and I fix it',
    'A glued binding is disposable.',
  ]
  for (const line of GOOD) {
    it(`clean: "${line.slice(0, 52)}${line.length > 52 ? '…' : ''}"`, () => {
      expect(nominalisationsIn(line), `flagged: ${JSON.stringify(nominalisationsIn(line))}`)
        .toEqual([])
    })
  }

  it('the whole set at once is clean — 12 lines, zero hits', () => {
    const all = GOOD.join(' ')
    expect(nominalisationsIn(all)).toEqual([])
  })
})

// ── THE WEAK ONES MUST BE CAUGHT, OR THE RULE DOES NOTHING ──────────────────
//
// ⚠️ A RULE THAT FLAGS NOTHING PASSES EVERY FALSE-POSITIVE TEST ABOVE. Without
// this block the suite would be satisfied by `return []`, which is the vacuous
// pass this repo has been bitten by before.
describe('the abstractions the report measured are caught', () => {
  const WEAK: Array<[string, string]> = [
    ['repairability', 'it can be repaired'],
    ['durability', 'it lasts'],
    ['disposability', 'it goes in the bin'],
    ['consistency', 'it is the same every time'],
  ]
  for (const [word, verb] of WEAK) {
    it(`"${word}" is flagged and names its verb`, () => {
      const hits = nominalisationsIn(`What matters here is the ${word} of the thing.`)
      expect(hits.length).toBe(1)
      expect(hits[0].word).toBe(word)
      expect(hits[0].verb).toBe(verb)
    })
  }

  it('"nutrient density" is caught on its head noun', () => {
    const hits = nominalisationsIn('It is about nutrient density.')
    expect(hits.map((h) => h.word)).toContain('density')
  })

  it('the report sentence that works for any niche is caught', () => {
    // "Consistency is the foundation of success" — the category-transplant
    // example. It must not pass.
    expect(hasNominalisation('Consistency is the foundation of success.')).toBe(true)
  })

  it('an unlisted -ability word is still caught by the suffix rule', () => {
    // The observed list can never be complete, so the suffix carries the rest.
    const hits = nominalisationsIn('the washability of the cover')
    expect(hits.length).toBe(1)
    expect(hits[0].by).toBe('suffix')
    expect(hits[0].verb).toBeNull()
  })
})

// ── THE RULE'S OWN SHAPE ────────────────────────────────────────────────────
describe('the rule is narrow on purpose', () => {
  it('only -ability and -ibility, so craft nouns cannot be swept up', () => {
    expect([...NOMINALISING_SUFFIXES]).toEqual(['ability', 'ibility'])
    // The four suffixes that WOULD eat her vocabulary.
    for (const bad of ['ure', 'age', 'ing', 'al']) {
      expect([...NOMINALISING_SUFFIXES]).not.toContain(bad)
    }
  })

  it('the exempt set is consulted before any rule fires', () => {
    // 'accessibility' ends in -ibility and is exempt; if the suffix rule ran
    // first it would be flagged anyway.
    expect(CRAFT_EXEMPT.has('accessibility')).toBe(true)
    expect(nominalisationsIn('accessibility matters')).toEqual([])
  })

  // ⚠️ MY FIRST VERSION OF THIS TEST WAS VACUOUS AND A MUTANT PROVED IT. It
  // asserted `nominalisationsIn(null/undefined/42)` is `[]`, which a mutant
  // that COERCES with `String(text ?? '')` also satisfies — `String(42)` is
  // two characters and gets filtered by length, so refusing and coercing look
  // identical for every value I had chosen. The test was wrong, not the code.
  //
  // ⚖️ SO IT DISCRIMINATES NOW: an object whose `toString` yields a flagged
  // word. Refusing returns nothing; coercing returns a verdict on text nobody
  // wrote, which is the defect the type check exists to prevent.
  it('a non-string is refused, not coerced into a verdict', () => {
    const pretender = { toString: () => 'durability' }
    expect(nominalisationsIn(pretender as unknown as string)).toEqual([])
    expect(nominalisationsIn(null)).toEqual([])
    expect(nominalisationsIn(undefined)).toEqual([])
    expect(nominalisationsIn(42)).toEqual([])
    expect(nominalisationsIn('')).toEqual([])
    // The positive control: the same word IS flagged when it really is text.
    expect(nominalisationsIn('durability').length).toBe(1)
  })

  it('each word is reported once however often it appears', () => {
    const hits = nominalisationsIn('durability and durability and more durability')
    expect(hits.length).toBe(1)
  })

  it('every observed entry carries a verb, since that IS the claim', () => {
    for (const [word, verb] of Object.entries(OBSERVED_NOMINALISATIONS)) {
      expect(verb, `${word} has no verb recorded`).toBeTruthy()
      expect(verb.length, `${word}'s verb is too short to be one`).toBeGreaterThan(2)
    }
  })
})
