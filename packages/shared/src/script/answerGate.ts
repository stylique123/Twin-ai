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
import { isPrivate } from './privacyGuard.js'

export type AnswerOutcome = 'answered' | 'filler'

// The WHOLE answer must be a shrug or pure praise. "No one told me it would
// smell like this" starts with "no" and is a real moment (owner review 2026-10-05).
const SHRUG = /^(nothing( specific| really| much)?|none|no|nope|n\/a|na|idk|i don'?t know|not sure|skip|no idea|not really|dunno|nah|pass|keep it general)( lol| haha| tbh| really| sorry)*$/
const PRAISE_WORDS = new Set(['it', "it's", 'its', 'is', 'really', 'so', 'very', 'good', 'great', 'amazing', 'the', 'best', 'delicious', 'coffee', "you'll", 'youll', 'you', 'will', 'love', 'just', 'try', 'lol', 'honestly', 'a', 'and', 'tasty', 'awesome', 'nice', 'idk'])

/** No moment, no detail: a short answer that is only a shrug or praise. */
export function isFillerAnswer(answer: string): boolean {
  const t = answer.trim().toLowerCase().replace(/[.!?,\s]+$/g, '').replace(/\s+/g, ' ')
  if (!t) return true
  if (SHRUG.test(t)) return true
  // Pure praise: every word is a praise/filler word — no person, moment, thing or number.
  const words = t.replace(/[.!?,;:]/g, ' ').split(/\s+/).filter(Boolean)
  return words.length <= 14 && words.every((w) => PRAISE_WORDS.has(w))
}


// OFFERS only: shipping terms, discounts, prices, codes, guarantees, and
// scarcity said as a limit ("only 30 bags", "20 left"). "Only 12 minutes" and
// "10 bags a week" are not offers (owner review 2026-10-05).
const COMMERCIAL = /\b(free shipping|ships? free|shipping (is|was)? ?(free|included|\$\s?\d)|discount|\d+\s?% off|on sale|coupon|promo code|use code|code [A-Z0-9]{3,}\b|guarantee\w*|refund|money back|\$\s?\d+(\.\d\d)?|£\s?\d+|€\s?\d+|only \d+\s+(bags?|units?|spots?|seats?|pieces?|left|available|made)\b|\d+\s+(bags?|units?|spots?|seats?|pieces?)\s+(left|available|only)\b|limited to \d+)/i

export interface GatedAnswer {
  outcome: AnswerOutcome
  sensitive: boolean
  /** Claims she must confirm, in plain words. */
  hold: string[]
  /** The sentences that carry those claims, held until her yes. */
  heldText: string
  /** The rest of her answer, saved as hers now. */
  keptText: string
  expiresAt: string | null
}

const sentences = (t: string) => (t.match(/[^.!?]+[.!?]*/g) ?? [t]).map((x) => x.trim()).filter(Boolean)

/**
 * @param known what she has already stated or confirmed (her brand, her
 *   products, her stated facts) — "my roastery" is not a claim to hold for a
 *   creator whose brand is a roastery.
 */
export function gateAnswer(answer: string, slot: { expires?: boolean }, opts: { known?: string; now?: number } = {}): GatedAnswer {
  const now = opts.now ?? Date.now()
  if (isFillerAnswer(answer)) return { outcome: 'filler', sensitive: false, hold: [], heldText: '', keptText: '', expiresAt: null }
  const hold: string[] = []
  const held: string[] = []
  const kept: string[] = []
  for (const sentence of sentences(answer)) {
    const roles = unconfirmedRoleClaims(sentence, opts.known ?? '')
    const offers = sentence.match(new RegExp(COMMERCIAL.source, 'gi')) ?? []
    if (!roles.length && !offers.length) { kept.push(sentence); continue }
    held.push(sentence)
    for (const c of roles) hold.push(`You run a ${c.replace(/^(my|our)\s+/, '')}`)
    for (const x of offers) hold.push(x.trim())
  }
  return {
    outcome: 'answered',
    sensitive: isPrivate(answer),
    hold: [...new Set(hold)],
    heldText: held.join(' '),
    keptText: kept.join(' '),
    expiresAt: slot.expires ? new Date(now + EXPIRY_DAYS * 86_400_000).toISOString() : null,
  }
}
