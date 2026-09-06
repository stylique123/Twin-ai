import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A LABELLING FAILURE IS NOT A USER ERROR.
 *
 * ⚠️ OBSERVED LIVE. A baker opened the type list, saw `Software`, `A mobile
 * app` and `A digital product` in the first four entries, and reasonably
 * concluded none of them described a loaf of bread. A loaf IS a physical
 * product — the label just did not look like it was for her.
 *
 * Three software-shaped entries at the top, and nothing naming food, handmade
 * goods, clothing, art or books, is a SaaS worldview rendered as a question.
 * The creator who cannot find themselves in it picks "Something else" or stops.
 *
 * ⚖️ THE ENUM IS UNTOUCHED. This is order and wording only, so no stored row
 * changes meaning and `inferShowability` reads exactly what it read before.
 */

const repo = join(import.meta.dirname, '..', '..', '..', '..')
const PAGE = readFileSync(
  join(repo, 'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx'), 'utf8')

/** The choices in the order a creator reads them. */
const choices = (() => {
  const at = PAGE.indexOf('const TYPE_CHOICES')
  const close = /\n\]/.exec(PAGE.slice(at))
  const block = PAGE.slice(at, at + (close?.index ?? 0))
  return [...block.matchAll(/value: '([A-Z_]+)', ?\n?\s*label: '([^']+)'/g)]
    .map((m) => ({ value: m[1], label: m[2] }))
})()

describe('the list parses, or every assertion below is vacuous', () => {
  it('reads all nine choices', () => {
    expect(choices.length).toBe(9)
  })
})

describe('a baker can find herself', () => {
  // ⚠️ THE ACTUAL DEFECT: what the creator reads FIRST decides whether she
  // believes the list is for her. Position, not membership.
  it('a physical product is the first thing offered', () => {
    expect(choices[0].value).toBe('PHYSICAL_PRODUCT')
  })

  // ⚖️ AND IT SAYS WHAT IT COVERS. "A physical product" alone is technically
  // correct and did not read as including bread.
  it('and names food, so bread is obviously covered', () => {
    expect(choices[0].label.toLowerCase()).toContain('food')
  })

  it('naming handmade and apparel too, since those failed the same way', () => {
    const l = choices[0].label.toLowerCase()
    expect(l).toContain('handmade')
    expect(l).toContain('apparel')
  })

  // ⚠️ THE SHAPE THAT CAUSED IT. Not "software must not appear" — it must
  // appear, it is a real answer — but it must not be what a non-software
  // creator reads first.
  it('no software-shaped option appears before the physical one', () => {
    const firstSoftware = choices.findIndex((c) => c.value === 'SAAS' || c.value === 'APP')
    const physical = choices.findIndex((c) => c.value === 'PHYSICAL_PRODUCT')
    expect(firstSoftware).toBeGreaterThan(physical)
  })

  it('software is still offered — it is a real answer, not the problem', () => {
    expect(choices.map((c) => c.value)).toContain('SAAS')
    expect(choices.map((c) => c.value)).toContain('APP')
  })
})

describe('nothing about the stored contract moved', () => {
  // ⚖️ ORDER AND WORDING ONLY. If a value were dropped, existing rows would
  // render as unselectable and `inferShowability` would read a type the picker
  // can no longer express.
  it('every enum value the picker used before is still offered', () => {
    const values = choices.map((c) => c.value).sort()
    expect(values).toEqual([
      'APP', 'COMMUNITY', 'COURSE', 'DIGITAL_PRODUCT', 'MARKETPLACE',
      'OTHER', 'PHYSICAL_PRODUCT', 'SAAS', 'SERVICE',
    ])
  })

  // ⚠️ AND `OTHER` STAYS LAST. It is deliberately offered — forcing a
  // misclassification is worse than an unspecific answer — but it is the
  // answer a creator reaches when the list has failed her, so it must never
  // be near the top.
  it('Something else is still last', () => {
    expect(choices[choices.length - 1].value).toBe('OTHER')
  })
})
