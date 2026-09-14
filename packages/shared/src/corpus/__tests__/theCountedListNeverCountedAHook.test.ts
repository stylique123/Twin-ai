// The counted-list pattern could not match "3 reasons", and no hook ever hit it.
//
// WHY THIS FILE EXISTS. `number_promise` read
// `(\d{1,3})\s+\p{L}+(\s+\p{L}+)?\s+(noun)` — a number, then ONE or TWO words,
// THEN the noun. The bare form was structurally excluded, digits-only excluded
// "three", and `\p{L}+` excluded any hyphenated word between the two.
//
// Measured over the 70 distinct hooks production has shipped: the old pattern
// matched ZERO of them. Twenty-two existing tests passed throughout, because
// none of them covered the canonical form — every fixture happened to carry an
// adjective in exactly the position the pattern demanded.
//
// ⚖️ THESE ASSERT BOTH DIRECTIONS. The structure is loosened; the noun
// vocabulary stays closed, and that is the only thing stopping a number word
// from labelling money and headcounts as counted lists.
import { describe, it, expect } from 'vitest'
import { assessedCaptionShape, CAPTION_SHAPE_VERSION } from '../captionShape'

// `assessedCaptionShape` takes the assessment timestamp as its second
// argument. It lands in `assessedAt` and never touches the classification, so
// it is pinned here rather than being `new Date()` — a fixture with a moving
// value in it is a fixture that can differ between runs.
const AT = '2026-09-14T00:00:00.000Z'
// ⚠️ NARROWED, NOT CAST. `Assessed<T>` is a union whose `indeterminate` and
// `not_checked` arms carry NO `value`, so reading `.value` off the union does
// not typecheck. An `as` here would silence the compiler on the one field
// every assertion in this file depends on — the repository's standing lesson.
// `assessedCaptionShape` returns null rather than an indeterminate wrapper, so
// in practice only the two value-bearing arms occur; the guard states that
// rather than assuming it.
const shapeOf = (s: string): string | null => {
  const a = assessedCaptionShape(s, AT)
  if (a === null) return null
  return a.basis === 'observed' || a.basis === 'inferred' ? a.value : null
}

describe('the bare counted list, which was impossible before', () => {
  it('"3 reasons ..." is a number_promise — the case the old pattern could not reach', () => {
    // Verbatim from production. The most canonical form of this shape.
    expect(shapeOf('3 reasons you are going to stay poor.')).toBe('number_promise')
  })

  it('"Here are the 3 reasons ..." too — six production hooks opened this way', () => {
    expect(shapeOf('Here are the 3 reasons you stay poor even though you work all day.'))
      .toBe('number_promise')
  })
})

describe('what sits between the number and the noun', () => {
  it('an adjective RUN is allowed — "3 critical ACL recovery rules"', () => {
    expect(shapeOf('Here are 3 critical ACL recovery rules every patient needs to know.'))
      .toBe('number_promise')
  })

  it('a HYPHENATED word is allowed — `\\p{L}+` alone excluded it', () => {
    expect(shapeOf('Beating your competition is simple. Avoid these 3 business-killing mistakes.'))
      .toBe('number_promise')
  })

  it('a number WORD counts the same as a digit', () => {
    expect(shapeOf('Most people stay poor because they make these three mistakes.'))
      .toBe('number_promise')
  })

  it('but the noun must be NEAR the number — a distant plural is not a counted list', () => {
    // ⚠️ THE BOUNDARY, AND THE FIRST VERSION OF THIS TEST DID NOT TEST IT. It
    // used a fixture whose plural sat ELEVEN words after the number, so a
    // mutant raising the cap to nine still passed — the noun was out of reach
    // either way. The test was wrong, not the cap. Here "lessons" sits SIX
    // words after "3": beyond the cap of three, inside a loosened one.
    //
    // And it is a genuine negative: the three counts YEARS, not lessons. Same
    // family as the price and headcount traps below, but with a noun that IS
    // on the list, which is what makes it the sharper case.
    expect(shapeOf('I spent 3 years learning these painful business lessons'))
      .not.toBe('number_promise')
  })
})

describe('⚠️ the closed noun list is the precision guard', () => {
  it('a PRICE is not a counted list', () => {
    expect(shapeOf('I priced my first kit at nine dollars and almost nobody bought.'))
      .not.toBe('number_promise')
  })

  it('a HEADCOUNT is not a counted list', () => {
    expect(shapeOf('I turned down three clients, then my waitlist started.'))
      .not.toBe('number_promise')
  })

  it('money in the middle of a sentence is not a counted list', () => {
    expect(shapeOf('POV: you just realized you have three dollars but the group chat is making plans.'))
      .not.toBe('number_promise')
  })
})

describe('a counted list still wins over what is inside it', () => {
  it('three myths is a list of three, not a myth-bust — and that is the doctrine', () => {
    // ⚠️ THIS RECLASSIFIES A ROW THAT ALREADY HAD AN ANSWER. The pattern table's
    // own header says a counted list wins over anything inside it; asserting it
    // here is what stops a future reorder from silently undoing the decision.
    expect(shapeOf('Here are 3 postpartum fitness myths you need to stop believing.'))
      .toBe('number_promise')
  })

  it('and over a "How to" opening when the caption is really a list of three', () => {
    expect(shapeOf('How to guarantee your business stays completely broke in 2026. Here are the 3 ways.'))
      .toBe('number_promise')
  })

  it('a plain how_to with no count is still how_to', () => {
    expect(shapeOf('How to make a minimalist wallet with a printable pattern.')).toBe('how_to')
  })

  it('a question is still a question', () => {
    expect(shapeOf('How much money has your fashion brand lost to sizing returns this year?'))
      .toBe('direct_question')
  })
})

describe('the version is the re-run', () => {
  it('is 2, so the backfill reclassifies rows that already carry a verdict', () => {
    // The backfill guards on `caption_shape_version is null or < v.version`.
    // Leaving this at 1 would ship a wider classifier that never re-reads the
    // 4,112 rows recorded as no_pattern_match under the narrower one.
    expect(CAPTION_SHAPE_VERSION).toBe(2)
    expect(CAPTION_SHAPE_VERSION).toBeGreaterThan(1)
  })
})
