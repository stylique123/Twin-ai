/**
 * A DIRECTION THAT ASKS FOR A SCREEN CAPTURE IS REPAIRED, NOT REFUSED.
 *
 * ⚠️ WHY THIS EXISTS EVEN THOUGH THE PROMPT NOW FORBIDS IT. The writer is a
 * model, and "never ask for a screen recording" is an instruction rather than a
 * guarantee. The failure this catches is specific and was observed in a real
 * script: "EXTRA CLIP: Screen recording showing the deletion of a draft" -- a
 * beat the creator cannot film, discovered AFTER they have already shot
 * everything else. That is the worst position to discover it in.
 *
 * ⚖️ REPAIR, NOT REJECT, WHICH IS THE HOUSE PATTERN. Throwing the script away
 * over one direction costs the creator every good beat in it. The subject is
 * kept and the shot is changed: the thing they wanted shown is still shown, with
 * a camera instead of a capture.
 */

/** Phrasings that mean "record your screen". Ordered longest-first so the more
 *  specific pattern wins and leaves a cleaner subject behind. */
const CAPTURE_PHRASES: readonly RegExp[] = Object.freeze([
  /\b(?:a\s+|an\s+|the\s+)?screen[\s-]?recording\s+(?:of|showing|that\s+shows)\b/i,
  /\b(?:a\s+|an\s+|the\s+)?screen[\s-]?capture\s+(?:of|showing|that\s+shows)\b/i,
  /\brecord\s+(?:your|the|my)\s+screen\s+(?:to\s+show|showing|and\s+show)\b/i,
  /\bscreen[\s-]?record\s+(?:your|the|my)?\s*/i,
  /\b(?:a\s+|an\s+|the\s+)?screen[\s-]?recording\b/i,
  /\b(?:a\s+|an\s+|the\s+)?screen[\s-]?capture\b/i,
  /\brecord\s+(?:your|the|my)\s+screen\b/i,
])

/** Does this direction ask for something the creator cannot film in the take? */
export function asksForScreenCapture(direction: string): boolean {
  if (typeof direction !== 'string' || direction.trim() === '') return false
  return CAPTURE_PHRASES.some((re) => re.test(direction))
}

/** ⚠️ THE SUBJECT IS WHAT SURVIVES, and getting it wrong is worse than not
 *  converting. "Screen recording showing the deletion of a draft" must keep
 *  "the deletion of a draft" -- a repair that drops the subject hands the
 *  creator a generic hold-up instruction with nothing to point at, which is the
 *  vague direction this whole rebuild exists to remove. */
export function subjectOfCapture(direction: string): string | null {
  if (!asksForScreenCapture(direction)) return null
  let rest = direction
  for (const re of CAPTURE_PHRASES) {
    if (re.test(rest)) { rest = rest.replace(re, ' '); break }
  }
  // Drop a leading label like "EXTRA CLIP:" and tidy the seam.
  rest = rest.replace(/^\s*[A-Z][A-Z\s]{2,}:\s*/, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:-]+/, '')
    .trim()
  return rest === '' ? null : rest
}

export interface ConvertedDirection {
  /** True when this direction was rewritten. */
  converted: boolean
  /** What the creator now reads. Unchanged when `converted` is false. */
  text: string
  /** What the shot is of, when one could be recovered. */
  subject: string | null
}

/** ⚖️ ONE TEMPLATE, DELIBERATELY. The audit's picker chooses between five
 *  patterns from beat purpose and privacy; a REPAIR has neither of those to hand
 *  -- it only has a sentence somebody already wrote. Guessing a fancier shot from
 *  a string would be the model-judgement this whole grammar exists to avoid, so
 *  the repair always lands on the hold-up, which works on every platform with one
 *  phone. A better shot can be chosen later by the picker, with real inputs. */
export function convertScreenCaptureDirection(direction: string): ConvertedDirection {
  if (!asksForScreenCapture(direction)) {
    return { converted: false, text: direction, subject: null }
  }
  const subject = subjectOfCapture(direction)
  const what = subject ?? 'the screen you wanted to show'
  return {
    converted: true,
    subject,
    text: `Open ${what} before you start filming, then hold your phone up beside your face with the screen turned to the camera. Pinch to zoom first so the part that matters is readable.`,
  }
}

/** ⚠️ COUNTED BEFORE IT IS ENFORCED, the order this repository already uses for
 *  beat_audit's other counters. How often the writer still asks for a capture is
 *  not known, and a refusal built on a guess about frequency is how a check
 *  becomes the thing people route around. The count is what makes the next
 *  decision evidential.
 *
 *  ⚖️ AND IT LANDS IN beat_audit RATHER THAN `unsupplyable_shots`. The audit
 *  routed it at a Fix 12 counter that does not exist anywhere in this
 *  repository; beat_audit is the durable, already-registered channel that every
 *  comparable count uses. */
export function countConvertedDirections(directions: readonly unknown[]): number {
  if (!Array.isArray(directions)) return 0
  return directions.filter((d) => typeof d === 'string' && asksForScreenCapture(d)).length
}

// ── UNSUPPLYABLE SHOTS — THE STANDING NO-SCREEN-RECORDING, NO-B-ROLL DECISION,
// MEASURED WHERE IT ACTUALLY LEAKS ──────────────────────────────────────────
//
// ⚠️ THE COUNTERS ABOVE READ THE WRONG FIELD. `screenCaptureDirectionsInline`
// (the edge function's own copy) scans `beat_plan`'s `proof`/`direction` —
// an earlier planning stage. MEASURED against production directly: the FINAL
// script's `editor_intent` field still carries live violations of both
// standing decisions — "Overlay the screen recording at fifty percent
// opacity so the creator is still visible" and "Hard cut to full screen
// b-roll for two seconds on the word unfulfilling" were both found in
// generated scripts. `shot_type` itself is correctly constrained to
// `talking_head`/`cover_frame`, but the free-text `editor_intent` field has
// no equivalent constraint, so the model can still ask for a shot the
// creator has no way to supply.
//
// ⚖️ NO B-ROLL DETECTOR EXISTED AT ALL BEFORE THIS. Only screen-capture
// phrasing was ever checked. Both are refused under the same standing
// decision, so both are measured here.
//
// ⚖️ THIS COUNTS DEMAND; IT DOES NOT CONVERT THE SHOT TYPE. Per the standing
// decision: "Build the unsupplyable_shots COUNTER so demand is measured,
// never the shot type." `editor_intent` is edit direction, not a plannable
// shot — there is no camera-only rewrite of "cut to b-roll" the way
// `convertScreenCaptureDirection` rewrites a screen-capture SHOT direction.
// Converting prose the renderer never executes would be theatre; counting how
// often it happens is the honest, useful signal.

/** Phrasings that ask for cutaway/stock footage the creator has no way to
 *  supply — the second standing-decision violation, alongside screen capture.
 *  Ordered longest-first for the same reason `CAPTURE_PHRASES` is. */
const BROLL_PHRASES: readonly RegExp[] = Object.freeze([
  /\bfull[\s-]?screen\s+b[\s-]?roll\b/i,
  /\bb[\s-]?roll\s+(?:of|showing|footage)\b/i,
  /\bcut(?:s)?\s+to\s+b[\s-]?roll\b/i,
  /\bstock\s+footage\b/i,
  /\binsert\s+(?:clip|footage|shot)\s+of\b/i,
  /\bcutaway\s+(?:to|of|shot)\b/i,
  /\bb[\s-]?roll\b/i,
])

/** Does this direction ask for cutaway/stock footage the creator cannot film
 *  in the take? */
export function asksForBroll(direction: string): boolean {
  if (typeof direction !== 'string' || direction.trim() === '') return false
  return BROLL_PHRASES.some((re) => re.test(direction))
}

/** Either standing-decision violation, in one check. */
export function asksForUnsupplyableShot(direction: string): boolean {
  return asksForScreenCapture(direction) || asksForBroll(direction)
}

/**
 * How many beats in the FINAL script (not the earlier beat_plan) still ask
 * for a shot the creator cannot supply — screen capture or b-roll — read from
 * `editor_intent`, the free-text field with no shot-type constraint on it.
 *
 * ⚠️ ADVISORY, COUNTED. Matches the discipline every other beat_audit counter
 * in this repository already uses: measured before it is ever enforced.
 */
export function unsupplyableShotCount(script: readonly { editor_intent?: unknown }[]): number {
  if (!Array.isArray(script)) return 0
  return script.filter((b) => asksForUnsupplyableShot(
    typeof b?.editor_intent === 'string' ? b.editor_intent : '')).length
}
