// FOUR COPIES OF ONE FIELD LIST, AND THE PRICE FELL THROUGH THREE OF THEM.
//
// ⚠️ REPORTED 2026-09-22, FROM THE SCREEN: "there's no option of offer, so it's
// not being listed, not being added, and not being used in script." The field
// was not missing. Migration 0222 added `offer` to `EntityAttestation`, the
// opened product rendered it, and `claimProductEntity` wrote it. What did not
// exist was a ROUTE from the add dialog to that column: `StartFromLink`'s
// `onClaim` prop, `ClaimForm`'s `onClaim` prop and `claim()`'s own parameter
// each restated the field list by hand, and none of the three was widened. A
// creator typing a price at add time had nowhere to type it, and the price had
// to be found by opening a product she had just created.
//
// ⚠️⚠️ THE MUTANT THIS FILE EXISTS FOR IS "ADD A FIFTH FIELD TO THE
// ATTESTATION AND WIRE IT INTO THE EDIT CARD ONLY." That is precisely what
// happened with `offer`, it broke nothing, every unit test passed, and the
// symptom only ever appeared to a person using the form. A type test alone
// cannot catch it either: the shapes now agree, and a form that renders no
// input for a field it is perfectly able to send is still the reported bug.
//
// ⚖️ SO TWO SEPARATE THINGS ARE CHECKED, and they fail for different reasons.
// First: there is ONE claim type, not four — the drift's cause. Second: every
// creator-TYPED field on that type has an input in the add dialog as well as
// in the opened product — the drift's symptom. Fix the first and the second
// can still regress; that is why both are here.
//
// ⚖️ AND THE LIST IS DELIBERATELY NOT "EVERY FIELD ON `ProductClaim`". Most of
// them are not typed — `type`, `relationship`, `personalUse` and `showability`
// are picked from `Choices`, `flags` is derived from a pick, `communityMap` is
// built from a sub-form, `imagePaths` is an upload. Asserting an `<input>` for
// those would be asserting the wrong control. These four are the ones a
// creator writes in her own words.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const page = readFileSync(join(here, '..', 'pages', 'ProductLibrary.tsx'), 'utf8')

/** The fields a creator types, and the state variable each add-form input is
 *  bound to. The edit card binds to the record instead, so it is matched on the
 *  property name it writes back. */
const TYPED_FIELDS = [
  { field: 'name', addInputId: 'product-name', editWrites: 'name:' },
  { field: 'creatorSummary', addInputId: 'product-summary', editWrites: 'creatorSummary:' },
  { field: 'offer', addInputId: 'product-offer', editWrites: 'offer:' },
  { field: 'productUrl', addInputId: 'product-link', editWrites: 'productUrl:' },
] as const

/** The add dialog's source, isolated so an input elsewhere on the page cannot
 *  stand in for one this form does not have. */
function addFormSource(): string {
  const start = page.indexOf('function StartFromLink(')
  expect(start, 'StartFromLink was renamed — re-anchor this test').toBeGreaterThan(-1)
  return page.slice(start)
}

describe('a field the add form could not send', () => {
  it('states the claim shape once, rather than restating it per form', () => {
    // ⚠️ THE ANCHOR IS THE INLINE SHAPE, NOT THE NAME. `onClaim: (a: {` is what
    // a hand-copied list looks like; any number of `(a: ProductClaim)` is fine.
    expect(page).not.toMatch(/onClaim: \(a: \{/)
    expect(page).not.toMatch(/async function claim\(s: ProductSuggestion \| null, a: \{/)
    const shared = page.match(/\(a: ProductClaim\)/g) ?? []
    expect(shared.length).toBeGreaterThanOrEqual(2)
  })

  for (const { field, addInputId, editWrites } of TYPED_FIELDS) {
    it(`asks for ${field} at add time as well as on the opened product`, () => {
      expect(addFormSource()).toContain(`id="${addInputId}"`)
      // The edit card saves by naming the column it writes.
      expect(page).toContain(editWrites)
    })
  }

  it('can send every typed field from the add form', () => {
    // ⚠️ THE INPUT EXISTING IS NOT THE SAME AS THE VALUE TRAVELLING. `offer`
    // had a reader, a column and a writer, and the one missing link was the
    // submit payload — so the submit call is checked on its own.
    const submit = addFormSource()
    for (const { field } of TYPED_FIELDS) expect(submit).toContain(`${field}:`)
  })
})
