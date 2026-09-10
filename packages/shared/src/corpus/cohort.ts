// WHICH VIDEOS COUNT AS EVIDENCE FOR HER — AND WHEN THE ANSWER IS NOTHING.
//
// ⚠️ THIS IS AN INTERNAL SELECTOR, NOT A RECOMMENDATION FEED. Its entire output
// is: which evidence goes into this prompt, and what that evidence proves. The
// creator never sees a ranking. She sees a better script, and one line saying
// why — only where the classification CHANGED what Twin chose.
//
// ⚖️ AND ITS MOST COMMON CORRECT ANSWER IS NOTHING. Measured on the live
// corpus, one goal in seven separates (`entertainment` at 6.36 SE); `authority`
// reads 0.94 and MOVED AWAY from decisive as the corpus grew. So the shape
// block is absent far more often than it is present — not weakened, absent.
//
// ── THE FALLBACK LADDER, AND WHY IT IS A LADDER ─────────────────────────────
//
// ⚠️ AN EXACT SUB-DOMAIN MATCH IS THE STRONGEST SIGNAL AND ALMOST ALWAYS YIELDS
// TOO FEW ROWS. Measured: 46 of 51 voices carry a `sub_niche`, and 634 distinct
// topic labels across the corpus with 554 of them singletons. Requiring an
// exact match would return nothing for nearly everyone.
//
// ⚖️ SO IT DESCENDS, AND EACH RUNG STATES WHICH RUNG IT IS. A cohort assembled
// on `domain` alone is real evidence and much weaker than one assembled on four
// facets; a caller that cannot tell them apart will weigh them the same.

import {
  facetMatch, describeCohort, cohortMayRecommend, MIN_COHORT, type FacetVector,
} from './facets'
import { relativePerformance, medianLift, type RelativeRead } from './relativePerformance'

/** How the cohort was assembled. Strongest first. */
export type CohortRung = 'sub_domain' | 'facets' | 'domain' | 'none'

/** ⚠️ HOW MANY FACETS MUST AGREE FOR THE `facets` RUNG. Three of four, and the
 *  fourth may be unknown rather than wrong — a photographer and a physio agree
 *  on `service · consumer · in_person` and differ on domain, which is exactly
 *  the case the vector exists to admit. */
export const FACET_AGREEMENT = 3

export interface CohortCard {
  /** The card's own facets, as its creator's. */
  facets: FacetVector
  /** Raw reach string as stored. */
  reach: unknown
  /** Every reach by the SAME creator, for the baseline. */
  creatorReaches: readonly unknown[]
  /** Caption-derived shape, or null when unclassified. */
  shape: string | null
}

export interface ShapeEvidence {
  shape: string
  /** Cards in this cohort carrying this shape. */
  n: number
  /** Median of capped lifts — the ranking unit. */
  medianLift: number
}

export interface CohortRead {
  rung: CohortRung
  /** The sentence the cohort says about itself. */
  basis: string
  /** How many cards were selected. */
  size: number
  /** ⚠️ EMPTY WHENEVER THE COHORT MAY NOT RECOMMEND. Not weakened. Empty. */
  shapes: ShapeEvidence[]
  /** True only when the cohort is large enough AND a shape leads decisively. */
  decisive: boolean
}

/**
 * ⚠️ A CARD WITH NO MEASURABLE LIFT IS NOT EVIDENCE ABOUT PERFORMANCE. It stays
 * out of the shape tally entirely rather than entering with a default — a
 * default of "average" floods the ranking with cards nobody measured, and they
 * would outrank genuinely below-average cards that WERE measured.
 */
function liftsByShape(cards: readonly CohortCard[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const c of cards) {
    if (c.shape === null || c.shape === '') continue
    const rel: RelativeRead | null = relativePerformance(c.reach, c.creatorReaches)
    if (rel === null) continue
    const arr = out.get(c.shape)
    if (arr === undefined) out.set(c.shape, [rel.lift])
    else arr.push(rel.lift)
  }
  return out
}

/**
 * ⚠️⚠️ THE SEPARATION RULE, THE SAME ONE THE GOAL/CONTAINER RANKING USES: a lead
 * counts only when the gap exceeds twice the sampling noise on a count,
 * `2 * sqrt(a + b)`. Restated here on cohort COUNTS rather than corpus counts,
 * because the question is different — but the bar is not, and it is set here
 * rather than discovered so it cannot be nudged until a favoured shape wins.
 *
 * ⚖️ THAT SENTENCE DELIBERATELY DOES NOT NAME THE OTHER MODULE.
 * check_symbol_readers greps source and does not strip comments, so naming a
 * symbol here reports it as having acquired a production reader — it did
 * exactly that on this file's first draft, and demanded a registry entry be
 * deleted for a function nothing calls. The guard fix is up separately.
 */
function separates(a: number, b: number): boolean {
  if (a <= 0) return false
  return (a - b) / Math.sqrt(a + b) > 2
}

/**
 * Assemble the strongest cohort available, and say which rung it came from.
 *
 * ⚖️ EVERY RUNG IS TRIED IN ORDER AND THE FIRST ONE THAT CLEARS `MIN_COHORT`
 * WINS. Descending only on size, never on preference — a `domain` cohort is
 * never chosen while a `facets` cohort of 20+ exists.
 */
/**
 * ⚠️ NAMED `selectEvidenceCohort`, NOT `selectCohort`. That name is already
 * taken by the pilot — `supabase/functions/_shared/pilotCore.ts` exports a
 * `selectCohort(rows, size, which)` that picks a review cohort, and
 * pilot-start and pilotDb both call it. Different module, so tsc raised
 * nothing, but check_symbol_readers greps by NAME across production sources
 * and reported this function as already having a reader.
 *
 * ⚖️ RENAMED RATHER THAN REGISTERED AROUND. Two unrelated `selectCohort`s in
 * one repository is a hazard for the next reader as much as for the guard, and
 * the same collision class already cost a rename once this month
 * (`questionsFor` against preScriptBrief's).
 */
export function selectEvidenceCohort(
  her: FacetVector,
  cards: readonly CohortCard[],
): CohortRead {
  const bySubDomain = her.subDomain === null ? [] : cards.filter((c) =>
    c.facets.subDomain !== null
    && c.facets.subDomain.trim().toLowerCase() === her.subDomain!.trim().toLowerCase())

  const byFacets = cards.filter((c) => {
    const m = facetMatch(her, c.facets)
    return m.agreed >= FACET_AGREEMENT
  })

  const byDomain = her.domain === null ? [] : cards.filter((c) => c.facets.domain === her.domain)

  const rungs: ReadonlyArray<[CohortRung, readonly CohortCard[]]> = [
    ['sub_domain', bySubDomain],
    ['facets', byFacets],
    ['domain', byDomain],
  ]

  for (const [rung, selected] of rungs) {
    if (!cohortMayRecommend(selected.length)) continue
    const lifts = liftsByShape(selected)
    const shapes: ShapeEvidence[] = []
    for (const [shape, xs] of lifts) {
      const ml = medianLift(xs)
      if (ml === null) continue
      shapes.push({ shape, n: xs.length, medianLift: ml })
    }
    // ⚖️ ORDERED BY n, NOT BY LIFT. A shape with the highest median lift on
    // three cards is an anecdote; the separation test below is about COUNTS,
    // and ordering by lift would put the anecdote first and invite reading it
    // as the answer.
    shapes.sort((a, b) => b.n - a.n || b.medianLift - a.medianLift || a.shape.localeCompare(b.shape))
    const decisive = shapes.length > 0
      && separates(shapes[0].n, shapes[1]?.n ?? 0)
    return {
      rung,
      basis: describeCohort(her, selected.length),
      size: selected.length,
      // ⚠️ SHAPES ARE RETURNED EVEN WHEN NOT DECISIVE, so a caller can say "we
      // looked and it was a tie" — but `decisive` is the ONLY thing that
      // licenses acting, and `shapeBlock` below returns null without it.
      shapes,
      decisive,
    }
  }

  // ⚖️ NOTHING IS AN ANSWER, AND IT STILL STATES ITS BASIS.
  return { rung: 'none', basis: describeCohort(her, 0), size: 0, shapes: [], decisive: false }
}

export interface ShapeBlock {
  shape: string
  n: number
  medianLift: number
  basis: string
  rung: CohortRung
}

/**
 * What the prompt's SHAPE block should contain, or null.
 *
 * ⚠️⚠️ null MEANS THE BLOCK IS ABSENT FROM THE PROMPT ENTIRELY — not a weakened
 * recommendation, not a hedge, not "we could not determine a shape". Absent.
 * A hedged shape is still a shape in the model's context, and it will be used.
 *
 * ⚖️ AND THE CREATOR SEES NOTHING IN THAT CASE. Silence is not a failure state
 * to report.
 */
export function shapeBlock(read: CohortRead): ShapeBlock | null {
  if (!read.decisive) return null
  if (read.shapes.length === 0) return null
  if (!cohortMayRecommend(read.size)) return null
  const top = read.shapes[0]
  // ⚠️ AND THE LEADING SHAPE ITSELF MUST CLEAR THE FLOOR. A cohort of 340 can
  // still carry a shape on 4 cards; the cohort size is not the shape's n.
  if (top.n < MIN_COHORT) return null
  return {
    shape: top.shape, n: top.n, medianLift: top.medianLift,
    basis: read.basis, rung: read.rung,
  }
}
