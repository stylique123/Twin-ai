import { middleBeats, type CraftBeat } from './craftContracts'

/**
 * AUDIT WAVE 2.1 — A SCRIPT BUILT FROM THE CREATOR'S OWN EXPERIENCE MUST SAY
 * SO IN THEIR VOICE.
 *
 * ⚠️ MEASURED IN PRODUCTION 2026-09-07, across the 33 generations carrying a
 * `witness_score`:
 *
 *     zero first-person beats ......................... 15  (45%)
 *       of those, the creator's knowledge store EMPTY ... 6
 *       of those, the creator had 8 to 50 rows on file .. 9
 *
 * `witnessScore` has counted this since it shipped and NOTHING HAS EVER READ
 * THE NUMBER — its only consumer is the `beat_audit` counter that stores it.
 * A field written and never read is not a feature; this is the reader.
 *
 * ⚖️ THE SIX EMPTY-STORE SCRIPTS ARE NOT FAILURES AND MUST NEVER BE FLAGGED.
 * `witnessScore`'s own header says it: an empty knowledge store cannot
 * manufacture a story that never happened, and a script that does not pretend
 * otherwise is the correct output. So this floor fires ONLY when the creator
 * actually supplied material. Absence of supply is not a defect.
 *
 * ⚠️ AND ALL NINE REAL CASES ARE ONE SHAPE, WHICH IS WHAT MAKES THE REPAIR
 * SAFE. Of the 9, the creator's material reached the script in 9 — 34 of their
 * 46 beats (74%) carry `substance: 'creator_knowledge'` — and the material
 * never reached the script in ZERO. Nothing here has to invent an experience.
 * The creator's own material is already in the beat; it is simply written as
 * general advice instead of as something that happened to them. Restoring the
 * attribution is not manufacturing testimony.
 *
 * ⚖️ A FLOOR, NOT A QUOTA. One beat is enough to clear it. Demanding a
 * proportion would be a threshold nobody measured — the exact shape of "a
 * constraint that has only ever seen the population it was written for".
 */

/** ⚠️ THE SAME MARKER LIST `witnessScore` USES, and it must stay that way: two
 *  spellings of "is this in their voice" would let a beat clear the floor while
 *  still scoring zero on the counter that reported the problem. */
const FIRST_PERSON_MARKER = /\b(?:i|i'm|i've|i'd|i'll|me|my|mine|we|we're|we've|our|ours)\b/i

export interface FirstPersonFailure {
  index: number
  line: string
  repair: string
}

/**
 * @param script    the declared beats
 * @param suppliedRows how many rows the creator actually supplied. ZERO means
 *   there was nothing to speak from, and this returns no failures.
 */
export function firstPersonFailures(
  script: readonly { section?: unknown; line?: unknown; substance?: unknown }[] | null | undefined,
  suppliedRows: number,
): FirstPersonFailure[] {
  const beats = Array.isArray(script) ? script : []
  // ⚠️ THE SUPPLY CHECK PRECEDES EVERYTHING. A creator with an empty store gets
  // no flag, because zero witness is the honest output for them.
  if (!(suppliedRows > 0)) return []

  const lineOf = (b: { line?: unknown }): string => (typeof b?.line === 'string' ? b.line : '')

  // ⚠️⚠️ THE HOOK DOES NOT COUNT, AND THAT IS THIS FILE'S WHOLE CORRECTION.
  // Until now ANY first-person beat cleared the whole script, and the hook is
  // where the creator most reliably appears. MEASURED 2026-09-07 over the 33
  // stored production scripts:
  //
  //   first-person HOOK, second-person middle, middle has text ....  5
  //   no first person anywhere, middle has text ................... 13
  //   first person somewhere in the middle (correctly clear) ......  5
  //   middle carries no text at all (a DIFFERENT defect) .......... 10
  //
  // Those five are scripts where the creator says "I" once, in the first line,
  // and never again — the exact "creator at position 1, gone by position 2"
  // shape the twelve-run audit found. A floor cleared by the hook is a floor
  // that cannot see the body it exists to protect.
  //
  // ⚖️ STILL A FLOOR, NOT A QUOTA. ONE first-person MIDDLE beat clears the
  // script; a proportion would be a threshold nobody measured.
  const middle = middleBeats(beats as readonly CraftBeat[])
  if (middle.some((b) => FIRST_PERSON_MARKER.test(String(b?.line ?? '')))) return []

  // ⚠️ A SCRIPT WITH NO MIDDLE TEXT IS NOT A PERSON PROBLEM. Ten of the 33
  // measured emit a fully-labelled three-or-four-beat middle in which not one
  // beat carries a `line`. There is no sentence there to make first person, and
  // flagging it would describe the wrong defect to the creator. Filed
  // separately as THE EMPTY MIDDLE; deliberately silent here.
  if (middle.every((b) => String(b?.line ?? '').trim() === '')) return []

  // ⚠️ ONLY A `creator_knowledge` BEAT MAY BE REWRITTEN. Asking the model to put
  // a reference's fact into the creator's mouth would manufacture exactly the
  // testimony this file refuses to manufacture. If their material never reached
  // the script at all — zero cases in production, but not impossible — there is
  // nothing here to restore and this stays silent rather than guessing.
  // ⚠️ AND THE BEAT WE ASK TO BE REWRITTEN MUST ITSELF BE A MIDDLE BEAT.
  // Scoping the CHECK to the middle and then repairing whichever beat happened
  // to match would let the repair rewrite the hook — clearing a floor that is
  // no longer looking at the hook, which is the same defect one layer down.
  const i = beats.findIndex((b) => b?.substance === 'creator_knowledge'
    && lineOf(b).trim() !== ''
    && middle.includes(b as CraftBeat))
  if (i < 0) return []

  return [{
    index: i,
    line: lineOf(beats[i]),
    repair: 'This line uses something the creator told us about their own experience,'
      + ' but says it as general advice, so nobody speaks as themselves after the hook.'
      + ' Rewrite this one line so they say it happened to them — "I", "we", "my", "our".'
      + ' Change only who is speaking. Do not add a detail, a number, or an event'
      + ' that is not already in the line.',
  }]
}
