import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * COLLECTED ONCE AND THEN UNREACHABLE.
 *
 * ⚠️ THE ADD FORM ASKS "In one line, what is it and who is it for?" and stores
 * the answer. The detail card never showed it — so it could not be corrected,
 * and a product created before the field existed could never gain one.
 *
 * ⚠️ AND IT IS THE FIELD THAT MAKES A LINKLESS PRODUCT POSSIBLE. Observed live:
 * a baker selling bread by pre-order, with no website and no intention of one,
 * met "Add a link or a photo and Twin can learn what this is" and then "Please
 * paste a full https:// link". Two prompts demanding a URL, and the single field
 * that answers them both was absent from the card she was standing on.
 *
 * ⚖️ THE WRITE PATH ALREADY EXISTED. `updateEntityPresentation` has accepted
 * `creatorSummary` since 0177 and nothing ever called it with one: built,
 * typed, tested, and unreachable from the screen that needed it. This is the
 * caller — the same defect class as `claimsQuestionFor` and the refund rule.
 */

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const PAGE = readFileSync(
  join(repo, 'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx'), 'utf8')
const API = readFileSync(
  join(repo, 'packages', 'shared', 'src', 'api.ts'), 'utf8')

/** Code lines only — a whole-line comment naming the field is not a call. */
const code = PAGE.split('\n').filter((l) => !/^\s*(\/\/|\*|\{?\/\*)/.test(l)).join('\n')

describe('the detail card can edit the description', () => {
  it('renders the question in the creator\'s own words', () => {
    expect(code).toContain('In one line, what is it and who is it for?')
  })

  it('reads the stored value rather than starting blank', () => {
    expect(code).toMatch(/defaultValue=\{e\.creatorSummary \?\? ''\}/)
  })

  // ⚠️ THE ACTUAL WIRE. A field that renders and never saves is the same
  // defect one layer up.
  it('saves it through the path that already accepted it', () => {
    expect(code).toMatch(/save\(e\.id, \{ creatorSummary: v \|\| null \}\)/)
  })

  // ⚖️ EMPTY CLEARS IT RATHER THAN STORING "". A blank string would read as a
  // description the creator wrote, and the writer would put it in a prompt.
  it('an emptied field stores null, not an empty string', () => {
    expect(code).toMatch(/creatorSummary: v \|\| null/)
  })

  // ⚠️ AND IT SAYS WHY IT MATTERS, because a creator with no website needs to
  // know this is the thing that replaces the link.
  it('tells the creator what it is for', () => {
    expect(code).toContain('Used if the page cannot be read')
  })
})

describe('the write path it calls is the one that already existed', () => {
  it('updateEntityPresentation still accepts creatorSummary', () => {
    expect(API).toMatch(/creatorSummary\?: string \| null/)
  })

  it('and still normalises an empty edit to null', () => {
    expect(API).toMatch(/row\.creator_summary = edit\.creatorSummary === null \? null : String\(edit\.creatorSummary\)\.trim\(\) \|\| null/)
  })
})

describe('the add form still asks it too', () => {
  // ⚖️ ONE FIELD SET, TWO SURFACES. The detail card is the add form with values
  // in it; if the add form stopped collecting this, the card would be editing a
  // field nothing ever populates.
  it('the add form still writes creatorSummary on claim', () => {
    expect(code).toMatch(/creatorSummary: summary\.trim\(\) \|\| null/)
  })
})
