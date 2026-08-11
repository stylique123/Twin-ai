// THE INLINED COPY MUST NOT DRIFT.
//
// `generate-blueprint` runs on Deno deploy and cannot import @twinai/shared, so
// the substance check exists twice: once in `knowledgeResolver.ts` where the 21
// tests live, and once inlined in the edge function where it actually runs.
//
// ⚠️ THE FAILURE THIS PREVENTS is the one the owner named: a contract that
// passes in tests and does something else in production. Tightening the
// first-person pattern in shared while the edge keeps the old one would leave
// every real generation checked by the version nobody tested.
//
// This reads the EDGE SOURCE and compares it to the shared source. It does not
// re-implement either — a paraphrase here would be the same defect one level up.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/** ⚖️ RELATIVE TO THIS FILE, NEVER TO THE WORKING DIRECTORY. These reads used
 *  `../../…`, which resolves against CWD — so the test passed from
 *  `packages/shared` and threw ENOENT from the repo root. A test whose result
 *  depends on where it was invoked from reports on the invocation. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

import { describe, expect, it } from 'vitest'

const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')
const SHARED = readFileSync(join(REPO, 'packages/shared/src/knowledgeResolver.ts'), 'utf8')

/** Lift a single-line `const NAME = ...` body. Throws rather than returning a
 *  default: a parity test that silently compares nothing is worse than absent. */
function lift(src: string, where: string, name: string): string {
  const m = src.match(new RegExp(`^const ${name} =\\s*\\n?\\s*(.+)$`, 'm'))
  if (!m) throw new Error(`could not lift ${name} from ${where} — fix the marker, do not inline the text`)
  return m[1].trim()
}

describe('edge ↔ shared substance-check parity', () => {
  it('the first-person history pattern is character-identical', () => {
    // The most expensive check in the system: this pattern is the only thing
    // standing between a creator and a fabricated claim about their own life.
    expect(lift(EDGE, 'the edge function', 'FIRST_PERSON_HISTORY'))
      .toBe(lift(SHARED, 'shared', 'FIRST_PERSON_HISTORY'))
  })

  it('the stopword set is identical, so relevance is judged the same way', () => {
    // `tracesTo` decides whether a cited item counts as support. A different
    // stoplist means the same beat passes on one side and fails on the other.
    const edgeStop = lift(EDGE, 'the edge function', 'SUBSTANCE_STOP')
    const sharedStop = lift(SHARED, 'shared', 'STOP')
    expect(edgeStop).toBe(sharedStop)
  })

  it('the edge ladder promotes only what the shared ladder promotes', () => {
    // Written out rather than lifted, because the two functions have different
    // names and signatures. What must match is the RULE: experience requires
    // both the kind and the spoken basis; anything not spoken is coverage.
    for (const src of [EDGE, SHARED]) {
      expect(src).toMatch(/kind === 'experience' && \w+\.basis === 'stated'\)? return 'experience'/)
      expect(src).toMatch(/basis === 'stated'\)? return 'opinion'/)
    }
  })

  it('the edge declares the same three issue codes', () => {
    for (const code of ['unsupported_creator_claim', 'undeclared_evidence', 'unearned_first_person']) {
      expect(EDGE).toContain(code)
    }
  })

  it('the beat schema carries both declaration fields, and requires them', () => {
    // A field the model may omit is a field it will omit. Gemini treats
    // `required` as advisory, but leaving it out guarantees the gap.
    expect(EDGE).toMatch(/substance: str,\n\s*substance_evidence: str,/)
    expect(EDGE).toMatch(/'action_posing', 'substance', 'substance_evidence'\]/)
  })

  it('the check reads the knowledge the PROMPT carried, not the whole store', () => {
    // Checking against `kRows` would excuse the fabrication this exists to
    // catch: a beat could cite something the writer was never shown.
    //
    // ⚖️ ASSERTS THE INVARIANT, NOT THE SPELLING. The first version pinned the
    // literal `substanceIssues(declared, speakable.map` and broke the moment a
    // second checker needed the same set and it was lifted to a named const —
    // a refactor, not a regression. What must hold is that the supplied set is
    // built from `speakable` and that BOTH checks read it.
    expect(EDGE).toMatch(/const suppliedForCheck = speakable\.map/)
    // The third argument (product facts) may be present or not; what must hold
    // is that the SECOND is the set built from `speakable`.
    expect(EDGE).toMatch(/substanceIssues\(declared, suppliedForCheck[,)]/)
    expect(EDGE).toMatch(/entitlementFailures\(declared, suppliedForCheck\)/)
    // And neither may reach past it to the full store.
    expect(EDGE).not.toMatch(/substanceIssues\(declared, kRows/)
    expect(EDGE).not.toMatch(/entitlementFailures\(declared, kRows/)
  })

  it('entitlement is ENFORCED, not merely reported', () => {
    // The behaviour that let 11 fabricated histories ship was detect-then-log.
    // A repair must be attempted, re-checked, and what survives must never be
    // spoken as written.
    expect(EDGE).toMatch(/entitlement_blocked/)
    expect(EDGE).toMatch(/entitlement_repair/)
    // Re-check after repair — a repair nobody verified is the trust we just withdrew.
    expect(EDGE).toMatch(/entFails = entitlementFailures\(declared, suppliedForCheck\)[\s\S]{0,200}still_failing/)
    // Survivors become a question, not a fabrication.
    expect(EDGE).toMatch(/b\.substance = 'needs_user'/)
  })

  it('the claim-strength patterns match the shared module character for character', () => {
    expect(lift(EDGE, 'the edge function', 'CLAIM_HISTORY'))
      .toBe(lift(readFileSync(join(REPO, 'packages/shared/src/claimEntitlement.ts'), 'utf8'), 'shared', 'HISTORY'))
    expect(lift(EDGE, 'the edge function', 'CLAIM_POSITION'))
      .toBe(lift(readFileSync(join(REPO, 'packages/shared/src/claimEntitlement.ts'), 'utf8'), 'shared', 'POSITION'))
  })
})

// THE OTHER DECLARED SOURCE, CHECKED THE SAME WAY IN BOTH COPIES.
describe('edge ↔ shared product_dna parity', () => {
  it('both declare the same two product issue codes', () => {
    for (const src of [EDGE, SHARED]) {
      expect(src).toContain('impossible_product_claim')
      expect(src).toContain('unsupported_product_claim')
    }
  })

  it('both gate the product check on the three-state rule', () => {
    // `productFacts != null` and not a truthiness test: `[]` is truthy in a
    // boolean sense but is the case that MUST fire, and `undefined` is the case
    // that must not. A `!productFacts` guard would invert exactly this.
    for (const src of [EDGE, SHARED]) {
      expect(src).toMatch(/source === 'product_dna' && productFacts != null/)
      expect(src).toMatch(/productFacts\.length === 0/)
    }
  })

  it('both trace product citations with the SAME matcher as creator knowledge', () => {
    for (const src of [EDGE, SHARED]) {
      expect(src).toMatch(/function tracesToText\(/)
      // `tracesTo` must delegate, not carry a second copy of the rule.
      expect(src).toMatch(/tracesTo\([\s\S]{0,120}\n?\s*return tracesToText\(/)
    }
  })

  it('the edge reads the product facts it actually PUT IN THE PROMPT', () => {
    // ⚠️ Reading the brief instead would check the beat against facts the
    // writer never saw — the identical mistake `suppliedForCheck` exists to
    // avoid on the knowledge side, and the reason 70 beats cited a source the
    // prompt did not carry.
    expect(EDGE).toMatch(/const productFactsForCheck: string\[\] = ev &&/)
    expect(EDGE).toMatch(/substanceIssues\(declared, suppliedForCheck, productFactsForCheck\)/)
    expect(EDGE).not.toMatch(/substanceIssues\(declared, suppliedForCheck, brief/)
  })
})

// DETECTION IS WIRED TO AN OUTCOME, NOT TO A LOG LINE.
describe('the product check is ENFORCED', () => {
  it('escalates product failures to a question the creator can answer', () => {
    // The first version of this check landed as a console.warn on a defect that
    // ran 70 times per 112 scripts. This file had already paid for
    // detect-then-log once, with 11 fabricated histories.
    expect(EDGE).toMatch(/const productFails = issues\.filter/)
    expect(EDGE).toMatch(/impossible_product_claim' \|\| i\.code === 'unsupported_product_claim'/)
    expect(EDGE).toMatch(/product_claim_escalated/)
  })

  it('marks the escalated beat needs_user and clears its false citation', () => {
    // Leaving `substance_evidence` in place would keep a citation to a source
    // that does not exist attached to a beat we just admitted we cannot fill.
    expect(EDGE).toMatch(/productEscalated[\s\S]{0,1200}b\.substance = 'needs_user'/)
    expect(EDGE).toMatch(/b\.substance_evidence = ''/)
  })

  it('never double-escalates a beat the entitlement pass already took', () => {
    expect(EDGE).toMatch(/if \(!b \|\| b\.substance === 'needs_user'\) continue/)
  })

  it('does NOT send product failures to the repair model', () => {
    // ⚖️ Deliberate. An entitlement failure has a true weaker statement to fall
    // back to; an impossible product claim has no floor at all, and the repair
    // call returns lines without declarations, so the false `substance` would
    // survive the rewrite untouched.
    const repairPrompt = EDGE.slice(EDGE.indexOf('const repairPrompt'), EDGE.indexOf('RE-CHECK.'))
    expect(repairPrompt).not.toMatch(/productFails/)
  })
})

describe('a script that is mostly questions is visible in production', () => {
  it('logs the density rather than inferring it later from a confused creator', () => {
    // Replayed over the last matrix, one script would have had 5 of 6 beats
    // escalated. Per beat that beats a fabrication; at that density it is a
    // different product.
    expect(EDGE).toMatch(/script_mostly_questions/)
    expect(EDGE).toMatch(/asked \/ totalBeats >= 0\.4/)
  })

  it('counts what the beats actually SAY, not what was escalated this pass', () => {
    // Counting `productEscalated + entFails.length` would miss beats the model
    // itself declared needs_user, which are the same experience for the creator.
    expect(EDGE).toMatch(/\?\.substance === 'needs_user'\)\.length/)
  })
})
