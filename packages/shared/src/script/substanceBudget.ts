/**
 * HOW MUCH THERE IS TO SAY, COUNTED BEFORE ANYTHING IS WRITTEN.
 *
 * ⚠️ THIS FILE IS HALF OF A RULE, AND THE SPLIT WAS NOT MY PLAN — CI FOUND IT.
 * The intent was to ship the budget and the expansion ban together, on the
 * reasoning that a budget nobody enforces is just a number. `check_symbol_
 * readers` then failed the ban with no caller, and it was right: A BAN NEEDS A
 * TARGET TO BAN AGAINST, and the target comes from the length picker, which is
 * not built. So the true dependency is budget + ban + picker, and the ban ships
 * with the picker rather than sitting here unreachable. What is here is wired,
 * counted on every generation, and logged.
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
 * choosing 30 is choosing an explainer, and the picker says so rather than
 * leaving them to find out at the teleprompter.
 */
const SHAPE: Readonly<Record<TargetSeconds, readonly string[]>> = Object.freeze({
  30: Object.freeze(['hook', 'setup', 'payoff', 'cta']),
  60: Object.freeze(['hook', 'setup', 'episode', 'consequence', 'payoff', 'cta']),
  90: Object.freeze([
    'hook', 'setup', 'episode', 'consequence', 'rehook', 'second point', 'payoff', 'cta',
  ]),
})

export function shapeFor(target: TargetSeconds): readonly string[] { return SHAPE[target] }
export function beatsFor(target: TargetSeconds): number { return SHAPE[target].length }

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
 * ⚖️ WHICH OF A REFERENCE'S BEATS ARE *POINTS*. `hook` and `cta` are excluded
 * because every script gets both regardless of how much there is to say —
 * counting them would credit a reference that contains nothing with two beats
 * of substance. `rehook` is excluded for the same reason: it is a structural
 * move, not a thing said.
 *
 * ⚠️ THE ROLES COME FROM `BEAT_ROLES` IN referenceContentProfile.ts. If a role
 * is added there and not considered here, it silently stops counting — which is
 * why `a-substance-budget-and-its-twin.test.ts` asserts this list against that
 * one rather than against a copy of itself.
 */
export const POINT_ROLES: readonly string[] = Object.freeze([
  'setup', 'item', 'turn', 'evidence', 'payoff',
])

/**
 * Count the points in a reference's beats.
 *
 * ⚠️ NULL WHEN THERE ARE NO BEATS TO COUNT, NEVER ZERO. `reference_content_
 * profiles.profile.structure.beats` is an `Assessed<Beat[]>`, whose
 * `not_checked` and `indeterminate` states mean nobody established the answer.
 * Returning 0 for those would say "this reference makes no points", which is a
 * finding nobody made, and would then cap every script at two beats.
 */
export function referencePointsFrom(
  beats: readonly { role?: unknown }[] | null | undefined,
): number | null {
  if (!Array.isArray(beats)) return null
  return beats.filter((b) => POINT_ROLES.includes(String(b?.role ?? ''))).length
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
 * script emits FEWER beats — it never stretches the beats it has to reach a
 * number, because that stretching is where the invented figures came from.
 *
 * ⚠️⚠️ AND THE NUMBER IT IS JUDGED AGAINST IS ALREADY FROZEN. Measured
 * 2026-09-08: removing the source material made the model write 64% MORE
 * (mean 12.5 -> 20.5 sentences, every run up by mean, run b x2.71). See
 * `removing-the-substance-makes-it-write-more.test.ts`. Re-running that
 * comparison with the ban wired must bring the ratio from 1.64 to at or below
 * 1.0; still above 1.0 means this is not reaching the path that writes.
 */
export function planLength(target: TargetSeconds, budget: SubstanceBudget): LengthPlan {
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
