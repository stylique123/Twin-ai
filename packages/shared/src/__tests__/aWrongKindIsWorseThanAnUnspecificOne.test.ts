// A WRONG KIND IS WORSE THAN AN UNSPECIFIC ONE, AND IT HAD NO CORRECTION.
//
// ⚠️ THE CODEBASE ALREADY STATED THE STAKE. `productEntity.ts`: "`OTHER` exists
// so the enum never forces a misclassification: `inferShowability` reads this to
// tell the Director what it may ask for, so a WRONG kind is worse than an
// unspecific one." The kind is DERIVED from the onboarding work-kind answer and
// reaches the Director — and `updateEntityPresentation` did not accept it, so a
// wrong one was a standing Director instruction nobody could withdraw.
//
// ⚠️ MEASURED: an account selling a service, a physical product AND tutorials,
// told "we'll treat it as your own physical product", whose only escape was to
// declare they own nothing at all.
//
// ⚖️ AND IT BELONGS IN THAT EDIT BY THE INTERFACE'S OWN RULE. `name` and
// `creatorSummary` are editable because "neither is an entitlement field".
// Neither is the kind: it decides what can be FILMED, never what may be CLAIMED.
// `relationship` stays forbidden for exactly the reason the kind is allowed.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ENTITY_TYPES, isEntityType } from '../productEntity'

const HERE = dirname(fileURLToPath(import.meta.url))
const API = readFileSync(join(HERE, '..', 'api.ts'), 'utf8')
const LIB = readFileSync(
  join(HERE, '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx'), 'utf8')

/** The body of `updateEntityPresentation`, bounded so a match cannot be
 *  satisfied by a neighbouring function — the vacuous-anchor defect this repo
 *  has paid for more than once. */
function updateBody(): string {
  const start = API.indexOf('export async function updateEntityPresentation')
  expect(start).toBeGreaterThan(-1)
  const end = API.indexOf('\n}', start)
  expect(end).toBeGreaterThan(start)
  return API.slice(start, end)
}

/** Whole-line comments dropped, so prose that merely NAMES a field can never
 *  be counted as a write of it. Trailing comments are kept. */
function codeOnly(src: string): string {
  return src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
}

describe('the kind is correctable', () => {
  it('the edit interface accepts a type', () => {
    expect(API).toMatch(/interface EntityPresentationEdit[\s\S]*?\btype\?: EntityType/)
  })

  it('the update actually WRITES it, not just accepts it', () => {
    // The gate the whole fix turns on: accepting a field and never assigning it
    // is the defect class this repo keeps closing.
    expect(codeOnly(updateBody())).toMatch(/row\.type\s*=/)
  })

  it('validates against the enum instead of forwarding whatever arrived', () => {
    // An unknown value would not be a bad label — it would be a Director
    // instruction derived from nothing, because inferShowability reads it.
    expect(codeOnly(updateBody())).toMatch(/isEntityType\(\s*edit\.type\s*\)/)
  })

  it('still refuses relationship, which IS an entitlement field', () => {
    const body = codeOnly(updateBody())
    expect(body).not.toMatch(/row\.relationship\s*=/)
  })

  it('does not quietly rewrite showability when the kind changes', () => {
    // Two fields, two decisions. Re-deriving showability here would overwrite an
    // answer the creator gave, on their behalf, without asking.
    const body = codeOnly(updateBody())
    const typeAt = body.indexOf('row.type =')
    expect(typeAt).toBeGreaterThan(-1)
    // No showability assignment may be introduced inside the type branch.
    expect(body.slice(typeAt)).not.toMatch(/row\.showability\s*=/)
  })
})

describe('the creator can reach it', () => {
  it('the library renders a kind corrector on an EXISTING product', () => {
    // `save(e.id, ...)` is the existing-card write path; the add form uses
    // local state, so anchoring on `save(e.id` is what distinguishes them.
    expect(codeOnly(LIB)).toMatch(/save\(e\.id,\s*\{\s*type:/)
  })

  it('reuses the add form\'s own labels rather than a second vocabulary', () => {
    expect(codeOnly(LIB)).toMatch(/TYPE_CHOICES\.map/)
  })

// ⚖️ BUSINESS IS NOT OFFERED AS A KIND OF PRODUCT, AND THAT IS THE OWNER'S
  // DECISION (2026-09-22): "it doesn't actually change anything… remove that."
  // A business is now a BRAND row at the top of the Library (0224), not a product
  // type. The value stays in the contract so the database constraint and readers
  // agree; production holds 0 rows of it. Exempted BY NAME, so any other value
  // missing from the picker still fails.
  it('offers every kind the enum allows, so no product is unrepresentable', () => {
    // TYPE_CHOICES is the list the corrector maps over; a kind missing from it
    // would be a product a creator could never correct their way into.
    for (const t of ENTITY_TYPES) {
      if (t === 'BUSINESS') continue // see the note above this describe block
      expect(LIB).toContain(`value: '${t}'`)
    }
  })

  it('the radio group is per product, so two cards cannot share a selection', () => {
    expect(codeOnly(LIB)).toMatch(/name=\{`kind-\$\{e\.id\}`\}/)
  })
})

describe('the validator it leans on', () => {
  it('accepts every declared kind', () => {
    for (const t of ENTITY_TYPES) expect(isEntityType(t)).toBe(true)
  })

  it('refuses a plausible near-miss', () => {
    // Lowercase and a made-up kind both have to fail, or validation is theatre.
    expect(isEntityType('physical_product')).toBe(false)
    expect(isEntityType('EBOOK')).toBe(false)
    expect(isEntityType(undefined)).toBe(false)
    expect(isEntityType(null)).toBe(false)
  })
})
