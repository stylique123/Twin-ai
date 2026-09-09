// NOTHING DECIDED HOW LONG THE VIDEO SHOULD BE.
//
// ⚠️ MEASURED, AND THE TWO READINGS POINT OPPOSITE WAYS. A 15-second reference
// produced a 48-second script; a 226-second reference produced a 60-second one.
// Both land near a minute because a minute is what the model writes when nobody
// tells it anything — the reference's own measured duration (`duration_sec`, on
// the row, captured by the analyzer) reaches the audit and never reaches the
// instruction.
//
// ⚠️ AND "DECIDE IT YOURSELF" IS ALREADY IN THE PROMPT. `beat_plan` tells the
// writer target_sec "is a real decision in seconds, not a guess after the fact".
// A decision with no budget is a preference, and the frozen experiment showed
// which way that preference runs: removing the substance requirement made it
// write 64% MORE, not less. Length is not something a writer trims towards; it
// is something the brief has to fix before the writing starts.
//
// ── WHAT THIS DECIDES, AND WHAT IT REFUSES TO ────────────────────────────
//
// ⚖️ IT DECIDES A TOTAL, NOT A SHAPE. How many beats, how the seconds are split
// between them, and which beat carries the turn are the writer's decisions and
// stay that way — this hands over a budget and a count RANGE, so a teardown and
// a demo can still be different videos of the same length.
//
// ⚖️ AND IT NEVER INVENTS A NUMBER THE CREATOR WAS NEVER OFFERED. Where there
// is no reference and no stated goal there is no target: `null`, and the writer
// is told nothing rather than told a made-up figure. The same refusal
// `asTarget` already makes elsewhere in this codebase.
import { WPM_PRESETS, DEFAULT_WPM, type WpmPreset } from '../recordingScript'
import type { VideoGoal } from '../videoIntent'

/** The short-form window this contract will target, in seconds.
 *
 *  ⚠️ NOT THE SAME NUMBER AS `DEFAULT_REFERENCE_BOUNDS.maxDurationSec` (180),
 *  and deliberately: that is the longest reference Twin will READ. This is the
 *  longest script it will ASK FOR. A creator may study a three-minute teardown
 *  and want a forty-second video out of it — copying the reference's length
 *  would make the study the assignment. */
export const MIN_TARGET_SEC = 15
export const MAX_TARGET_SEC = 90

/** How far the finished script may sit either side of the target before the
 *  contract calls it a miss.
 *
 *  ⚖️ A BAND, NOT A POINT. Words do not divide evenly into seconds and a writer
 *  forced to hit 45.0 would pad or truncate a sentence to do it — which is a
 *  worse script for an exactly-correct number. */
export const TOLERANCE = 0.2

/**
 * The default length for a video with no reference to take one from.
 *
 * ⚠️ THESE ARE JUDGEMENT, AND ARE LABELLED AS SUCH. They are not measured from
 * this product's own data — there is no corpus of "the right length for a leads
 * video" here yet. They encode one defensible idea: a video asking for a
 * DECISION (leads, sell, conversations) has to earn it and needs room, while a
 * video buying attention (followers, entertain) competes on getting to the point.
 *
 * ⚖️ WHICH IS STILL BETTER THAN NOTHING, because "nothing" is not neutral — it
 * is whatever the model felt like, measured at 48 and 60 seconds for references
 * fifteen times apart.
 */
export const GOAL_TARGET_SEC: Record<VideoGoal, number> = {
  followers: 30,
  entertain: 30,
  authority: 45,
  educate: 60,
  conversations: 45,
  leads: 45,
  sell: 60,
  personal_brand: 40,
}

export interface DurationInput {
  /** The reference video's own MEASURED duration, when the analyzer captured
   *  one. Never a guess, never zero-for-unknown. */
  referenceSeconds?: number | null
  goal?: VideoGoal | null
}

/**
 * The video's target length in seconds, or null when nothing decides it.
 *
 * ⚠️ THE REFERENCE WINS WHERE THERE IS ONE, because the creator chose it — a
 * fifteen-second video is what they said they wanted to make something like.
 * It is CLAMPED, not copied: a 226-second reference becomes 90, the longest
 * short-form script this contract will ask for, and a 6-second one becomes 15.
 */
export function targetSeconds(input: DurationInput): number | null {
  const ref = input.referenceSeconds
  if (typeof ref === 'number' && Number.isFinite(ref) && ref > 0) {
    return Math.min(MAX_TARGET_SEC, Math.max(MIN_TARGET_SEC, Math.round(ref / 5) * 5))
  }
  const goal = input.goal
  if (goal && goal in GOAL_TARGET_SEC) return GOAL_TARGET_SEC[goal]
  return null
}

export interface DurationBudget {
  targetSec: number
  /** Words the whole script may spend, at the recorder's own rate. */
  words: number
  minWords: number
  maxWords: number
  /** How many beats this length can carry. A RANGE — the count is the writer's. */
  minBeats: number
  maxBeats: number
}

/** Seconds per beat used only to derive the COUNT RANGE — never to size a beat.
 *  ⚖️ WIDE ON PURPOSE: at 45 seconds this permits 4 to 9 beats, which is the
 *  difference between a story and a list, and both are legitimate. */
const SEC_PER_BEAT_MAX = 12
const SEC_PER_BEAT_MIN = 5

/**
 * The budget the writer is given for a target length.
 *
 * ⚖️ THE WORD COUNT COMES FROM `WPM_PRESETS`, THE SAME RATE THE TELEPROMPTER
 * SCROLLS AT AND `estimateDurationSec` MEASURES WITH. A second rate here would
 * let the brief ask for a length the recorder then reports as a different one —
 * two numbers for one script, which is the defect three other checks in this
 * codebase exist to prevent.
 */
export function durationBudget(targetSec: number, wpm: WpmPreset = DEFAULT_WPM): DurationBudget {
  const words = Math.round((targetSec / 60) * WPM_PRESETS[wpm])
  return {
    targetSec,
    words,
    minWords: Math.round(words * (1 - TOLERANCE)),
    maxWords: Math.round(words * (1 + TOLERANCE)),
    minBeats: Math.max(3, Math.floor(targetSec / SEC_PER_BEAT_MAX)),
    maxBeats: Math.max(4, Math.ceil(targetSec / SEC_PER_BEAT_MIN)),
  }
}

/**
 * The sentence the writer is given. Null in, null out — a brief that says
 * nothing is better than one that states an invented number as a requirement.
 */
export function durationBrief(input: DurationInput, wpm: WpmPreset = DEFAULT_WPM): string | null {
  const target = targetSeconds(input)
  if (target === null) return null
  const b = durationBudget(target, wpm)
  const because = typeof input.referenceSeconds === 'number' && input.referenceSeconds > 0
    ? `the reference they chose runs ${Math.round(input.referenceSeconds)} seconds`
    : `what this video is for`
  return `- LENGTH IS DECIDED, NOT DISCOVERED. This video runs ${b.targetSec} seconds, because ${because}.`
    + ` That is ${b.words} spoken words at a natural pace — write between ${b.minWords} and ${b.maxWords}, and count them.`
    + ` Use between ${b.minBeats} and ${b.maxBeats} beats and make the target_sec of every beat add up to ${b.targetSec}.`
    + ` If the substance does not fill ${b.targetSec} seconds, cut the video shorter rather than padding it —`
    + ` and if it does not fit, cut a point rather than speeding up.`
}

/** How far a written script sits from its budget. Null target means nothing to
 *  compare against, which is not a miss. */
export function durationMiss(
  words: number, input: DurationInput, wpm: WpmPreset = DEFAULT_WPM,
): { targetSec: number; words: number; overBy: number; underBy: number } | null {
  const target = targetSeconds(input)
  if (target === null) return null
  const b = durationBudget(target, wpm)
  return {
    targetSec: target,
    words,
    overBy: Math.max(0, words - b.maxWords),
    underBy: Math.max(0, b.minWords - words),
  }
}
