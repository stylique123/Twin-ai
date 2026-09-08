// FOUR SUBSYSTEMS READ ONE SCRIPT FOUR WAYS, AND NOTHING MAKES THEM AGREE.
//
// ⚠️ THE MEASURED CASE. A hook says "six month deal". `containsCount(hook, 6)`
// returns TRUE — the word "six" is there — so the count contract records the
// hook as carrying a promise of six items, and a panel elsewhere praises the
// same line for naming a number. Both are reading raw text and inferring a
// different thing from the same six characters. Every fix has been correct in
// isolation; nothing forces them to agree.
//
// ⚖️ THE FIX IS TO CLASSIFY ONCE, NOT TO ADD A FIFTH READER. A number in a
// script line has exactly one role, decided by what follows it, and every
// checker that cares about numbers should ask the same question of the same
// answer. This module is that one answer.
//
// ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
//
// ⚠️ IT DOES NOT DECIDE WHETHER A CLAIM IS TRUE, ALLOWED, OR SUPPORTED. Those
// belong to `claimEntailment`, `productClaimCheck` and the entitlement rules,
// and each already owns its question. This answers only: what KIND of number is
// this — so the others stop each inventing their own answer from the raw string.
//
// ⚖️ AND IT IS DELIBERATELY NARROW. A role is assigned only where the text says
// so, by the unit or marker sitting against the number. Anything else is
// `unknown`, which is not a default in either direction — it means the text did
// not say, and a caller must decide what to do about that rather than being
// handed a guess.

/** What a number in a script line is doing.
 *
 *  ⚠️ `enumeration` IS THE ABSENCE OF ANOTHER ROLE, not a positive detection.
 *  "5 mistakes" and a bare "5" both read as a possible item count; "5 months"
 *  does not. This is the asymmetry the count contract needs: it must never
 *  mistake a duration for a promise, and it may still ask about a bare number. */
export type NumberRole = 'enumeration' | 'duration' | 'money' | 'percentage' | 'multiple'

export interface NumberMention {
  /** The value, as a number. Word forms are resolved to digits. */
  value: number
  role: NumberRole
  /** The exact text matched, for a caller that wants to quote it. */
  text: string
  /** Index in the source string, so two mentions of "6" are distinguishable. */
  at: number
}

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
}

/** ⚠️ NOT IDENTICAL TO `claimEntailment`'s DURATION LIST, AND SAYING SO BEATS
 *  CLAIMING PARITY IT DOES NOT HAVE. An earlier draft of this comment asserted
 *  the two sets were the same; they are not. `claimEntailment` recognises
 *  hours, minutes, days, weeks, months and years — it has no SECONDS, because
 *  its job is spotting a claimed measurement and "5 seconds" is rarely one.
 *
 *  ⚖️ THIS LIST ADDS SECONDS DELIBERATELY, because its job is the opposite: to
 *  stop a number being mistaken for an item count, and "5 seconds in" is
 *  exactly the kind of line that would otherwise read as a promise of five
 *  things. A wider list here can only ever REFUSE to call something a count,
 *  which is the safe direction for this module and the unsafe one for that.
 *  The difference is pinned by a test rather than left to be rediscovered. */
const DURATION = /^\s*-?\s*(?:second|sec|minute|min|hour|hr|day|week|month|year)s?\b/i
const PERCENT = /^\s*%|^\s*percent\b/i
const MULTIPLE = /^\s*(?:x\b|×|times\b|fold\b)/i
const MONEY_BEFORE = /[$£€]\s*$/
const MONEY_AFTER = /^\s*(?:dollars?|pounds?|euros?|bucks?|k\b|\/\s*(?:mo|month|yr|year))/i

function roleFor(before: string, after: string): NumberRole {
  // ⚠️ MONEY IS CHECKED ON BOTH SIDES. "$29" carries its marker in front and
  // "29 dollars" behind; reading only one side classifies half of all prices as
  // an item count, which is the same defect in a new place.
  if (MONEY_BEFORE.test(before) || MONEY_AFTER.test(after)) return 'money'
  if (PERCENT.test(after)) return 'percentage'
  if (DURATION.test(after)) return 'duration'
  if (MULTIPLE.test(after)) return 'multiple'
  return 'enumeration'
}

/**
 * Every number in this text, each with the one role the text gives it.
 *
 * ⚖️ ORDER AND POSITION ARE KEPT because "6 tips in 6 weeks" is two mentions
 * with two roles, and a caller collapsing them to a set would lose exactly the
 * distinction this module exists to make.
 */
export function numberMentions(textValue: string | null | undefined): NumberMention[] {
  const src = String(textValue ?? '')
  if (src.trim() === '') return []
  const out: NumberMention[] = []
  const push = (value: number, text: string, at: number): void => {
    out.push({ value, text, at, role: roleFor(src.slice(Math.max(0, at - 3), at), src.slice(at + text.length)) })
  }
  // ⚠️ THE DIGIT PATTERN REFUSES A NUMBER INSIDE A LONGER ONE, so `5` does not
  // match inside `2025` and a decimal is one mention rather than two.
  for (const m of src.matchAll(/(?<![\d.,])(\d+(?:\.\d+)?)(?![\d.,])/g)) {
    push(Number(m[1]), m[1], m.index ?? 0)
  }
  // ⚠️ AND WORD FORMS ARE BOUNDARY-ANCHORED. "money", "gone" and "someone" all
  // contain "one"; a naive search reports every line as carrying the count 1.
  for (const [word, value] of Object.entries(WORDS)) {
    for (const m of src.matchAll(new RegExp(`\\b${word}\\b`, 'gi'))) {
      push(value, m[0], m.index ?? 0)
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** A list a human tracks is small. Two is the shortest thing worth announcing
 *  as a count, and past a dozen nobody is counting along.
 *
 *  ⚠️ THIS BOUND CAME WITH THE RULE, and dropping it in the move would have
 *  been a silent widening: `itemCounts('a $46 million business in 2025')` would
 *  report 2025 as a promised list size. The money marker already excludes 46;
 *  nothing but this excludes the year. */
export const MIN_ITEM_COUNT = 2
export const MAX_ITEM_COUNT = 12

/**
 * Does this text state `n` AS AN ITEM COUNT?
 *
 * ⚠️ THIS IS THE FUNCTION THE COUNT CONTRACT NEEDED AND DID NOT HAVE. "six
 * month deal" contains six and promises nothing; "six mistakes" promises six.
 * The old `containsCount` could not tell them apart, so a hook naming a
 * duration was recorded as honouring an enumeration it never made.
 */
export function statesCountOfItems(textValue: string | null | undefined, n: number): boolean {
  if (n < MIN_ITEM_COUNT || n > MAX_ITEM_COUNT) return false
  return numberMentions(textValue).some((m) => m.value === n && m.role === 'enumeration')
}

/** Every value in this text that could be an item count — the roles that are
 *  not durations, prices, percentages or multiples. */
export function itemCounts(textValue: string | null | undefined): number[] {
  const seen = new Set<number>()
  for (const m of numberMentions(textValue)) {
    if (m.role !== 'enumeration') continue
    if (m.value < MIN_ITEM_COUNT || m.value > MAX_ITEM_COUNT) continue
    seen.add(m.value)
  }
  return [...seen].sort((a, b) => a - b)
}
