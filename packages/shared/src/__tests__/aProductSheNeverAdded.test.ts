// "THERE'S ALREADY A PRODUCT ADDED — NOT NAMED, NOTHING. I NEVER ADDED IT."
//
// ⚠️⚠️ REPORTED FROM THE SCREEN, 2026-09-22. The first thing in the Product
// Library, above anything she created:
//
//   Not named yet
//   Add a link or a photo and Twin can learn what this is.
//   You own this product
//
// `mintFromWorkKind` writes that row from her onboarding work-kind answer. It
// carries a derived type and nothing else — no name, no description she edited,
// no link — and it asserts "You own this product" about a business nobody asked.
//
// ── WHY THE ROW IS NOT DELETED ────────────────────────────────────────────
//
// An earlier pass examined exactly this row and concluded "the row is not the
// defect", for two reasons that both still hold:
//
//   · it carries the type and showability she IMPLIED by answering the
//     work-kind question, which deleting would throw away;
//   · `rowAnswersProductQuestion` depends on such a row to stop re-asking the
//     creator who answered "nothing to sell" — a `NONE` row is nameless BY
//     DESIGN, and requiring a name would break the opposite case.
//
// ⚖️ WHAT THAT PASS NEVER ASKED IS WHETHER THE ROW SHOULD BE RENDERED TO HER AS
// ONE OF HER PRODUCTS. It should not. The previous fix traded a WRONG NAME (the
// sourdough sentence) for NO NAME and left the phantom on screen; this is the
// honest end of the same reasoning — an unconfirmed inference is not a product
// until she puts something in it.
import { describe, expect, it } from 'vitest'
import { rowIsCreatorSupplied, rowAnswersProductQuestion } from '../productQuestionAnswered'

/** The mint, exactly as `mintFromWorkKind` produces it. */
const UNCONFIRMED_MINT = {
  name: null,
  creatorSummary: null,
  productUrl: null,
  userConfirmed: false,
  relationship: 'OWN_PRODUCT',
}

describe('the row she never created is not shown to her', () => {
  it('an unconfirmed mint is not a product she supplied', () => {
    expect(rowIsCreatorSupplied(UNCONFIRMED_MINT)).toBe(false)
  })

  it('⚠️ but it still answers "do you have a product?" — nothing regressed', () => {
    // THE WHOLE POINT OF KEEPING THE ROW. If this ever returns false, the
    // capture card comes back for a creator who already answered.
    expect(rowAnswersProductQuestion({ ...UNCONFIRMED_MINT, relationship: 'NONE' })).toBe(true)
  })

  it('⚖️ and "nothing to sell" is not rendered as a product either', () => {
    // A real answer, a real row — and not a thing she sells. Showing it as a
    // card would be the same defect wearing the opposite answer.
    expect(rowIsCreatorSupplied({ ...UNCONFIRMED_MINT, relationship: 'NONE' })).toBe(false)
  })
})

describe('everything she did put something into still shows', () => {
  it('a name she typed', () => {
    expect(rowIsCreatorSupplied({ ...UNCONFIRMED_MINT, name: 'NFC Digital Business Card Keychain' })).toBe(true)
  })

  it('a description she edited, even with no name yet', () => {
    // `creatorSummary` is only ever written when `offerConfirmed === true`, so
    // its presence IS her confirmation.
    expect(rowIsCreatorSupplied({ ...UNCONFIRMED_MINT, creatorSummary: 'Handmade bandanas for dogs' })).toBe(true)
  })

  it('⚠️ a link she pasted, BEFORE the page read finishes and names it', () => {
    // She has created a product and not named it. Hiding this row would delete
    // her work from the screen mid-read — the opposite of this rule's point.
    expect(rowIsCreatorSupplied({ ...UNCONFIRMED_MINT, productUrl: 'https://makerbee.example/keychain' })).toBe(true)
  })

  it('a row she explicitly confirmed', () => {
    expect(rowIsCreatorSupplied({ ...UNCONFIRMED_MINT, userConfirmed: true })).toBe(true)
  })

  it('whitespace is not a supply', () => {
    expect(rowIsCreatorSupplied({ ...UNCONFIRMED_MINT, name: '   ', creatorSummary: '  ' })).toBe(false)
  })

  it('a missing row is not a product', () => {
    expect(rowIsCreatorSupplied(null)).toBe(false)
    expect(rowIsCreatorSupplied(undefined)).toBe(false)
  })
})

// ── AND THE SCREEN ACTUALLY USES IT ───────────────────────────────────────
//
// ⚠️⚠️ THE FAILURE THIS GUARDS IS SILENT AND TOTAL. `ProductEntityRecord`
// extends `DraftEntity`, which is camelCase; the DB row is snake_case. A filter
// written against `creator_summary` / `product_url` would typecheck, return
// false for EVERY row, and hide the creator's entire library — a worse bug than
// the one being fixed, with no error anywhere.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const LIB = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx'), 'utf8')
const CODE = LIB.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')

describe('the library renders the narrowed list, not the raw one', () => {
  it('computes the shown list through the shared predicate', () => {
    // ⚖️ RE-PINNED 2026-09-22: the list is now split into her own products and
    // things she promotes for others, but both halves come from the SAME
    // predicate-filtered set, which is the claim this test makes.
    expect(CODE).toMatch(/suppliedEntities\s*=\s*\(entities \?\? \[\]\)\.filter\(rowIsCreatorSupplied\)/)
    // Every group of the shown list is carved out of `suppliedEntities` and
    // nothing else — the raw `entities` never reaches the rendered list.
    // Re-anchored 2026-09-23: each brand box, the loose list and the promoted
    // list are separate `suppliedEntities.filter(...)` groups now.
    expect(CODE).toMatch(/const items = suppliedEntities\.filter\(/)
    expect(CODE).toMatch(/const loose = suppliedEntities\.filter\(/)
    expect(CODE).toMatch(/const promoted = suppliedEntities\.filter\(/)
  })

  it('and the row map reads it', () => {
    // Re-anchored 2026-09-23: the rows render per group through `renderEntity`.
    expect(CODE).toMatch(/\{items\.map\(renderEntity\)\}/)
    expect(CODE).toMatch(/\{loose\.map\(renderEntity\)\}/)
    expect(CODE).toMatch(/\{promoted\.map\(renderEntity\)\}/)
  })

  it('⚖️ while saves and reloads still work on the whole set', () => {
    // Filtering at the source would make an unconfirmed mint un-savable and
    // un-deletable — the problem, worse.
    expect(CODE).toMatch(/setEntities\(rows\)/)
  })
})
