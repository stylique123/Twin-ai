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
// ⚠️ DETECTION ONLY, NO REPAIR. The spec's own repair step ("prefer adjusting
// target_sec to the line") assumes something downstream reads `target_sec` —
// it does not. `beat_plan` is planning-stage model output; it is never
// returned in the shipped blueprint and nothing on the client resolves it
// today (confirmed: only `script`, `hook_options`, `concept` and `packaging`
// reach the creator). Repairing a field with no reader is the exact defect
// this session's own audit found twice already (a register with no caller
// looks healthier than an absent one). So this measures and flags; wiring an
// actual repair is a second PR, once a real consumer of the adjusted value
// exists to make the repair observable.
//
// ⚖️ ONE BEAT PER SCRIPT ENTRY, EXACTLY — the writer's own contract
// (beat_plan's schema comment: "EMIT EXACTLY ONE BEAT PER script ENTRY, in
// the same order, so beat 1 is script line 1"). This module trusts that
// ordering rather than matching on any other key, because there is no other
// key: `beat_plan` entries carry no id.

import { DEFAULT_WPM, estimateDurationSec, type WpmPreset } from '../recordingScript'

export interface TimingFlag {
  /** Index into both `script` and `beatPlan`, per the one-beat-per-entry contract. */
  index: number
  expectedSec: number
  targetSec: number
  diffSec: number
}

/**
 * Read `target_sec` as the writer wrote it. ⚠️ IT IS A STRING IN THE SCHEMA,
 * NOT A NUMBER — the model may write "6s", "6 seconds", or "6". A value with
 * no parseable number is NOT a target of zero; it is no target at all, so the
 * beat is excluded from the check rather than compared against a fabricated 0.
 */
export function parseTargetSec(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null
  if (typeof raw !== 'string') return null
  const match = raw.match(/(\d+(?:\.\d+)?)/)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) && n > 0 ? n : null
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
