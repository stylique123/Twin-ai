// "THE LAST 30 DAYS" IS NOT A PRODUCT, AND NEITHER IS POSTING FREQUENCY.
//
// ⚠️ REPORTED FROM THE LIVE PAGE. The Product Library offered five suggestions
// and they were: a content series title, Zoom, an opinion about how often to
// post on Instagram, and a claim about growing a TikTok account. The rule
// producing them was, in effect, "this noun appeared in a video, so perhaps
// commerce has occurred".
//
// ⚖️ PRECISION MATTERS FAR MORE THAN RECALL HERE, AND THE ASYMMETRY IS NOT
// CLOSE. Missing a product is mildly annoying — there is an Add button two
// inches away. Calling somebody's opinion about the Instagram algorithm "your
// product" makes the entire intelligence layer look like it is guessing, and a
// creator who sees that once has no reason to trust the script either.
//
// ⚖️ SO THE THRESHOLD IS DELIBERATELY HIGH AND SILENCE IS A GOOD OUTCOME. This
// module answers "is there strong evidence of a commercial relationship with a
// named thing", and when the answer is no it produces nothing at all.
//
// ⚠️ IT DOES NOT MINT, CLAIM OR PERMIT ANYTHING. A suggestion is an invitation
// to answer four questions; the attestation still decides ownership, and no
// confidence score here ever substitutes for a person saying "that is mine".

import type { CommercialTie } from './creatorProfileQuestions'

/** What this reads off an extracted knowledge row. Structural, so a caller
 *  holding a row from any source can ask. */
export interface SuggestionCandidate {
  text?: unknown
  /** How the item was obtained: 'stated' carries more weight than 'inferred'. */
  basis?: unknown
  /** How many videos carried it. Repetition is the cheapest honest signal. */
  timesSeen?: unknown
}

export type SuggestionConfidence = 'high' | 'medium' | 'low'

export interface SuggestionVerdict {
  confidence: SuggestionConfidence
  /** The signals that fired, in plain English — shown to the creator so a
   *  suggestion can be judged rather than merely accepted. */
  reasons: string[]
  /** Why it was refused, when it was. Kept for the same reason: a suggestion
   *  that vanishes with no explanation teaches nothing. */
  rejectedFor: string | null
}

// ── WHAT A COMMERCIAL RELATIONSHIP SOUNDS LIKE ────────────────────────────
//
// ⚖️ PHRASES, NOT TOPICS. Each of these is somebody speaking about a thing they
// have a stake in — building it, selling it, earning from it, or telling people
// to go and get it. A noun on its own signals nothing.
const OWNERSHIP = /\b(we built|we made|i built|i made|our (?:app|product|platform|tool|software|course|agency)|my (?:app|product|platform|tool|software|course|agency|book)|we launched|i launched|we sell|i sell|founded)\b/i
const COMMERCIAL_CTA = /\b(link in bio|sign ?up|try it free|try (?:it|our|my)|get (?:it|yours)|use code|discount code|check out (?:my|our)|available (?:now|at)|shop|order|book a call|join (?:my|our))\b/i
const PROMOTION = /\b(affiliate|sponsored by|sponsor|partnered with|paid partnership|commission|i recommend|i use (?:this|it) daily|been using)\b/i
const URLISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|io|co|ai|app|net|org|shop|store)\b)/i

// ── WHAT IS NEVER A PRODUCT, HOWEVER OFTEN IT IS SAID ─────────────────────
//
// ⚠️ THE ACTUAL GARBAGE, NAMED. Every pattern here was written against a real
// suggestion that reached a creator's screen.
const ADVICE_OR_CLAIM = /\b(you should|you need to|the best way|how to|why you|stop |start |mistake|tip|lesson|secret|posting|algorithm|engagement|followers?|growth|consistency|frequency)\b/i
const SENTENCE_SHAPED = /[.?!]\s|\?$|\b(?:is|are|was|were|will|can|should|does|do)\b.*\b(?:not|never|always)\b/i

/** ⚖️ A PLATFORM IS NOT A PRODUCT SOMEBODY OWNS, unless they say something that
 *  makes it one. Zoom, Instagram and TikTok are where the work happens; naming
 *  the room is not selling it. */
const PLATFORMS = new Set([
  'zoom', 'instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'x', 'linkedin',
  'reels', 'shorts', 'snapchat', 'threads', 'whatsapp', 'google', 'canva',
])

const text = (c: SuggestionCandidate): string => String(c?.text ?? '').trim()
const seen = (c: SuggestionCandidate): number =>
  typeof c?.timesSeen === 'number' && Number.isFinite(c.timesSeen) ? c.timesSeen : 1

/**
 * Does the creator's own onboarding answer permit ANY suggestion at all?
 *
 * ⚠️ "NOTHING COMMERCIAL" IS AN ANSWER AND THE PAGE MUST HONOUR IT. Manufacturing
 * suggestions for somebody who has said they sell nothing is the product arguing
 * with them about their own business.
 *
 * ⚖️ AND SILENCE IS NOT THAT ANSWER. An empty list means the question was never
 * reached, which is a different fact — so it permits suggestions rather than
 * suppressing them.
 */
export function suggestionsAllowed(ties: readonly CommercialTie[] | null | undefined): boolean {
  if (!Array.isArray(ties) || ties.length === 0) return true
  return !(ties.length === 1 && ties[0] === 'none')
}

/**
 * How strongly does this row look like a thing the creator has a stake in?
 *
 * ⚖️ SIGNALS ARE NAMED, NOT SUMMED INTO A NUMBER NOBODY CAN ARGUE WITH. The
 * reasons are shown to the creator, because a suggestion that explains itself can
 * be judged and one that does not can only be trusted or ignored.
 */
export function scoreSuggestion(candidate: SuggestionCandidate): SuggestionVerdict {
  const raw = text(candidate)
  const reasons: string[] = []
  if (raw === '') return { confidence: 'low', reasons, rejectedFor: 'empty' }

  // ⚠️ DISQUALIFIERS RUN FIRST AND ARE ABSOLUTE. A sentence of advice cannot
  // become a product by being repeated, and scoring it before rejecting it is
  // how "posting once a week is insufficient" reached a Product Library.
  if (SENTENCE_SHAPED.test(raw) || ADVICE_OR_CLAIM.test(raw)) {
    return { confidence: 'low', reasons, rejectedFor: 'reads as a topic, opinion or piece of advice rather than a named thing' }
  }
  const bare = raw.toLowerCase().replace(/[^a-z0-9. ]/g, '').trim()
  if (PLATFORMS.has(bare) && !PROMOTION.test(raw) && !OWNERSHIP.test(raw)) {
    return { confidence: 'low', reasons, rejectedFor: 'a platform they post on, not a product they sell' }
  }

  if (OWNERSHIP.test(raw)) reasons.push('they describe building or selling it')
  if (PROMOTION.test(raw)) reasons.push('they describe a commercial relationship with it')
  if (COMMERCIAL_CTA.test(raw)) reasons.push('it appears with a call to action')
  if (URLISH.test(raw)) reasons.push('it appears with a link')
  const times = seen(candidate)
  if (times >= 3) reasons.push(`mentioned in ${times} videos`)
  if (candidate?.basis === 'stated') reasons.push('they said it directly')

  // ⚖️ REPETITION ALONE IS NEVER ENOUGH. A creator says "Instagram" in thirty
  // videos. What makes something a product is a RELATIONSHIP signal, so at least
  // one of ownership, promotion, CTA or link is required before anything else
  // counts — this is the line the old rule did not have.
  const hasRelationship = OWNERSHIP.test(raw) || PROMOTION.test(raw)
    || COMMERCIAL_CTA.test(raw) || URLISH.test(raw)
  if (!hasRelationship) {
    // ⚠️ LENGTH IS CHECKED HERE AND NOT EARLIER, AND A TEST IS WHY. The first
    // version rejected anything over eight words BEFORE looking for evidence,
    // and it threw out "I have been using Notion — affiliate link in bio": nine
    // words, three relationship signals, exactly the row this module exists to
    // find. Shape is a weak proxy for "not a product name"; stated commerce is
    // direct evidence, and a proxy must never outrank the thing it stands in for.
    // So length only decides among rows that showed no relationship at all.
    const tooLong = raw.split(/\s+/).length > 8
    return {
      confidence: 'low',
      reasons,
      rejectedFor: tooLong
        ? 'reads as a phrase rather than a named thing, with nothing commercial around it'
        : 'nothing indicates they sell, promote or earn from it',
    }
  }

  // HIGH needs the relationship AND corroboration — a second, independent
  // reason. One phrase in one video is a mention; a phrase plus repetition, or
  // ownership plus a link, is evidence.
  const confidence: SuggestionConfidence = reasons.length >= 2 ? 'high' : 'medium'
  return { confidence, reasons, rejectedFor: null }
}

export interface RankedSuggestion<T> {
  item: T
  verdict: SuggestionVerdict
}

/**
 * The ONE suggestion worth showing, or none.
 *
 * ⚠️ ONE, NOT A SECTION. Five cards of "products you have mentioned" is a wall
 * the creator has to audit, and every wrong entry costs more trust than a right
 * one earns. A single high-confidence candidate with its reasons attached is
 * something a person can answer in two seconds.
 *
 * ⚖️ MEDIUM IS KEPT OUT OF SIGHT RATHER THAN SHOWN QUIETLY. It is a real state —
 * evidence exists but does not corroborate — and the honest treatment is to
 * accumulate it silently, not to present it at half brightness and let the
 * creator adjudicate our uncertainty.
 */
export function bestSuggestion<T extends SuggestionCandidate>(
  candidates: readonly T[],
  ties?: readonly CommercialTie[] | null,
): RankedSuggestion<T> | null {
  if (!suggestionsAllowed(ties)) return null
  let best: RankedSuggestion<T> | null = null
  for (const item of candidates ?? []) {
    const verdict = scoreSuggestion(item)
    if (verdict.confidence !== 'high') continue
    if (!best || verdict.reasons.length > best.verdict.reasons.length) best = { item, verdict }
  }
  return best
}
