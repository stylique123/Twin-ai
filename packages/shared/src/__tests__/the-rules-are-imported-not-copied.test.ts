// THE SUCCESSOR TO THREE PARITY TESTS THAT POLICED COPIES.
//
// ⚠️ `blueprintSubstanceParity`, `routeSubstanceParity` and `progressCheckParity`
// existed to keep SIX hand-inlined copies of the substance rules in step with
// `knowledgeResolver.ts`. They were doing real work — the cost of drift here is
// measured, not theoretical: a stale copy of the first-person detector once saw
// 2 history beats where `claimStrength` saw 22, for months, with a green suite.
//
// ⚖️ THEY ARE RETIRED BECAUSE THE COPIES ARE GONE, NOT BECAUSE THEY WERE NOISY.
// The edge now IMPORTS the rules from `_shared`, and `check_resolver_parity.mjs`
// holds `_shared` to `packages/shared`. This file guards the remaining link in
// that chain: that the edge has not quietly grown a local copy again.
//
// ⚠️ DELETING THEM WITHOUT THIS WOULD BE A NET LOSS OF COVERAGE, which is the
// trap in "retire the redundant tests" — redundant with what, exactly, has to be
// answerable.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const EDGE = readFileSync(join(REPO, 'supabase/functions/generate-blueprint/index.ts'), 'utf8')

/** Everything the edge must get from the shared module rather than restate. */
const IMPORTED = [
  'evidenceLevel', 'groundingDepth', 'creatorDepth', 'substanceIssues',
  'isProgressCheck', 'SUBSTANCE_SOURCES',
] as const

describe('the substance rules are imported, never copied', () => {
  it('every rule arrives from _shared/knowledgeResolver', () => {
    const block = EDGE.slice(0, EDGE.indexOf('\n\n'))
      + EDGE.slice(0, 4000) // the import region
    for (const name of IMPORTED) {
      expect(block).toMatch(new RegExp(`\\b${name}\\b`))
    }
    expect(EDGE).toMatch(/from '\.\.\/_shared\/knowledgeResolver\.ts'/)
    expect(EDGE).toMatch(/from '\.\.\/_shared\/claimStrength\.ts'/)
  })

  // ⚠️ THE REGRESSION THIS FILE EXISTS FOR. A `function substanceIssues(` in the
  // edge means somebody re-inlined the rule, and the shared tests would keep
  // passing while production graded beats by a different one.
  it('and none of them is re-declared locally', () => {
    for (const name of [...IMPORTED, 'claimStrength', 'tracesTo', 'suppliedLevel']) {
      expect(EDGE).not.toMatch(new RegExp(`^(?:export )?(?:function|const|type) ${name}\\b`, 'm'))
    }
  })

  it('the progress-check pattern is no longer restated at the edge', () => {
    // It lives in `knowledgeResolver` and reaches the edge through
    // `isProgressCheck`, which applies the pattern AND the "beat carries
    // nothing" condition together.
    expect(EDGE).not.toMatch(/const PROGRESS_CHECK\b/)
    expect(EDGE).toMatch(/isProgressCheck\(line,/)
  })

  // ⚖️ ONE BOUNDARY, AND THE DEFENSIVENESS LIVES THERE. The copies differed from
  // shared only by `String()` coercions, because the edge receives untrusted
  // JSON. Coercing once keeps the rules pure and gives one place to reason about.
  it('untrusted knowledge is coerced exactly once', () => {
    expect(EDGE).toMatch(/const asSubstance = \(v: unknown\): SubstanceItem\[\]/)
    expect((EDGE.match(/const asSubstance\b/g) ?? []).length).toBe(1)
  })
})
