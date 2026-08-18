// WHAT YOU MAKE AND WHAT YOU WANT TO MAKE ARE TWO FACTS.
//
// ⚠️ COLLAPSING THEM TRAPS A CREATOR INSIDE THEIR OWN HISTORY, which is close to
// the opposite of why somebody signs up. Forty talking-heads in the archive is
// evidence about the past; it is not a request. A creator with:
//
//     observed:  talking_head, talking_head, talking_head
//
// may be here precisely because they want:
//
//     preferred: pov_skit, walk_and_talk, review_comparison
//
// and a gallery that ranked their history as their preference would keep showing
// them the thing they came to escape — while looking like personalisation.
//
// ⚖️ SO `preferred` IS NULL UNTIL SOMEBODY ASKS, AND NULL MEANS NOT ASKED. Not
// "no preference", and emphatically not "talking head by default". The ranking
// group SKIPS on null, and the signal reports `not_checked` with the reason
// spelled out, exactly as every other unasked question in this codebase does.
//
// ── OBSERVED IS STILL USEFUL, FOR DIFFERENT QUESTIONS ─────────────────────
//
// It is evidence of CAPABILITY and FAMILIARITY — "Twin has seen you record a
// talking-head, so it knows you can" and "you already make this kind of video".
// Both are worth saying to a creator. Neither is authority over what they want,
// and `formatStance` below is what keeps the two apart at the call site.

import type { ProductionMode } from './referenceProfile'
import type { Provenanced } from './authority'

/**
 * The two format facts, side by side rather than merged.
 *
 * ⚠️ `preferred` IS `Provenanced<…> | null` AND `observed` IS NOT NULLABLE. An
 * account with no posts has an EMPTY observed list — we looked and found none —
 * whereas an unasked preference has no answer at all. Those are different
 * states and the types say so.
 */
export interface FormatProfile {
  /** From the scan. `source: 'observed'` carries its own evidence count. */
  observedFormats: Provenanced<readonly ProductionMode[]>
  /** From a question the creator answered. Null until one is asked. */
  preferredFormats: Provenanced<readonly ProductionMode[]> | null
}

/** How a reference's format relates to this creator — three answers, not one
 *  `match`.
 *
 *  ⚖️ ONE `format_match` BOOLEAN CANNOT RECOMMEND NOVELTY ON PURPOSE. Splitting
 *  it lets Twin say "this is outside what you usually make, and it fits what you
 *  are trying to do" as a deliberate suggestion rather than as an accident that
 *  a match-score failed to suppress. */
export const FORMAT_STANCES = ['preferred', 'familiar', 'expansion', 'not_checked'] as const
export type FormatStance = (typeof FORMAT_STANCES)[number]

export interface FormatVerdict {
  stance: FormatStance
  /** Plain English, for the card and for the drawer. Present always — including
   *  for `not_checked`, where the honest sentence is that nobody asked. */
  because: string
}

/**
 * Where does this reference's production mode sit for this creator?
 *
 * ⚠️ PREFERENCE OUTRANKS FAMILIARITY, AND THAT ORDER IS THE POINT. A format
 * somebody asked for beats one they merely have a history of, because the
 * history is the thing they may be trying to change.
 */
export function formatStance(
  mode: ProductionMode | null,
  formats: FormatProfile | null,
): FormatVerdict {
  if (mode === null) {
    return { stance: 'not_checked', because: 'Nobody has looked at how this video was made yet.' }
  }
  const preferred = formats?.preferredFormats?.value ?? null
  const observed = formats?.observedFormats.value ?? null

  if (preferred !== null && preferred.includes(mode)) {
    return { stance: 'preferred', because: 'This is one of the kinds of video you said you want to make.' }
  }
  if (observed !== null && observed.includes(mode)) {
    return { stance: 'familiar', because: 'You already make videos like this one.' }
  }
  // ⚠️ "EXPANSION" IS ONLY HONEST ONCE SOMETHING IS KNOWN. With no preference
  // answered AND nothing observed, this is not a new direction — it is a
  // question nobody asked, and calling it expansion would invent an intent.
  if (preferred === null && (observed === null || observed.length === 0)) {
    return { stance: 'not_checked', because: 'Nobody has asked what kinds of video you want to make.' }
  }
  return { stance: 'expansion', because: 'This is different from what you usually make.' }
}

/** ⚖️ THE ONE QUESTION THAT WOULD TURN THE FORMAT GROUP ON. Written here, beside
 *  the field it fills, rather than in a planning document — a named gap in the
 *  code is a gap somebody trips over; a named gap in a document is one somebody
 *  has to remember to read. */
export const PREFERRED_FORMATS_QUESTION =
  'What kinds of videos do you want Twin to help you make?'
