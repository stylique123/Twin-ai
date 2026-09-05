// UNRECORDED IS NOT NONE — pinned against the edge source that actually runs.
//
// ⚠️ THE DEFECT. `generate-blueprint` derived its product refusal from
//
//     const noProduct = !ownedEntity || ownedEntity.relationship === 'NONE'
//
// and emitted "this creator has no product" whenever it was true. Those two
// operands are not the same fact. `relationship === 'NONE'` is an ANSWER the
// creator gave. `!ownedEntity` is the absence of a row — and `product_entities`
// is written from exactly one place, a browser tap on the onboarding confirm
// step, and held ZERO rows in production. So the second operand was true for
// every generation this system had ever run, and every script was told as a
// fact something nobody had ever observed.
//
// ⚖️ WHY THIS IS A SOURCE-READING GUARD AND NOT A UNIT TEST. The block is inline
// in the edge function, which cannot import from here (Deno deploy), and it
// builds prompt TEXT rather than returning a value. Re-implementing it in a test
// would check a paraphrase — the exact failure `blueprintSubstanceParity`
// exists to prevent — so this reads the shipped source instead.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ⚖️ Relative to THIS FILE, never to the working directory — a test whose result
// depends on where it was invoked from reports on the invocation.
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

describe('the product refusal separates a recorded NONE from an unrecorded one', () => {
  it('the two states are derived SEPARATELY, not collapsed into one flag', () => {
    // ⚠️ THE SOURCE CHANGED AND THE SEPARATION DID NOT. Both states used to be
    // read off `ownedEntity` ALONE, and that made `recordedNoProduct`
    // unreachable: ZERO production entities carry NONE, because the "I sell
    // nothing" answer writes `pre_script_brief.commercialTies`, which this file
    // never read. Both now consult both stores; they remain two derivations.
    expect(EDGE).toMatch(
      /const recordedNoProduct = saysSellsNothingInline\(briefTies, ownedEntity\?\.relationship\)/)
    expect(EDGE).toMatch(/const unrecordedProduct = tieConsistency\.verdict === 'unrecorded'/)
  })

  // ⚖️ AND THE ENTITY-ONLY FORM MUST NOT COME BACK. It is not merely narrower —
  // it is a condition that was never once true in production, so restoring it
  // silently disables the refusal rather than weakening it.
  it('never re-derives the recorded case from the entity alone', () => {
    expect(EDGE).not.toMatch(
      /const recordedNoProduct = !!ownedEntity && ownedEntity\.relationship === 'NONE'/)
    expect(EDGE).not.toMatch(/const unrecordedProduct = !ownedEntity\b/)
  })

  it('the exact collapsed expression never comes back', () => {
    // ⚠️ THE REGRESSION THIS CATCHES. Re-deriving the refusal from `noProduct`
    // is a one-token edit away and silently restores the assertion.
    expect(EDGE).not.toMatch(/const noProduct = !ownedEntity \|\| ownedEntity\.relationship === 'NONE'/)
  })

  it('only the RECORDED answer may assert the creator has no product', () => {
    // The hard sentence must be reachable from `recordedNoProduct` and from
    // nothing else. Guarding on the flag rather than on the prose means a
    // reworded refusal still has to pick the right branch.
    // ⚠️ ANCHOR ON THE PROMPT LITERAL, NOT THE BARE PHRASE. A first version
    // searched for "this creator has no product" and matched the EXPLANATORY
    // COMMENT a few lines above the code, which sits before `recordedNoProduct`
    // is declared — so the guard reported on its own prose and failed. The
    // quoted `* PRODUCT DEMONSTRATION —` prefix only occurs in emitted text.
    const hard = EDGE.indexOf("'  * PRODUCT DEMONSTRATION — this creator has no product")
    expect(hard).toBeGreaterThan(-1)
    const guard = EDGE.lastIndexOf('recordedNoProduct', hard)
    const wrongGuard = EDGE.lastIndexOf('unrecordedProduct', hard)
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(wrongGuard)
  })

  it('the unrecorded branch claims nothing about whether a product exists', () => {
    // ⚖️ IT STILL GUARDS, IT JUST DOES NOT ASSERT. The line must forbid a scene
    // that DEPENDS on a product — safe whether or not they have one — without
    // stating that they do or do not.
    const start = EDGE.indexOf('unrecordedProduct\n        ?')
    expect(start).toBeGreaterThan(-1)
    const line = EDGE.slice(start, start + 600)
    expect(line).toMatch(/NOT RECORDED/)
    expect(line).toMatch(/do not assume either way/i)
    expect(line).toMatch(/depends on showing, holding or demonstrating/i)
    // The assertion from the old behaviour must not appear in this branch.
    expect(line).not.toMatch(/this creator has no product/)
  })

  it('the unrecorded branch also forbids INVENTING a product', () => {
    // ⚠️ The opposite failure. Removing the false "no product" claim without
    // this leaves the writer free to name one, which is how a guess becomes a
    // product the creator has never heard of.
    const start = EDGE.indexOf('unrecordedProduct\n        ?')
    expect(EDGE.slice(start, start + 600)).toMatch(/do NOT name or invent a product/i)
  })
})
