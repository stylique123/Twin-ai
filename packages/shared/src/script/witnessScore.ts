/**
 * FIX 11 — SERMON WITHOUT WITNESS, DETECTED.
 *
 * ⚠️ ZERO FIRST-PERSON EVIDENCE IN A WHOLE SCRIPT IS SOMETIMES THE CORRECT
 * OUTPUT. An empty knowledge store cannot manufacture a story that never
 * happened, and the honest response to that is a script that does not
 * pretend otherwise (the "observer frame" premise decision, elsewhere). This
 * module is DETECTION ONLY: it measures how much of a script is grounded in
 * the creator's own stated experience, so the premise-selection layer and
 * the ask-queue can react to a real number instead of a guess.
 *
 * ⚖️ TWO SEPARATE COUNTS, NOT ONE SCORE. `firstPersonBeats` asks "did the
 * creator's own supplied knowledge reach a beat, spoken in their own voice";
 * `figuresSpoken` asks "does the script carry a real number at all",
 * regardless of where that number came from. A script can carry figures
 * from a reference and zero first-person beats — that is exactly the sermon
 * shape this exists to name, and collapsing the two into one number would
 * hide it.
 */

import { claimedValues } from '../claimEntailment'

/** ⚠️ A NARROW MARKER LIST, DELIBERATELY. This is NOT the experiential-verb
 *  premise detector in `premiseCompatibility.ts` — that module judges
 *  whether a REFERENCE implies an autobiography, which needs a completed
 *  act ("I quit my job") to rule out a bare opinion ("I think..."). Here the
 *  beat's `substance` field has already done that work: `creator_knowledge`
 *  means the line draws on something this creator actually supplied. All
 *  that is left to ask is whether the line is spoken IN THEIR VOICE. */
const FIRST_PERSON_MARKER = /\b(?:i|i'm|i've|i'd|i'll|me|my|mine|we|we're|we've|our|ours)\b/i

function hasFirstPersonMarker(line: unknown): boolean {
  return typeof line === 'string' && FIRST_PERSON_MARKER.test(line)
}

export interface WitnessScore {
  /** Beats whose substance is the creator's own knowledge AND whose spoken
   *  line carries a first-person marker — real evidence, in their voice. */
  firstPersonBeats: number
  /** Beats whose spoken line asserts a real number, regardless of source.
   *  Reuses the same measured-value detector as the citation-entailment
   *  check (FIX/G8), so the two counters cannot drift on what counts as a
   *  figure. */
  figuresSpoken: number
}

/**
 * The witness_score `beat_audit` counter.
 *
 * ⚠️ A NON-ARRAY SCRIPT SCORES ZERO ON BOTH, NOT NULL. Unlike a flag that
 * means "not recorded", this is a straightforward count over whatever beats
 * exist — an empty or malformed script genuinely carries zero witness.
 */
export function witnessScore(beats: unknown): WitnessScore {
  if (!Array.isArray(beats)) return { firstPersonBeats: 0, figuresSpoken: 0 }
  let firstPersonBeats = 0
  let figuresSpoken = 0
  for (const b of beats) {
    const beat = (b ?? {}) as { line?: unknown; substance?: unknown }
    if (beat.substance === 'creator_knowledge' && hasFirstPersonMarker(beat.line)) firstPersonBeats += 1
    if (typeof beat.line === 'string' && claimedValues(beat.line).size > 0) figuresSpoken += 1
  }
  return { firstPersonBeats, figuresSpoken }
}
