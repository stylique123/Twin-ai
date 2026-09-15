// TWO PRODUCTS THAT AGREED ANSWERED NOTHING, AND THE ASK HAD NO WAY OUT.
//
// ⚠️ `libraryRelationship` resolved the creator's relationship to their work
// from the Product Library when this run selected no product. It ended:
//
//     return answered.length === 1 ? answered[0].relationship : null
//
// One product resolved. TWO returned null even when both said the same thing —
// and null makes readiness report `relationship` as MISSING_REQUIRED, which
// renders the ask whose only action is "Open Product Library to set it →": a
// page where it is already set. Go, see it set, come back, asked again.
//
// ⚠️⚠️ MEASURED ON PRODUCTION 2026-09-14, per voice, over unarchived products
// carrying an answered relationship:
//
//   exactly one ............................... 11   resolved today
//   MORE THAN ONE, ALL AGREEING ...............  3   returned null: BROKEN
//   more than one, genuinely disagreeing ......  2
//
// Three plus two is exactly the five accounts the owner measured as unable to
// complete `Sell something` or `Get leads`. The reporting account holds two
// products per voice, both OWN_PRODUCT — which is why "a complete, named
// product with a set relationship" still dead-ended.
//
// ⚖️ EXECUTED, NOT READ. The function is not exported, so it is extracted and
// run, the same way the owner-console parity tests run their card. A test that
// only grepped the source could not tell unanimity from a count.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SRC = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

type Rel = string | null
interface P { name?: string | null; relationship?: Rel }

/** ⚠️ THE REAL FUNCTION, LIFTED AND RUN. */
function loadFn(): (products: readonly P[] | null, offer?: string | null) => Rel {
  const start = SRC.indexOf('function libraryRelationship')
  expect(start, 'libraryRelationship not found').toBeGreaterThan(-1)
  // Bounded on the closing brace at column zero, so the next declaration is
  // not swallowed — a loose bound is how an extraction test starts asserting
  // about code it did not mean to include.
  const end = SRC.indexOf('\n}\n', start) + 3
  expect(end).toBeGreaterThan(start)
  const block = SRC.slice(start, end)
  const js = transformSync(block, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return libraryRelationship`)() as ReturnType<typeof loadFn>
}

const libraryRelationship = loadFn()

describe('unanimity is an answer', () => {
  it('resolves when two products agree — the measured broken case', () => {
    const two: P[] = [
      { name: 'Custom Bible Rebind', relationship: 'OWN_PRODUCT' },
      { name: 'The Nook Pattern', relationship: 'OWN_PRODUCT' },
    ]
    expect(libraryRelationship(two, null)).toBe('OWN_PRODUCT')
  })

  it('resolves for four agreeing products, however many there are', () => {
    const four: P[] = Array.from({ length: 4 }, (_, i) => (
      { name: `p${i}`, relationship: 'OWN_SERVICE' }))
    expect(libraryRelationship(four, null)).toBe('OWN_SERVICE')
  })

  it('still resolves the single-product case it always handled', () => {
    expect(libraryRelationship([{ name: 'x', relationship: 'AFFILIATE' }], null)).toBe('AFFILIATE')
  })
})

describe('disagreement is NOT an answer', () => {
  it('returns null when two products genuinely differ', () => {
    // ⚖️ Picking one would guess at which product this video is about, and that
    // is a different question with its own picker. Two production voices are in
    // this state and the null is correct for them.
    const mixed: P[] = [
      { name: 'a', relationship: 'OWN_PRODUCT' },
      { name: 'b', relationship: 'AFFILIATE' },
    ]
    expect(libraryRelationship(mixed, null)).toBeNull()
  })

  it('an exact offer-name match still wins over unanimity', () => {
    // The name match is more specific than the set, and it ran first before
    // this change. It must still run first.
    const mixed: P[] = [
      { name: 'Alpha', relationship: 'OWN_PRODUCT' },
      { name: 'Beta', relationship: 'AFFILIATE' },
    ]
    expect(libraryRelationship(mixed, 'beta')).toBe('AFFILIATE')
    expect(libraryRelationship(mixed, '  BETA  ')).toBe('AFFILIATE')
  })
})

describe('an unanswered library is still unanswered', () => {
  it('ignores NONE and null relationships rather than counting them', () => {
    // ⚠️ `NONE` is "I sell nothing", which is an answer elsewhere but not a
    // relationship to a product. Counting it would make a creator with one real
    // product and one NONE row look ambiguous.
    const withNone: P[] = [
      { name: 'a', relationship: 'NONE' },
      { name: 'b', relationship: 'OWN_PRODUCT' },
    ]
    expect(libraryRelationship(withNone, null)).toBe('OWN_PRODUCT')
    expect(libraryRelationship([{ name: 'a', relationship: 'NONE' }], null)).toBeNull()
    expect(libraryRelationship([{ name: 'a', relationship: null }], null)).toBeNull()
  })

  it('returns null for an empty or absent library', () => {
    expect(libraryRelationship([], null)).toBeNull()
    expect(libraryRelationship(null, null)).toBeNull()
  })
})
