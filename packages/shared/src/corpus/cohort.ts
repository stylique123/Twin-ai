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

/** How the cohort was assembled. Strongest first.
 *
 *  ⚠⚠ `all` IS THE WEAKEST RUNG AND IT IS DELIBERATELY LAST. It answers a
 *  different question from the three above it: not "what do creators like her
 *  do" but "what does this corpus do", which is a fact about the scrape as much
 *  as about the craft. It exists because the ladder without it reached ONE
 *  creator in seven.
 *
 *  ⚠️ MEASURED 2026-09-13, AND BOTH HALVES MATTER. By niche bucket, 1 of 7
 *  buckets clears MIN_COHORT with 2-sigma separation (entertainment 46v6,
 *  sigma 5.55; business 91v66 is 2.00 and the bar is a strict >). Across all
 *  niches: 596 cards, direct_question 279 vs how_to 151, sigma 6.17. So the
 *  global cohort is decisive where six of seven niche cohorts are not.
 *
 *  ⚖️ IT IS ONLY HONEST BECAUSE THE BASIS SAYS SO. `describeCohort` renders
 *  this rung as "videos across all niches", never as her niche, so a global
 *  shape can never reach the writer disguised as niche-specific advice. A rung
 *  that lied about its breadth would be worse than no rung. */
export type CohortRung = 'sub_domain' | 'facets' | 'domain' | 'all' | 'none'

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
  /**
   * ⚠️ CARDS IN THIS COHORT CARRYING THIS SHAPE — ALL OF THEM, AND THAT IS A
   * CHANGE. This used to be the count of cards whose LIFT resolved, which is a
   * different number and a smaller one: a card whose creator had too few
   * reaches to form a baseline carried the shape but was not counted as
   * carrying it. Since the block now says "n=340" and nothing else, `n` has to
   * mean what a reader will take it to mean — how many videos in this cohort
   * had this shape.
   */
  n: number
  /**
   * Median of capped lifts, or null where no card in this shape had a
   * measurable one.
   *
   * ⚠️⚠️ INTERNAL EVIDENCE ONLY. It is NOT emitted, NOT gated on, and NOT used
   * to order — see `shapeBlock`. It is computed and carried so the layer stays
   * wired for the recalibration, and so a shape with no measurable lift is
   * visibly `null` rather than quietly absent from the tally.
   */
  medianLift: number | null
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
 * Tally the cohort by shape: every card counted, its lift kept where it exists.
 *
 * ⚠️ THIS USED TO DROP A CARD WHOSE LIFT DID NOT RESOLVE, and that was right
 * while the block asserted a performance relationship — a card nobody measured
 * is not evidence ABOUT PERFORMANCE. It is the wrong rule for a block that now
 * asserts only frequency: a video's shape is observable whether or not its
 * creator had a usable baseline, and dropping it understates the count the
 * prompt is about to state.
 */
function tallyByShape(
  cards: readonly CohortCard[],
): Map<string, { n: number; lifts: number[] }> {
  const out = new Map<string, { n: number; lifts: number[] }>()
  for (const c of cards) {
    if (c.shape === null || c.shape === '') continue
    let bucket = out.get(c.shape)
    if (bucket === undefined) { bucket = { n: 0, lifts: [] }; out.set(c.shape, bucket) }
    bucket.n++
    const rel: RelativeRead | null = relativePerformance(c.reach, c.creatorReaches)
    if (rel !== null) bucket.lifts.push(rel.lift)
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
    // ⚠️ LAST, ALWAYS. Descending by specificity, so a niche cohort of 20+ is
    // never passed over for this one -- the loop returns at the first rung that
    // clears the floor, and this is only reached when the three above it did not.
    ['all', cards],
  ]

  for (const [rung, selected] of rungs) {
    if (!cohortMayRecommend(selected.length)) continue
    const tally = tallyByShape(selected)
    const shapes: ShapeEvidence[] = []
    for (const [shape, t] of tally) {
      shapes.push({ shape, n: t.n, medianLift: medianLift(t.lifts) })
    }
    // ⚖️ ORDERED BY n, AND THE TIE-BREAK IS THE NAME, NOT THE LIFT. Ordering
    // by lift would put an anecdote first and invite reading it as the answer;
    // it would also make the order depend on a lift that is degenerate on this
    // corpus — 48.8% of classified cards come from a creator with ONE card,
    // whose own median is that card. A deterministic alphabetical tie-break
    // decides nothing and cannot be read as a claim.
    shapes.sort((a, b) => b.n - a.n || a.shape.localeCompare(b.shape))
    const decisive = shapes.length > 0
      && separates(shapes[0].n, shapes[1]?.n ?? 0)
    return {
      rung,
      // ⚠⚠ THE GLOBAL RUNG MUST NOT BORROW HER FACETS FOR ITS BASIS.
      // `describeCohort` renders the cohort as HER description -- "From 596
      // videos by fitness, consumer" -- which for the `all` rung would claim a
      // match nobody made, and would reach the writer as niche-specific advice
      // built from every niche. That lie is the only thing that could make this
      // rung worse than having no rung, so it is stated separately.
      basis: rung === 'all'
        ? `From ${selected.length} ${selected.length === 1 ? 'video' : 'videos'} across all niches.`
        : describeCohort(her, selected.length),
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

/**
 * ⚠️⚠️ THERE IS NO LIFT IN THE BLOCK, AND ITS ABSENCE IS THE DESIGN.
 *
 * This file used to gate on `MIN_MEDIAN_LIFT = 1.2` and emit `medianLift`
 * alongside the shape. Both are gone. The measurement that removed them is
 * kept here because it is the reason, and because it is what the recalibration
 * has to overturn:
 *
 * Simulated against the whole production corpus on 2026-09-10, with 2,116
 * classified cards, this function returned a block for four of seven niche
 * buckets — and every one carried `medianLift` of EXACTLY 1.0000:
 *
 *     business         how_to          n=297   lift 1.0000
 *     tech             how_to          n=169   lift 1.0000
 *     food             number_promise  n= 50   lift 1.0000
 *     beauty_fashion   number_promise  n= 48   lift 1.0000
 *
 * ⚠️ EXACTLY 1.0000 AT n=297 IS ARITHMETIC, NOT MEASUREMENT. You get exactly
 * one when you divide a value by a median it alone determines.
 *
 * ⚠️⚠️ AND THE FIRST EXPLANATION WRITTEN HERE WAS WRONG. It said `reach` is
 * AUDIENCE SIZE rather than per-video views, citing "40.6% of a creator's cards
 * share one identical value". That statistic is real and the inference from it
 * was not: it POOLS 3,309 single-card creators, and one card is trivially its
 * own modal value. Re-measured 2026-09-13, stratified by how many cards a
 * creator actually has:
 *
 *     cards per creator   creators   % of cards at the modal value
 *     1                      3,309      100.0   (true by definition)
 *     2-4                      532       44.7
 *     5-9                      100       19.0
 *     10-29                     35       10.8
 *     30+                        2        7.8
 *
 * The distinct-value ratio is 0.94-1.00 in EVERY band. If `reach` were audience
 * size, one creator's cards would carry ONE value and that ratio would be ~1/n.
 * So `reach` IS per-video views, and the sentence this replaces was a
 * conclusion drawn from a pooled average over a population dominated by
 * singletons.
 *
 * ⚖️ THE REAL CAUSE OF THE 1.0000 IS THE SHAPE OF THE CORPUS, NOT THE COLUMN.
 * Of 596 classified cards: 291 (48.8%) belong to a creator with exactly ONE
 * card, whose own median IS that card; another 171 (28.7%) sit below
 * `MIN_VIDEOS_FOR_BASELINE`. Only 134 (22.5%) can produce a real lift at all —
 * far too few to reach `MIN_COHORT` per shape per cohort.
 *
 * ⚖️ SO THE DECISION IS UNCHANGED AND ITS REASON IS NOT. A lift computed from
 * this corpus is degenerate because the scraper collects one card each from
 * thousands of creators rather than a catalogue from a few — a DEPTH problem,
 * fixable by scraping differently, not a wrong-column problem. Emitting
 * `lift 1.0000`
 * as evidence is worse than emitting nothing: it is a meaningless number that
 * reads as a measured one, and the model will use it. `lift: unknown` and
 * `lift: 1.0` are the same failure — a hedged field in the model's context is
 * still a field. So the field is ABSENT, exactly as the whole block is absent
 * when nothing separates.
 *
 * ⚠️ THIS IS NOT A LOWERED BAR. The gates that remain are the COUNT gates —
 * cohort size, the leading shape's own n, and the two-sigma separation — and
 * they are unchanged. What was removed is a threshold on a quantity the column
 * cannot express, which was refusing all four cohorts above for a reason that
 * had nothing to do with them.
 *
 * WHAT WOULD BRING A LIFT BACK: a per-video view count on `gallery_items`.
 * With that, `ShapeEvidence.medianLift` is already computed and carried; the
 * threshold should be cut from the observed distribution rather than chosen,
 * and this comment replaced with that measurement.
 */
export interface ShapeBlock {
  shape: string
  /**
   * ⚠️ THE PROMPT MUST SAY THE NUMBER, NOT JUST THE SHAPE. "how_to" is an
   * instruction; "how_to, across 297 videos in this cohort" is an observation
   * a reader can weigh and disagree with. A consumer that renders the shape and
   * drops this field turns the second back into the first.
   */
  n: number
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
  // ⚖️ AND NOTHING HERE ASKS HOW THE SHAPE PERFORMED, deliberately. See the
  // block above: the lift this corpus can compute is degenerate, because half
  // the classified cards come from creators with a single card. A performance
  // gate here would be a threshold on that. What this block claims is
  // frequency, and every gate it passes is a count.
  return { shape: top.shape, n: top.n, basis: read.basis, rung: read.rung }
}
