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
// ⚖️ AND THE CREATOR DECIDES, NOT THE REFERENCE. Owner's ruling, 2026-09-09:
// "The explicit pick wins. The reference cannot know how long her video should
// be. Her platform, her audience and her patience decide the length. Someone
// else's video doesn't."
//
// So the ladder is exactly three rungs and `resolveTarget` is the only place it
// exists:
//
//   1. `pickedSeconds`         her 30/60/90 choice, this video. ALWAYS WINS.
//   2. `storedDefaultSeconds`  her own default, when she did not pick this time.
//   3. `FALLBACK_TARGET_SEC`   60, when there is no history.
//
// ⚠️⚠️ THE REFERENCE IS NOT ON THAT LADDER. It was rung one until this change --
// a 226-second teardown clamped the script to 90 whatever she asked for -- and
// `suggestedTarget` is what is left of it: a PREFILL for the picker, offered
// before she chooses and overridden the moment she does. A suggestion that
// cannot be overridden is a constraint wearing a softer word.
//
// ⚠️ AND THERE IS NO LONGER A NULL TARGET. Tier 3 is a real number the owner
// chose, so `resolveTarget` always answers and `source` says which rung
// answered. "60 because nobody has picked yet" is a different fact from "60
// because she picks 60", and an audit that cannot tell them apart cannot ever
// measure whether the default is the right one.
import { WPM_PRESETS, DEFAULT_WPM, type WpmPreset } from '../recordingScript'

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

/** Tier 3. The owner's number, not a measured one, and labelled as such.
 *
 *  ⚖️ 60 AND NOT 30, for the reason the picker's default gives: the twelve
 *  measured runs fail by being THIN, so the safe end of the guess is the longer
 *  one. It is a starting point that `storedDefaultSeconds` is meant to replace
 *  as soon as a creator has enough history to have a median. */
export const FALLBACK_TARGET_SEC = 60

/** The three lengths the picker offers. */
export const PICKABLE_SECONDS = [30, 60, 90] as const
export type PickedSeconds = (typeof PICKABLE_SECONDS)[number]

/** ⚠️ REFUSES ANYTHING THAT IS NOT ONE OF THE THREE. A stale client posting 45
 *  has not chosen 45 and has not chosen 60 either; rounding it would record a
 *  decision nobody made. Null here falls through to the next rung, which is the
 *  correct handling of "she was never asked". */
export function asPicked(v: unknown): PickedSeconds | null {
  const n = typeof v === 'number' ? v : Number(v)
  return (PICKABLE_SECONDS as readonly number[]).includes(n) ? (n as PickedSeconds) : null
}

/** Which rung of the ladder answered. */
export type TargetSource = 'picked' | 'stored_default' | 'fallback'

export interface DurationInput {
  /** Tier 1: what she picked for THIS video. */
  pickedSeconds?: unknown
  /** Tier 2: her own stored default, derived from her own median.
   *
   *  ⚠️ NOTHING WRITES THIS YET, AND THAT IS STATED RATHER THAN HIDDEN. Traced
   *  2026-09-09 before building: no column in any migration, nothing in
   *  `information_schema` on production, and no reader anywhere. The rung is
   *  here because the owner's ladder has three rungs and a two-rung
   *  implementation would silently promote the fallback; the change that starts
   *  computing her median is the change that fills it. Until then every caller
   *  passes null and `source` reads `'fallback'`, which is the truth. */
  storedDefaultSeconds?: number | null
  /** The reference's own MEASURED duration. A PREFILL SUGGESTION ONLY -- it is
   *  deliberately NOT read by `resolveTarget`, and the parameter stays on the
   *  input so a caller that used to pass it gets a compile-time home for it
   *  rather than quietly keeping the old behaviour. */
  referenceSeconds?: number | null
}

function clampToWindow(sec: number): number {
  return Math.min(MAX_TARGET_SEC, Math.max(MIN_TARGET_SEC, Math.round(sec / 5) * 5))
}

/**
 * What the picker should OPEN on when there is a reference to take a hint from.
 *
 * ⚠️ RETURNS ONE OF THE THREE PICKABLE LENGTHS, NOT AN ARBITRARY CLAMP. The
 * picker has three buttons; suggesting 85 would be a suggestion it cannot
 * render, and rendering it as "90" while auditing it as 85 is two numbers for
 * one video. Null when there is no reference -- the picker then opens on its
 * own default and nothing pretends a hint existed.
 */
export function suggestedTarget(referenceSeconds?: number | null): PickedSeconds | null {
  if (typeof referenceSeconds !== 'number' || !Number.isFinite(referenceSeconds) || referenceSeconds <= 0) {
    return null
  }
  const clamped = clampToWindow(referenceSeconds)
  let best: PickedSeconds = PICKABLE_SECONDS[0]
  for (const p of PICKABLE_SECONDS) {
    if (Math.abs(p - clamped) < Math.abs(best - clamped)) best = p
  }
  return best
}

/**
 * The video's target length, and which rung of the ladder decided it.
 *
 * ⚠️ NEVER NULL, AND NEVER THE REFERENCE'S LENGTH. See the header.
 */
export function resolveTarget(input: DurationInput): { targetSec: number; source: TargetSource } {
  const picked = asPicked(input.pickedSeconds)
  if (picked !== null) return { targetSec: picked, source: 'picked' }
  const stored = input.storedDefaultSeconds
  if (typeof stored === 'number' && Number.isFinite(stored) && stored > 0) {
    return { targetSec: clampToWindow(stored), source: 'stored_default' }
  }
  return { targetSec: FALLBACK_TARGET_SEC, source: 'fallback' }
}

/** The resolved number on its own, for callers that do not need the provenance. */
export function targetSeconds(input: DurationInput): number {
  return resolveTarget(input).targetSec
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

/** Why this length, in the creator's terms. */
function becauseOf(source: TargetSource): string {
  if (source === 'picked') return `they asked for it`
  if (source === 'stored_default') return `it is the length they usually make`
  return `nobody has picked one yet and this is the starting point`
}

export interface SubstanceFit {
  /** How many beats the substance actually supports. Null means NOBODY COUNTED,
   *  which is not "no substance" -- see `substanceBudget`. */
  availableBeats?: number | null
}

/**
 * The sentence the writer is given. Never null now: tier 3 always answers.
 *
 * ⚠️ AND IT NEVER ASKS FOR PADDING. Owner's ruling: "when substance can't fill
 * the target, the script comes out shorter and says why -- never pads." The
 * frozen experiment is why this is stated rather than assumed: removing the
 * substance requirement made the model write 64% MORE. A brief that names a
 * length and says nothing about running out of things to say is an instruction
 * to fill the gap.
 *
 * ⚖️ AND THE OTHER DIRECTION IS NAMED TOO. When there is MORE substance than
 * the target holds, the writer is told to say what it left out rather than to
 * compress everything into a faster read -- "cut a point, do not speed up" --
 * because a script that covers eight points in sixty seconds is unsayable, and
 * the creator finds that out at the teleprompter.
 */
export function durationBrief(
  input: DurationInput, wpm: WpmPreset = DEFAULT_WPM, fit: SubstanceFit = {},
): string {
  const { targetSec, source } = resolveTarget(input)
  const b = durationBudget(targetSec, wpm)
  let line = `- LENGTH IS DECIDED, NOT DISCOVERED. This video runs ${targetSec} seconds, because ${becauseOf(source)}.`
    + ` That is ${b.words} spoken words at a natural pace — write between ${b.minWords} and ${b.maxWords}, and count them.`
    + ` Use between ${b.minBeats} and ${b.maxBeats} beats and make the target_sec of every beat add up to ${targetSec}.`
  const available = fit.availableBeats
  if (typeof available === 'number' && Number.isFinite(available)) {
    if (available < b.minBeats) {
      line += ` THERE IS ONLY ENOUGH SUBSTANCE FOR ${available} BEATS. Write ${available} and STOP.`
        + ` The video comes out shorter than ${targetSec} seconds and that is the correct outcome —`
        + ` say in the final beat that this is everything there is to say on it.`
        + ` Do NOT repeat a point, restate the hook, or add a beat that carries no new information to reach the target.`
    } else if (available > b.maxBeats) {
      line += ` THERE IS MORE SUBSTANCE THAN ${targetSec} SECONDS HOLDS — ${available} beats' worth against room for ${b.maxBeats}.`
        + ` Cut whole points rather than speeding up, and name what you left out in one clause so the creator can decide`
        + ` whether it belonged in this video or the next one.`
    }
  }
  return line
}

/** How far a written script sits from its budget. */
export function durationMiss(
  words: number, input: DurationInput, wpm: WpmPreset = DEFAULT_WPM,
): { targetSec: number; words: number; overBy: number; underBy: number } {
  const { targetSec } = resolveTarget(input)
  const b = durationBudget(targetSec, wpm)
  return {
    targetSec,
    words,
    overBy: Math.max(0, words - b.maxWords),
    underBy: Math.max(0, b.minWords - words),
  }
}
