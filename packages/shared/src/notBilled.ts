// WE DID NOT CHARGE YOU FOR THAT ONE, AND NOBODY EVER SAID SO.
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-01, on a fresh signup's first session. Five
// generations, and the credit ledger reads:
//
//   -10 blueprint  →  +10 blueprint_refund_quality   (×5, ~60-90s apart)
//
// Net zero. The remix counter dropped to 2 and returned to 3 every time, which
// the owner reported as "it still shows 3". The counter is right. What is
// missing is the sentence explaining why.
//
// ⚖️ THE REFUND IS THE HONEST BEHAVIOUR AND STAYS. generate-blueprint refunds a
// script whose beats are mostly questions (`script_mostly_questions`, ≥40% of
// beats `needs_user`), and writes `credits_spent: 0` so the row records what was
// KEPT rather than what was reserved. On those five: 3/5, 4/6, 3/6, 5/7, 4/6 —
// 50% to 71% of every script. For a brand-new account with no knowledge, no
// products and no transcripts, the writer genuinely cannot ground the body, and
// refusing to bill for that is correct.
//
// ⚠️ WHAT IS WRONG IS THE SILENCE. `credits_spent` had ZERO readers in the web
// app — the one field stating the charge was reversed was stored and never
// shown. A creator watching a counter that will not move concludes the product
// is broken; the truth is that Twin declined to bill for a script it knows is
// mostly questions. Silence turned honest behaviour into a bug report.

import { discoveryQuestions, isBillableScript } from './generationReadiness.js'

/** The shape this reads. Structural rather than importing `Generation`, so a
 *  caller holding a plain row can ask too. */
export interface BilledView {
  /** ⚠️ THE NULL CHECK MUST PRECEDE THE COERCION. A row predating the column
   *  reads `null`/`undefined`, which is "not recorded", NOT "not billed" — and
   *  telling a creator their charge was reversed when it was not is the same
   *  class of lie in the opposite direction. */
  credits_spent?: number | null
  script?: ReadonlyArray<{ substance?: string | null; line?: string | null; ask?: string | null }> | null
}

/** Beats the writer marked as needing the creator — the same field the edge
 *  function counts when it decides not to bill. */
export function needsUserCount(script: BilledView['script']): number {
  if (!Array.isArray(script)) return 0
  return script.filter((b) => b?.substance === 'needs_user').length
}

/** A beat's text as the edge's billing gate reads it: `line` AND `ask`. */
const gateText = (b: { line?: string | null; ask?: string | null } | null | undefined) =>
  `${String(b?.line ?? '')} ${String(b?.ask ?? '')}`

/**
 * Beats that ask the creator for something — marked `needs_user` OR carrying
 * one of the escalation sentences the edge writes.
 *
 * ⚠️ 2026-09-22, 8 remixes, 6 refunded: the ledger reconciled exactly (-80,
 * +60), but a 1-of-8 ask refunds the whole script (`script_asks_creator_for_context`)
 * while the notice counted only `needs_user`. The count shown must be the count
 * the gate saw, or "free" looks random.
 */
export function askingBeatCount(script: BilledView['script']): number {
  if (!Array.isArray(script)) return 0
  const lines = script.map(gateText)
  const escalated = new Set(discoveryQuestions(lines))
  return script.filter((b, i) => b?.substance === 'needs_user' || escalated.has(i)).length
}

/**
 * The billing decision the edge makes, recomputed from the stored script —
 * the same `isBillableScript` rule (parity-pinned to the edge's inline copy by
 * `two-lists-one-refund.test.ts`). Used to check a row against its own charge.
 */
export function billingDecisionFor(script: BilledView['script']): { billable: boolean; reason: string | null } {
  if (!Array.isArray(script)) return { billable: true, reason: null }
  const { billable, reason } = isBillableScript(script.map(gateText), needsUserCount(script))
  return { billable, reason }
}

/**
 * Was this generation kept off the bill?
 *
 * ⚖️ ZERO IS THE SIGNAL, AND ONLY AN EXPLICIT ZERO. `credits_spent` is written
 * as `unbillable ? 0 : BLUEPRINT_COST` at the moment of insert, so a stored 0 is
 * a decision, not an absence. Anything non-numeric is unknown and says nothing.
 */
export function wasNotBilled(gen: BilledView | null | undefined): boolean {
  const spent = gen?.credits_spent
  return typeof spent === 'number' && Number.isFinite(spent) && spent === 0
}

/**
 * The sentence a creator reads, or null when there is nothing true to say.
 *
 * ⚠️ PLAIN ENGLISH, AND IT NAMES THE NUMBER. "Some beats need your input" is a
 * shrug; "4 of the 6 beats" is a fact the creator can act on, and it matches
 * what they will see marked on the script itself.
 */
export function notBilledNotice(gen: BilledView | null | undefined): string | null {
  if (!wasNotBilled(gen)) return null
  const script = gen?.script
  const total = Array.isArray(script) ? script.length : 0
  const asks = askingBeatCount(script)
  if (total === 0 || asks === 0) {
    // Not billed, but we cannot say which beats — so say only what is certain.
    return 'This one is free — Twin could not ground enough of it to charge you for it.'
  }
  return `This one is free. ${asks} of the ${total} beats need a detail only you can give, `
    + 'so Twin did not take a remix for it. Fill those in and the next run will be stronger.'
}
