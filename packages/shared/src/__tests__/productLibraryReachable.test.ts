// A CREATOR MUST BE ABLE TO REGISTER A PRODUCT WE NEVER GUESSED.
//
// ⚠️ THE DEFECT THIS CLOSES, WHICH SHIPPED. The Product Library's attestation
// form was rendered ONLY inside the extracted-suggestions list. A creator whose
// product the extractor had never seen could not register it at all — and the
// empty state told them, accurately, that they had no product and offered no way
// to change that. In production 6 of 17 owners with knowledge had NO product
// suggestions, so for a third of users the page was read-only, and
// `product_entities` stayed at zero rows with every generation taking the
// "unrecorded" branch.
//
// ⚖️ THE SUGGESTION WAS NEVER THE PART THAT MATTERED. An entitlement comes from
// the creator answering four questions; the suggestion only ever saved typing.
// Coupling the form to it confused a convenience with a requirement.
//
// This reads the shipped page source. It is a structural check — that the ways
// in exist and are not nested inside the suggestions block — not a render test.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const PAGE = readFileSync(join(REPO, 'apps/web/src/pages/ProductLibrary.tsx'), 'utf8')

/** The JSX region that only renders when there is a suggestion to show.
 *
 *  ⚠️ THE ANCHOR MOVED WHEN THE PAGE STOPPED RENDERING EVERY EXTRACTED ROW. It
 *  was `{suggestions.length > 0 &&` — a section of every candidate — and is now
 *  `{picked &&`, the single ranked one. The CLAIM below did not change and must
 *  not: whatever the suggestion block is called, an attestation form has to
 *  exist outside it, or a creator with no suggestion has no way in. Narrowing
 *  the suggestions made that MORE load-bearing, not less. */
function suggestionsBlock(): string {
  const start = PAGE.indexOf('{picked && (')
  expect(start).toBeGreaterThan(-1)
  return PAGE.slice(start)
}

describe('the page is never read-only', () => {
  it('renders the attestation form OUTSIDE the suggestions block', () => {
    // ⚠️ THE EXACT REGRESSION. One `<ClaimForm>` lives inside the suggestions
    // list (claiming a suggestion) and at least one outside it (adding from
    // scratch). If the outside one disappears, the dead end is back.
    const total = (PAGE.match(/<ClaimForm/g) ?? []).length
    const inside = (suggestionsBlock().match(/<ClaimForm/g) ?? []).length
    expect(total).toBeGreaterThan(inside)
    expect(total - inside).toBeGreaterThanOrEqual(1)
  })

  it('the EMPTY state offers a way out of itself', () => {
    // A creator with no entities and no suggestions must still see an action.
    const empty = PAGE.slice(PAGE.indexOf('entities.length === 0'))
    expect(empty.slice(0, empty.indexOf('{entities.map'))).toMatch(/Add a product/)
  })

  it('the form does not REQUIRE a suggestion to exist', () => {
    // The prop is optional at the type level, so a caller with nothing to
    // suggest is not forced to invent one.
    expect(PAGE).toMatch(/suggestion\?: ProductSuggestion \| null/)
    // And the radio group still gets a stable name without one, or every radio
    // on the page would share a group and selecting one would clear another.
    expect(PAGE).toMatch(/suggestion\?\.id \?\? 'new'/)
  })
})

describe('a claimed product can be withdrawn', () => {
  it('every entity offers removal', () => {
    // ⚠️ ONCE CLAIMED, PERMANENT was the shipped behaviour. A creator who stops
    // selling something could not stop their scripts being licensed to sell it.
    const row = PAGE.slice(PAGE.indexOf('{entities.map('))
    expect(row).toMatch(/setRemovingId\(e\.id\)/)
    expect(row).toMatch(/void remove\(e\.id\)/)
  })

  it('names the CONSEQUENCE rather than asking a bare "are you sure"', () => {
    // ⚖️ Withdrawing removes permissions. A generic confirm hides the only part
    // of the decision the creator needs.
    //
    // ⚠️ THE WORDING MOVED WHEN ARCHIVE ARRIVED, AND THE ASSERTION MOVED WITH
    // IT RATHER THAN BEING LOOSENED. There are now TWO ways out and the copy has
    // to distinguish them, so what is pinned is that both consequences are
    // stated: archiving stops future use and keeps the record, deleting does not.
    const row = PAGE.slice(PAGE.indexOf('{entities.map('))
    expect(row).toMatch(/stops Twin using it in new videos/)
    expect(row).toMatch(/existing scripts keep/)
    expect(row).toMatch(/Removing deletes it entirely/)
  })

  it('offers ARCHIVE as the primary way out, with delete as the smaller choice', () => {
    // ⚖️ The spec prefers archive wherever scripts may already reference the
    // entity — which is every entity that has been used even once.
    const row = PAGE.slice(PAGE.indexOf('{entities.map('))
    const archive = row.indexOf('void archive(e.id)')
    const del = row.indexOf('void remove(e.id)')
    expect(archive).toBeGreaterThan(-1)
    expect(del).toBeGreaterThan(archive)
  })

  it('DELETE really deletes, rather than quietly archiving', () => {
    // ⚠️ THIS COMMENT USED TO ARGUE AGAINST A RETIRED FLAG ALTOGETHER, and that
    // argument is now half wrong. The danger it named was real — a flagged row
    // the generator did not filter would keep granting withdrawn permissions —
    // but the answer was to WRITE the filter, which 0124 and its readers do. So
    // archive exists and is the preferred path.
    //
    // ⚖️ WHAT THIS STILL PINS is that the two operations stay DIFFERENT. Once
    // both are on the page, the tempting simplification is to make "delete" call
    // archive so nothing is ever really lost. That would make the destructive
    // choice silently non-destructive, and a creator who deleted a sponsor's
    // product for legal reasons would find it still on record.
    const api = readFileSync(join(REPO, 'packages/shared/src/api.ts'), 'utf8')
    const fn = api.slice(api.indexOf('export async function deleteProductEntity'))
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/\.delete\(\)\s*\.eq\('id', id\)/)
  })
})
