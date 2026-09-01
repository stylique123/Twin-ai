/**
 * FIX 8 (Wave 3) — THE RUNTIME NEVER CAME FROM THE WORDS.
 *
 * ⚠️ THE AUDITED CASE, from `eval/fixtures/live-runs/run-a.json`: the Result
 * screen's header claimed "47 seconds of talking" for a script whose own
 * words, at the recorder's rate, run about 33 seconds — 82 words / 150 wpm.
 * The header number was never checked against the script it was describing;
 * across all four dogfood fixtures it disagrees by 5-30 seconds
 * (`liveRunFixtures.test.ts`, assertion 8). `measureScriptLength` (this
 * package) already computes the honest number from the FINAL script's own
 * words; the defect was that nothing compared it to anything and nothing
 * ever warned when it ran long.
 *
 * ⚖️ THE WPM IS THE RECORDER'S WPM, NOT A NEW ONE. Same reasoning as
 * `scriptLength.ts` and `timingMath.ts`: a third divisor here would let this
 * module, the Plan screen and the teleprompter quote three different lengths
 * for the same words.
 *
 * ⚖️ THE CEILING IS REUSED, NOT INVENTED. `DEFAULT_REFERENCE_BOUNDS.maxDurationSec`
 * (`editor/referenceCheck.ts`) is already the codebase's one committed
 * "short-form" length ceiling — 180s, chosen because "three minutes is
 * already long for a short-form reference". A generated script is exactly a
 * short-form video by the same product definition, so this reuses that
 * number rather than asserting a second, unreviewed one for the same shape
 * of question.
 *
 * ⚖️ DISCLOSES, LIKE `scriptLength.ts`. A ceiling warning is a fact
 * ("this runs longer than short-form videos run"), not a block — the
 * creator may still choose to shoot it.
 */
import { DEFAULT_WPM, type WpmPreset } from '../recordingScript'
import { DEFAULT_REFERENCE_BOUNDS } from '../editor/referenceCheck'
import { measureScriptLength, spokenTime, type SpokenBeat } from './scriptLength'

/** Reused from the reference-eligibility bound, not a second opinion. */
export const RUNTIME_CEILING_SEC = DEFAULT_REFERENCE_BOUNDS.maxDurationSec

export interface RuntimeComparison {
  /** Seconds of speech in the FINAL script, at `wpm` — the one number this
   *  whole module exists to compute honestly. */
  computedSec: number
  /** The reference video's own known duration, when captured. ⚖️ ABSENT IS
   *  NOT ZERO: most references have no measured duration on file, and that
   *  is a fact about the data, never a video with no length. */
  referenceSec: number | null
  ceilingSec: number
  /** `computedSec - referenceSec`, positive means the generated script runs
   *  longer. Null exactly when `referenceSec` is null — there is nothing to
   *  diff against. */
  diffFromReferenceSec: number | null
  exceedsCeiling: boolean
  /** Beats that still have no words. ⚠️ WHEN THIS IS NON-ZERO, `computedSec`
   *  TIMES ONLY PART OF THE SCRIPT, and comparing it to a whole reference
   *  video is comparing two different things. Optional so a comparison built
   *  before this field existed still reads as "no claim", never as zero. */
  unwrittenBeats?: number
}

/**
 * Compare the FINAL script's own computed runtime against the reference
 * video's known duration and the short-form ceiling.
 *
 * ⚠️ `beats` MUST BE THE SCRIPT AFTER EVERY REPAIR HAS RUN — the same "run
 * last" placement every other beat_audit counter in this wave follows. A
 * runtime measured on the model's first draft describes a script the
 * creator will never see.
 */
export function compareRuntime(
  beats: readonly SpokenBeat[] | null | undefined,
  referenceSec: number | null | undefined,
  wpm: WpmPreset = DEFAULT_WPM,
  ceilingSec: number = RUNTIME_CEILING_SEC,
): RuntimeComparison {
  const measured = measureScriptLength(beats, wpm)
  const computedSec = measured.spokenSec
  const refSec =
    typeof referenceSec === 'number' && Number.isFinite(referenceSec) && referenceSec > 0
      ? referenceSec
      : null
  return {
    computedSec,
    referenceSec: refSec,
    ceilingSec,
    diffFromReferenceSec: refSec === null ? null : Math.round((computedSec - refSec) * 10) / 10,
    exceedsCeiling: computedSec > ceilingSec,
    // ⚠️ CARRIED SO THE SENTENCE CAN REFUSE TO COMPARE. `computedSec` counts
    // WRITTEN beats only; comparing that against a whole reference video is
    // comparing two different things and reporting the gap as if it were a
    // choice the writer made.
    unwrittenBeats: measured.unwrittenBeats,
  }
}

/**
 * The sentence the Plan/Result screen shows beside the reference's own
 * length. ⚖️ A FACT, AND WHEN IT APPLIES, THE CEILING — never a verdict on
 * whether the creator should trim it (see `scriptLength.ts`'s same rule).
 */
export function runtimeComparisonSentence(cmp: RuntimeComparison): string {
  const pending = cmp.unwrittenBeats ?? 0

  // ⚠️ A PARTIAL SCRIPT MAY NOT BE COMPARED TO A WHOLE VIDEO. Reported from
  // production as "duration matching is a clamp": a 103-second reference
  // against a 34-second script, a 59-second reference against 24. Neither
  // number was a clamp. `computedSec` counts only the beats that HAVE words,
  // so a seven-beat script with five unanswered asks times two beats and the
  // panel presented that against the full reference as though the writer had
  // chosen to cut it by two thirds.
  //
  // ⚖️ THE BEAT PLAN WAS NEVER THE PROBLEM. Measured across production, its
  // `target_sec` totals track the reference (a 59s reference planned 56s). The
  // defect is entirely in this sentence.
  //
  // ⚖️ SO WHILE BEATS ARE PENDING, SAY WHAT IS TIMED AND STOP. `lengthSentence`
  // in scriptLength.ts already does exactly this for the same measurement; two
  // sentences about one script must not disagree about whether it is finished.
  if (pending > 0) {
    const base = `About ${spokenTime(cmp.computedSec)} of talking so far — ${pending} ${
      pending === 1 ? 'line is' : 'lines are'
    } still waiting on you, so this will grow.`
    return cmp.referenceSec === null
      ? base
      : `${base} The reference runs about ${spokenTime(cmp.referenceSec)}.`
  }

  const base = `About ${spokenTime(cmp.computedSec)} of talking.`
  const refPart =
    cmp.referenceSec === null ? '' : ` The reference runs about ${spokenTime(cmp.referenceSec)}.`
  const ceilingPart = cmp.exceedsCeiling
    ? ` That is longer than a short-form video normally runs (over ${spokenTime(cmp.ceilingSec)}) — worth trimming before you record.`
    : ''
  return `${base}${refPart}${ceilingPart}`
}
