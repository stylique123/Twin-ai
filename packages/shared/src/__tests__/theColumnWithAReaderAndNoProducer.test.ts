// `product_entities.evidence` HAS A READER AND NO PRODUCER.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-15, WITH THE CONTRAST THAT EXPLAINS IT:
//
//   rows                     22
//   evidence non-null         0   — not an object, not even '"declined"'
//   knowledge non-null        5   — and all 5 carry knowledge_extracted_at
//                                   AND knowledge_source_url
//   knowledge_failed_at       1
//
// `knowledge` is populated because it HAS a producer: an extraction path with
// its own timestamp column, source-url column and failure column. `evidence`
// is empty because it has none. That is the entire difference between the two
// columns, and it answers the owner's standing question about why one is full
// and the other is not.
//
// Both row-creating paths — the two mints in `productEntity.ts` — write
// `evidence: null`. `saveMintedEntity` and the Product Library update write
// `evidence: entity.evidence`, a pass-through, so they can only ever re-write
// the null they were handed. Nothing in the repository constructs a non-null
// `product_entities.evidence`.
//
// ⚖️ AND THE READER IS REAL, WHICH IS WHY THIS IS A FINDING RATHER THAN DEAD
// WEIGHT. `factsOfProduct` reads `evidence.sections` first and falls back to
// `knowledge`. That fallback is the only reason the product path returns facts
// at all — a reader pointed at an empty column with a populated one beside it.
//
// ⚠️ WHAT THIS FILE DOES *NOT* DO IS DECIDE WHAT EVIDENCE IS. That is a product
// question and an open owner question, and migration 0213 set the precedent by
// refusing to invent a taxonomy and deriving it from rows once they existed. So
// this pins the asymmetry as a KNOWN state with a named owner. The day someone
// adds a producer, the first test here goes red — deliberately: that failure is
// the prompt to revisit this comment and the reader's precedence, not a
// nuisance to delete.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const ENTITY = readFileSync(join(REPO, 'packages/shared/src/productEntity.ts'), 'utf8')
const API = readFileSync(join(REPO, 'packages/shared/src/api.ts'), 'utf8')
const BUILDING = readFileSync(join(REPO, 'apps/web/src/pages/v2/V2Building.tsx'), 'utf8')

// Whole-line comments stripped. The notes added alongside this finding QUOTE
// the field they describe, so a raw grep would read the prose explaining the
// absence of a producer as a producer — a guard reporting success on the very
// thing it exists to catch.
function code(src: string): string {
  return src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
}

describe('nothing in the repository produces a non-null evidence', () => {
  it('both mints write null, and there are exactly two of them', () => {
    const body = code(ENTITY)
    const nulls = body.match(/^\s*evidence: null,$/gm) ?? []
    expect(nulls.length, 'the number of evidence producers changed').toBe(2)
    // Any other assignment to the field in this file would be a producer.
    //
    // ⚠️ REQUIRE THE TRAILING COMMA. My first version matched
    // `^\s*evidence: .*$` and counted THREE — the third being the interface
    // member `evidence: ProductEvidence | 'declined' | null`, a type
    // declaration, not a value. The test was too loose, not the code; an
    // object-literal value always ends in a comma and a member declaration
    // does not, which separates them exactly.
    const all = body.match(/^\s*evidence: .*,$/gm) ?? []
    expect(all.length, 'a mint now writes something other than null').toBe(2)
    expect(body, 'the field is still typed to permit a producer later')
      .toMatch(/evidence: ProductEvidence \| 'declined' \| null/)
  })

  it('the two writers in api.ts pass the record through, they do not construct', () => {
    const body = code(API)
    const writes = body.match(/^\s*evidence: .*$/gm) ?? []
    expect(writes.length).toBeGreaterThan(0)
    for (const w of writes) {
      // `evidence: entity.evidence` (pass-through) and the read-side normaliser
      // are both fine; a literal object or string here would be a producer.
      expect(w, `a constructed evidence value appeared: ${w.trim()}`)
        .not.toMatch(/evidence: \s*[{'"[]/)
    }
  })

  it('the select still asks for the column, so the reader can see it change', () => {
    // If the column were dropped from the projection, a producer added later
    // would populate a field no client ever reads — the same defect one layer
    // down. This is the cheap guard against fixing it into invisibility.
    expect(API).toMatch(/evidence, restrictions/)
  })
})

describe('the reader exists, and reads evidence before knowledge', () => {
  it('factsOfProduct prefers evidence.sections and falls back to knowledge', () => {
    const start = BUILDING.indexOf('factsOfProduct')
    expect(start, 'the reader is gone').toBeGreaterThan(-1)
    const fn = BUILDING.slice(start, BUILDING.indexOf('\n}\n', start))
    const declined = fn.indexOf("'declined'")
    const sections = fn.indexOf('sections')
    const knowledge = fn.indexOf('knowledge')
    expect(declined, 'the explicit refusal is no longer honoured first').toBeGreaterThan(-1)
    expect(sections, 'the evidence branch is gone').toBeGreaterThan(-1)
    expect(knowledge, 'the fallback that actually returns facts today is gone')
      .toBeGreaterThan(-1)
    expect(declined).toBeLessThan(sections)
    expect(sections).toBeLessThan(knowledge)
  })

  it('the fallback is filtered to usable knowledge, not to whatever is there', () => {
    const start = BUILDING.indexOf('factsOfProduct')
    const fn = BUILDING.slice(start, BUILDING.indexOf('\n}\n', start))
    // 5 of 22 rows have knowledge and 1 has knowledge_failed_at, so an
    // unfiltered fallback would hand a failed extraction to the writer.
    expect(fn).toMatch(/usable/)
  })
})

describe('the shape constraint still permits what a producer would write', () => {
  it('the column accepts null, "declined", or an object — so no migration is owed', () => {
    const SQL = readFileSync(join(REPO, 'supabase/migrations/0120_product_entities.sql'), 'utf8')
    expect(SQL).toMatch(/evidence is null or evidence = '"declined"'::jsonb or jsonb_typeof\(evidence\) = 'object'/)
  })
})
