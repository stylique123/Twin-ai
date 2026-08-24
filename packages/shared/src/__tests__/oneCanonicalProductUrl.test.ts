import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ⚠️ THREE URL INPUTS WITH DISJOINT EFFECTS IS NOT A UI PROBLEM, IT IS A
// CANONICAL-FIELD PROBLEM. The Product Library asked for a link in three places:
//
//   1. the add form        -> wrote product_url AND started an extraction
//   2. the detail "Link"   -> wrote product_url, never re-read the page
//   3. "What Twin knows"   -> started an extraction, NEVER wrote product_url
//
// So the most recent address a creator gave Twin was the one address Twin did
// not keep, and every other view — generate-blueprint included — reads
// product_url. This guard pins the fix at the only place a grep can see it: the
// shipped source.

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const LIB = readFileSync(
  join(repo, 'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx'), 'utf8',
)

/** ⚠️ COMMENTS ARE NOT CODE. An earlier guard in this repo failed against
 *  correct code because it matched the comment EXPLAINING the bug. */
const code = LIB.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const learnBody = (() => {
  const at = code.indexOf('async function learn(')
  if (at < 0) throw new Error('learn() not found — the page was restructured')
  return code.slice(at, code.indexOf('\n  }', at))
})()

describe('giving Twin a page to read tells it where the product lives', () => {
  it('learn() persists the url it was given', () => {
    expect(learnBody).toMatch(/productUrl/)
    expect(learnBody).toMatch(/save\(/)
  })

  it('and still starts the extraction', () => {
    expect(learnBody).toMatch(/requestProductExtraction\(/)
  })

  // ⚖️ ORDER MATTERS. Writing after the extraction would leave the two out of
  // step for however long the worker takes, and leave them permanently out of
  // step if the write failed while the read succeeded.
  it('writes the url BEFORE handing it to the extractor', () => {
    expect(learnBody.indexOf('productUrl'))
      .toBeLessThan(learnBody.indexOf('requestProductExtraction('))
  })

  // ⚖️ A RE-READ OF THE SAME PAGE IS NOT AN EDIT. Round-tripping an identical
  // value would touch the row and read as a change the creator did not make.
  it('skips the write when the url has not changed', () => {
    expect(learnBody).toMatch(/!==\s*\(?entity\?\.productUrl/)
  })
})

describe('the other two inputs still do what they claim', () => {
  it('the detail Link field still writes product_url', () => {
    expect(code).toMatch(/save\(e\.id,\s*\{\s*productUrl:/)
  })

  it('the add form still carries the link into the claim', () => {
    expect(code).toMatch(/productUrl:\s*link/)
  })
})
