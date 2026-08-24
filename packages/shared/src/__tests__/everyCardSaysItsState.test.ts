import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LIFECYCLE_MESSAGE, type ProductLifecycle } from '../productLifecycle'

// ⚠️ MOST STATES SAID NOTHING ON THE CARD. Only READING rendered a sentence;
// a product that was READY, or carrying unchecked guesses, or had no source
// yet, all opened with the same "Name" field. "What is happening with this
// one" had to be worked out by reading down the card.
//
// ⚖️ AND NOTHING_FOUND HAD TWO WORDINGS — one hardcoded in the page, one in
// LIFECYCLE_MESSAGE, close but not identical. Two sentences for one state
// drift apart at whatever rate the two files are edited.

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const raw = readFileSync(join(repo, 'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx'), 'utf8')
/** Comments are not code — a guard here already failed once by matching the
 *  comment that explained the bug it was hunting. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const STATES: ProductLifecycle[] = [
  'ARCHIVED', 'NEEDS_SOURCE', 'READING', 'NOTHING_FOUND', 'REVIEW_REQUIRED', 'READY',
]

describe('the card renders its state', () => {
  it('every card opens with the state sentence', () => {
    expect(code).toMatch(/LIFECYCLE_MESSAGE\[productLifecycle\(e, photoPathsOf\(e\)\.length\)\]/)
  })

  it('it is derived, never a stored status field', () => {
    expect(code).not.toMatch(/e\.status\b|e\.lifecycle\b/)
  })
})

describe('one wording per state', () => {
  // ⚠️ THE REAL TEST OF THIS CHANGE. If any state's sentence is ALSO typed into
  // the page, there are two sources for it and the shared map has stopped being
  // authoritative — which is the exact defect this repo keeps rediscovering.
  it.each(STATES)('%s has no second copy of its sentence in the page', (state) => {
    const sentence = LIFECYCLE_MESSAGE[state]
    expect(code).not.toContain(sentence)
  })

  // ⚖️ THE SPECIFIC ONE THAT WAS DUPLICATED, named so a regression is legible
  // rather than a generic failure.
  it('the nothing-found prose is gone from the page', () => {
    expect(code).not.toMatch(/could not find anything usable on it/)
    expect(code).toMatch(/LIFECYCLE_MESSAGE\.NOTHING_FOUND/)
  })
})

describe('the sentences stay readable to a first-time creator', () => {
  it.each(STATES)('%s says nothing about how Twin works inside', (state) => {
    expect(LIFECYCLE_MESSAGE[state]).not.toMatch(
      /extraction|entity|null|knowledge_|column|schema|lifecycle/i)
  })

  it.each(STATES)('%s does not blame the creator', (state) => {
    expect(LIFECYCLE_MESSAGE[state]).not.toMatch(/you (failed|forgot|did not|must)/i)
  })
})
