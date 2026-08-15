// THE WORDING THE CREATOR USED THIS TIME MUST REACH THE STORE.
//
// ⚠️ THE MATCHER READS `surface_forms` (0133), SO SOMETHING HAS TO WRITE THEM.
// A matcher reading a column nothing fills is the reader-with-no-writer defect
// this repo has now found in `product_entities`, in six expiring counters and in
// `generations.capability_flags` — and removing the recorder leaves every test
// green, because the merge itself still works.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const INSERT = readFileSync(join(SRC, 'knowledgeInsert.ts'), 'utf8')

describe('the recorder is wired, not merely written', () => {
  it('is called on the canonicalise path', () => {
    expect(INSERT).toMatch(/await recordSurfaceForms\(db, owner, voice, newForms, stored\)/)
  })

  it('selects the column it matches on', () => {
    // ⚠️ WITHOUT THIS THE MEMORY IS WRITE-ONLY. #376 shipped a preference for
    // `source` that was inert for a day because the edge never selected the
    // column; this is the same seam.
    expect(INSERT).toMatch(/\.select\('kind,text,surface_forms'\)/)
  })

  it('reads an absent column as none rather than as broken', () => {
    // A store predating 0133 must keep matching on canonical text exactly as before.
    expect(INSERT).toMatch(/Array\.isArray\(r\.surface_forms\) \? \(r\.surface_forms as string\[\]\) : \[\]/)
  })
})

describe('recording can never cost a scan its knowledge', () => {
  it('bounds the array to what the CHECK accepts', () => {
    // ⚖️ 0133 caps it at twelve. An over-long array would fail the update, and
    // losing a scan because a belief was reworded thirteen times is the worst
    // trade available.
    expect(INSERT).toMatch(/\.slice\(-12\)/)
  })

  it('swallows every failure', () => {
    const fn = INSERT.slice(INSERT.indexOf('async function recordSurfaceForms'), INSERT.indexOf('async function canonicalise'))
    expect(fn).toMatch(/catch \{/)
    expect(fn).not.toMatch(/throw/)
  })

  it('degrades when the client cannot update at all', () => {
    expect(INSERT).toMatch(/typeof table\.update !== 'function'/)
  })
})
