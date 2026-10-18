// THE SHAPE RULE EXISTS TWICE, AND THE ONE THAT RUNS IS THE EDGE FUNCTION'S.
//
// ⚠️ THE MIRROR IS NOT OPTIONAL AND NEITHER IS THIS TEST. An edge function
// cannot import `@twinai/shared` (`generate-blueprint/index.ts:1853`) and the
// worker is forbidden from it too (`directorContract.ts:8`), so the rule that
// decides whether a script gets a SHAPE block has to be duplicated. A second
// authority for one rule is the defect class this codebase keeps closing — the
// only thing that makes it survivable is a test that fails when the two drift.
//
// ⚖️ AND THE NULL CASES ARE THE POINT. `cohort.ts` says it plainly: a hedged
// shape is still a shape in the model's context, and it will be used. A mirror
// that returns a weak shape where the original returns null is WORSE than no
// mirror at all — it puts an unearned recommendation into a paid generation.
// Every one of `shapeBlock`'s four null paths is exercised below on BOTH sides.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  selectEvidenceCohort as sharedSelect, shapeBlock as sharedBlock,
  type CohortCard as SharedCard,
} from '../corpus/cohort'
import { MIN_COHORT as SHARED_MIN_COHORT, type FacetVector as SharedFacets } from '../corpus/facets'
import {
  selectEvidenceCohort as edgeSelect, shapeBlock as edgeBlock,
  MIN_COHORT as EDGE_MIN_COHORT,
} from '../../../../supabase/functions/_shared/cohortShape'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const MIRROR = readFileSync(join(REPO, 'supabase/functions/_shared/cohortShape.ts'), 'utf8')

/**
 * A card the selector will accept, with only the fields under test varied.
 *
 * ⚠️ NO CAST. The first draft of this helper invented a `creator` field and
 * wrote `as SharedCard`, and the cast made seven invalid fixtures compile — the
 * standing note is exactly this: a cast defeats the compiler. The tests passed
 * while varying a field `CohortCard` does not have, so the "distinct creators"
 * in the table were distinguishing nothing. `CohortCard` is facets, reach,
 * creatorReaches and shape. The per-creator baseline lives in `creatorReaches`,
 * NOT in an id.
 */
function card(over: Partial<SharedCard> = {}): SharedCard {
  return {
    facets: { domain: 'health', subDomain: null, customer: null, stageBand: null },
    shape: 'how_to',
    reach: '100000',
    creatorReaches: ['10000', '10000', '10000', '10000', '10000'],
    ...over,
  }
}

// ⚠️ EVERY VALUE HERE IS FROM THE REAL VOCABULARY, and the first draft's were
// not: `domain: 'fitness'` is not a NicheBucket ('health' is) and
// `stageBand: 'growing'` is not a StageBand. Both compiled only because the
// card helper carried a cast. Two of three facets were nonsense, so the
// scenarios below were not the scenarios they were named after.
const HER: SharedFacets = { domain: 'health', subDomain: 'strength', customer: 'consumer', stageBand: '10k_100k' }

/**
 * The fixture table. Each row is a state `shapeBlock` must judge, and the four
 * null paths are named so a failure says WHICH invariant broke.
 */
const FIXTURES: ReadonlyArray<{ name: string; her: SharedFacets; cards: SharedCard[] }> = [
  { name: 'no cards at all — nothing to be decisive about', her: HER, cards: [] },
  {
    name: 'a cohort below the floor cannot recommend',
    her: HER,
    cards: Array.from({ length: 5 }, (_, i) => card()),
  },
  {
    name: 'a big cohort whose LEADING shape is thin — the cohort size is not the shape n',
    her: HER,
    cards: [
      ...Array.from({ length: 40 }, (_, i) => card({ shape: null })),
      ...Array.from({ length: 4 }, (_, i) => card({ shape: 'how_to' })),
    ],
  },
  {
    name: 'two shapes too close to separate',
    her: HER,
    cards: [
      ...Array.from({ length: 22 }, (_, i) => card({ shape: 'how_to' })),
      ...Array.from({ length: 21 }, (_, i) => card({ shape: 'number_promise' })),
    ],
  },
  {
    name: 'a decisive cohort with a clear leader',
    her: HER,
    cards: [
      ...Array.from({ length: 60 }, (_, i) => card({ shape: 'how_to' })),
      ...Array.from({ length: 5 }, (_, i) => card({ shape: 'myth_bust' })),
    ],
  },
  {
    name: 'reach that cannot be parsed contributes no lift',
    her: HER,
    cards: Array.from({ length: 30 }, (_, i) => card({ reach: '0' })),
  },
  {
    name: 'a creator with too few videos has no baseline',
    her: HER,
    cards: Array.from({ length: 30 }, (_, i) => card({ creatorReaches: ['10000'] })),
  },
  {
    // ⚠️⚠️ THIS FIXTURE EXISTS BECAUSE THE TABLE ALMOST MISSED A REAL DRIFT.
    // When MIN_MEDIAN_LIFT landed in shared, ONE of these 19 cases failed — the
    // TEXTUAL check. Every behavioural case still passed, because they all use
    // a 10x lift, so a mirror with no lift gate agreed with a shared copy that
    // had one. Behavioural parity alone would have called a stale mirror
    // correct. These two cases put the gate itself under the comparison.
    name: 'a shape at exactly the creator median — the lift gate, both sides',
    her: HER,
    cards: Array.from({ length: 60 }, () => card({
      reach: '10000', creatorReaches: ['10000', '10000', '10000', '10000', '10000'],
    })),
  },
  {
    name: 'a shape below the creator median is refused by both sides',
    her: HER,
    cards: Array.from({ length: 60 }, () => card({
      reach: '5000', creatorReaches: ['10000', '10000', '10000', '10000', '10000'],
    })),
  },
  {
    name: 'her facets entirely unknown — unknown is not agreement',
    her: { domain: null, subDomain: null, customer: null, stageBand: null },
    cards: Array.from({ length: 60 }, (_, i) => card()),
  },
]

describe('shared ↔ edge shapeBlock parity, on the same fixtures', () => {
  it.each(FIXTURES.map((f) => [f.name, f] as const))('%s', (_name, f) => {
    const s = sharedBlock(sharedSelect(f.her, f.cards))
    const e = edgeBlock(edgeSelect(f.her as never, f.cards as never) as never)
    expect(e).toEqual(s)
  })

  // ⚠️ A NULL IS A RESULT AND MUST BE COMPARED AS ONE. Asserting only on the
  // fixtures that produce a block would let a mirror that never returns null
  // pass every row it was tested on.
  it('the null verdicts are the same set, not merely compatible', () => {
    const sharedNulls = FIXTURES.map((f) => sharedBlock(sharedSelect(f.her, f.cards)) === null)
    const edgeNulls = FIXTURES.map((f) => edgeBlock(edgeSelect(f.her as never, f.cards as never) as never) === null)
    expect(edgeNulls).toEqual(sharedNulls)
    // And the table must actually contain both outcomes, or it proves nothing.
    expect(sharedNulls).toContain(true)
    expect(sharedNulls).toContain(false)
  })

  it('the shared and edge floors are the same number', () => {
    expect(EDGE_MIN_COHORT).toBe(SHARED_MIN_COHORT)
  })
})

describe('the mirror is its originals, not a rewrite of them', () => {
  /** The originals with import lines removed — the rule the mirror is built by. */
  function stripImports(txt: string): string {
    const out: string[] = []
    let skipping = false
    for (const l of txt.split('\n')) {
      if (skipping) { if (/^\} from '/.test(l)) skipping = false; continue }
      if (/^import .* from /.test(l)) continue
      if (/^import \{$/.test(l) || (l.startsWith('import {') && !l.includes(' from '))) { skipping = true; continue }
      out.push(l)
    }
    return out.join('\n')
  }

  // ⚠️ CHARACTER-IDENTICAL, WHITESPACE INCLUDED. A mirror that is "equivalent"
  // is a mirror somebody reasoned about, and the reasoning is what drifts.
  it.each([
    ['corpus/relativePerformance.ts'],
    ['corpus/cohort.ts'],
  ])('%s appears verbatim, imports aside', (rel) => {
    const original = stripImports(readFileSync(join(REPO, 'packages/shared/src', rel), 'utf8')).trim()
    expect(MIRROR).toContain(original)
  })

  // ⚠️ facets.ts IS MIRRORED PER DECLARATION, NOT WHOLE. Carrying the whole file
  // dragged in `facetsOf`, `knownFacets`, `customerOf` and `stageBandOf`, which
  // `cohort.ts` never calls — and `check_symbol_readers` then reported the
  // SHARED copies as having acquired production readers. They had not; the
  // mirror merely contained their text. A mirror that carries unused exports
  // turns a debt register into a false all-clear.
  it.each([
    ['export const MIN_COHORT'],
    ['export interface FacetVector'],
    ['export function facetMatch'],
    ['export function describeCohort'],
    ['export function cohortMayRecommend'],
  ])('facets.ts %s appears verbatim', (marker) => {
    const src = readFileSync(join(REPO, 'packages/shared/src/corpus/facets.ts'), 'utf8')
    const lines = src.split('\n')
    const li = lines.findIndex((l) => l.startsWith(marker))
    expect(li, marker).toBeGreaterThan(-1)
    // The declaration's first line is enough to catch a rename or a signature
    // change; the behavioural fixtures above catch a changed body.
    expect(MIRROR).toContain(lines[li])
  })

  it('the four unused facets declarations are NOT in the mirror', () => {
    for (const n of ['function facetsOf', 'function knownFacets', 'function customerOf', 'function stageBandOf']) {
      expect(MIRROR, n).not.toContain(n)
    }
  })

  it('the mirror adds no exported function of its own', () => {
    // Anything exported here that is not in an original is a rule that exists
    // in one place only — which is how a mirror becomes a fork.
    const names = (src: string) => (src.match(/^export function (\w+)/gm) ?? []).sort()
    const originals = ['corpus/relativePerformance.ts', 'corpus/facets.ts', 'corpus/cohort.ts', 'nicheQuestions.ts']
      .flatMap((r) => names(readFileSync(join(REPO, 'packages/shared/src', r), 'utf8')))
    for (const n of names(MIRROR)) expect(originals, n).toContain(n)
  })
})
