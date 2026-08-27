/**
 * FOUR SCENES, ONE LOCATION STRING, AND NOTHING CHECKED IT.
 *
 * ⚠️ MEASURED IN PRODUCTION. The retention doctrine requires scene-to-scene
 * visual change; nothing in the pipeline enforced it. A four-beat script with
 * `location: "center of the room facing a window"` on every beat shipped
 * clean — every other check passed, because none of them look at whether the
 * SAME beat looked different from the last one.
 *
 * ⚖️ FLAG ONLY, NEVER AUTO-REPAIR. Location is exactly the field with the
 * "assumed inventory" failure mode ("your walnut chair") — a model asked to
 * vary it would invent a room the creator does not have. A deterministic
 * suggestion drawn from a small, safe, always-true set ("move to the
 * window", "sit → stand", "punch in to tight face") is offered in the UI;
 * this module only detects the run and lets the caller decide what to show.
 *
 * ⚖️ A SILENT BEAT ('[No spoken audio]') IS NOT A SPEAKING BEAT even though
 * its `line` is non-empty text — the bracket marker is direction, not
 * dialogue. Reuses `isSilentBeat` rather than a second definition of
 * silence, so the two modules cannot drift on what counts as speech.
 *
 * ⚖️ CHANGING EITHER LOCATION OR FRAMING COUNTS. `direction` is the beat's
 * camera framing (e.g. "chest-up", "overlay", "tight face") — repeating the
 * room while the framing changes is a different shot, not monotony. Only a
 * run where BOTH stayed identical is flagged.
 */

import { isSilentBeat } from './silentBeat'

/** A run of ≥3 consecutive speaking beats holding the same (location,
 *  framing) pair. `startIndex` is the first beat in the run, `length` how
 *  many beats it spans — both counted against the ORIGINAL beat array, not
 *  the filtered speaking-only list, so a UI can point at the real cards. */
export interface SceneMonotonyRun {
  startIndex: number
  length: number
  location: string
  direction: string
}

/** ⚠️ NORMALIZED FOR COMPARISON, NEVER FOR DISPLAY. Case and punctuation
 *  differences ("Center of the room." vs "center of the room") are the same
 *  place; the flag must not miss a run because of them. */
function normalize(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[.,!?]+$/g, '')
    : ''
}

/** ⚠️ THE THRESHOLD IS ≥3, MATCHING THE SPEC'S "no more than 2 consecutive
 *  speaking beats". Two identical beats in a row is normal coverage; three
 *  is the run the doctrine forbids. */
const MONOTONY_RUN_LENGTH = 3

/**
 * Does this beat carry a spoken line at all? A silent beat (`[No spoken
 * audio]`) or an empty line contributes nothing to watch and must not
 * extend or break a run on its own — it is simply skipped, matching the
 * spec's "consecutive SPEAKING beats" wording exactly.
 */
function isSpeakingBeat(beat: { line?: unknown }): boolean {
  return typeof beat.line === 'string' && beat.line.trim().length > 0 && !isSilentBeat(beat.line)
}

/**
 * Find every run of ≥3 consecutive speaking beats whose location and
 * framing (direction) are both unchanged.
 *
 * ⚠️ NON-SPEAKING BEATS ARE INVISIBLE TO THE SCAN, NOT BREAKS IN IT. A silent
 * beat sandwiched between two identical speaking beats does not save the
 * pair from monotony — the creator still stands in the same spot for the
 * same shot across every beat that talks.
 */
export function sceneMonotonyRuns(
  beats: unknown,
): SceneMonotonyRun[] {
  if (!Array.isArray(beats)) return []

  const speaking: Array<{ index: number; location: string; direction: string }> = []
  beats.forEach((b, index) => {
    const beat = (b ?? {}) as { line?: unknown; location?: unknown; direction?: unknown }
    if (!isSpeakingBeat(beat)) return
    speaking.push({ index, location: normalize(beat.location), direction: normalize(beat.direction) })
  })

  const runs: SceneMonotonyRun[] = []
  let runStart = 0
  for (let i = 1; i <= speaking.length; i++) {
    const sameAsPrev = i < speaking.length
      && speaking[i].location === speaking[runStart].location
      && speaking[i].direction === speaking[runStart].direction
      // ⚠️ AN EMPTY (location, direction) PAIR IS "NOT RECORDED", NOT "THE SAME
      // PLACE". Two beats that both left location blank are not a repeated
      // room — they are two beats nobody described, and flagging them would
      // punish an absent field instead of a real repeat.
      && speaking[runStart].location !== ''

    if (!sameAsPrev) {
      const runLength = i - runStart
      if (runLength >= MONOTONY_RUN_LENGTH) {
        runs.push({
          startIndex: speaking[runStart].index,
          length: runLength,
          location: speaking[runStart].location,
          direction: speaking[runStart].direction,
        })
      }
      runStart = i
    }
  }
  return runs
}

/** Total speaking beats caught in a monotony run, for the `beat_audit`
 *  counter. A script with one 4-beat run counts 4, not 1 — the metric this
 *  exists to answer is "how much of the script repeats", not "how many
 *  separate incidents". */
export function sceneMonotonyBeatCount(beats: unknown): number {
  return sceneMonotonyRuns(beats).reduce((sum, run) => sum + run.length, 0)
}
