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

/** Spoken words one unit of her material carries in a beat. */
export const WORDS_PER_UNIT = 35
/** Words the hook and the close take between them. */
export const FRAME_WORDS = 35
/**
 * ⚖️ PANEL-6 RE-TUNE. "Genuinely can't fill it" means the material carries
 * less than this share of the requested budget: the hook, the close and the
 * bridges are written around the material, so 75% of the words from it fills
 * the length honestly. Panel-6 under the old rule (100%, a story = 1 unit,
 * nothing after the floor counted): 18 of 22 went to sprint, every deep
 * request was lowered and the median script fell to 57 words.
 */
export const FILL_SHARE = 0.75
/** A story fills its own beat and the turn after it. */
export const STORY_UNITS = 2
/** A short fact (a product fact, the offer, a dated item) half a beat. */
export const SHORT_UNITS = 0.5
/** Outside material never carries more than this many units. */
export const OUTSIDE_CAP_UNITS = 2
/** Product facts never carry more than this many units. */
export const PRODUCT_CAP_UNITS = 3

export interface MaterialCounts {
  stories: number
  facts: number
  /** Answers she actually gave (skips excluded). */
  answers: number
  /** Facts of the product THIS video is about. */
  product_facts: number
  note_moment?: boolean
  /** Outside items that reach the writer after the floor (research, niche, audience). */
  outside?: number
  /** Offer and dated items. */
  short?: number
}

export interface DurationChoice {
  requested: DurationProfile
  ceiling: DurationProfile
  chosen: DurationProfile
  units: number
  capacity_words: number
  reason: string
  /** Rule version, so panel numbers can be compared across tunes. */
  version?: string
}

export const DURATION_FROM_MATERIAL_VERSION = 'dfm-v2'

const ORDER: readonly DurationProfile[] = ['sprint', 'standard', 'deep']

const n0 = (v: number | undefined) => (Number.isFinite(v) ? Math.max(0, v as number) : 0)

/** The longest profile her material supports. */
export function materialCeiling(m: MaterialCounts): { ceiling: DurationProfile; units: number; capacity: number } {
  const stories = n0(m.stories) + (m.note_moment ? 1 : 0)
  const units = stories * STORY_UNITS + n0(m.facts) + n0(m.answers)
    + Math.min(PRODUCT_CAP_UNITS, n0(m.product_facts) * SHORT_UNITS)
    + n0(m.short) * SHORT_UNITS
    + Math.min(OUTSIDE_CAP_UNITS, n0(m.outside) * SHORT_UNITS)
  const capacity = Math.round(FRAME_WORDS + units * WORDS_PER_UNIT)
  const fills = (p: DurationProfile) => capacity >= FILL_SHARE * DURATION_PROFILES[p].words
  const ceiling: DurationProfile = fills('deep') && stories >= 1
    ? 'deep'
    : fills('standard') ? 'standard' : 'sprint'
  return { ceiling, units, capacity }
}

/** The requested profile, lowered only when the material cannot fill it. */
export function chooseDuration(requested: DurationProfile, m: MaterialCounts): DurationChoice {
  const { ceiling, units, capacity } = materialCeiling(m)
  const chosen = ORDER.indexOf(requested) <= ORDER.indexOf(ceiling) ? requested : ceiling
  const need = Math.round(FILL_SHARE * DURATION_PROFILES[requested].words)
  const noStory = requested === 'deep' && ceiling !== 'deep' && capacity >= FILL_SHARE * DURATION_PROFILES.deep.words
  const reason = chosen === requested
    ? `requested ${requested}; material reaching the writer (${units} unit(s)) carries about ${capacity} words, enough for ${DURATION_PROFILES[requested].words}`
    : `requested ${requested} needs about ${need} words of material; ${units} unit(s) reaching the writer carry about ${capacity}${noStory ? ' but no story of hers' : ''}, so ${chosen}`
  return { requested, ceiling, chosen, units, capacity_words: capacity, reason, version: DURATION_FROM_MATERIAL_VERSION }
}

/** The allowed profile of a template closest to (and not above) `want`, or null when none is. */
export function fitProfile(allowed: readonly DurationProfile[], want: DurationProfile): DurationProfile | null {
  for (let i = ORDER.indexOf(want); i >= 0; i--) if (allowed.includes(ORDER[i]!)) return ORDER[i]!
  return null
}

/** A ledger item as the writer sees it (structural; the gate's LedgerItem fits). */
export interface MaterialItem { origin: string; product_id?: string | null; text?: string }

const SKIP = /^(nothing( specific| really| much)?|none|no|n\/a|na|idk|i don'?t know|not sure|skip|no idea|not really)\b|\bkeep it general\b/i

/**
 * COUNT WHAT REACHES THE WRITER (panel-6). The counts come from the ledger the
 * writer is handed (after the material floor and the named-story restore), not
 * from the stored rows before them: her stories, facts and real answers, the
 * facts of THIS video's product (another product's facts are not material
 * here), the offer and dated items, and the outside items kept by the floor.
 * A skip or a one-to-three-word note ("beans") is not material.
 */
export function countsFromLedger(items: readonly MaterialItem[], targetProductId: string | null): MaterialCounts {
  const c: Required<MaterialCounts> = { stories: 0, facts: 0, answers: 0, product_facts: 0, note_moment: false, outside: 0, short: 0 }
  for (const it of items) {
    const t = String(it?.text ?? '').trim()
    switch (it?.origin) {
      case 'her_story': c.stories++; break
      case 'her_fact': case 'audience_question': c.facts++; break
      case 'her_answer':
        if (t && !SKIP.test(t.replace(/[.!\s]+$/, '')) && t.split(/\s+/).length >= 4) c.answers++
        break
      case 'product_fact': if (targetProductId && it.product_id === targetProductId) c.product_facts++; break
      case 'offer': case 'urgency': c.short++; break
      case 'outside_research': case 'outside_moment': case 'niche_note': c.outside++; break
      default: break
    }
  }
  return c
}
