// WHAT THE CREATOR TYPED, KEPT — INSTEAD OF SPENT ONCE AND DISCARDED.
//
// ⚠️⚠️ MEASURED BY THE OWNER OVER THREE GENERATIONS. The strength counter read
// "2 real stories and 1 number" before the session and the same after it, having
// been given three onboarding answers, four idea-mode paragraphs and several
// product-mode answers in between. `creator_knowledge` has exactly three
// writers — the scan, the asked-questions card, and the beat-ask — and NONE of
// them is the box a creator types their idea into. So that material reached one
// script and then existed nowhere.
//
// ⚠️⚠️ AND IT COMPOUNDED INTO A WRONG FACT ON CAMERA. With the pool frozen at
// two stories, a Daisy Candle script needed a second story, found no relevant
// one, and reused the peony-wedding order — welding "I hand-packed them over
// three nights" to a claim about ambient burn. A thin pool is what forces a
// bad match; this is the supply side of that failure.
//
// ⚖️ BUT NOT EVERYTHING TYPED IS KNOWLEDGE, AND STORING IT ALL WOULD BE WORSE.
// The same box takes "make the hook punchier" and "a bride ordered fifty peony
// candles for her wedding". The first is an instruction to the writer about ONE
// video; storing it would put a direction in the pool that a later script could
// read back as a fact about the creator. So this refuses by default and stores
// only what reads as something that HAPPENED to them.

/** Shared with `answerToKnowledge`: the same floor and ceiling a typed answer
 *  gets, because this is the same creator typing into a different box. */
export const TYPED_MIN = 40
export const TYPED_MAX = 1200

export type TypedRefusal =
  | 'empty' | 'too_short' | 'too_long' | 'instruction' | 'question' | 'no_first_person'

export interface TypedMaterialRow {
  kind: 'experience'
  text: string
  basis: 'stated'
  confidence: number
  times_seen: number
  source_ref: string
}

/**
 * ⚠️ AN INSTRUCTION TO THE WRITER IS NOT A FACT ABOUT THE CREATOR. These are the
 * openings a creator uses to steer ONE video — "make it", "write a", "can you" —
 * and every one of them would read back later as a claim about them.
 */
const INSTRUCTION = /^\s*(make|write|do|create|give|turn|rewrite|redo|try|use|add|remove|keep|shorten|lengthen|focus|talk|explain|show|tell me|i want|i need|can you|could you|please)\b/i

/** A question is a request, not a statement, whoever is asking. */
const QUESTION = /\?\s*$/

/**
 * ⚠️ FIRST PERSON IS THE WHOLE TEST, AND IT IS DELIBERATELY NARROW. "Candles
 * sell well in winter" is a market opinion anyone could hold; "I lost a batch
 * when the wax cooled" is this creator's. Only the second is worth storing as
 * theirs, and mistaking the first for the second is how a pool fills with
 * sentences the creator never lived.
 */
const FIRST_PERSON = /\b(i|i'm|i've|i'd|ive|my|me|mine|we|we're|we've|our|ours)\b/i

/**
 * A knowledge row for something the creator typed, or the reason it is refused.
 *
 * ⚖️ REFUSAL IS THE DEFAULT AND COSTS NOTHING. Material that does not clear
 * these gates is still used by the generation it was typed for — exactly as
 * today. What changes is only whether it ALSO survives.
 */
export function typedMaterialToKnowledge(
  typed: unknown,
  sourceRef: string,
): { ok: true; row: TypedMaterialRow } | { ok: false; reason: TypedRefusal } {
  const text = String(typed ?? '').trim().replace(/\s+/g, ' ')
  if (text === '') return { ok: false, reason: 'empty' }
  if (text.length < TYPED_MIN) return { ok: false, reason: 'too_short' }
  if (text.length > TYPED_MAX) return { ok: false, reason: 'too_long' }
  if (QUESTION.test(text)) return { ok: false, reason: 'question' }
  if (INSTRUCTION.test(text)) return { ok: false, reason: 'instruction' }
  if (!FIRST_PERSON.test(text)) return { ok: false, reason: 'no_first_person' }
  return {
    ok: true,
    row: {
      // ⚖️ `experience` BECAUSE THAT IS WHAT THE COUNTER AND THE WRITER BOTH
      // READ. `twinStrength` counts `experience` and `example` as the kind that
      // "makes a script non-generic"; storing this as anything else would grow
      // the pool without moving the number the creator is watching.
      kind: 'experience',
      text,
      // ⚠️ `stated`, NEVER `observed`. They typed it; nobody watched it happen.
      basis: 'stated',
      // ⚖️ BELOW AN ANSWERED QUESTION'S 0.9. A question names what it wants and
      // gets a considered reply; this box takes whatever was on the creator's
      // mind. Worth keeping, worth ranking under a direct answer.
      confidence: 0.8,
      times_seen: 1,
      source_ref: sourceRef,
    },
  }
}
