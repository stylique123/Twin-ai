// NOTHING EVER ASKED HER WHETHER SHE FILMED IT.
//
// ⚠️ MEASURED, 2026-09-09. `generation_outcomes` records the frozen context on
// every generation and `was_filmed` is three-state on purpose — true filmed,
// false looked-at-and-declined, NULL not-asked. Grepped the whole repository
// for a writer: the string `was_filmed` appeared in 0191 and in ONE comment in
// `generate-blueprint` saying the column is left null on purpose. Nothing asked,
// so NULL was the only reachable state and `false` — the single negative signal
// in this product — could never occur.
//
// ⚖️ EVERYTHING ELSE IN TWIN MEASURES ENTHUSIASM AT THE MOMENT OF CLICKING.
// Which references get picked, which angles get opened, which scripts get
// generated: all of it is what looked appealing in a gallery. Whether the script
// became a video is the only measure of regret we can get, and it cannot be
// derived — `posts` holds 4 posted rows against 85 generations, because posting
// THROUGH Twin is rare. 5% coverage is not a proxy for 100%.
//
// ── WHEN TO ASK, WHICH IS MOST OF THE DESIGN ─────────────────────────────
//
// ⚠️ ASKING AT THE END OF THE BUILD WOULD POISON THE ANSWER. She has not filmed
// anything yet; "no" would mean "not yet" and would be recorded as "declined" —
// manufacturing the negative signal this exists to measure honestly. The ask has
// to wait until an answer is possible.
//
// ⚖️ SO THE TRIGGER IS HER COMING BACK. Opening a script she generated some time
// ago is the moment she knows the answer, and it needs no scheduling, no email
// and no notification — she is already looking at the thing being asked about.
export const ASK_AFTER_MS = 12 * 60 * 60 * 1000

export type FilmedAsk =
  /** No outcome row: nothing to answer into. See `no_row` below. */
  | { kind: 'no_row' }
  /** Too soon — she cannot honestly answer yet. */
  | { kind: 'too_soon' }
  /** Ask her. */
  | { kind: 'ask' }
  /** She already answered; show it back and let her change it. */
  | { kind: 'answered'; wasFilmed: boolean; answeredAt: string | null }

export interface FilmedAskInput {
  /** The outcome row, or null when there is none. */
  outcome: { was_filmed: boolean | null; filmed_answered_at: string | null } | null
  /** When the generation was created (ISO). */
  generatedAt: string | null
  /** Epoch ms. Passed in so this is pure and testable at a boundary. */
  now: number
}

/**
 * Whether to ask, and what to show.
 *
 * ⚠️⚠️ `no_row` IS NOT A BUG AND MUST NOT BE REPAIRED BY CREATING ONE. The
 * outcome row is written at generation time with the context FROZEN — niche,
 * sub-niche, substance budget, whether there was a reference. For a generation
 * that predates the table, none of that is recoverable: 0191 argues this at
 * length and it is the reason the table exists at all. Inserting a row now to
 * have something to answer into would fabricate `had_reference`, which is `not
 * null`, and quietly seed the corpus with invented context.
 *
 * ⚖️ SO OLD GENERATIONS ARE NEVER ASKED, AND THAT IS THE HONEST OUTCOME. The
 * 85 generations written before today are permanently unattributable. The
 * question fills forward.
 */
export function filmedAsk(input: FilmedAskInput): FilmedAsk {
  const { outcome, generatedAt, now } = input
  if (!outcome) return { kind: 'no_row' }

  // ⚠️ THE ANSWERED CHECK PRECEDES THE TIMER. An answer given early — she
  // filmed it in the first hour, which is the best possible outcome — must not
  // be hidden again by a clock that thinks it is too soon to have one.
  if (outcome.was_filmed !== null) {
    return { kind: 'answered', wasFilmed: outcome.was_filmed, answeredAt: outcome.filmed_answered_at }
  }

  // ⚠️ NULL IS "WE DO NOT KNOW WHEN", NOT "LONG AGO". A generation with no
  // recorded timestamp cannot clear the waiting period, because nothing
  // established that it has elapsed. The null check precedes the arithmetic:
  // `now - Date.parse(null)` is NaN, and every comparison against NaN is false,
  // which would read as "too soon" by accident rather than by decision.
  if (!generatedAt) return { kind: 'too_soon' }
  const at = Date.parse(generatedAt)
  if (!Number.isFinite(at)) return { kind: 'too_soon' }

  return now - at >= ASK_AFTER_MS ? { kind: 'ask' } : { kind: 'too_soon' }
}

/** The words she reads. Plain English — this is a creator surface.
 *
 *  ⚖️ "NOT THIS ONE" RATHER THAN "NO". `false` here is a real and useful answer,
 *  not a failure, and the wording must not make saying it feel like a
 *  complaint — an option that reads as criticism gets avoided, and avoidance
 *  produces exactly the NULL-heavy data this change exists to end.
 */
export const FILMED_ASK_QUESTION = 'Did you film this one?'
export const FILMED_YES = 'Yes, I filmed it'
export const FILMED_NO = 'Not this one'
export const FILMED_WHY = 'This is the only way Twin learns which scripts turn into videos. It changes nothing about this script.'
