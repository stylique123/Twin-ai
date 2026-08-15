// WHAT KIND OF EDIT WAS THAT? — ASKED AT READ TIME, NEVER AT CAPTURE TIME.
//
// ── WHY THIS IS NOT STORED ────────────────────────────────────────────────
//
// ⚠️ 0127 STORES THE PAIR AND REFUSES TO STORE THE JUDGEMENT, and this module is
// the other half of that decision rather than a reversal of it. Interpretation
// frozen at capture time cannot be revised when it turns out wrong — and the
// session that built the capture produced four broken metrics, each of which
// would have been baked permanently into the data had it been computed on write.
// So the pair is kept raw and the reading happens here, where it can change.
//
// ── WHAT IT WILL AND WILL NOT CLAIM ───────────────────────────────────────
//
// ⚖️ ONLY WHAT IS DECIDABLE FROM THE TWO STRINGS. `describeEditFacts` already
// computes word delta, whether a figure or first person arrived, and what share
// of the original survived. Those support real categories.
//
// ⚠️ AND THE INTERESTING CATEGORIES ARE NOT AMONG THEM. "formal → conversational",
// "salesy → natural", "weak hook → stronger hook" are judgements. A regex that
// claimed them would produce a confident label on every pair and a corpus nobody
// could trust — which is precisely the failure mode of the four metrics above.
// They are named in `NEEDS_JUDGEMENT` and deliberately not implemented: when
// there are enough pairs to be worth a model call, the call belongs here, and
// until then the honest label is `unclassified`.
import type { ScriptEditFacts } from './scriptEditRecord'

/** Categories decidable from the two strings alone. */
export type EditType =
  | 'tightened'
  | 'expanded'
  | 'made_concrete'
  | 'made_personal'
  | 'rewritten'
  | 'unclassified'

/** ⚠️ NAMED SO THE ABSENCE IS VISIBLE. A reader who wants "salesy → natural"
 *  should find out here that nothing computes it, rather than discover it by
 *  trusting a number that was never measured. */
export const NEEDS_JUDGEMENT = [
  'formal_to_conversational',
  'salesy_to_natural',
  'weak_hook_to_stronger',
  'ai_phrase_to_creator_phrasing',
  'abstract_to_concrete_reasoning',
] as const

/** Below this share of surviving words the creator did not adjust a line, they
 *  replaced it — and the two mean different things to a writer trying to learn. */
export const REWRITE_KEPT_SHARE = 0.3

/** A change smaller than this is a tweak, not a direction. Three words is the
 *  smallest delta that survives punctuation and a dropped filler. */
export const LENGTH_DELTA_MIN = 3

/** Read one edit. Order matters and is deliberate.
 *
 *  ⚖️ REWRITE IS TESTED FIRST because it subsumes the others: a line replaced
 *  wholesale may also be shorter and contain a number, and reporting that as
 *  "tightened" would teach the writer to trim when the creator actually started
 *  over. The strongest statement the facts support is the one returned.
 *
 *  ⚖️ AND CONCRETENESS BEATS LENGTH. A creator who swaps a vague clause for a
 *  figure has said something about substance; that the line also got two words
 *  shorter is incidental. */
export function classifyEdit(facts: ScriptEditFacts): EditType {
  if (facts.keptShare < REWRITE_KEPT_SHARE) return 'rewritten'
  if (facts.addedFigure) return 'made_concrete'
  if (facts.addedFirstPerson) return 'made_personal'
  if (facts.wordDelta <= -LENGTH_DELTA_MIN) return 'tightened'
  if (facts.wordDelta >= LENGTH_DELTA_MIN) return 'expanded'
  return 'unclassified'
}

/** ⚠️ THE THRESHOLD BELOW WHICH A CREATOR-SPECIFIC PATTERN IS NOISE. One creator
 *  trimming three lines is not a preference; it is three lines. Global lessons
 *  need more still, because they average over people who disagree. */
export const MIN_PAIRS_PER_CREATOR = 20
export const MIN_PAIRS_GLOBAL = 100

export interface EditLesson {
  scope: 'global' | 'creator'
  ownerId?: string
  pairs: number
  byType: Record<EditType, number>
  /** ⚠️ FALSE UNTIL THE SAMPLE SUPPORTS IT, and the caller must respect it. The
   *  whole point of capturing human signal is to stop reporting conclusions the
   *  data cannot carry. */
  reportable: boolean
}

/** Summarise pairs into a lesson, refusing to call it one below the threshold. */
export function summariseEdits(
  pairs: readonly { ownerId: string; facts: ScriptEditFacts }[],
  scope: 'global' | 'creator',
  ownerId?: string,
): EditLesson {
  const rows = scope === 'creator' ? pairs.filter((p) => p.ownerId === ownerId) : pairs
  const byType = {
    tightened: 0, expanded: 0, made_concrete: 0,
    made_personal: 0, rewritten: 0, unclassified: 0,
  } as Record<EditType, number>
  for (const r of rows) byType[classifyEdit(r.facts)]++
  return {
    scope,
    ownerId,
    pairs: rows.length,
    byType,
    reportable: rows.length >= (scope === 'creator' ? MIN_PAIRS_PER_CREATOR : MIN_PAIRS_GLOBAL),
  }
}
