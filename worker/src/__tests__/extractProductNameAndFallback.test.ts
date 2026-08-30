// THE NAME A PAGE STATED NEVER REACHED THE COLUMN THE CARD ACTUALLY READS.
//
// ⚠️ THE DEFECT, TRACED FROM THE CREATOR'S REPORT. The add form's link-only
// path tells a creator "Twin will read this from the page" and leaves `name`
// blank on purpose. The extractor DID file a `name` fact into `knowledge` --
// but `product_entities.name`, the column `apps/web/src/pages/ProductLibrary.tsx`
// actually renders in the Name field, was never written by anything after the
// initial claim. So the card kept showing its placeholder no matter how many
// times the page was successfully read: the READ side (`readEntityRow`,
// `defaultValue={e.name ?? ''}`) was correct throughout, and the WRITE side
// (`extractProduct.ts`) was the gap.
//
// This is a source-inspection test, matching this file's neighbours
// (`extractProductHead.test.ts`, `extractProductModel.test.ts`) rather than a
// runtime test — `db` is a real Supabase client constructed at import time with
// no injection point, the same reason those tests read the source too.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'jobs', 'extractProduct.ts'), 'utf8')

describe('a name the page stated reaches the column the card reads', () => {
  it('reads the existing name and an extracted name fact before deciding whether to write', () => {
    expect(SRC).toMatch(/existingName/)
    expect(SRC).toMatch(/facts\.find\(\(f\) => f\.field === 'name'\)/)
  })

  it('only fills the column when the creator never set one themselves', () => {
    // ⚠️ THE GUARD IS THE WHOLE POINT. Without it, a creator's own typed name
    // would be silently overwritten by whatever the next re-read of the page
    // happened to say.
    const guard = SRC.slice(SRC.indexOf('const nameUpdate'), SRC.indexOf('const nameUpdate') + 220)
    expect(guard).toMatch(/existingName === null/)
    expect(guard).toMatch(/existingName\.trim\(\) === ''/)
  })

  it('the name update is actually spread into the update payload', () => {
    const update = SRC.slice(SRC.indexOf("db.from('product_entities').update({\n    knowledge,"))
    expect(update.slice(0, 400)).toMatch(/\.\.\.nameUpdate/)
  })
})

describe("the creator's own sentence is the floor under a page that cannot be read", () => {
  it('builds a user_confirmed description fact from creator_summary when the page is unreadable', () => {
    const branch = SRC.slice(
      SRC.indexOf('if ((!text || text.length < 80)'),
      SRC.indexOf('return { extracted: fallback.length'))
    expect(branch).toMatch(/creatorSummary/)
    expect(branch).toMatch(/field: 'description'/)
    expect(branch).toMatch(/source: 'user_confirmed'/)
    expect(branch).toMatch(/trust: 'usable'/)
  })

  it('selects creator_summary off the row so the fallback has something to read', () => {
    expect(SRC).toMatch(/select\('product_url, owner_id, name, creator_summary'\)/)
  })
})
