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
