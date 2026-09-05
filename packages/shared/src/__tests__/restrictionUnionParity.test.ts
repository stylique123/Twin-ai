// THE INLINED UNION MUST NOT DRIFT FROM THE TESTED ONE.
//
// `generate-blueprint` runs on Deno deploy and cannot import @twinai/shared, so
// the restriction union exists twice: in `productEntity.ts` where its ten tests
// live, and inlined in the edge function where it actually runs.
//
// ⚠️ THE FAILURE THIS PREVENTS is the one the owner named: a contract that
// passes in tests and does something else in production. Tightening a
// relationship rule in shared while the edge kept the old wording would leave
// every real generation governed by the version nobody tested.
//
// This compares the SHIPPED SOURCES. It does not re-implement either — a
// paraphrase here would be the same defect one level up.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/productEntity.ts'), 'utf8')

/** Every derived PROHIBITION, lifted from a source rather than retyped. Retyping
 *  is exactly how the two copies come to disagree.
 *
 *  ⚠️ DISCLOSURES ARE DELIBERATELY OUT OF SCOPE, AND THE FIRST VERSION OF THIS
 *  TEST WAS WRONG TO INCLUDE THEM. It matched "This is a paid…" too and failed —
 *  correctly detecting that the two files word disclosure differently. But that
 *  difference is intentional, not drift: the edge has carried a much stronger,
 *  purpose-written disclosure instruction since long before this union existed
 *  ("a legal obligation, not a stylistic choice, and it may not be traded away
 *  for pacing"), while the shared one-liner exists for the UI. Forcing them
 *  identical would have meant WEAKENING the prompt to match a summary. What
 *  matters is that both REQUIRE disclosure for the same relationships, which is
 *  asserted separately below. */
function prohibitions(src: string): string[] {
  return [...src.matchAll(/(?:push|forbidden\.push)\(\s*(['"`])(Do not[^'"`]*)\1/g)]
    .map((m) => m[2])
}

describe('the relationship-derived rules are word-for-word identical', () => {
  it('lifts the rules that exist rather than comparing nothing', () => {
    // A parity test that silently compares an empty set is worse than no test.
    expect(prohibitions(SHARED).length).toBeGreaterThanOrEqual(2)
  })

  it('both require disclosure for AFFILIATE and SPONSOR, however each words it', () => {
    // ⚖️ THE OBLIGATION IS THE CONTRACT; THE WORDING IS NOT. The edge's
    // instruction is deliberately stronger than the shared summary — see the
    // note on `prohibitions`.
    expect(SHARED).toMatch(/rules\.disclosureRequired/)
    expect(EDGE).toMatch(/const disclosureRequired = rel === 'AFFILIATE' \|\| rel === 'SPONSOR'/)
    expect(EDGE).toMatch(/A DISCLOSURE IS REQUIRED AND IS NOT OPTIONAL/)
  })

  it('every rule the shared module derives appears verbatim in the edge', () => {
    for (const s of prohibitions(SHARED)) {
      expect(EDGE, `edge is missing the shared rule: ${s}`).toContain(s)
    }
  })

  it('the edge invents no derived rule the shared module lacks', () => {
    // ⚠️ DRIFT RUNS BOTH WAYS. A rule added only to the edge is untested; a rule
    // added only to shared never runs.
    const shared = new Set(prohibitions(SHARED))
    for (const s of prohibitions(EDGE)) {
      expect(shared.has(s), `edge has a rule shared does not: ${s}`).toBe(true)
    }
  })
})

describe('both copies keep the properties the union depends on', () => {
  it('the creator sentence is kept whole in both', () => {
    // Chopping on punctuation can invert a clause that depends on its second
    // half — "no guarantees, ever, about income".
    expect(SHARED).toMatch(/if \(creator !== ''\) forbidden\.push\(creator\)/)
    expect(EDGE).toMatch(/if \(creatorForbidden !== ''\) unionForbidden\.push\(creatorForbidden\)/)
  })

  it('both dedupe, so a rule arriving from two levels is said once', () => {
    expect(SHARED).toMatch(/\[\.\.\.new Set\(forbidden\)\]/)
    expect(EDGE).toMatch(/\[\.\.\.new Set\(unionForbidden\)\]/)
  })

  it('an EMPTY approval list is stated, never omitted — §5a.5', () => {
    // ⚠️ SILENCE READS AS "NO RESTRICTION" RATHER THAN "NO PERMISSION". An
    // outcome claim needs an approval that EXISTS; omitting the section when
    // nothing is approved invites the model to supply its own.
    expect(EDGE).toMatch(/NO OUTCOME CLAIM HAS BEEN APPROVED/)
  })

  it('derives NO product rules when there is no product', () => {
    // "Do not imply ownership" with nothing to own would forbid language about a
    // product that is not in the video at all.
    expect(EDGE).toMatch(/if \(ownedEntity && !ownershipLanguage\)/)
    expect(SHARED).toMatch(/if \(input\.entity\) \{/)
  })
})
