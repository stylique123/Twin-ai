// TWO IMPLEMENTATIONS OF ONE RULE, EXECUTED SIDE BY SIDE.
//
// ⚠️ `generate-blueprint` CANNOT IMPORT @twinai/shared, so the shape rule has to
// exist twice. A second authority for one rule is the defect class this
// codebase keeps closing; the only thing that makes it survivable is a test
// that FAILS when the two drift.
//
// ⚖️ EXECUTED, NEVER PATTERN-MATCHED. A floor that differs by one, or a `>` that
// became a `>=`, is invisible to a text comparison and changes which creators
// get a SHAPE block at all.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { transformSync } from 'esbuild'
import { selectEvidenceCohort, shapeBlock } from '../corpus/cohort'
import { MIN_COHORT, type FacetVector } from '../corpus/facets'
import { nicheBucket } from '../nicheQuestions'
import type { CohortCard } from '../corpus/cohort'

const EDGE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..',
    'supabase', 'functions', 'generate-blueprint', 'index.ts'), 'utf8')

/** ⚖️ THE INLINE BLOCK IS LIFTED AND RUN, not re-typed. Anything re-typed here
 *  would be a third copy of the rule and would prove nothing about the second. */
function loadInline(): {
  dominantShapeInline: (cards: ReadonlyArray<{ niche: unknown; caption_shape: unknown }>, n: unknown)
    => { shape: string; n: number; basis: string; rung: string } | null
  nicheBucketInline: (n: unknown) => string | null
  renderDominantShapeInline: (b: unknown) => string
} {
  const start = EDGE.indexOf('const NICHE_BUCKET_PATTERNS_INLINE')
  const end = EDGE.indexOf('// ── SUBSTANCE BUDGET (inlined')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const body = EDGE.slice(start, end)
    + '\nreturn { dominantShapeInline, nicheBucketInline, renderDominantShapeInline }'
  const js = transformSync(body, { loader: 'ts', format: 'cjs' }).code
  // eslint-disable-next-line no-new-func
  return new Function(js)() as ReturnType<typeof loadInline>
}

const inline = loadInline()

describe('the two bucket readers agree on every niche the corpus holds', () => {
  const NICHES = [
    'micro-bakery and sourdough', 'ai tools for founders', 'skincare routines',
    'physio and rehab', 'short-form content creation', 'comedy skits and dubbing',
    'real estate investing', 'saas marketing', 'android development',
    '', '   ', 'underwater basket weaving', 'FOOD', 'Fitness Coaching',
  ]
  for (const n of NICHES) {
    it(`agrees on: ${JSON.stringify(n)}`, () => {
      expect(inline.nicheBucketInline(n)).toBe(nicheBucket(n))
    })
  }

  it('the table actually exercises real buckets, or it proves nothing', () => {
    const hit = NICHES.map((n) => nicheBucket(n)).filter((b) => b !== null)
    expect(new Set(hit).size).toBeGreaterThanOrEqual(5)
  })
})

describe('the two shape rules reach the same verdict', () => {
  const HER_NICHE = 'micro-bakery and sourdough'   // bucket: food
  const her: FacetVector =
    { domain: 'food', subDomain: null, customer: null, stageBand: null }

  /** The same cohort expressed the two ways each side consumes it. */
  function bothWays(counts: Record<string, number>, otherBucket = 0) {
    const edge: { niche: unknown; caption_shape: unknown }[] = []
    const shared: CohortCard[] = []
    for (const [shape, n] of Object.entries(counts)) {
      for (let i = 0; i < n; i++) {
        edge.push({ niche: HER_NICHE, caption_shape: shape })
        shared.push({
          facets: { domain: 'food', subDomain: null, customer: null, stageBand: null },
          // ⚠️ REACH IS DELIBERATELY UNREADABLE IN THIS FIXTURE. Neither side
          // may consult it now, so a fixture that supplied a usable one could
          // hide a re-added performance gate on either.
          reach: '0', creatorReaches: [], shape,
        })
      }
    }
    // Cards from another bucket must not be counted by either side.
    for (let i = 0; i < otherBucket; i++) {
      edge.push({ niche: 'ai tools for founders', caption_shape: 'how_to' })
      shared.push({
        facets: { domain: 'tech', subDomain: null, customer: null, stageBand: null },
        reach: '0', creatorReaches: [], shape: 'how_to',
      })
    }
    return { edge, shared }
  }

  const CASES: { name: string; counts: Record<string, number>; other?: number }[] = [
    { name: 'a clear leader', counts: { how_to: 40, myth_bust: 3 } },
    { name: 'the measured business case at n=297', counts: { how_to: 297, story: 12 } },
    { name: 'two shapes too close to separate', counts: { how_to: 30, story: 29 } },
    // ⚠️ THE BOUNDARY BAND, AND ITS ABSENCE LET A MUTANT THROUGH. Weakening the
    // separation from two sigma to one passed the whole table on the first
    // draft, because every case was either obviously clear or obviously tied.
    // 30 vs 20 is 1.41 sigma: a lead under the real rule, a block under a
    // loosened one. A table without the boundary tests the spelling, not the rule.
    { name: 'separates at one sigma but NOT two', counts: { how_to: 30, story: 20 } },
    { name: 'just over two sigma', counts: { how_to: 42, story: 20 } },
    { name: 'leader under MIN_COHORT', counts: { how_to: MIN_COHORT - 1, story: 1 } },
    { name: 'cohort under MIN_COHORT', counts: { how_to: 5 } },
    { name: 'exactly at MIN_COHORT with a clear lead', counts: { how_to: 40, story: 2 } },
    { name: 'one shape only', counts: { how_to: 44 } },
    { name: 'three shapes, clear leader', counts: { how_to: 60, story: 10, myth_bust: 8 } },
    { name: 'a tie at the top', counts: { alpha: 25, beta: 25 } },
    { name: 'other buckets present and ignored', counts: { how_to: 40, story: 2 }, other: 50 },
  ]

  for (const c of CASES) {
    it(`agrees on: ${c.name}`, () => {
      const { edge, shared } = bothWays(c.counts, c.other ?? 0)
      const mine = shapeBlock(selectEvidenceCohort(her, shared))
      const theirs = inline.dominantShapeInline(edge, HER_NICHE)
      // The verdict and the two claimed facts must match. `basis` wording is
      // each side's own sentence and is compared only for the count it states.
      expect(theirs === null).toBe(mine === null)
      if (mine !== null && theirs !== null) {
        expect(theirs.shape).toBe(mine.shape)
        expect(theirs.n).toBe(mine.n)
      }
    })
  }

  it('the case table contains both verdicts, or a mirror that always refuses passes', () => {
    const verdicts = CASES.map((c) => {
      const { shared } = bothWays(c.counts, c.other ?? 0)
      return shapeBlock(selectEvidenceCohort(her, shared)) === null
    })
    expect(new Set(verdicts).size).toBe(2)
  })
})

describe('what the block says when it is rendered', () => {
  it('names structure only, and refuses words, in the text itself', () => {
    const text = inline.renderDominantShapeInline(
      { shape: 'how_to', n: 297, basis: '412 videos from creators in food', rung: 'domain' })
    expect(text).toContain('how_to')
    expect(text).toContain('297')
    // ⚠️ WITHOUT THIS SENTENCE THE MODEL TREATS A CORPUS OBSERVATION AS LICENCE
    // TO BORROW FROM IT — the failure referenceBorrowingBaseline measures.
    expect(text).toMatch(/NO WORDS/)
    expect(text).toMatch(/NOT how well it performed/)
    // And it must not smuggle a performance claim back in as prose.
    expect(text).not.toMatch(/lift|outperform|better than|\bx\b/i)
  })

  it('a null block renders to the empty string, so nothing reaches the prompt', () => {
    expect(inline.renderDominantShapeInline(null)).toBe('')
  })
})

describe('the emission is actually wired into the prompt', () => {
  const code = EDGE.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')
      && !l.trim().startsWith('/*')).join('\n')

  it('the rendered section is interpolated into the prompt text', () => {
    expect(code).toMatch(/\$\{shapeSection\}/)
  })

  it('the block is computed from the corpus read, not from a placeholder', () => {
    expect(code).toMatch(/dominantShapeInline\s*\(/)
    expect(code).toMatch(/from\('gallery_items'\)/)
  })

  it('a truncated corpus read yields no block', () => {
    // A "most common shape" over a slice nobody chose is a confident wrong
    // answer, and a full page is indistinguishable from a complete one.
    expect(code).toMatch(/corpusCardsComplete/)
    expect(code).toMatch(/length\s*<\s*CLASSIFIED_CARD_CAP/)
  })
})
