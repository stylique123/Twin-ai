// DURATION FROM MATERIAL (owner, panel-current-5; trial only, kill switch
// DURATION_FROM_MATERIAL at the edge).
//
// The requested length decided the profile, so a creator with one story and
// one opinion on file was handed a Standard (140 words) or Deep (210 words)
// budget, and the beats were filled with padding or invented events. The
// profile is now capped by how much of HER material is on file for this video:
//
//   - every item is one unit (a story, a fact or opinion, an answer she gave,
//     a fact of the product this video is about, a moment typed in her note);
//   - a unit fills about one body beat, WORDS_PER_UNIT spoken words, and the
//     hook and close take FRAME_WORDS between them;
//   - a profile is allowed when that capacity reaches its word budget in
//     `DURATION_PROFILES`; Deep also needs one first-party story.
//
// Sprint (about 30 s) is always allowed: a thin creator gets an honest Sprint.
// The material only ever LOWERS the requested profile, never raises it.
//
// Pure, no I/O. Deno copy is GENERATED (scripts/ci/generate_shared_pilot_core.mjs).

import { DURATION_PROFILES, type DurationProfile } from './templateData.js'

/** Spoken words one item of her material carries in a beat. */
export const WORDS_PER_UNIT = 35
/** Words the hook and the close take between them. */
export const FRAME_WORDS = 35

export interface MaterialCounts {
  stories: number
  facts: number
  answers: number
  product_facts: number
  note_moment?: boolean
}

export interface DurationChoice {
  requested: DurationProfile
  ceiling: DurationProfile
  chosen: DurationProfile
  units: number
  capacity_words: number
  reason: string
}

const ORDER: readonly DurationProfile[] = ['sprint', 'standard', 'deep']

/** The longest profile her material supports. */
export function materialCeiling(m: MaterialCounts): { ceiling: DurationProfile; units: number; capacity: number } {
  const stories = Math.max(0, m.stories) + (m.note_moment ? 1 : 0)
  const units = stories + Math.max(0, m.facts) + Math.max(0, m.answers) + Math.max(0, m.product_facts)
  const capacity = FRAME_WORDS + units * WORDS_PER_UNIT
  const ceiling: DurationProfile = capacity >= DURATION_PROFILES.deep.words && stories >= 1
    ? 'deep'
    : capacity >= DURATION_PROFILES.standard.words ? 'standard' : 'sprint'
  return { ceiling, units, capacity }
}

/** The requested profile, lowered to what the material supports, with the reason. */
export function chooseDuration(requested: DurationProfile, m: MaterialCounts): DurationChoice {
  const { ceiling, units, capacity } = materialCeiling(m)
  const chosen = ORDER.indexOf(requested) <= ORDER.indexOf(ceiling) ? requested : ceiling
  const reason = chosen === requested
    ? `requested ${requested}; ${units} item(s) on file carry about ${capacity} words, enough for ${DURATION_PROFILES[requested].words}`
    : `requested ${requested} needs about ${DURATION_PROFILES[requested].words} words; ${units} item(s) on file carry about ${capacity}${ceiling !== 'deep' && requested === 'deep' && capacity >= DURATION_PROFILES.deep.words ? ' but no story of hers' : ''}, so ${chosen}`
  return { requested, ceiling, chosen, units, capacity_words: capacity, reason }
}

/** The allowed profile of a template closest to (and not above) `want`, or null when none is. */
export function fitProfile(allowed: readonly DurationProfile[], want: DurationProfile): DurationProfile | null {
  for (let i = ORDER.indexOf(want); i >= 0; i--) if (allowed.includes(ORDER[i]!)) return ORDER[i]!
  return null
}
