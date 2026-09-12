// @vitest-environment jsdom
//
// THE HAPPY-PATH CARD TOLD HER ABOUT HER BALANCE, IN OUR NOUN, LOOKING BACKWARDS.
//
// ⚠️ THE LINE: "No remix has been used yet. Three taps — Twin decides how to
// make it, you decide what it is for." Two problems in one sentence.
//
// "No remix has been used yet" is ACCOUNTING. `remix` is our word for a credit;
// a creator who has never once thought about her balance is being told
// something about it before she is told what the screen is for. It was written
// for the REFUSAL card, where nothing-was-charged is genuine reassurance, and
// then inherited by a card that now appears on every build.
//
// "Three taps" is the same mistake one clause over: it MEASURES THE FORM rather
// than saying what the form is for, and it goes stale the moment a question is
// added or removed — a number in copy that no test could hold true.
//
// ⚖️ WHAT SHE ACTUALLY NEEDS IS THAT ANSWERING COSTS HER NOTHING. Forward-
// looking, true however many chips there are, and in her vocabulary.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(import.meta.dirname, 'V2Building.tsx'), 'utf8')

/** The two branches of the card's subtitle, read as source so this asserts what
 *  ships rather than what a fixture says. */
const chipBranch = (() => {
  const i = SRC.indexOf('askQuestions.some(isChip)\n                //')
  const j = SRC.indexOf('</p>', i)
  return SRC.slice(i, j)
})()

describe('the card says what it is for, not how big it is', () => {
  it('found the branch — a refactor here would silently empty every check below', () => {
    expect(chipBranch.length).toBeGreaterThan(200)
    expect(chipBranch).toContain('?')
    expect(chipBranch).toContain(':')
  })

  it('does not count the form', () => {
    // ⚠️ ANY count of the questions. "Three taps" was wrong the day a fourth
    // was added, and nothing would have caught it.
    expect(chipBranch).not.toMatch(/'[^']*\b(one|two|three|four|five)\s+(taps?|questions?|things?)/i)
  })

  it('does not open the happy path with our accounting noun', () => {
    const shipped = chipBranch.slice(chipBranch.indexOf('? '), chipBranch.indexOf(': '))
    expect(shipped).not.toMatch(/remix/i)
  })

  it('tells her the thing that is actually true and useful', () => {
    expect(chipBranch).toContain("'Nothing is charged until you make it.'")
  })
})

describe('what was already right is untouched', () => {
  // ⚖️ THE BEST LINE ON THE SCREEN, AND IT STAYS VERBATIM. It explains WHY Twin
  // is asking in terms of the creator's own risk, which is the only argument
  // that makes a question feel like care rather than paperwork.
  it('keeps the sentence that says why, in terms of her risk', () => {
    expect(SRC).toContain(
      'Twin would rather ask than guess — a guess here ends up as a claim in your voice.')
  })

  // ⚠️ AND THE REFUSAL BRANCH IS NOT SWEPT UP IN THIS. There, nothing was
  // charged for a build that did not happen, and saying so IS the reassurance —
  // the same job `No remix was used` does on the failure paths, which
  // `the-refund-is-never-silent` and `cdpEdgeParity` both pin. A change that
  // read "remix is our noun, remove it everywhere" would have deleted a
  // creator-facing promise about money.
  it('leaves the refusal branch saying nothing was charged', () => {
    expect(SRC).toContain('No remix has been used. Twin would rather ask than guess')
    expect(SRC).toContain('No remix was used.')
  })
})
