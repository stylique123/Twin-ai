/**
 * HOW LONG THIS SCRIPT ACTUALLY RUNS.
 *
 * ⚠️ MEASURED IN PRODUCTION, NOT ASSUMED. Of the 35 generations that adapted a
 * reference with a known duration, 17 (49%) run more than 25% LONGER than that
 * reference and 10 (29%) run more than 25% SHORTER. One shipped script is FOUR
 * SECONDS of talking. Only 8 of 35 land within a quarter of the length they
 * were adapting. Nothing on any screen said so — the creator found out at the
 * teleprompter, or after posting.
 *
 * ⚖️ THIS MODULE DISCLOSES, IT DOES NOT ENFORCE. A creator is allowed to shoot
 * something longer or shorter than the video they took the idea from; that is
 * a creative choice and Twin does not get a vote. What Twin owes them is the
 * number BEFORE they stand in front of a camera. So there is no score here, no
 * pass/fail, and no "too long" — only how long it runs, in seconds, and the one
 * case that is a defect rather than a choice: a script with barely anything in
 * it, which nobody chose.
 *
 * ⚠️ THE WPM IS THE RECORDER'S WPM, NOT A NEW ONE. `estimateDurationSec` in
 * `recordingScript.ts` already converts words to seconds for the teleprompter
 * and the per-scene time cap. If this module invented its own rate, the Plan
 * screen and the teleprompter would quote two different lengths for the same
 * words, and the creator would have no way to tell which one was lying.
 */
import { DEFAULT_WPM, estimateDurationSec, type WpmPreset } from '../recordingScript'

/** A beat as it reaches this module. Only the spoken half matters: direction,
 *  wardrobe and shot notes are never read aloud. */
export interface SpokenBeat {
  line?: string | null
  /** ⚠️ `needs_user` BEATS HAVE NO WORDS YET, and their `line` is empty by
   *  design (see `beatAsk.ts`). They are counted as UNWRITTEN, never as zero
   *  seconds of a finished script — the difference is the whole point. */
  substance?: string | null
}

/**
 * ⚠️ A SCRIPT SHORTER THAN THIS IS NOT A SHORT SCRIPT, IT IS A BROKEN ONE.
 * The lower bound is deliberately far below any real choice: creators do post
 * 10-second videos. 8 seconds of total speech across every beat is the range
 * where the measured 4-second script lives, and no one picked that.
 */
export const IMPLAUSIBLY_SHORT_SEC = 8

export interface ScriptLength {
  /** Seconds of speech across every beat that HAS words, at `wpm`. */
  spokenSec: number
  /** Beats that carry words today. */
  writtenBeats: number
  /** Beats still waiting on the creator — words not yet written, so not yet
   *  time. ⚖️ ABSENT IS NOT ZERO: these are missing, not empty. */
  unwrittenBeats: number
  /** True only when every beat is written AND the total is implausibly short.
   *  ⚠️ A script that is short BECAUSE it is unfinished is not this defect —
   *  it is an unfinished script, and saying "too short" would send the creator
   *  to fix the wrong thing. */
  implausiblyShort: boolean
}

function hasWords(b: SpokenBeat): boolean {
  return typeof b.line === 'string' && b.line.trim().length > 0
}

export function measureScriptLength(
  beats: readonly SpokenBeat[] | null | undefined,
  wpm: WpmPreset = DEFAULT_WPM,
): ScriptLength {
  const all = Array.isArray(beats) ? beats : []
  const written = all.filter(hasWords)
  // ⚠️ EVERY BEAT WITHOUT WORDS IS UNWRITTEN, whatever its `substance` says.
  // Trusting `substance === 'needs_user'` alone would miss a beat that lost its
  // line some other way, and an unwritten beat must never silently become 0s.
  const unwritten = all.length - written.length
  const spokenSec =
    Math.round(
      written.reduce((a, b) => a + estimateDurationSec(String(b.line), wpm), 0) * 10,
    ) / 10
  return {
    spokenSec,
    writtenBeats: written.length,
    unwrittenBeats: unwritten,
    implausiblyShort: written.length > 0 && unwritten === 0 && spokenSec < IMPLAUSIBLY_SHORT_SEC,
  }
}

/** "1 minute 20 seconds" — never "1:20", which reads as a timestamp, and never
 *  "80s". Plain everyday English, per the standing UX rule. */
export function spokenTime(sec: number): string {
  const whole = Math.round(sec)
  if (whole < 60) return `${whole} second${whole === 1 ? '' : 's'}`
  const m = Math.floor(whole / 60)
  const s = whole % 60
  const mins = `${m} minute${m === 1 ? '' : 's'}`
  return s === 0 ? mins : `${mins} ${s} second${s === 1 ? '' : 's'}`
}

/**
 * The sentence the Plan screen shows. ⚖️ A FACT AND, WHEN IT APPLIES, WHAT IS
 * MISSING — never a verdict on the writing.
 */
export function lengthSentence(len: ScriptLength): string {
  if (len.writtenBeats === 0) {
    return 'None of this script is written yet, so there is nothing to time.'
  }
  const base = `About ${spokenTime(len.spokenSec)} of talking.`
  if (len.unwrittenBeats > 0) {
    return `${base} ${len.unwrittenBeats} more ${
      len.unwrittenBeats === 1 ? 'line is' : 'lines are'
    } waiting on you, so the real video will run longer.`
  }
  if (len.implausiblyShort) {
    return `${base} That is shorter than a video normally needs — worth a look before you record.`
  }
  return base
}
