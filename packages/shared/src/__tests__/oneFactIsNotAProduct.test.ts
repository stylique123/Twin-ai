// ONE THIN GRADED FACT SUPPRESSED THE ONE LINE THE CREATOR TYPED THEMSELVES.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14, on the account whose session produced
// the ask-beats:
//
//   Pueblo Bifold ......... 1 usable fact, 70-char creator description
//   The Nook Pattern ...... 1 usable fact, 58-char creator description
//   Custom Bible Rebind ... 0 usable facts, 97-char creator description
//
// The fallback that emits the creator's own description was gated on
// `usableProductFacts.length === 0`. At ZERO it fired, and the Bible-rebind
// scripts read well. At ONE it was withheld while the graded block emitted a
// single attribute — so the writer had a name and one field to build six beats
// from, and asked the creator to supply the rest.
//
// ⚖️ WHICH IS WHY LONGER TARGETS GOT WORSE, MECHANICALLY: the Nook produced
// 1 ask-beat at 30s and 2 at 90s. Same missing input, more beats to fill.
//
// ⚠️⚠️ AND IT EXPLAINS THE CONTRADICTION ON ONE SCREEN, TWO LINES APART: the
// panel read the entity and said "Yours, and you use it"; the scene read these
// facts and said "nothing about it was supplied". Both were true of what they
// read. Neither was true of the product.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
/** ⚠️ CODE LINES ONLY. This region is heavily commented and the prose names
 *  every symbol it discusses, so a whole-file match would be satisfied by the
 *  explanation rather than by the rule. */
const CODE = EDGE.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('the creator\'s own description survives a thin graded block', () => {
  it('is gated on a FLOOR, never on exactly zero', () => {
    // Reader-removal: put `=== 0` back and a product with one graded fact goes
    // back to being written from a name.
    expect(CODE).toContain('usableProductFacts.length < MIN_GRADED_FACTS_TO_STAND_ALONE')
    expect(CODE).not.toContain('usableProductFacts.length === 0')
  })

  it('sets the floor above one, because one fact is the production case', () => {
    const m = CODE.match(/const MIN_GRADED_FACTS_TO_STAND_ALONE = (\d+)/)
    expect(m, 'the floor must be a named constant').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(1)
  })

  it('still emits the graded block whenever there is anything graded', () => {
    // ⚖️ The fix must not have replaced one block with the other. A product with
    // one usable fact should now get BOTH — the fact, and the description.
    expect(CODE).toContain('if (usableProductFacts.length > 0) {')
  })

  it('keeps the description BELOW the graded block, not merged into it', () => {
    // The original design worry — an ungraded sentence inheriting the trust of
    // reviewed ones — is answered by order and label, not by suppression.
    const graded = CODE.indexOf('WHAT IS TRUE ABOUT THIS PRODUCT')
    const own = CODE.indexOf('HOW THE CREATOR DESCRIBES THIS PRODUCT')
    expect(graded).toBeGreaterThan(-1)
    expect(own).toBeGreaterThan(graded)
  })

  it('still labels it unverified, so it cannot be read as a checked fact', () => {
    expect(EDGE).toContain('Nothing has been verified about this product beyond this line')
    expect(EDGE).toMatch(/Do not turn it into a capability claim, a result or a figure/)
  })

  it('still caps the length, so a long paste cannot become the prompt', () => {
    expect(CODE).toContain('creatorSummaryLine.slice(0, 300)')
  })

  it('still selects the column it reads', () => {
    // ⚠️ The original defect was the select omitting it. A floor change must not
    // quietly reintroduce that.
    expect(CODE).toContain('creator_summary')
    expect(CODE).toMatch(/\.select\('id, name, creator_summary,/)
  })
})
