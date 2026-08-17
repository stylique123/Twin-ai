// ASKING A CREATOR TO RETYPE A PRODUCT THEY REGISTERED IS ASKING THEM TO BE
// THEIR OWN DATABASE.
//
// ⚠️ THE OFFER QUESTION WAS A BLANK BOX FOR A THING ALREADY ON RECORD. Whatever
// they typed — a nickname, a typo, a different product entirely — became what
// the script pointed at, with no link back to the entity carrying that product's
// facts, its permissions and its photographs. The Product Library existed and
// the one screen that needed it did not read it.
//
// ⚖️ SO THE ANSWER IS A CARD, AND TYPING REMAINS. A picker with no way out would
// make registering a product the price of answering a question — and a creator
// may legitimately be pointing this video at something they never registered.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PAGE = readFileSync(join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'v2', 'V2Building.tsx',
), 'utf8')

describe('the offer question offers what the creator already registered', () => {
  it('reads the library', () => {
    expect(PAGE).toMatch(/loadProductEntities\(\)/)
  })

  it('only when the offer is actually being asked', () => {
    // ⚖️ ON THE ORDINARY PATH THE BUILD JUST RUNS. A fetch nobody's answer
    // depends on can only make a build slower.
    expect(PAGE).toMatch(/askQuestions\?\.some\(\(q\) => q\.field === 'offer'\)/)
  })

  it('renders products as choices rather than a blank box', () => {
    expect(PAGE).toMatch(/q\.field === 'offer' && \(products\?\.length \?\? 0\) > 0/)
  })

  it('and still lets them type something else', () => {
    // ⚠️ THE LIBRARY IS NOT THE ONLY TRUTH. A picker with no escape turns a
    // question into a prerequisite.
    expect(PAGE).toMatch(/Or type something else/)
  })

  it('says what Twin knows about each one, so the choice is informed', () => {
    // ⚖️ NULL AND EMPTY SAY DIFFERENT THINGS HERE TOO. "Not read yet" and "read
    // it and found nothing" are different facts about the same product, and a
    // creator picking between two products deserves both.
    expect(PAGE).toMatch(/has not read this one yet/)
    expect(PAGE).toMatch(/Nothing usable found on its page/)
  })

  it('a failed read falls back to typing rather than claiming an empty library', () => {
    // ⚠️ `[]` WOULD ASSERT THE CREATOR HAS NO PRODUCTS. The three-state rule, at
    // the one point where getting it wrong silently hides their own products
    // from them.
    const eff = PAGE.slice(PAGE.indexOf("q.field === 'offer') || products !== null"))
    expect(eff.slice(0, 600)).toMatch(/catch\(\(\) => \{ if \(alive\) setProducts\(\[\]\) \}\)/)
    expect(PAGE).toMatch(/useState<ProductEntityRecord\[\] \| null>\(null\)/)
  })

  it('the answer is saved on every change, like every other answer here', () => {
    // ⚖️ THE EVENT THAT LOSES AN ANSWER IS NOT A SUBMIT — it is a background tab
    // reclaimed with no warning. A picker that skipped this would lose exactly
    // the answers the text box keeps.
    const block = PAGE.slice(PAGE.indexOf("q.field === 'offer' && (products"))
    expect(block.slice(0, 3200).match(/rememberAnswers\(buildKey\(state\), next\)/g) ?? [])
      .toHaveLength(2)
  })
})
