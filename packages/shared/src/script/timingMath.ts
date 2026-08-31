// FIX 7 — "WRITE TO target_sec" WAS PROSE. NOTHING COMPUTED IT.
//
// ⚠️ THE MEASURED CASE. Scene 2 in the audited script: ~31 words in an 8s
// beat — about 2.6 words/sec needed against a natural ~2.5 words/sec rate.
// The writer was told a number and never checked against it.
//
// ⚖️ THE RATE IS THE RECORDER'S RATE, NOT A NEW ONE. `estimateDurationSec` in
// `recordingScript.ts` already converts words to seconds for the teleprompter
// and the per-scene time cap, at `DEFAULT_WPM` (150 wpm ≈ 2.5 words/sec). This
// module reuses it rather than inventing its own divisor — the spec's own
// "calibrate the divisor later" note is answered by using the number the
// product already commits to everywhere else, so the Plan screen and the
// teleprompter can never quote two different lengths for the same words.
//
// ⚠️ THAT "NOTHING READS target_sec" CLAIM WAS TRUE ONCE AND IS NOW FALSE, AND
// IT COST A DAY. This block used to argue that `beat_plan` is planning-stage
// output which "is never returned in the shipped blueprint and nothing on the
// client resolves it today (confirmed: only `script`, `hook_options`, `concept`
// and `packaging` reach the creator)". It has a reader:
// `recordingScriptAdapter` copies `beatPlan[idx].targetSec` onto
// `RecordingScene.target_sec`, and `ScriptEditor`'s `BeatLength` renders it to
// a creator as "Xs beat". A confident parenthesised "confirmed" outlived the
// thing it confirmed, and reading it sent an audit looking for a missing
// surface when the surface had been live all along.
//
// ⚖️ SO THE NO-REPAIR RULE NOW RESTS ON ITS OTHER LEG, WHICH STILL HOLDS.
// Repair is still not this module's job — but because a target the writer
// DECIDED is the honest thing to compare against, and silently rewriting it to
// match whatever words arrived would delete the disagreement the Plan screen
// exists to show. Detection here, disagreement on the surface, judgement with
// the creator.
//
// ⚖️ ONE BEAT PER SCRIPT ENTRY, EXACTLY — the writer's own contract
// (beat_plan's schema comment: "EMIT EXACTLY ONE BEAT PER script ENTRY, in
// the same order, so beat 1 is script line 1"). This module trusts that
// ordering rather than matching on any other key, because there is no other
// key: `beat_plan` entries carry no id.

import { DEFAULT_WPM, estimateDurationSec, type WpmPreset } from '../recordingScript'
// ⚠️ REUSED, NOT REDEFINED. `beatPlan.ts` already parses this exact field with
// real bounds (1.5-90s) -- a second parser here would be a second opinion on
// what a valid target_sec is, free to drift from the first.
import { parseTargetSec } from '../beatPlan'

export interface TimingFlag {
  /** Index into both `script` and `beatPlan`, per the one-beat-per-entry contract. */
  index: number
  expectedSec: number
  targetSec: number
  diffSec: number
}

/** ⚠️ THE THRESHOLD THE SPEC NAMES: whichever is larger of a flat 2 seconds or
 *  30% of the target — a short beat needs the flat floor (30% of 3s is
 *  under a second, which natural speech variance alone would trip) and a
 *  long beat needs the percentage (2s on a 40s beat is noise). */
export function timingThreshold(targetSec: number): number {
  return Math.max(2, targetSec * 0.3)
}

export interface TimingBeat {
  line?: string | null
}
export interface TimingPlanEntry {
  target_sec?: unknown
}

/**
 * Every beat whose expected speaking time (from its own line, at the
 * recorder's rate) diverges from its planned `target_sec` by more than the
 * threshold.
 *
 * ⚠️ A BEAT WITH NO LINE OR NO PARSEABLE TARGET IS SKIPPED, NEVER FLAGGED AT
 * A FABRICATED 0. An unwritten `needs_user` beat has no words yet to measure
 * (see `scriptLength.ts`'s `SpokenBeat` note) — flagging it would tell the
 * creator their timing is wrong for a line that does not exist yet.
 */
export function timingFlags(
  script: readonly TimingBeat[] | null | undefined,
  beatPlan: readonly TimingPlanEntry[] | null | undefined,
  wpm: WpmPreset = DEFAULT_WPM,
): TimingFlag[] {
  const beats = Array.isArray(script) ? script : []
  const plan = Array.isArray(beatPlan) ? beatPlan : []
  const out: TimingFlag[] = []
  const n = Math.min(beats.length, plan.length)
  for (let i = 0; i < n; i++) {
    const line = beats[i]?.line
    if (typeof line !== 'string' || line.trim() === '') continue
    const targetSec = parseTargetSec(plan[i]?.target_sec)
    if (targetSec === null) continue
    const expectedSec = estimateDurationSec(line, wpm)
    const diffSec = Math.abs(expectedSec - targetSec)
    if (diffSec > timingThreshold(targetSec)) {
      out.push({ index: i, expectedSec, targetSec, diffSec: Math.round(diffSec * 10) / 10 })
    }
  }
  return out
}

/** The `beat_audit` counter: how many beats' words don't fit the plan they
 *  were given. Zero is the expected reading for a well-planned script. */
export function timingFlagCount(
  script: readonly TimingBeat[] | null | undefined,
  beatPlan: readonly TimingPlanEntry[] | null | undefined,
  wpm: WpmPreset = DEFAULT_WPM,
): number {
  return timingFlags(script, beatPlan, wpm).length
}
