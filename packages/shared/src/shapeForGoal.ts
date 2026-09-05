// WHICH SHAPE TO REACH FOR WHEN THERE IS NO REFERENCE TO COPY.
//
// ⚠️ THE CONTAINER TEMPLATES ARE COMPLETE AND ONE DOOR CAN REACH THEM.
// `containerTemplates.ts` holds fourteen shapes with named beats, and
// generate-blueprint turns one into a beat-by-beat instruction — the ORDER that
// makes a round-up watchable, stated instead of hoped for. Every line of it is
// gated on `reference_url`: the container is read off the ASSESSED REFERENCE.
// A creator who arrives through the Idea door has no reference, so
// `containerBlock` stays empty and the writer picks a shape by instinct, per
// generation. A field written and never read, one more time — except here the
// machine is built and only one of four entry doors is wired to it.
//
// ⚖️ SO THE SHAPE COMES FROM THE CORPUS INSTEAD, AND THE CORPUS WAS ASKED.
// Measured over the assessed profiles on 2026-09-05 — containers by how many
// carried `structureTransferability: high` for each goal the assessor recorded:
//
//   education        tutorial 94   numbered_list 77   framework 57
//   growth           numbered_list 62   tutorial 58   story 57
//   entertainment    story 60   tutorial 17   reaction 15
//   authority        framework 51   numbered_list 33   tutorial 30
//   leads            tutorial 31   numbered_list 19   framework 14
//   conversation     numbered_list 24   tutorial 18   story 18
//   sales            tutorial 13   problem_solution 10   numbered_list 8
//
// ⚠️ AND ONE GOAL IN SEVEN ACTUALLY SEPARATES. My first draft picked a ratio
// threshold by eye, and it was fitted to the answer I expected rather than to
// the data. Replaced with a rule that does not depend on preference: two counts
// differ meaningfully when the gap exceeds twice the sampling noise on a count,
// sqrt(a + b). Applied to the measurement above:
//
//   entertainment   60 vs 17   gap 43   4.90 SE   SEPARATED
//   authority       51 vs 33   gap 18   1.96 SE   tie
//   leads           31 vs 19   gap 12   1.70 SE   tie
//   education       94 vs 77   gap 17   1.30 SE   tie
//   conversation    24 vs 18   gap  6   0.93 SE   tie
//   sales           13 vs 10   gap  3   0.63 SE   tie
//   growth          62 vs 58   gap  4   0.37 SE   tie
//
// So the corpus can name the shape for `entertainment` and for nothing else
// yet. `education`'s 94-to-77 looks like a result and is 1.3 standard errors —
// seventeen references apart out of 171. Shipping it as "tutorials are the
// shape for teaching" would be the borrowing-baseline mistake in a new place.
// `rankShapesForGoal` therefore returns the ORDER and whether the lead means
// anything, and `shapeForGoal` hands back null on a tie.
//
// ⚠️ `other` IS EXCLUDED. It is the largest bucket in the corpus and it is not
// a shape — there is no template for it, and there could not be.

// ── INERT SINCE 2026-09-05, AND HERE IS THE TRIGGER TO RE-OPEN IT ─────────
//
// ⚠️ NOTHING CALLS THIS YET, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT.
// The reader that would use it is `generate-blueprint`, and the corpus read it
// needs costs 311ms — measured 2026-09-05 with EXPLAIN ANALYZE: a sequential
// scan, 8,034 shared buffers, 601 rows, because the whole `profile` jsonb is
// detoasted per row and no index the planner can use exists (it estimated 7
// rows and got 601). That cost lands on EVERY generation, on a paid path, and
// it grows with the corpus.
//
// ⚖️ 311ms ON EVERY GENERATION TO SERVE ONE GOAL IN SEVEN IS A BAD TRADE.
// `entertainment` is the only goal whose leading container separates by more
// than sampling noise; the other six return null and the writer keeps the
// judgement it already has. So this stays built and uncalled.
//
// ⚠️ INERT CODE THAT NOBODY RE-EXAMINES BECOMES DEAD CODE THAT LOOKS LIVE.
// The next reader sees a wired-looking module and assumes it runs. So the
// deferral carries a TRIGGER rather than a vague "later" — re-open when EITHER:
//
//   · the corpus separates a shape for 4 OR MORE of the 7 goals
//     (check with `rankShapesForGoal(...).decisive` across VIDEO_GOALS), OR
//   · the per-call corpus read drops below ~100ms — which needs an aggregate
//     refreshed by the assess job, not a live scan of `profile`.
//
// ⚖️ AND THE FIRST TRIGGER IS A BACKLOG JOB, NOT A TRAFFIC ONE. Measured
// 2026-09-05: 4,805 already-fetched references are unassessed, and 17 niches
// hold 20+ references with fewer than 20 assessed. Shapes and topics fall out
// of the SAME assess pass, so one backlog run moves both this and
// `topicLibrary`. No new creators are required.

import type { VideoGoal } from './videoIntent'
import type { LikelyGoal, ContainerType } from './referenceContentProfile'
import type { ShapeRow } from './shapeLibrary'

/**
 * Twin's per-video goal vocabulary against the assessor's.
 *
 * ⚠️ `personal_brand` MAPS TO NOTHING, AND null IS THE HONEST ANSWER. The
 * assessor's list has no equivalent — it records what a SHAPE naturally serves,
 * and "makes this creator memorable" is a property of the creator, not the
 * container. Mapping it to `authority` because the words feel adjacent would
 * put a framework template behind a goal nobody measured. A creator with this
 * goal gets no shape suggestion, which is the same thing that happens today.
 */
export const CORPUS_GOAL_FOR_VIDEO_GOAL: Record<VideoGoal, LikelyGoal | null> = Object.freeze({
  followers: 'growth',
  authority: 'authority',
  educate: 'education',
  conversations: 'conversation',
  leads: 'leads',
  sell: 'sales',
  entertain: 'entertainment',
  personal_brand: null,
})

/** ⚠️ FEWER THAN THIS AND THE CONTAINER IS ONE PERSON'S HABIT, not a pattern
 *  the corpus has seen. Matches the floor the measurement above was taken at. */
export const MIN_SHAPE_SUPPORT = 5

/** How many standard errors of separation before a lead is called a lead.
 *
 *  ⚠️ TWO IS THE CONVENTIONAL BAR AND IT IS SET HERE RATHER THAN DISCOVERED,
 *  so it cannot be nudged until a favoured shape wins. On today's corpus it
 *  admits `entertainment` alone; `authority` misses at 1.96, and that near-miss
 *  stays a miss. */
const DECISIVE_SIGMAS = 2

export interface ShapeForGoal {
  container: ContainerType
  /** References with this container AND this goal that the assessor judged
   *  structurally transferable. Transferability is the whole question here:
   *  a shape that does not survive a change of subject is useless to a creator
   *  writing about something else. */
  transferable: number
}

export interface ShapeRanking {
  /** The corpus goal actually consulted, or null when Twin's goal has none. */
  corpusGoal: LikelyGoal | null
  /** Best first. Empty when nothing clears the support floor. */
  shapes: ShapeForGoal[]
  /** ⚠️ FALSE MEANS "THE TOP TWO ARE TIED", not "there is no answer". A caller
   *  that offers a choice should offer both; one that must pick may take the
   *  first, knowing it. */
  decisive: boolean
}

/**
 * Rank the containers the corpus associates with a goal.
 *
 * Reads only `ShapeRow`s — the whitelist projection — so no source text can
 * reach a caller through this path either.
 */
export function rankShapesForGoal(
  goal: VideoGoal | null,
  rows: readonly ShapeRow[],
): ShapeRanking {
  const corpusGoal = goal ? CORPUS_GOAL_FOR_VIDEO_GOAL[goal] ?? null : null
  if (!corpusGoal) return { corpusGoal: null, shapes: [], decisive: false }

  const by = new Map<ContainerType, number>()
  for (const row of rows) {
    if (!row.container || row.container === 'other') continue
    if (row.transferability !== 'high') continue
    if (!row.goals.includes(corpusGoal)) continue
    by.set(row.container, (by.get(row.container) ?? 0) + 1)
  }

  const shapes = [...by]
    .map(([container, transferable]) => ({ container, transferable }))
    .filter((s) => s.transferable >= MIN_SHAPE_SUPPORT)
    .sort((a, b) => b.transferable - a.transferable || a.container.localeCompare(b.container))

  // ⚖️ SAMPLING NOISE ON A COUNT DIFFERENCE IS sqrt(a + b). A gap smaller than
  // twice that is indistinguishable from the corpus having been scraped in a
  // slightly different order.
  const decisive = shapes.length >= 2
    ? (shapes[0].transferable - shapes[1].transferable)
      >= DECISIVE_SIGMAS * Math.sqrt(shapes[0].transferable + shapes[1].transferable)
    : shapes.length === 1

  return { corpusGoal, shapes, decisive }
}

/**
 * The single shape to hand a writer, or null.
 *
 * ⚖️ RETURNS null ON A TIE, WHICH TODAY IS SIX GOALS IN SEVEN. For `growth` the
 * top three sit within five references of each other; for `education` the lead
 * is seventeen out of 171, which reads like a result and is 1.3 standard
 * errors. Picking one anyway would manufacture a finding. The writer keeps its
 * own judgement in that case — exactly what it does today, so a tie costs
 * nothing and a wrong confident answer would.
 */
export function shapeForGoal(goal: VideoGoal | null, rows: readonly ShapeRow[]): ContainerType | null {
  const ranking = rankShapesForGoal(goal, rows)
  if (!ranking.decisive || ranking.shapes.length === 0) return null
  return ranking.shapes[0].container
}
