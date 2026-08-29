// GENERATED FROM packages/shared/src/script/hookEntity.ts — DO NOT EDIT.
// Run: node scripts/ci/generate_shared_pilot_core.mjs
// Edit the source instead. CI regenerates this file and fails on a diff.
// @ts-nocheck
/**
 * A HOOK MAY NOT INVENT A BUSINESS FACT ABOUT THE CREATOR.
 *
 * ⚠️ RUN A / RUN D, MEASURED. Run A's shipped hook said "revenue was
 * stagnant"; Run D's said "we do over a million in revenue" and "stop
 * blaming your churn" — a magnitude, a first-person-plural business claim,
 * and a business-model assumption (this creator runs a subscription
 * business with churn to speak of), none of them backed by anything in
 * `product_entities`. Nobody supplied these facts; the writer reached for
 * them because a confident number reads as a stronger hook than an honest
 * one.
 *
 * ⚖️ THE SAME QUESTION `ctaEntity.ts` ASKS OF A CTA, ASKED OF A HOOK. FIX 2
 * already decided that a first-person-plural business claim needs a
 * `product_entities` match or it is unowned. This reuses that judgment
 * rather than restating it, and adds the two shapes a CTA never needs to
 * make: a bare currency/magnitude figure, and a business-model term
 * (churn, subscribers, headcount) that presupposes a kind of business this
 * creator may not run at all.
 *
 * ⚖️ FLAGGED HOOKS ARE DEMOTED, NEVER DELETED. Five hooks are generated so
 * the creator can choose; a hook they might have picked on its own merits
 * is still a preference datapoint even when it may not lead. See
 * `demoteUnsupportedHooks` below for the reordering, and its doc comment
 * for what happens when all five fail.
 */

export interface EntityLike {
  name?: unknown
  relationship?: unknown
}

/** "$1.2M", "a million", "over a million", "6-figure", "$40k MRR" — a bare
 *  currency or magnitude figure asserted about the creator's own business,
 *  not a fact anyone supplied. */
const FIGURE =
  /\$\s?\d[\d,.]*\s*(k|m|million|billion|thousand)?\b|\b\d[\d,]*\s*(million|billion|thousand)\b|\b\d+[\-\s]?figure\b|\b(a|one|two|three|four|five|six|seven|eight|nine|ten)\s+million\b|\bmillions?\s+(?:in|of)\s+revenue\b/i

/** "we do", "we made", "we generate", "we earn", "we serve", "we retain" —
 *  a first-person-plural claim about running or performing a business,
 *  widened from `ctaEntity`'s verb list to cover the revenue-reporting verbs
 *  a hook reaches for that a CTA rarely does. */
const FIRST_PERSON_PLURAL_BUSINESS =
  /\bwe('re| are)?\s+(do(es|ing)?|made|make(s|ing)?|generate(s|d)?|earn(s|ed)?|serve(s|d)?|scale(s|d)?|built|build(s|ing)?|run(s)?|operate(s|d)?|offer(s|ed)?|provide(s|d)?|bring in|pull(ed|ing)? in)\b/i

/** "your churn", "our churn", "subscribers", "MRR", "ARR", "headcount",
 *  "staff of N" — vocabulary that presupposes a specific kind of business
 *  (subscription, staffed) this creator may never have described. Second
 *  person included: "stop blaming YOUR churn" still asserts the viewer, and
 *  by extension the creator giving the advice, runs that kind of business. */
const BUSINESS_MODEL_TERM =
  /\b(?:my|our|your|the)?\s*churn\b|\bsubscribers?\b|\b(?:MRR|ARR)\b|\bheadcount\b|\bstaff of \d+\b|\b\d+\s+employees\b/i

/** "Revenue last year was stagnant", "our sales are down", "profit doubled"
 *  — a claimed STATE of the creator's own business performance, with no
 *  figure and no "we" in sight, which is exactly why `FIGURE` and
 *  `FIRST_PERSON_PLURAL_BUSINESS` miss it. Run A's shipped hook read
 *  "Revenue last year was stagnant" — a specific, checkable fact about a
 *  business nobody described, asserted as flatly as a date. */
const BUSINESS_STATE_CLAIM =
  /\b(?:revenue|sales|profit|margins?)\b[^.!?]{0,25}\b(?:stagnant|flat|down|declining|dropped|falling|growing|up|doubled|tripled|plateaued)\b|\b(?:stagnant|flat|declining|dropped|falling|plateaued)\b[^.!?]{0,25}\b(?:revenue|sales|profit|margins?)\b/i

function normalize(s: unknown): string {
  return String(s ?? '').toLowerCase().trim()
}

function ownedNames(entities: readonly EntityLike[] | null | undefined): string[] {
  if (!Array.isArray(entities)) return []
  return entities.map((e) => normalize(e?.name)).filter((n) => n !== '')
}

export type HookEntityFailureReason =
  | 'unsupported_figure'
  | 'unsupported_business_claim'
  | 'unsupported_business_model'

export interface HookEntityCheckResult {
  flagged: boolean
  reason: HookEntityFailureReason | null
  matched?: string
}

/**
 * Does this hook assert a currency figure, a first-person-plural business
 * claim, or a business-model assumption this creator's `product_entities`
 * cannot back up?
 *
 * ⚖️ SAME OWNERSHIP RULE AS `checkCtaEntity`. An empty `product_entities` is
 * a fact — nothing was supplied — not a blank to fill with whatever the hook
 * reaches for; and where entities exist, the hook must actually mention one
 * of them, not merely coexist with the creator having *some* product on
 * file.
 */
export function checkHookEntity(
  line: unknown,
  entities: readonly EntityLike[] | null | undefined,
): HookEntityCheckResult {
  const text = String(line ?? '')
  if (text.trim() === '') return { flagged: false, reason: null }
  const owned = ownedNames(entities)
  const mentionsOwned = owned.length > 0 && owned.some((n) => text.toLowerCase().includes(n))

  const figure = FIGURE.exec(text)
  if (figure && !mentionsOwned) {
    return { flagged: true, reason: 'unsupported_figure', matched: figure[0].trim() }
  }
  if (FIRST_PERSON_PLURAL_BUSINESS.test(text) && !mentionsOwned) {
    return { flagged: true, reason: 'unsupported_business_claim' }
  }
  const model = BUSINESS_MODEL_TERM.exec(text) ?? BUSINESS_STATE_CLAIM.exec(text)
  if (model && !mentionsOwned) {
    return { flagged: true, reason: 'unsupported_business_model', matched: model[0].trim() }
  }
  return { flagged: false, reason: null }
}

export interface DemotedHooks {
  /** Same set of hooks, reordered so every flagged one sorts after every
   *  unflagged one, each group keeping its original relative order. */
  hooks: readonly string[]
  /** How many of the input hooks were flagged. */
  found: number
  /** How many actually changed rank as a result — 0 when nothing was
   *  flagged, and ALSO 0 when every hook was flagged, since there is no
   *  unflagged hook to promote ahead of them (see below). */
  demoted: number
}

/**
 * Push every business-claim-flagged hook behind every clean one, WITHOUT
 * dropping any of the five.
 *
 * ⚖️ ALL FIVE FAILING IS A FALLBACK, NOT A CRASH. When nothing survives
 * unflagged, reordering has nothing to promote — so the input order is
 * returned unchanged and `demoted` reads 0, meaning "the recommended hook is
 * still whatever the writer ranked first," the same safest-available
 * fallback `hooks_unentitled`'s sibling check uses when the whole list is
 * suspect. This is a graceful degrade, never a thrown generation: a
 * generation that could not clear this bar is still a generation the
 * creator can read, edit, or pick a different option from.
 */
export function demoteUnsupportedHooks(
  hooks: readonly string[],
  entities: readonly EntityLike[] | null | undefined,
): DemotedHooks {
  if (!Array.isArray(hooks) || hooks.length === 0) return { hooks: [], found: 0, demoted: 0 }
  const flags = hooks.map((h) => checkHookEntity(h, entities).flagged)
  const found = flags.filter(Boolean).length
  if (found === 0 || found === hooks.length) {
    // Nothing to demote (0), or nothing left to demote it BEHIND (all).
    return { hooks: [...hooks], found, demoted: 0 }
  }
  const clean = hooks.filter((_, i) => !flags[i])
  const flagged = hooks.filter((_, i) => flags[i])
  return { hooks: [...clean, ...flagged], found, demoted: flagged.length }
}
