// WHAT HAPPENS TO HER ANSWER BEFORE IT IS SAVED (owner, 2026-10-04 — tested on
// the owner's simulated moments; the three traps must not reach a script as
// typed).
//
// · filler ("idk just try it lol", "It's really good coffee, you'll love it")
//   is not saved: the slot stays open and the script stays honestly short.
// · a private matter (the city's letter about permits) is saved private.
// · a business or role she claims ("my coffee cart business") and
//   commercial terms (numbers of bags, free shipping, prices, codes) are saved
//   HELD: not used on camera until she taps yes on the exact claim.
// · a slot that expires (a launch limit) is saved with that expiry.

import { unconfirmedRoleClaims } from './roleClaims.js'
import type { Slot as SpecSlot } from './questionSpecs.js'
import { EXPIRY_DAYS } from './questionSpecs.js'

export type AnswerOutcome = 'answered' | 'filler'
export interface GatedAnswer {
  outcome: AnswerOutcome
  sensitive: boolean
  /** Claims she must confirm before any of this answer is said on camera. */
  hold: string[]
  /** ISO time this answer stops being current, or null. */
  expiresAt: string | null
}

const NON_ANSWER = /^(nothing( specific| really| much)?|none|no|n\/a|na|idk|i don'?t know|not sure|skip|no idea|not really|dunno)\b/
const PRAISE_ONLY = /\b(really good|so good|you'?ll love it|it'?s (great|amazing|the best|delicious)|the best|amazing|just try it)\b/

/** No moment, no detail: a short answer that is only a shrug or praise. */
export function isFillerAnswer(answer: string): boolean {
  const t = answer.trim().toLowerCase().replace(/[.!\s]+$/, '')
  if (!t) return true
  const words = t.split(/\s+/)
  if (NON_ANSWER.test(t) && words.length <= 12) return true
  if (/\bkeep it general\b/.test(t)) return true
  if (words.length <= 12 && PRAISE_ONLY.test(t) && !/\d/.test(t)) return true
  return false
}

// Backstop only: the worker reads every fact by meaning (privacyByMeaning).
const PRIVATE = /\b(permits?|permitting|inspections?|inspector|zoning|licen[cs]e|the city sent|council|fined|(?:got|paid|gave me) a fine|lawsuit|sued|court|police|landlord|evict\w*|rent (is|was) late|debt|bank (account|balance)|broke\b|diagnos\w*|illness|hospital|pregnan\w*|divorce|my ex\b|therapy|medication)/i

const COMMERCIAL = /\b(free shipping|ships? free|shipping|discount|\d+\s?% off|on sale|coupon|promo|use code|code [A-Z0-9]{3,}|guarantee|refund|money back|\$\s?\d|£\s?\d|€\s?\d|\d+\s+(bags?|units?|spots?|seats?|pieces?)\b|only \d+(?:\s+[a-z]+)?)/i

export function gateAnswer(answer: string, slot: Pick<SpecSlot, 'expires'>, now = Date.now()): GatedAnswer {
  if (isFillerAnswer(answer)) return { outcome: 'filler', sensitive: false, hold: [], expiresAt: null }
  const hold: string[] = []
  for (const c of unconfirmedRoleClaims(answer, '')) hold.push(`You run a ${c.replace(/^(my|our)\s+/, '')}`)
  const m = answer.match(new RegExp(COMMERCIAL.source, 'gi'))
  for (const x of new Set((m ?? []).map((s) => s.trim()))) hold.push(x)
  return {
    outcome: 'answered',
    sensitive: PRIVATE.test(answer),
    hold,
    expiresAt: slot.expires ? new Date(now + EXPIRY_DAYS * 86_400_000).toISOString() : null,
  }
}
