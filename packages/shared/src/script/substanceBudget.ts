/**
 * THE CREATOR PICKS THE LENGTH. THE REFERENCE SUPPLIES THE SUBSTANCE.
 * WHEN THEY DO NOT MATCH, TWIN SAYS SO — IT NEVER PADS AND NEVER QUIETLY
 * DROPS HALF THE VALUE.
 *
 * ⚠️ MEASURED, NOT ASSUMED. Twelve runs, references from 6 to 519 seconds,
 * scripts from 26 to 87 seconds. Three different behaviours with no visible
 * logic: a 168s reference compressed 6.5× into 26 seconds (three scenes, one of
 * them a sign-off), a 70s reference held at roughly 1:1, and a 25s reference
 * EXPANDED into 40 seconds. There is no rule today; this is the rule.
 *
 * ⚠️⚠️ THE EXPANSION HALF IS THE ONE THAT MATTERS. The 25s → 40s run had to
 * invent fifteen seconds of content, and that run family is where "a five
 * thousand dollar oven", "$1.50 in ingredients" and "a four-loaf licence limit"
 * came from. Silent padding is not a length bug. It is the mechanism that
 * produces invented claims, which is why the ban is structural here rather than
 * a sentence in a prompt asking the model nicely.
 *
 * ⚖️ THIS MODULE DELIBERATELY TAKES A DIFFERENT STANCE FROM `scriptLength.ts`,
 * WHICH SAYS OF ITSELF: "THIS MODULE DISCLOSES, IT DOES NOT ENFORCE." That was
 * right for what it measures — how long a finished script runs is the creator's
 * business, and Twin does not get a vote on whether they shoot 40 seconds or
 * 90. This is a different question. Not "is this length allowed" but "is there
 * enough here to fill it honestly", and the answer to that is not a taste. The
 * two modules are not in conflict and neither supersedes the other.
 *
 * ⚠️ AND THE THIRD STATE IS THE WHOLE DESIGN. A budget nobody could count is
 * NOT a budget of zero — that would refuse every script — and it is not
 * unlimited either, which is exactly the licence to pad this exists to remove.
 * It is UNKNOWN, `enforceable` comes back false, and the caller is told it may
 * not claim the ban was applied. Absent is not zero, in the one place where
 * collapsing it would either break the product or reintroduce the defect.
 */

/** The three lengths a creator may choose. */
export const TARGET_SECONDS = [30, 60, 90] as const
export type TargetSeconds = (typeof TARGET_SECONDS)[number]

/**
 * ⚠️ ADDING LENGTH ADDS BEATS, NOT LONGER BEATS. Measured: every beat overshoots
 * its planned target today, 12 of 12 runs, the worst 18 seconds against a 10
 * second plan. Stretching beats is how a script gets slow; adding beats is how
 * it gets longer, and this table is what makes that structural.
 *
 * ⚖️ THE EPISODE SLOT ONLY EXISTS AT 60s AND ABOVE. A 30-second script is one
 * idea — there is no room for a story with a before and an after — so a creator
 * choosing 30 is choosing an explainer, and `shapeFor` is what lets a screen
 * tell them that rather than leaving them to discover it.
 */
const SHAPE: Readonly<Record<TargetSeconds, readonly string[]>> = Object.freeze({
  30: Object.freeze(['hook', 'setup', 'payoff', 'cta']),
  60: Object.freeze(['hook', 'setup', 'episode', 'consequence', 'payoff', 'cta']),
  90: Object.freeze([
    'hook', 'setup', 'episode', 'consequence', 'rehook', 'second point', 'payoff', 'cta',
  ]),
})

/** ⚖️ TARGETS, NOT CAPS. At ~2.5 words per second of speech. The measured
 *  failure is thinness — 26 seconds out of a 168-second reference — not
 *  verbosity, so nothing here is allowed to trim a script for being wordy. */
const WORDS: Readonly<Record<TargetSeconds, number>> = Object.freeze({ 30: 75, 60: 150, 90: 225 })

export function shapeFor(target: TargetSeconds): readonly string[] { return SHAPE[target] }
export function beatsFor(target: TargetSeconds): number { return SHAPE[target].length }
export function wordsFor(target: TargetSeconds): number { return WORDS[target] }

/** ⚖️ THE DEFAULT IS 60, NOT 30. The twelve runs show the failure mode is
 *  thinness, so defaulting to the shortest option would make the common case
 *  worse in exactly the direction it is already wrong. */
export const DEFAULT_TARGET_SECONDS: TargetSeconds = 60

/** Narrow an unknown to a real choice, or null. ⚠️ NULL, NOT A DEFAULT: a
 *  caller that never asked must not be recorded as having chosen 60. */
export function asTarget(v: unknown): TargetSeconds | null {
  const n = typeof v === 'number' ? v : Number(v)
  return (TARGET_SECONDS as readonly number[]).includes(n) ? (n as TargetSeconds) : null
}

/**
 * What each source can support, in POINTS — discrete things there are words
 * for. `null` means nobody counted, which is not the same as counting zero.
 */
export interface SubstanceSources {
  /** The reference's content-carrying beats: its points, its turn, its
   *  mechanism. ⚠️ NOT its hook and CTA — every script gets those regardless,
   *  so counting them as substance would credit the budget for structure it
   *  always has and let a reference with nothing in it look full. */
  referencePoints?: number | null
  /** Episodes, figures and opinions in the creator's store for this topic. */
  storeItems?: number | null
  /** Confirmed product facts, where a product is attached. */
  productFacts?: number | null
}

export interface SubstanceBudget {
  /** Beats the available substance can fill honestly, or null when unknown. */
  beats: number | null
  /** ⚠️ FALSE MEANS THE BAN CANNOT BE CLAIMED. Not that it passed. */
  enforceable: boolean
  /** Which sources were actually counted — so a caller can say WHY it is thin
   *  rather than only that it is. */
  counted: { referencePoints: number; storeItems: number; productFacts: number } | null
}

function count(v: number | null | undefined): number | null {
  // ⚠️ THE NULL CHECK PRECEDES THE COERCION. `Number(null)` is 0, and one
  // uncounted source would silently become "they have nothing", which is the
  // sentence that sends a creator to answer questions they already answered.
  if (v === null || v === undefined) return null
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null
  return Math.floor(v)
}

/**
 * ⚖️ HOW POINTS BECOME BEATS, STATED PLAINLY BECAUSE IT IS A CHOICE AND NOT A
 * FACT. One point of substance fills one body beat. A hook and a CTA are added
 * on top, because both are written from the topic itself and neither needs a
 * point spent on it — a script with one thing to say still opens and still
 * closes. So the budget is `points + 2`.
 *
 * ⚠️ THIS IS THE FIRST VERSION OF THIS MAPPING AND IT IS DELIBERATELY
 * GENEROUS. It can only ever permit MORE beats than a stricter rule would, so
 * if it is wrong it is wrong in the direction of shipping the current
 * behaviour, never in the direction of refusing a script that had the material.
 * Tighten it against real runs, not against intuition.
 */
const FREE_BEATS = 2

export function substanceBudget(sources: SubstanceSources | null | undefined): SubstanceBudget {
  const s = sources ?? {}
  const ref = count(s.referencePoints)
  const store = count(s.storeItems)
  const product = count(s.productFacts)

  // ⚠️ EVERY source unknown means the budget is unknown. One known source is
  // enough to count with — an uncounted store does not make a counted
  // reference worthless — but nothing known at all is the third state.
  if (ref === null && store === null && product === null) {
    return { beats: null, enforceable: false, counted: null }
  }
  const counted = { referencePoints: ref ?? 0, storeItems: store ?? 0, productFacts: product ?? 0 }
  const points = counted.referencePoints + counted.storeItems + counted.productFacts
  return { beats: points + FREE_BEATS, enforceable: true, counted }
}

export interface LengthPlan {
  /** Beats the script may actually emit. */
  beats: number
  /** The creator's ask, unchanged — so a screen can show both numbers. */
  targetBeats: number
  /** Beats of substance beyond the target. ⚖️ NAME WHAT WAS DROPPED. */
  dropped: number
  /** True when the budget could not fill the target: end short, never pad. */
  short: boolean
  /** ⚠️ FALSE MEANS "WE COULD NOT CHECK", AND A CALLER MAY NOT REPORT IT AS
   *  "we checked and it was fine". */
  enforced: boolean
}

/**
 * THE EXPANSION BAN. A script may not exceed the substance budget. Ever.
 *
 * ⚠️ THE ONE LINE THAT DOES THE WORK IS THE `Math.min`. Everything else is
 * reporting. If the target asks for more beats than the budget supports, the
 * script emits FEWER beats and the panel says why — it never stretches the
 * beats it has to reach a number, because that stretching is where the invented
 * figures came from.
 */
export function planLength(
  target: TargetSeconds,
  budget: SubstanceBudget,
): LengthPlan {
  const targetBeats = beatsFor(target)

  // ⚠️ AN UNKNOWN BUDGET DOES NOT BECOME A LICENCE. It also does not become a
  // refusal. The target stands, and `enforced: false` is the caller's
  // instruction not to claim the ban ran.
  if (!budget.enforceable || budget.beats === null) {
    return { beats: targetBeats, targetBeats, dropped: 0, short: false, enforced: false }
  }
  const beats = Math.min(targetBeats, budget.beats)
  return {
    beats,
    targetBeats,
    dropped: Math.max(0, budget.beats - targetBeats),
    short: budget.beats < targetBeats,
    enforced: true,
  }
}

/**
 * What the creator is told, in plain everyday English.
 *
 * ⚠️ NO JARGON REACHES THIS STRING. "Budget", "beats" and "substance" are our
 * words for our problem; a creator is told how many seconds there is material
 * for and what they can do about it.
 */
export function lengthMessage(plan: LengthPlan, target: TargetSeconds): string | null {
  if (!plan.enforced) return null
  if (plan.short) {
    // ⚖️ SECONDS, NOT BEATS, AND ROUNDED DOWN. Promising 37 and delivering 34
    // is the same broken promise in miniature.
    const secs = Math.floor((plan.beats / plan.targetBeats) * target / 5) * 5
    return `You asked for ${target} seconds. There's about ${secs} seconds of substance here — `
      + `the reference is short and I don't have a story from you on this topic.`
  }
  if (plan.dropped > 0) {
    const n = plan.dropped
    return `There's more here than fits ${target} seconds — ${n} ${n === 1 ? 'point' : 'points'} `
      + `didn't make it in. You can keep this length or go longer and keep all of it.`
  }
  return null
}
