// THE FACTS WERE IN THE OTHER COLUMN.
//
// ⚠️ `factsOfProduct` decides whether Twin already has something it may say
// about the creator's product. Its answer becomes `productFacts` on
// `assessReadiness`, and an empty answer makes `claims` fire as
// MISSING_REQUIRED — the question asking the creator to type out what their
// product does.
//
// It read ONLY `evidence.sections`. MEASURED ON PRODUCTION 2026-09-14 across
// all 22 product_entities rows, every one unarchived:
//
//     evidence populated .......  0 of 22
//     knowledge populated ......  5 of 22   (extracted, graded, array-shaped)
//     knowledge extraction failed  1
//
// So it returned null on 100% of runs. `generationReadiness`'s own note
// describes the resulting harm exactly: "asked, then silently discarded
// server-side once readyFacts.length > 0."
//
// ⚖️ TWO COLUMNS, TWO THINGS. `evidence.sections` is what the product PAGE
// looked like; `knowledge` is the graded facts pulled out of it — the same
// notion the server's `usableProductFacts` works from. V2Building already reads
// `knowledge` 1,600 lines further down to tell the creator "N things Twin can
// say about it". One file, two readers, one pointed at the empty column.
//
// ⚖️ EXECUTED, NOT READ. The function is not exported, so it is lifted and RUN.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const SRC = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

type Facts = readonly string[] | null

function loadFn(): (p: unknown) => Facts {
  const start = SRC.indexOf('function factsOfProduct')
  expect(start, 'factsOfProduct not found').toBeGreaterThan(-1)
  const end = SRC.indexOf('\n}\n', start) + 3
  expect(end).toBeGreaterThan(start)
  const js = transformSync(SRC.slice(start, end), { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(`${js}; return factsOfProduct`)() as (p: unknown) => Facts
}

const factsOfProduct = loadFn()
const fact = (value: string, trust = 'usable') =>
  ({ field: 'what_it_does', value, source: 'marketing_copy', sourceUrl: null, trust, extractedAt: '' })

describe('the page sections still win when there are any', () => {
  it('reads evidence.sections exactly as before', () => {
    expect(factsOfProduct({ evidence: { sections: [{ label: 'What it does' }, { label: 'Price' }] } }))
      .toEqual(['What it does', 'Price'])
  })

  it('prefers sections over knowledge, so nothing regresses', () => {
    // ⚖️ THE CHANGE IS ADDITIVE. If a flow does start populating `evidence`,
    // its answer must be untouched.
    expect(factsOfProduct({
      evidence: { sections: [{ label: 'From the page' }] },
      knowledge: [fact('From the extraction')],
    })).toEqual(['From the page'])
  })
})

describe('the graded facts answer when the page sections do not', () => {
  it('returns usable knowledge values — the 5-of-22 case', () => {
    expect(factsOfProduct({ evidence: null, knowledge: [fact('Rebinds a Bible in three weeks')] }))
      .toEqual(['Rebinds a Bible in three weeks'])
  })

  it('answers when evidence is an empty section list, not just null', () => {
    // ⚠️ AN EMPTY `sections` ARRAY USED TO SHORT-CIRCUIT TO `[]`. That reads as
    // a stated absence rather than "nothing on the page", and it would have
    // hidden the extraction sitting beside it.
    expect(factsOfProduct({ evidence: { sections: [] }, knowledge: [fact('A real fact')] }))
      .toEqual(['A real fact'])
  })

  it('counts ONLY the usable grade', () => {
    // `needs_confirmation` is a fact the creator has not stood behind. Treating
    // it as material would skip the claims question on unconfirmed ground.
    expect(factsOfProduct({
      knowledge: [fact('Unconfirmed', 'needs_confirmation'), fact('Confirmed')],
    })).toEqual(['Confirmed'])
  })

  it('an unreadable grade is not permission', () => {
    // ⚠️ THE FIRST VERSION OF THIS TEST WAS WRONG, NOT THE CODE. It passed
    // `undefined` through `fact()`'s default parameter (`trust = 'usable'`), so
    // the helper quietly supplied the very grade the case meant to withhold and
    // the assertion failed on a fixture that never expressed it. The grades are
    // built literally here instead.
    const grades: unknown[] = ['USABLE', 'Usable', 'true', 1, true, null, {}, []]
    for (const trust of grades) {
      const row = { field: 'what_it_does', value: 'Junk grade', trust }
      expect(factsOfProduct({ knowledge: [row] }),
        `trust ${JSON.stringify(trust)} must not count as usable`).toBeNull()
    }
    // And a MISSING grade — the key absent entirely — is not permission either.
    expect(factsOfProduct({ knowledge: [{ field: 'what_it_does', value: 'No grade at all' }] })).toBeNull()
    // The one spelling that does count, so this is not vacuous.
    expect(factsOfProduct({ knowledge: [{ value: 'Graded', trust: 'usable' }] })).toEqual(['Graded'])
  })
})

describe('the three answers stay three answers', () => {
  it('declined is NO, never a fall-through to the extraction', () => {
    // ⚠️ A REFUSAL IS NOT A SOURCE. A creator who would not hand over the page
    // has no facts on file, whatever else is in the row.
    expect(factsOfProduct({ evidence: 'declined', knowledge: [fact('Should not be read')] })).toBeNull()
  })

  it('an extraction with no usable fact is UNKNOWN, not a stated absence', () => {
    // ⚖️ `assessReadiness` reads `[]` as "nothing was supplied" and `null` as
    // "unknown". A product whose page yielded nothing usable has not been asked
    // yet, so it must be the second. Returning `[]` would report a hole as an
    // answer — and `[]` is "the exact state that produced 70 invented product
    // facts", per generationReadiness.
    expect(factsOfProduct({ knowledge: [] })).toBeNull()
    expect(factsOfProduct({ knowledge: [fact('x', 'needs_confirmation')] })).toBeNull()
  })

  it('no product and junk rows are null, not a crash', () => {
    expect(factsOfProduct(null)).toBeNull()
    expect(factsOfProduct({})).toBeNull()
    expect(factsOfProduct({ knowledge: 'not an array' })).toBeNull()
    expect(factsOfProduct({ knowledge: [null, 7, 'x'] })).toBeNull()
    expect(factsOfProduct({ evidence: { sections: 'nope' }, knowledge: null })).toBeNull()
  })

  it('blank values never become facts', () => {
    expect(factsOfProduct({ knowledge: [fact('   '), fact('')] })).toBeNull()
    expect(factsOfProduct({ knowledge: [fact('  '), fact('Real')] })).toEqual(['Real'])
  })
})
