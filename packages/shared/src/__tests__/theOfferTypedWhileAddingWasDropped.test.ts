// THE PRICE SAVED WHEN EDITED AND VANISHED WHEN TYPED.
//
// ⚠️⚠️ REPORTED 2026-09-22: "there's no option of offer, so it's not being
// listed, it's not being added, and not being used in script."
//
// Two separate gaps produced one symptom, and each alone looks harmless:
//
//   1. "Add a product" had no offer input at all. The field existed only on the
//      OPENED product, so the price had to be discovered by opening a product
//      you had just finished creating.
//   2. `claimProductEntity`'s INSERT did not write the column. 0222 added
//      `offer`, `EntityAttestation` declares it, `attestedEntity` computes it as
//      `recordedOffer(a.offer)` — and the row build listed `name`,
//      `creator_summary`, `product_url` and not this one.
//
// ⚖️ SO EVEN WIRING THE INPUT ALONE WOULD HAVE CHANGED NOTHING, and nothing
// would have failed: the value was computed, typed correctly, handed to the
// insert, and silently discarded. `updateEntityPresentation` wrote the same
// field fine, so the field "worked" everywhere anyone thought to look.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { attestedEntity } from '../productEntity'

const HERE = dirname(fileURLToPath(import.meta.url))
const API = readFileSync(join(HERE, '..', 'api.ts'), 'utf8')
const FORM = readFileSync(
  join(HERE, '..', '..', '..', '..', 'apps', 'web', 'src', 'pages', 'ProductLibrary.tsx'), 'utf8')

const BASE = {
  relationship: 'OWN_PRODUCT' as const,
  personalUse: 'NOT_CONFIRMED' as const,
  type: 'PHYSICAL_PRODUCT' as const,
  name: 'NFC Digital Business Card Keychain',
}

describe('the attestation carries the price', () => {
  it('keeps an offer the creator typed', () => {
    expect(attestedEntity({ ...BASE, offer: '$28 — one bandana, free shipping over $50' }).offer)
      .toBe('$28 — one bandana, free shipping over $50')
  })

  it('⚖️ and a price nobody typed stays null, not an empty string', () => {
    expect(attestedEntity({ ...BASE }).offer).toBeNull()
    expect(attestedEntity({ ...BASE, offer: '   ' }).offer).toBeNull()
  })
})

describe('and every step between the box and the column exists', () => {
  it('⚠️ the INSERT writes the column — the half that was missing', () => {
    // Source-level because the alternative is a live Supabase round trip. The
    // failure was an ABSENT KEY, which no type check and no unit test on
    // `attestedEntity` can see.
    const row = API.slice(API.indexOf('const row = {', API.indexOf('export async function claimProductEntity')))
    expect(row.slice(0, 1200)).toMatch(/^\s*offer: entity\.offer,/m)
  })

  it('the add form has an offer input', () => {
    expect(FORM).toMatch(/id="product-offer"/)
    expect(FORM).toMatch(/What does it cost, and what do they get\?/)
  })

  it('and it sends what was typed', () => {
    expect(FORM).toMatch(/offer: offer\.trim\(\) \|\| null/)
  })

  it('⚖️ the opened product asks the SAME question, in the same words', () => {
    // Two wordings for one field is how a creator concludes they are two
    // fields, and then fills neither.
    const asks = FORM.match(/What does it cost, and what do they get\?/g) ?? []
    expect(asks.length).toBeGreaterThanOrEqual(2)
  })
})
