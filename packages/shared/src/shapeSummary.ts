// THE LIBRARY WAS BUILT, TESTED, GUARDED — AND READ BY NOTHING.
//
// ⚠️ `projectShape` AND `shapeStats` SHIPPED IN #675 AHEAD OF THEIR CONSUMERS,
// deliberately and with the reason recorded in `check_symbol_readers`:
//
//   Merged (#675) deliberately BEFORE its consumers, because a whitelist
//   projection with no readers is free to change and one with readers is a
//   taxonomy under live traffic. Unreached by design and by decision. WIRE
//   with the gallery and angle engine, which are the named consumers.
//
// ⚖️ THAT WAS AN ARGUED DEFERRAL, NOT AN OVERSIGHT, AND THIS IS THE CHANGE IT
// NAMED. The exemption comes out of the guard in the same commit — it carries a
// stale check that fails when an excused symbol acquires a reader, so leaving
// it would break the build. A self-expiring excuse is the only kind worth
// having.
//
// ── WHAT THE CORPUS ACTUALLY SUPPORTS, MEASURED 2026-09-09 ───────────────
//
// 5,579 distinct public gallery URLs · 1,772 with a profile (32%) · 1,098 with
// structure (20%) · 1,035 with a container (18.6%).
//
// ⚠️ SO A PAGE OF FIFTY CARDS CARRIES ABOUT NINE SHAPES, AND THAT NUMBER IS
// WHY THIS MODULE REFUSES MORE OFTEN THAN IT SPEAKS. Nine rows spread across
// sixteen container types is not a finding, it is noise with a confident
// sentence wrapped round it. 0191's rule — "anything read out of this table
// before then must state its n" — applies to every aggregate in this product,
// and the honest way to obey it is to say nothing below a threshold and to
// print the sample size above it.
import { shapeStats, type ShapeRow, type ShapeStat } from './shapeLibrary'

/**
 * The fewest shaped references this will summarise.
 *
 * ⚠️ JUDGEMENT, AND LABELLED AS SUCH — not derived from a power calculation
 * nobody ran. It is set where the sentence stops being embarrassing rather than
 * where it becomes significant, and those are different bars: a claim about
 * "what travels" drawn from eight videos would be wrong often enough to teach a
 * creator to ignore the panel, which costs more than saying nothing.
 */
export const MIN_SHAPES_FOR_A_CLAIM = 20

/** How many containers may be named. Two, because a list of six is a taxonomy
 *  dump and not advice. */
const NAMED = 2

export interface ShapeSummary {
  /** The sample this was computed from. ALWAYS shown to the creator. */
  n: number
  /** Ranked by transferable count, best first. */
  top: ShapeStat[]
}

/** Human labels. The assessor's vocabulary is snake_case and ours to translate;
 *  a creator should never read `numbered_list`. */
const LABEL: Record<string, string> = {
  story: 'stories',
  tutorial: 'tutorials',
  numbered_list: 'list videos',
  recommendation: 'recommendations',
  framework: 'frameworks',
  problem_solution: 'problem-and-fix videos',
  reaction: 'reactions',
  myth_busting: 'myth-busting',
  unpopular_opinion: 'unpopular opinions',
  comparison: 'comparisons',
  confession: 'confessions',
  mistakes: 'mistake videos',
  prediction: 'predictions',
  before_after: 'before-and-afters',
}

export function shapeLabel(container: string): string {
  return LABEL[container] ?? container.replace(/_/g, ' ')
}

/**
 * A summary, or null when the sample cannot support one.
 *
 * ⚠️ `other` IS EXCLUDED FROM WHAT GETS NAMED, AND IT IS THE LARGEST BUCKET.
 * Measured over the corpus: 308 rows, 92 transferable (30%), mean 2.8 beats
 * against 5–7 for every real shape — it is where thin and failed assessments
 * land, not a structure anybody chose. Recommending it would be recommending
 * "none of the above", and its beat count is the tell.
 *
 * ⚖️ IT STAYS IN `n`, THOUGH. Dropping it from the denominator would inflate
 * how much of the page this claim actually covers, which is the one number the
 * creator needs to judge the claim by.
 */
export function shapeSummary(rows: readonly ShapeRow[]): ShapeSummary | null {
  const withContainer = rows.filter((r) => r.container !== null)
  if (withContainer.length < MIN_SHAPES_FOR_A_CLAIM) return null
  const top = shapeStats(withContainer)
    .filter((s) => s.container !== 'other' && s.transferableHigh > 0)
    .slice(0, NAMED)
  if (top.length === 0) return null
  return { n: withContainer.length, top }
}

/**
 * The sentence a creator reads. Null in, null out.
 *
 * ⚠️ IT STATES THE SAMPLE IN THE SENTENCE ITSELF, not in a tooltip. A number
 * somebody has to hover to find is a number that does not qualify the claim it
 * is attached to.
 */
export function shapeSummaryLine(summary: ShapeSummary | null): string | null {
  if (!summary) return null
  const names = summary.top.map((s) => shapeLabel(s.container))
  const which = names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`
  return `Of the ${summary.n} picks here we have read closely, ${which} carry the structure that travels best.`
}
