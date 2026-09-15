// A ROW NOBODY PUT ANYTHING IN ANSWERED "DO YOU HAVE A PRODUCT?"
//
// Part 7 defect 6. The owner's wording blames the auto-created row; the row is
// deliberate (`mintFromWorkKind` writes `name: null` on purpose). What is wrong
// is that a bare COUNT of those rows closed the question, so the capture card
// never rendered and one creator is permanently unasked.
//
// ⚠️ THE TWO MUTANTS THAT MATTER PULL IN OPPOSITE DIRECTIONS, which is why
// neither a "require a name" rule nor the old bare count is acceptable:
//   · too loose (the old count): a bare inference answers → never asked again
//   · too strict (require a name): a "nothing to sell" row stops answering →
//     asked forever, having already answered
// Both are asserted, because a rule that only avoids one of them is the other.

import { describe, it, expect } from 'vitest'
import { rowAnswersProductQuestion } from '../productQuestionAnswered'

// ⚖️ THE LIBRARY-WIDE CASES MAP OVER `rowAnswersProductQuestion` DIRECTLY. An
// `anyRowAnswersProductQuestion` wrapper existed and was deleted for having no
// production reader — see the note in the module. Testing through the same call
// the callers make is also the more honest test.
const anyRowAnswersProductQuestion = (
  rows: ReadonlyArray<Parameters<typeof rowAnswersProductQuestion>[0]> | null | undefined,
): boolean => Array.isArray(rows) && rows.some(rowAnswersProductQuestion)

describe('a row answers the question when a person supplied something', () => {
  it('a name is an answer', () => {
    expect(rowAnswersProductQuestion({ name: 'Custom Bible Rebind', relationship: 'OWN_PRODUCT' })).toBe(true)
  })

  it('a creator summary is an answer even with no name', () => {
    // MEASURED: two of production's three nameless rows are exactly this — an
    // onboarding mint whose guessed offer the creator EDITED. `creatorSummary`
    // is only written when `offerConfirmed === true && offered !== ''`, so its
    // presence is confirmation rather than the scan's guess.
    expect(rowAnswersProductQuestion({
      name: null,
      creatorSummary: 'Workshops address tactical growth, talent recruitment, and decision-making.',
      relationship: 'OWN_PRODUCT',
    })).toBe(true)
  })

  // ⚠️ THE TOO-STRICT MUTANT. A creator who answers "No, nothing to sell" gets
  // a row minted with `name: null` BY DESIGN. If that stopped answering, the
  // card would re-ask someone who had already told us — and the card's own
  // header is explicit that both answers close the gap, not just "yes".
  it('an explicit NONE is an answer, and it is nameless by design', () => {
    expect(rowAnswersProductQuestion({ name: null, creatorSummary: null, relationship: 'NONE' })).toBe(true)
  })

  // ⚠️ THE TOO-LOOSE MUTANT, AND THE SHIPPED STATE. Nothing but a derived type
  // is OUR inference about the creator, not their answer. Exactly one
  // production row looks like this.
  it('a bare mint carrying only a derived type is NOT an answer', () => {
    expect(rowAnswersProductQuestion({ name: null, creatorSummary: null, relationship: 'OWN_PRODUCT' })).toBe(false)
  })

  it('whitespace is not an answer', () => {
    expect(rowAnswersProductQuestion({ name: '   ', creatorSummary: '\n\t', relationship: 'OWN_PRODUCT' })).toBe(false)
  })

  // ⚠️ THE EMPTY STRING IS WHY THIS IS NOT A PostgREST `.or()`. A filter can
  // say "name is not null"; it cannot say "name is not blank". Production holds
  // 3 NULL names and ZERO empty ones today, and relying on that is the trap
  // this repo names: a constraint that has only seen its own population looks
  // like it works.
  it("an empty-string name is not an answer either, not just a null one", () => {
    expect(rowAnswersProductQuestion({ name: '', creatorSummary: '', relationship: 'OWN_PRODUCT' })).toBe(false)
  })

  it('a missing row is not an answer', () => {
    expect(rowAnswersProductQuestion(null)).toBe(false)
    expect(rowAnswersProductQuestion(undefined)).toBe(false)
  })
})

describe('across a library', () => {
  it('one answering row is enough', () => {
    expect(anyRowAnswersProductQuestion([
      { name: null, creatorSummary: null, relationship: 'OWN_PRODUCT' },
      { name: 'The Nook Pattern', relationship: 'OWN_PRODUCT' },
    ])).toBe(true)
  })

  it('a library of nothing but bare mints leaves the question open', () => {
    expect(anyRowAnswersProductQuestion([
      { name: null, creatorSummary: null, relationship: 'OWN_PRODUCT' },
      { name: null, creatorSummary: null, relationship: 'OWN_SERVICE' },
    ])).toBe(false)
  })

  it('an empty library leaves the question open', () => {
    expect(anyRowAnswersProductQuestion([])).toBe(false)
    expect(anyRowAnswersProductQuestion(null)).toBe(false)
  })

  // The production shape, as measured: 22 rows, 19 named, 2 nameless with a
  // summary, 1 bare. The question is answered — by the 21, not by the 1.
  it("production's own shape answers, and not because of the bare row", () => {
    const named = { name: 'Pueblo Bifold', relationship: 'OWN_PRODUCT' }
    const summarised = { name: null, creatorSummary: 'Workshops for scaling businesses.', relationship: 'OWN_PRODUCT' }
    const bare = { name: null, creatorSummary: null, relationship: 'OWN_PRODUCT' }
    expect(anyRowAnswersProductQuestion([named, summarised, bare])).toBe(true)
    expect(anyRowAnswersProductQuestion([bare])).toBe(false)
  })
})
