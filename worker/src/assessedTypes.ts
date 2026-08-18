// ⚠️ DERIVED FROM `packages/shared/src/assessed.ts`. See referenceExtraction.ts
// for why the worker carries its own copy; the parity test covers both.
// HOW A FIELD CAME TO BE KNOWN, KEPT BESIDE THE FIELD.
//
// ⚠️ LIFTED OUT OF `referenceProfile` SO THE TWO ENRICHMENT PASSES CAN SHARE IT
// WITHOUT ONE IMPORTING THE OTHER. What Twin heard and what Twin saw are
// separate artifacts on purpose; they are not separate ideas about evidence.
//
// ⚖️ AND THERE ARE FOUR STATES, NOT THREE. The batch made the fourth necessary:
// "nobody has looked at this card" and "the transcript was read and it does not
// say" are different facts with different consequences. The first belongs on the
// next run's worklist; the second is finished, and re-queueing it would spend
// 9,504 calls a second time to learn the same nothing.

export const ASSESSMENT_BASIS = ['observed', 'inferred', 'indeterminate', 'not_checked'] as const
export type AssessmentBasis = (typeof ASSESSMENT_BASIS)[number]

/**
 * One assessed field.
 *
 * ⚠️ `observed` REQUIRES SOMETHING TO HAVE BEEN READ — a transcript, the frames,
 * the caption. `inferred` is a reading of marketing prose, which is weaker and
 * must never be laundered into the first. The discriminated union makes the
 * evidence non-optional wherever a value is claimed.
 *
 * ⚖️ `indeterminate` CARRIES EVIDENCE TOO, and that is the point of it. It is a
 * finding — "I read the transcript and it never says who this is for" — so it
 * says what was examined. A model that must fill every field will invent an
 * audience, and fake certainty is the defect this codebase keeps paying to
 * remove.
 */
export type Assessed<T> =
  | { value: T; basis: 'observed'; evidence: string; assessedAt: string }
  | { value: T; basis: 'inferred'; evidence: string; assessedAt: string }
  | { basis: 'indeterminate'; evidence: string; assessedAt: string }
  | { basis: 'not_checked'; needs: string }

/** ⚖️ A FIELD NOBODY HAS LOOKED AT, SAYING WHAT WOULD ANSWER IT. A bare `null`
 *  would lose that, and "what is missing" is what makes an unbuilt signal one
 *  measurement away rather than an open question. */
export const unchecked = <T,>(needs: string): Assessed<T> => ({ basis: 'not_checked', needs })

/** ⚖️ LOOKED AT, GENUINELY NOT ANSWERABLE FROM WHAT WAS THERE. */
export const indeterminate = <T,>(evidence: string, assessedAt: string): Assessed<T> =>
  ({ basis: 'indeterminate', evidence, assessedAt })

/** Does this field carry a usable value? `indeterminate` does NOT — it is a
 *  finished measurement with no answer, and every consumer must treat it the
 *  same way it treats silence. */
export const isKnown = <T,>(a: Assessed<T>): a is Extract<Assessed<T>, { value: T }> =>
  a.basis === 'observed' || a.basis === 'inferred'

/** ⚠️ WOULD ANOTHER PASS LEARN ANYTHING? The batch's re-queue predicate, written
 *  once. `indeterminate` is deliberately false here: the question was asked and
 *  answered "the source cannot tell you", and asking it again costs a call to
 *  reach the same place. */
export const worthChecking = <T,>(a: Assessed<T>): boolean => a.basis === 'not_checked'

/** How many fields in a record were actually seen rather than guessed or
 *  skipped. Used to answer "how assessed is this card" without walking it. */
export const countObserved = (fields: readonly Assessed<unknown>[]): number =>
  fields.filter((f) => f.basis === 'observed').length
