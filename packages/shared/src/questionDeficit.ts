// A FULL STORE STOPS THE ASKING, AND THE ASKING IS THE ONLY SOURCE OF EPISODES.
//
// ⚠️ MEASURED ON THE PHYSIO RUNS: three complete scripts, ZERO first-person
// episodes. Not because the writer refused them — because there were none to
// use. Ask-beats stop firing once the store has enough of *something*, and the
// something it had was opinions. The store looked full and was starving in one
// specific nutrient.
//
// ⚖️ THE BANK ALREADY KNOWS ITS OWN SHAPE. Every question in
// `creatorQuestions.ts` carries a `kind` — opinion, experience, framework,
// claim. `nextQuestion` ignores it entirely and returns the first unanswered
// question in fixed order, so a creator who happens to answer the opinion
// questions first is asked more opinions, forever.
//
// This picks the first unanswered question of the SCARCEST kind instead.
//
// ── ⚠️ WHAT THIS DELIBERATELY DOES NOT CHANGE ─────────────────────────────
//
// On an EMPTY store every kind is equally scarce, so this falls through to bank
// order and behaves exactly like `nextQuestion` — which matters, because that
// order is not arbitrary: the first two questions are the ones whose answers
// most change a script, so a creator who answers two and never returns has
// still given the two that count. Deficit weighting must not cost that.
//
// ⚖️ AND IT IS NOT RANDOMISED. Variety nobody asked for would trade a
// deterministic, testable order for the appearance of intelligence.

import { CREATOR_QUESTIONS, type CreatorQuestion, type AskedKind } from './creatorQuestions'

/** How many rows of each kind the creator's store already holds.
 *
 *  ⚠️ A MISSING KEY IS ZERO HERE, AND THAT IS THE ONE PLACE IT IS SAFE. This
 *  counts rows the creator HAS; a kind absent from the count genuinely has none,
 *  which is exactly the kind we most want to ask about. The dangerous direction
 *  — treating an unknown store as empty — is guarded separately: `null` counts
 *  mean "we could not read the store" and fall back to bank order rather than
 *  claiming everything is scarce. */
export type StoreCounts = Partial<Record<AskedKind, number>>

/** The whole vocabulary. Used by `storeGap` to enumerate; the selector below
 *  deliberately derives its candidate kinds from the BANK instead, so a kind with
 *  no unanswered questions left cannot win. */
const KINDS: readonly AskedKind[] = Object.freeze(['opinion', 'experience', 'framework', 'claim'])

/**
 * The next question to put, weighted toward what the store lacks.
 *
 * ⚠️ `alreadyPut` MUST INCLUDE SKIPS, exactly as `nextQuestion` requires. Both
 * an answer and a decline are decisions and neither may come back.
 *
 * ⚠️ NULL COUNTS ARE NOT AN EMPTY STORE. A failed read must not be reported as
 * "they have nothing", which would make every kind look equally scarce and
 * silently disable the weighting while appearing to work. Unknown falls back to
 * the fixed bank order and says so by doing the old thing.
 */
export function nextQuestionByDeficit(
  alreadyPut: readonly string[],
  counts: StoreCounts | null | undefined,
  bank: readonly CreatorQuestion[] = CREATOR_QUESTIONS,
): CreatorQuestion | null {
  const done = new Set(alreadyPut.map((x) => String(x)))
  const open = bank.filter((q) => !done.has(q.id))
  if (open.length === 0) return null
  if (counts === null || counts === undefined) return open[0]

  // The scarcest kind AMONG THE ONES STILL ASKABLE. Ranking all four kinds and
  // then discovering the winner has no unanswered questions left would fall back
  // to bank order and quietly stop weighting near the end of the bank, which is
  // exactly when the store is most lopsided.
  // ⚖️ TIES BREAK BY BANK POSITION, NOT BY THE ORDER OF THE `KINDS` ARRAY.
  // Those are different rules and I shipped the second one while the comment
  // claimed the first — a test caught it immediately: with an empty store and
  // `contrarian` already answered, ranking by KINDS index picked the next
  // OPINION, while the bank's next question is an EXPERIENCE. The declared
  // property is "an empty store behaves exactly like `nextQuestion`", and only
  // bank position delivers it.
  const firstAt = new Map<AskedKind, number>()
  open.forEach((q, i) => { if (!firstAt.has(q.kind)) firstAt.set(q.kind, i) })

  const ranked = [...firstAt.keys()]
    .map((k) => ({ kind: k, n: Math.max(0, Math.trunc(counts[k] ?? 0)), at: firstAt.get(k) ?? 0 }))
    .sort((a, b) => (a.n - b.n) || (a.at - b.at))

  const scarcest = ranked[0]?.kind
  return open.find((q) => q.kind === scarcest) ?? open[0]
}

/**
 * What the store is missing, for the line under the script.
 *
 * ⚖️ NAMES A KIND, NOT A COUNT. "Twin knows 8 phrases" invites a creator to
 * optimise a number nobody set. "Twin has never heard you tell a story" names
 * the gap and is true or false.
 */
export function storeGap(counts: StoreCounts | null | undefined): AskedKind | null {
  if (counts === null || counts === undefined) return null
  const empty = KINDS.filter((k) => Math.max(0, Math.trunc(counts[k] ?? 0)) === 0)
  // ⚠️ NO GAP IS NOT THE SAME AS AN UNREADABLE STORE. Both return null here, and
  // the caller distinguishes them by whether it had counts at all — which is why
  // this takes the counts rather than a precomputed boolean.
  return empty.length === 0 ? null : (empty[0] ?? null)
}
