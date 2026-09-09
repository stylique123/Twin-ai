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
import { FIRST_PERSON_MARKER } from './witnessScore.js'

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
export function bodyBeats(script: readonly CraftBeat[]): CraftBeat[] {
  return script.filter((b) => isSpoken(b)
    && !sectionIs(b, 'hook', 'call to action', 'cta', 'payoff'))
}

/** ⚠️ THE MIDDLE IS NOT THE BODY, AND THE DIFFERENCE IS THE WHOLE POINT OF THIS
 *  FUNCTION. `bodyBeats` answers "where must the substance be specific", and it
 *  drops the re-hook on purpose — a re-hook is written to a formula and judging
 *  its vagueness is how a check earns a reputation for being wrong.
 *
 *  This answers a DIFFERENT question: "where must the CREATOR appear". A
 *  re-hook is a perfectly good place for them to appear, so it stays in. Only
 *  the opening hook, the payoff and the CTA come out.
 *
 *  ⚖️ TWO SPELLINGS OF ONE QUESTION WOULD BE A DEFECT; TWO QUESTIONS NEEDING
 *  TWO SCOPES IS NOT. #718 shipped a false agreement between two rules that
 *  claimed to ask the same thing, so this comment says plainly that they do not.
 *
 *  ⚠️ MEASURED 2026-09-07 over the 33 stored production scripts. Middle beats
 *  are labelled by the model, not by any enum: `setup` 29 and `re-hook` 27
 *  dominate, but the tail is ~40 one-off labels ("reason 1", "the incident",
 *  "pitfall 2: operational inefficiency"). Several are composites containing
 *  the word "hook" — "mistake 2 / re-hook", "re-hook: shift in mindset" — which
 *  is why matching on the substring alone would drop real middle beats. */
export function middleBeats(script: readonly CraftBeat[]): CraftBeat[] {
  return script.filter((b) => isSpoken(b)
    && !isOpeningHook(b)
    && !sectionIs(b, 'call to action', 'cta', 'payoff'))
}

/** The FIRST-position hook only. "re-hook", "mistake 2 / re-hook" and
 *  "re-hook: shift in mindset" are middle beats that happen to contain the
 *  word, and treating them as the hook removes 27 of the 66 measured middles. */
function isOpeningHook(b: CraftBeat): boolean {
  return sectionIs(b, 'hook') && !sectionIs(b, 're-hook', 'rehook', 're hook')
}

function hookBeat(script: readonly CraftBeat[]): CraftBeat | null {
  return script.find((b) => isSpoken(b) && isOpeningHook(b)) ?? null
}

// ── 1. SPECIFICITY FLOOR ──────────────────────────────────────────────────
//
// ⚠️ `hasParticular` AND `bodyBeats` ARE EXPORTED, AND THAT IS DELIBERATE.
// `particularFloor.ts` decides whether the WRITER should be asked to put a
// creator's own detail into the script, and it must ask the SAME question this
// note asks. Two spellings of "is this specific" would let a repair satisfy
// itself while the creator still reads "nothing here is specific". Re-privatise
// either one and the two rules fork silently.
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

// ── THE THIRD WAY TO BE PARTICULAR: SOMETHING THAT HAPPENED ────────────────
//
// ⚠️ A FIGURE AND A NAME WERE THE ONLY TWO WAYS TO PASS, AND THAT MISSED THE
// ONE THIS MEDIUM ACTUALLY RUNS ON. Measured over 32 stored scripts with body
// text: only 3 carry a first-person past-tense episode anywhere in the body.
// The owner's reading of the twelve-run audit is that the writer WILL produce
// numbers and simply produces false ones — $5,000 oven three times, a $10 loaf,
// a four-loaf licence limit — so the choice a script faces is not "figures or
// story", it is "particulars or neither".
//
// ⚠️ A BARE "I" IS NOT AN EPISODE, and the difference is load-bearing. "I think
// you should" and "I am going to show you" are opinions and framing; "I lost
// money on my first hundred loaves" is a thing that happened. Measured: 4 of 32
// scripts would clear on a bare marker against 3 on a real episode, so the
// past-tense requirement is doing work rather than decorating.
//
// ⚖️ A CLOSED LIST OF ACTION VERBS, NOT `\w+ed`. "I am tired", "I was worried",
// "I feel excited" all end in -ed and none is an episode; a catch-all would let
// a feeling clear a floor that exists to demand a fact. Conservative on
// purpose: a floor that under-counts episodes is safer than one that
// over-clears, and the two copula-led cases it misses ("I was charged $30")
// carry a figure anyway and pass on the first path.
//
// ⚠️ AND A CLOSED LIST THAT IS TOO SHORT IS ITS OWN DEFECT. The first draft
// omitted "went", so "my first batch went straight in the bin" — an episode by
// any reading — did not count. The test caught it and the TEST WAS RIGHT. Every
// verb below is an action or an event; none is a state or an opinion, because
// "said", "thought" and "felt" would let a view back in through the door this
// closes.
const PARTICULAR_EPISODE_VERB = new RegExp(
  '\\b(?:lost|made|took|got|spent|started|quit|built|sold|paid|charged|burned|burnt'
  + '|went|came|began|stopped|broke|fixed|changed|chose|drove|grew|met|put|sat|stood'
  + '|held|turned|pulled|pushed|poured|mixed|shaped|sliced|packed|weighed|tested|counted'
  + '|threw|tried|learned|learnt|failed|closed|opened|hired|fired|moved|called|asked'
  + '|told|saw|found|bought|wasted|saved|earned|ran|gave|left|kept|sent|wrote|showed'
  + '|taught|worked|baked|cooked|shipped|launched|raised|dropped|cut|added|pitched'
  + '|switched|scrapped|rebuilt|refunded|delivered|priced)\\b',
  'i',
)

/** A first-person EPISODE: their voice AND something that happened in it. */
export function isFirstPersonEpisode(line: unknown): boolean {
  const raw = String(line ?? '')
  return FIRST_PERSON_MARKER.test(raw) && PARTICULAR_EPISODE_VERB.test(raw)
}

export function hasParticular(line: unknown): boolean {
  const raw = String(line ?? '')
  if (PARTICULAR_DIGIT.test(raw) || PARTICULAR_MONEY.test(raw)) return true
  if (isFirstPersonEpisode(raw)) return true
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

// ── 6. A STORY WITH NO WHEN ───────────────────────────────────────────────
//
// ⚠️ MEASURED IN PRODUCTION 2026-09-09, over 276 spoken beats in 62 scripts:
// ONE beat carries a time anchor. One, in two hundred and seventy-six. Every
// script this system has written is untethered in time.
//
// ⚖️ AND THAT NUMBER IS EXACTLY WHY THIS NOTE IS NARROW. A contract saying
// "every script must land in time" would fire on 98% of them, and a note that
// fires on 98% of scripts is not a floor — it is a nag, and it trains whoever
// reads these to ignore all of them. `countContractIssues` states the same rule
// for enumerations: "inventing a complaint for them would train whoever reads
// these to ignore all of them."
//
// ⚠️⚠️ SO IT FIRES ONLY WHERE A MOMENT IS OWED: a FIRST-PERSON EPISODE. "I lost
// a client" is a story, and a story with no when is a claim wearing a story's
// clothes — the listener cannot tell last week from a decade ago, and the
// specificity floor already counts the episode as concrete on the strength of
// the verb alone.
//
// ⚖️ MEASURED FIRE RATE: 8 of 62 scripts (13%) — and ALL EIGHT first-person
// episodes in production lack an anchor, so the rule is not hypothetical and it
// is not universal. That is the shape a floor should have.
//
// ⚖️ ANY BEAT MAY CARRY THE ANCHOR, not the episode beat itself. A script that
// opens "Last March" and tells the episode three beats later has landed it;
// demanding the anchor sit in the same sentence would fail correct writing.
const MOMENT_ANCHOR = new RegExp(
  '\\b(?:'
  // Relative, the commonest form in real speech.
  + 'yesterday|today|tonight|this (?:morning|afternoon|evening|week|month|year)'
  + '|last (?:night|week|month|year|summer|winter|spring|autumn|fall|monday|tuesday'
  + '|wednesday|thursday|friday|saturday|sunday)'
  + '|(?:a|two|three|four|five|six|seven|eight|nine|ten|\\d{1,2})\\s+'
  + '(?:days?|weeks?|months?|years?)\\s+ago'
  // Absolute.
  + '|in\\s+(?:19|20)\\d{2}|back\\s+in\\s+(?:19|20)\\d{2}'
  + '|(?:january|february|march|april|may|june|july|august|september|october'
  + '|november|december)'
  // Narrative openers that fix a point in time without naming one.
  + '|the\\s+other\\s+(?:day|week|night)|back\\s+when|at\\s+the\\s+time'
  + '|when\\s+i\\s+(?:was|first|started)|the\\s+day\\s+(?:i|we)'
  + ')\\b',
  'i',
)

/** Does this line fix a point in time? */
export function hasMomentAnchor(line: unknown): boolean {
  return MOMENT_ANCHOR.test(String(line ?? ''))
}

/**
 * A first-person episode that never says when it happened.
 *
 * ⚖️ RETURNS NULL WHEN THERE IS NO EPISODE, and that is the common case — 54 of
 * 62 production scripts. This contract has an opinion about stories and no
 * opinion about anything else.
 */
export function momentAnchorNote(script: readonly CraftBeat[]): string | null {
  const spoken = script.filter(isSpoken)
  if (!spoken.some((b) => isFirstPersonEpisode(b.line))) return null
  if (spoken.some((b) => hasMomentAnchor(b.line))) return null
  return 'The script tells a story about something that happened to you and never says when. Anchor it — "last March", "two years ago", "the day I opened" — so it lands as an episode rather than a claim.'
}

/** ⚠️ ALL SIX, IN ONE CALL, IN A FIXED ORDER. The order is the order a writer
 *  would fix them in: what the script is about, then its shape, then its sound.
 *  Nulls are dropped, so an empty array means all six contracts held. */
export function craftContractNotes(script: readonly CraftBeat[]): string[] {
  if (!Array.isArray(script)) return []
  return [
    specificityFloorNote(script),
    callbackTokenNote(script),
    payoffMustAddNote(script),
    escalationDependencyNote(script),
    momentAnchorNote(script),
    rhythmBreakNote(script),
  ].filter((n): n is string => n !== null)
}
