// THE CARD ASKED "DO YOU HAVE A PRODUCT?" ON 13 OF 13 RUNS, TO A CREATOR WITH FOUR.
//
// ⚠️ MEASURED ON PRODUCTION 2026-09-14, on the account that reported it:
//
//   product_entities rows (not archived) ... 4, across two voices
//   every one's relationship .............. OWN_PRODUCT
//   pre_script_brief.commercialTies ....... ["unspecified"]
//
// `unrecordedProduct` comes from `commercialConsistencyInline`, which returns
// `unrecorded` only when BOTH stores are silent. `fromTies` was null because
// "unspecified" is not a tie; `fromEntity` was null because it reads the entity
// THIS RUN SELECTED, and a run that selected none has none. Both silent, so the
// verdict was `unrecorded` — and the script told a man with four products that
// it did not know whether he had one, on scripts that named one in every scene.
//
// ⚖️ THE PROMPT INSTRUCTION WAS NEVER WRONG, AND IS UNCHANGED. A product this
// run did not select genuinely cannot carry a scene, whatever else is in the
// library. What was wrong is that the CARD inherited that boolean, and the card
// asks a different question — one the library answers on its own.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
/** ⚠️ CODE LINES ONLY — this region's prose names every symbol it discusses. */
const CODE = EDGE.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('the card stops asking once the library has answered', () => {
  it('gates the flag on the library, not on this run\'s selection alone', () => {
    // Reader-removal: drop `&& !hasAnyProductRow` and the card goes back to
    // asking a creator with four products whether he has one.
    expect(CODE).toMatch(/product_capture_prompt\s*=\s*\n?\s*unrecordedProduct && !hasAnyProductRow/)
  })

  it('counts ANY product the creator owns, head-only and unarchived', () => {
    const at = CODE.indexOf('hasAnyProductRow')
    expect(at).toBeGreaterThan(-1)
    const block = CODE.slice(at, at + 700)
    expect(block).toContain("from('product_entities')")
    // ⚠️ THIS PINNED `{ count: 'exact', head: true }` AND THE ANCHOR WENT
    // STALE WHEN THE THING IT PINNED CHANGED. A head-only count answered the
    // question for rows nobody put anything in: an onboarding mint is nameless
    // BY DESIGN, so a bare count reported the question closed and the card
    // never rendered again. The claim this file makes is unchanged and the
    // three assertions that carry it are untouched; only the implementation
    // detail moved, so it is RE-ANCHORED on the rule that replaced it rather
    // than re-litigated. Strictly more is asserted than before.
    expect(block).toContain('rowAnswersProductQuestionInline')
    expect(block).toContain("eq('owner_id', user.id)")
    // ⚖️ An archived product is not a product she has.
    expect(block).toContain("is('archived_at', null)")
  })

  it('leaves the question OPEN when the count fails, never closes it', () => {
    // ⚠️ ASKING A CREATOR WHO HAS ONE IS A SMALL ANNOYANCE. Silently never
    // asking one who does not is the defect the card exists for, so a failed
    // read must fall to false.
    const at = CODE.indexOf('hasAnyProductRow = false')
    expect(at).toBeGreaterThan(-1)
    const decl = CODE.indexOf('let hasAnyProductRow = false')
    expect(decl).toBeGreaterThan(-1)
    // The catch must reset to false rather than assume a product exists.
    const catchAt = CODE.indexOf('} catch {', decl)
    expect(catchAt).toBeGreaterThan(decl)
    expect(CODE.slice(catchAt, catchAt + 120)).toContain('hasAnyProductRow = false')
  })

  it('does NOT change the prompt instruction, which was already correct', () => {
    // ⚖️ `unrecordedProduct` still drives the DO-NOT-USE line on its own. A
    // product this run did not select cannot carry a scene.
    // ⚠️⚠️ ANCHORED ON THE DECLARATION LINE ITSELF, BECAUSE A WINDOW MISSED IT.
    // The first version of this test looked at the 400 characters preceding the
    // DO-NOT-USE string and asserted `hasAnyProductRow` was absent there — but
    // the declaration sits further above than that, so a mutant that appended
    // `&& !hasAnyProductRow` to the DECLARATION passed. The test was wrong, not
    // the code. The whole line is pinned now, terminator included.
    const decl = CODE.match(/const unrecordedProduct = [^\n]*/)
    expect(decl).not.toBeNull()
    expect(decl![0]).toBe("const unrecordedProduct = tieConsistency.verdict === 'unrecorded'")
    const doNot = EDGE.indexOf('PRODUCT DEMONSTRATION — it is NOT RECORDED')
    expect(doNot).toBeGreaterThan(-1)
  })

  it('still lets the card fire for a creator with nothing recorded anywhere', () => {
    // The card must not be disabled outright — that would trade one silent
    // failure for another.
    expect(CODE).toContain('unrecordedProduct && !hasAnyProductRow')
    expect(CODE).not.toContain('product_capture_prompt = false')
  })
})
