/**
 * THE BEATS THAT CAN ALWAYS BE WRITTEN, AND THEREFORE MUST BE.
 *
 * ⚠️ THE ONE BEAT THAT NEEDED NOTHING PERSONAL WAS THE ONE THAT STARVED. In the
 * audited script the final beat — a direct ask to share — shipped as
 * "Only you can supply this. What would you actually say here?" A creator at a
 * teleprompter cannot read that, and unlike a personal story there was nothing
 * to supply: a call to action is writable from the video's goal and the
 * creator's offer, both of which were already on file.
 *
 * ⚖️ `needs_user` IS CORRECT AND MUST BE PROTECTED. Twin refusing to invent a
 * creator's life is the most valuable thing about it, and nothing here weakens
 * that. This module says only that THREE SECTIONS CANNOT HONESTLY CLAIM IT:
 * the hook, the payoff and the CTA are craft, not testimony. A writer that marks
 * them `needs_user` has not protected the creator from a fabrication — it has
 * handed them an unfinished script and called it integrity.
 */

/** ⚠️ NORMALISED, BECAUSE THE SECTION IS FREE TEXT. The prompt names "Hook",
 *  "Setup", "Re-hook", "CTA", and real output has carried "Call to action",
 *  "CTA / Payoff" and "The payoff". Matching the exact string would let a rule
 *  be escaped by a space. */
function normalise(section: unknown): string {
  return String(section ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()
}

/**
 * ⚠️ RE-HOOK IS DELIBERATELY NOT A CRAFT BEAT. The doctrine requires a re-hook to
 * CARRY SUBSTANCE — that is its entire job — so a re-hook that needs the creator
 * is telling the truth about a real gap. Including it here would force a beat to
 * be written from nothing, which is the fabrication this system exists to refuse.
 */
export function isCraftSection(section: unknown): boolean {
  const s = normalise(section)
  if (s.includes('re hook') || s.includes('rehook')) return false
  // ⚠️ THE SPACED ACRONYM IS MATCHED EXACTLY, NEVER BY COMPACTING. "C.T.A."
  // normalises to "c t a", so it has to be recognised on purpose — but stripping
  // all spaces to catch it would make "attractant" contain "cta" and flag a
  // section nobody meant. Precision here costs one clause.
  if (/(^| )c t a( |$)/.test(s)) return true
  // ⚠️ WORD-BOUNDED, BECAUSE "attractant" CONTAINS "cta". A bare substring test
  // shipped in the first draft of this file and the test written against it
  // caught the false positive immediately — the normalisation lesson, again.
  // "hook" and "payoff" stay loose on purpose: "Hook section", "The payoff beat"
  // and "Payoff/CTA" are all real writer output and all mean what they say.
  if (/\bcta\b/.test(s)) return true
  return s.includes('hook') || s.includes('call to action') || s.includes('payoff')
}

export interface BeatLike {
  section?: unknown
  substance?: unknown
  line?: unknown
}

export interface CraftViolation {
  index: number
  section: string
}

/**
 * Which craft beats claimed they needed the creator.
 *
 * ⚖️ IT REPORTS, IT DOES NOT REPAIR. The replacement line has to come from the
 * creator's actual goal and offer, which live where the generation runs — a
 * shared module inventing a CTA would be writing copy from nothing, the precise
 * thing this file exists to prevent.
 */
export function craftBeatsThatAsked(beats: readonly unknown[] | null | undefined): readonly CraftViolation[] {
  if (!Array.isArray(beats)) return Object.freeze([])
  const out: CraftViolation[] = []
  beats.forEach((b, index) => {
    if (!b || typeof b !== 'object') return
    const beat = b as BeatLike
    if (String(beat.substance ?? '').toLowerCase() !== 'needs_user') return
    if (!isCraftSection(beat.section)) return
    out.push({ index, section: String(beat.section ?? '') })
  })
  return Object.freeze(out)
}

/** ⚠️ THE STRING THE CREATOR MUST NEVER READ. Kept here so a check can assert
 *  its absence from a shipped line rather than trusting that it was filtered. */
export const REFUSAL_TEXT = /only you can supply this|what would you actually say here/i

/**
 * Does this line read as a refusal rather than as speech?
 *
 * ⚖️ A PLACEHOLDER IS A FAILED BEAT, NOT A DRAFT — the writer's own prompt says
 * so, and the audited script shipped three of them as spoken lines. This is that
 * rule made decidable, and it is deliberately narrow: it matches the refusal
 * TEXT and bracketed stubs, never "short" or "vague", because a short line is
 * often the best line.
 */
export function readsAsPlaceholder(line: unknown): boolean {
  const s = String(line ?? '').trim()
  if (s === '') return true
  if (REFUSAL_TEXT.test(s)) return true
  // A line that is nothing but a bracketed token: "[Insert hook here]".
  if (/^[[(<{][^\]\)>}]*[\]\)>}]$/.test(s)) return true
  // ⚠️ A BARE NUMBER IS NOT A LINE. The audited script rendered two scene cards
  // whose entire body was "2" and "3" — the enumeration ordinal leaking into a
  // text field. Cheap to detect, and invisible until a creator sees the card.
  if (/^\d+[.)]?$/.test(s)) return true
  return false
}

/**
 * The line a call to action falls back to when the writer left it unwritten.
 *
 * ⚠️ EVERY ONE OF THESE IS SPEAKABLE AND CONTAINS NO BRACKET. The whole defect
 * being fixed is a creator reading dead text off a teleprompter, so a fallback
 * that says "[your offer]" would reproduce it in a smaller font. If the offer is
 * not on file, the line that ships is one that never needed it.
 *
 * ⚖️ AND IT IS PLAIN EVERYDAY ENGLISH. A first-time creator has to understand
 * every one of these instantly, and none of them may mention how Twin works.
 */
const FALLBACK_CTA: Record<string, string> = {
  sell: 'If you want the full thing, the link is in my bio.',
  leads: 'If you want help with this, send me a message.',
  conversations: 'Tell me if you have done this differently. I want to hear it.',
  followers: 'Follow if you want more like this.',
  educate: 'Save this so you have it when you need it.',
  authority: 'Follow if you want the rest of this.',
  entertain: 'Send this to someone who needs to see it.',
  personal_brand: 'Follow along if this is your kind of thing.',
}

/** ⚖️ THE DEFAULT IS THE ONE THAT ASKS LEAST. When the goal is unknown, a save
 *  costs the viewer nothing and claims nothing about what the creator sells. */
const CTA_WHEN_NOTHING_IS_KNOWN = 'Save this so you have it when you need it.'

export function fallbackCta(goal: unknown, offer?: unknown): string {
  const g = String(goal ?? '').toLowerCase().trim()
  // ⚠️ THE OFFER IS USED ONLY WHEN IT IS A REAL, SHORT, SPEAKABLE THING. A
  // 300-character description pasted into a brief is not something anyone says
  // out loud, and splicing it in would produce a line the creator has to edit
  // before they can read it — which is the defect, moved.
  const o = typeof offer === 'string' ? offer.trim() : ''
  if (g === 'sell' && o !== '' && o.length <= 40 && !/[\n\r]/.test(o)) {
    return `If you want ${o}, the link is in my bio.`
  }
  return FALLBACK_CTA[g] ?? CTA_WHEN_NOTHING_IS_KNOWN
}
