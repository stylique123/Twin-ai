/**
 * WAVE 3 — THE FIVE CRAFT CONTRACTS.
 *
 * ⚠️ WHAT THESE ARE FOR. Every earlier wave checked whether the script was
 * ACCURATE: does it claim what the creator can back, does it copy someone
 * else's phrasing, do the seconds add up. A script can pass all of that and
 * still be dull — true, safe, and about nothing in particular. These five ask
 * whether it is WRITTEN, and each one names a specific way a script goes flat:
 *
 *   1. specificity floor      nothing concrete anywhere in the body
 *   2. callback token         the hook is never returned to
 *   3. payoff must add        the ending only restates the opening
 *   4. escalation dependency  the beats could be shuffled and nobody would know
 *   5. rhythm break           every beat is the same length
 *
 * ⚖️ ALL FIVE ARE ADVISORY, AND THAT IS A DECISION, NOT A COMPROMISE. Each is a
 * judgement about craft, and a craft judgement stated as a verdict would block
 * a script the creator may have written deliberately — a deadpan list IS a
 * format. `parallelTriads.ts` set this discipline for the same class of finding:
 * never say the shape is wrong, only say what was observed and let the creator
 * decide. So every function here returns a sentence or null, and nothing here
 * rewrites, refuses, or scores.
 *
 * ⚖️ AND EVERY ONE FIRES ONLY ON THE UNAMBIGUOUS CASE. A note that fires on a
 * script that is fine is worse than one that stays quiet on a script that is
 * not: the creator learns to skip the amber text, and then all five are gone at
 * once. So each threshold below is set where the finding is not arguable — zero
 * particulars, not "few"; no dependency at all, not "weak" — and each says so.
 */

import { STOPWORDS } from './hookContract.js'
import { beatVoice } from './silentBeat.js'

/** One beat as the script holds it. Both fields are whatever the model wrote,
 *  so both are checked rather than trusted. */
export interface CraftBeat {
  section?: string | null
  line?: string | null
}

function normWords(line: unknown): string[] {
  return String(line ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9']/g, ''))
    .filter((w) => w !== '')
}

/** ⚖️ LENGTH ≥ 4 MATCHES `phraseOverlap.ts`, deliberately. A shared token has
 *  to be a word worth noticing; "made", "have" and "into" recur in every
 *  English sentence and would make every callback check pass. */
function contentWords(line: unknown): string[] {
  return normWords(line).filter((w) => w.length >= 4 && !STOPWORDS.has(w))
}

function isSpoken(b: CraftBeat): boolean {
  return beatVoice(b?.line) === 'spoken'
}

function sectionIs(b: CraftBeat, ...needles: string[]): boolean {
  const s = String(b?.section ?? '').toLowerCase()
  return needles.some((n) => s.includes(n))
}

/** ⚠️ THE BODY IS WHAT IS LEFT AFTER THE THREE CRAFT BEATS. Hook, re-hook and
 *  CTA are written to a formula on purpose — a CTA with no number in it is not
 *  a vague CTA. Judging them by the body's standards is how a check earns a
 *  reputation for being wrong. */
function bodyBeats(script: readonly CraftBeat[]): CraftBeat[] {
  return script.filter((b) => isSpoken(b)
    && !sectionIs(b, 'hook', 'call to action', 'cta', 'payoff'))
}

function hookBeat(script: readonly CraftBeat[]): CraftBeat | null {
  return script.find((b) => isSpoken(b) && sectionIs(b, 'hook') && !sectionIs(b, 're-hook', 'rehook')) ?? null
}

// ── 1. SPECIFICITY FLOOR ──────────────────────────────────────────────────
//
// ⚠️ A NUMBER, A NAME, OR A PRICE — one of the three, somewhere. This is the
// cheapest possible test for "is this about anything", and it is set at ZERO
// on purpose: a body of three or more beats that contains not one number, not
// one proper noun and not one amount is not a stylistic choice, it is a script
// that could be about any business in the world.
//
// ⚖️ A CAPITAL COUNTS ONLY MID-SENTENCE. Every sentence starts with one, so a
// sentence-initial capital is evidence of nothing.

const PARTICULAR_DIGIT = /\d/
const PARTICULAR_MONEY = /[$£€]/

function hasParticular(line: unknown): boolean {
  const raw = String(line ?? '')
  if (PARTICULAR_DIGIT.test(raw) || PARTICULAR_MONEY.test(raw)) return true
  const tokens = raw.split(/\s+/).filter((t) => t !== '')
  // Skip index 0, and any token that opens a new sentence.
  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1]
    if (/[.!?]$/.test(prev)) continue
    if (/^["'(]*[A-Z][a-z]/.test(tokens[i])) return true
  }
  return false
}

/** Below this the body is too short for "nothing concrete" to mean anything. */
export const MIN_BODY_BEATS_FOR_SPECIFICITY = 3

export function specificityFloorNote(script: readonly CraftBeat[]): string | null {
  const body = bodyBeats(script)
  if (body.length < MIN_BODY_BEATS_FOR_SPECIFICITY) return null
  if (body.some((b) => hasParticular(b.line))) return null
  return `Nothing in the ${body.length} body beats is specific — no number, no name, no amount. Put one concrete particular in: what it cost, how long it took, who it was.`
}

// ── 2. CALLBACK TOKEN ─────────────────────────────────────────────────────
//
// ⚠️ THE HOOK IS A PROMISE AND SOMETHING HAS TO COLLECT IT. A hook that names
// a thing — the £400 invoice, the client who left — and is then never mentioned
// again was decoration: the viewer stayed for it and the script moved on.
//
// ⚖️ ANY ONE SHARED CONTENT WORD SATISFIES THIS, which is a low bar held
// deliberately low. The contract is "the script comes back to its own opening
// at least once", not "the callback is good" — that second judgement is not
// checkable from text and would be invented.

export function callbackTokenNote(script: readonly CraftBeat[]): string | null {
  const hook = hookBeat(script)
  if (!hook) return null
  const tokens = new Set(contentWords(hook.line))
  if (tokens.size === 0) return null
  const later = script.slice(script.indexOf(hook) + 1).filter(isSpoken)
  if (later.length < 2) return null
  const returns = later.some((b) => contentWords(b.line).some((w) => tokens.has(w)))
  if (returns) return null
  return 'Nothing in the rest of the script comes back to the hook — not one word of it. The opening promise is never collected.'
}

// ── 3. PAYOFF MUST ADD ────────────────────────────────────────────────────
//
// ⚠️ RESTATING THE HOOK IS NOT AN ENDING. If every content word in the payoff
// already appeared in the hook, the script has travelled in a circle: the
// viewer knows exactly what they knew at second three.
//
// ⚖️ SUBSET, NOT SIMILARITY. "Mostly the same" is a threshold argument that
// would need calibration data this has none of. "Adds no word it did not open
// with" is a fact about the two lines, decidable, and unarguable when true.

function payoffBeat(script: readonly CraftBeat[]): CraftBeat | null {
  const named = script.find((b) => isSpoken(b) && sectionIs(b, 'payoff'))
  if (named) return named
  const spoken = script.filter(isSpoken)
  for (let i = spoken.length - 1; i >= 0; i--) {
    if (!sectionIs(spoken[i], 'call to action', 'cta')) return spoken[i]
  }
  return null
}

export function payoffMustAddNote(script: readonly CraftBeat[]): string | null {
  const hook = hookBeat(script)
  const payoff = payoffBeat(script)
  if (!hook || !payoff || hook === payoff) return null
  const opened = new Set(contentWords(hook.line))
  const closing = contentWords(payoff.line)
  if (closing.length === 0 || opened.size === 0) return null
  if (closing.some((w) => !opened.has(w))) return null
  return 'The payoff only says the hook again — every word in it was already in the opening. The ending has to leave the viewer with something the hook did not.'
}

// ── 4. ESCALATION DEPENDENCY ──────────────────────────────────────────────
//
// ⚠️ IF THE BEATS CAN BE SHUFFLED, THEY ARE A LIST. An escalating script has
// beats that DEPEND on the one before: they either say so with a connective
// ("so", "which means", "that's why") or they pick up something the previous
// beat put down. A body where no beat depends on its predecessor plays the same
// in any order, and a viewer can leave at any point without missing anything.
//
// ⚖️ ONE DEPENDENCY IN THE WHOLE BODY IS ENOUGH TO STAY QUIET. Same reason as
// the callback: the contract is that the script is a sequence, not that every
// join is strong.

const CONNECTIVES = [
  'so ', 'because ', 'which means', 'that\'s why', 'thats why', 'which is why',
  'then ', 'after that', 'now that', 'but ', 'and that', 'so that',
]

export const MIN_BODY_BEATS_FOR_ESCALATION = 3

export function escalationDependencyNote(script: readonly CraftBeat[]): string | null {
  const body = bodyBeats(script)
  if (body.length < MIN_BODY_BEATS_FOR_ESCALATION) return null
  for (let i = 1; i < body.length; i++) {
    const text = String(body[i].line ?? '').toLowerCase()
    if (CONNECTIVES.some((c) => text.includes(c))) return null
    const before = new Set(contentWords(body[i - 1].line))
    if (contentWords(body[i].line).some((w) => before.has(w))) return null
  }
  return `None of the ${body.length} body beats depends on the one before it — no shared subject, no "so", no "which means". They would play the same in any order.`
}

// ── 5. RHYTHM BREAK ───────────────────────────────────────────────────────
//
// ⚠️ EVERY BEAT THE SAME LENGTH IS A METRONOME. Speech has short beats and long
// ones, and the short one after three long ones is where emphasis comes from. A
// script whose beats are all within a couple of words of each other has no
// emphasis available anywhere in it.
//
// ⚖️ THIS IS NOT `sentenceUniformity.ts`, which measures SENTENCES INSIDE a
// line. Two checks, two units, two owners: a script can have varied sentences
// inside uniformly-sized beats, and the metronome is still audible because the
// cards are what the creator films to.

export const MIN_BEATS_FOR_RHYTHM = 4
/** Spread at or below this across every beat is a metronome, not a rhythm. */
export const MIN_BEAT_WORD_SPREAD = 3

export function rhythmBreakNote(script: readonly CraftBeat[]): string | null {
  const counts = script.filter(isSpoken).map((b) => normWords(b.line).length)
  if (counts.length < MIN_BEATS_FOR_RHYTHM) return null
  const spread = Math.max(...counts) - Math.min(...counts)
  if (spread > MIN_BEAT_WORD_SPREAD) return null
  return `Every beat is about the same length (${Math.min(...counts)}–${Math.max(...counts)} words). Cut one of them to a few words — a short beat after long ones is where emphasis comes from.`
}

/** ⚠️ ALL FIVE, IN ONE CALL, IN A FIXED ORDER. The order is the order a writer
 *  would fix them in: what the script is about, then its shape, then its sound.
 *  Nulls are dropped, so an empty array means all five contracts held. */
export function craftContractNotes(script: readonly CraftBeat[]): string[] {
  if (!Array.isArray(script)) return []
  return [
    specificityFloorNote(script),
    callbackTokenNote(script),
    payoffMustAddNote(script),
    escalationDependencyNote(script),
    rhythmBreakNote(script),
  ].filter((n): n is string => n !== null)
}
