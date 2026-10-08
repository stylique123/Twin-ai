/**
 * DOES A SOFTWARE CLOSE ANSWER THE SIGN-UP HESITATION? (blueprint gap report, item 5)
 *
 * The software close should take away the reason not to try it: what it costs
 * (free, a trial, a price), what signing up takes (no card, one minute, a
 * link) or how long until it pays off. This only MEASURES the close on the
 * trial (`software_close_audit`); no line is rewritten here.
 *
 * Pure: no model call, no I/O.
 */

const COST = /\b(?:free|trial|no card|no credit card|cancel any ?time|\$\s?\d|\d+\s?(?:dollars|bucks)|per month|a month|\/mo|price|pricing|costs?)\b/i
const SIGNUP = /\b(?:sign(?:ing)?[- ]?up|signup|create an account|download|install|link in (?:my )?bio|one click|in (?:a|one) minute|takes (?:a|one|two|\d+) (?:minute|second)s?|set ?up)\b/i
const TIME = /\b(?:in (?:\d+|a|one|two|five|ten) (?:minutes?|seconds?|days?)|first (?:day|week)|today|tonight|right now|this week)\b/i

export type HesitationAnswered = 'cost' | 'signup' | 'time'

export interface SoftwareCloseAudit {
  /** Which hesitations the close answers (empty when none). */
  answers: HesitationAnswered[]
  /** True when the close answers at least one. */
  ok: boolean
}

/** Measure the close: the last spoken line. */
export function auditSoftwareClose(lines: readonly unknown[]): SoftwareCloseAudit {
  const spoken = lines.map((l) => (typeof l === 'string' ? l.trim() : '')).filter(Boolean)
  const close = spoken.slice(-1).join(' ')
  const answers: HesitationAnswered[] = []
  if (COST.test(close)) answers.push('cost')
  if (SIGNUP.test(close)) answers.push('signup')
  if (TIME.test(close)) answers.push('time')
  return { answers, ok: answers.length > 0 }
}
