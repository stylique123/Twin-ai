// WHAT SHAPES EXIST, DRAWN FROM 900 ASSESSED REFERENCES — AND NOT ONE WORD OF
// ANYBODY'S SCRIPT.
//
// ⚠️ THE CORPUS ALREADY EXISTS AND IS MUCH LARGER THAN THE BACKLOG NOTE SAYS.
// Measured 2026-09-05: `reference_content_profiles` holds 1,459 rows, 900 with a
// full structural profile and 459 with a visual one, assessed between
// 2026-08-18 and 07:22 THIS MORNING. The standing note still says "~3,500
// references, ~35 assessed". The extraction is done; what was missing is a
// reader.
//
// ⚠️⚠️ AND EVERY FIELD IN THAT CORPUS CARRIES VERBATIM SOURCE TEXT. Each value
// is stored as `{ basis, value, evidence, assessedAt }`, where `evidence` is the
// creator's own sentence:
//
//   "mechanism": { "value": "question",
//                  "evidence": "Du hast ein Produkt und du willst es über
//                               Social Media verkaufen?" }
//
// ⚖️ THAT IS DEFENSIBLE PER-REFERENCE AND DANGEROUS AS A LIBRARY. On the
// reference a creator chose, `evidence` is provenance — it says which line the
// reading came from, so a disputed call can be checked. Aggregated across
// creators it becomes a store of other people's phrasing, one lookup away from
// a script. The governing rule is explicit: a shape library stores STRUCTURES
// AND TOPICS, NEVER TEXT, and "search the corpus for any field containing a
// full sentence from a source transcript" is a test that must never pass.
//
// ── SO THIS IS A WHITELIST, AND THAT IS THE WHOLE SAFETY ARGUMENT ─────────
//
// ⚠️ A BLACKLIST WOULD BE WRONG THE DAY SOMEBODY ADDS A FIELD. Stripping
// `evidence` and copying the rest means the next key added to the assessor —
// a quote, a caption, a transcript excerpt — flows into the library by default
// and nobody notices until it is in a prompt. Naming the handful of ENUM fields
// that may cross keeps the failure mode "the library is missing something",
// which is visible, instead of "the library leaked something", which is not.

/** A structural reading, as the assessor stores it. */
interface Observed { basis?: unknown; value?: unknown; evidence?: unknown }

// ⚠️ THE VOCABULARIES ARE THE ASSESSOR'S OWN, IMPORTED, NEVER RETYPED. A
// hand-copied whitelist is a whitelist that drifts: the first draft of this file
// spelled the containers by hand and silently omitted `before_after`, so every
// before/after reference in the corpus would have projected to `container: null`
// and vanished from the library — a shape missing for no reason anyone could see.
// Importing means a new container appears here the day the assessor learns it,
// and an unrecognised string still cannot pass.
import {
  CONTAINER_TYPES, HOOK_MECHANISMS, PAYOFF_TYPES, BEAT_ROLES, LIKELY_GOALS,
  type ContainerType, type HookMechanism, type PayoffType, type LikelyGoal,
} from './referenceContentProfile'
import { CTA_MECHANISMS } from './cta'


/** What the assessor may record for somebody else's CTA: Twin's own vocabulary
 *  plus the two states only observing needs. Mirrors `ObservedCta`. */
const OBSERVED_CTA = Object.freeze([...CTA_MECHANISMS, 'implicit', 'none'] as const)

/** ⚖️ `not_checked` IS NOT A LEVEL, so it is excluded here rather than filtered
 *  downstream. The canonical enum carries it because a profile must be able to
 *  say "not measured"; a library that counted it as a transferability grade
 *  would be reading absence as a value. */
const TRANSFER_LEVELS = Object.freeze(['high', 'medium', 'low'] as const)

/**
 * How fast the video moves, as a band rather than a number.
 *
 * ⚠️ BANDS, NOT A RATE, BECAUSE THE RATE IS NOT PRECISE ENOUGH TO PRINT.
 * Measured over the 134 references with complete beat timing: 1.5 beats/min at
 * p10, 5.5 at the median, 16.5 at p90 — an elevenfold spread. A creator reading
 * "6.2 beats per minute" would take a precision from it that the corpus cannot
 * support; three bands are what the data honestly separates.
 *
 * ⚖️ THE THRESHOLDS ARE THE MEASURED QUARTILES, not round numbers chosen for
 * looking tidy: p25 is 3.0 and p75 is 8.6, so `steady` is the middle half of
 * the corpus and the two edges are the quarters. They are labelled as measured
 * so a future reader can re-derive them when the corpus grows.
 */
export const PACING_BANDS = ['unhurried', 'steady', 'rapid'] as const
export type PacingBand = (typeof PACING_BANDS)[number]
const PACING_P25_BEATS_PER_MIN = 3.0
const PACING_P75_BEATS_PER_MIN = 8.6

/**
 * The band, or null when nothing measured it.
 *
 * ⚠️⚠️ NULL IS THE COMMON ANSWER AND MUST STAY REACHABLE. Every reference
 * assessed before 0193 has no duration and never will — the file it was
 * measured from is gone. Coercing that to a band would put 1,773 invented
 * readings into the one field this whole exercise exists to measure honestly.
 *
 * ⚠️ AND THE NULL CHECK PRECEDES THE ARITHMETIC. `beats / 0` is Infinity, which
 * compares greater than every threshold and would silently report every
 * zero-duration row as `rapid` — a reading, from a video nobody measured.
 */
export function pacingBand(durationSec: unknown, beatCount: unknown): PacingBand | null {
  const d = typeof durationSec === 'number' ? durationSec : Number(durationSec)
  const b = typeof beatCount === 'number' ? beatCount : Number(beatCount)
  if (!Number.isFinite(d) || d <= 0) return null
  if (!Number.isFinite(b) || b <= 0) return null
  const perMin = (b / d) * 60
  if (perMin < PACING_P25_BEATS_PER_MIN) return 'unhurried'
  return perMin > PACING_P75_BEATS_PER_MIN ? 'rapid' : 'steady'
}

/** One reference reduced to shape. NO free text, by construction. */
export interface ShapeRow {
  container: ContainerType | null
  hookMechanism: HookMechanism | null
  payoffType: PayoffType | null
  ctaMechanism: (typeof OBSERVED_CTA)[number] | null
  /** Beat ROLES in order — never the beat summaries, which are prose. */
  beatRoles: string[]
  beatCount: number
  transferability: 'high' | 'medium' | 'low' | null
  /** How fast it moves, or null when its length was never measured — which is
   *  every reference assessed before 0193. */
  pacing: PacingBand | null
  /** Goal labels the assessor recognised, from its own closed vocabulary. */
  goals: LikelyGoal[]
}

/** Pull `value` out of an Observed cell, and ONLY when it is in the allowed set.
 *
 *  ⚠️ `evidence` IS NEVER READ HERE, AND THE FUNCTION CANNOT REACH IT. That is
 *  the point: there is no code path from a profile's evidence string into a
 *  ShapeRow, so the safety property is structural rather than remembered. */
function enumValue<T extends string>(cell: unknown, allowed: readonly T[]): T | null {
  const v = (cell as Observed | null)?.value
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null
}

/**
 * Project one stored profile into shape.
 *
 * ⚠️ RETURNS null FOR A PROFILE WITH NO STRUCTURE. A row of all-nulls in a
 * library counts as evidence that a shape exists when it only means the
 * assessment failed — the same absent-is-not-zero rule this repo keeps
 * relearning.
 */
export function projectShape(profile: unknown, durationSec?: number | null): ShapeRow | null {
  if (!profile || typeof profile !== 'object') return null
  const p = profile as Record<string, unknown>
  const structure = (p.structure ?? {}) as Record<string, unknown>
  const hook = (p.hook ?? {}) as Record<string, unknown>

  const container = enumValue(structure.containerType, CONTAINER_TYPES)
  const hookMechanism = enumValue(hook.mechanism, HOOK_MECHANISMS)

  const rawBeats = (structure.beats as Observed | undefined)?.value
  const beatRoles = Array.isArray(rawBeats)
    ? rawBeats
        .map((b) => (b as { role?: unknown })?.role)
        .filter((r): r is string => typeof r === 'string' && (BEAT_ROLES as readonly string[]).includes(r))
    : []

  const rawGoals = (p.likelyGoals as Observed | undefined)?.value
  const goals = Array.isArray(rawGoals)
    ? rawGoals.filter((g): g is LikelyGoal =>
        typeof g === 'string' && (LIKELY_GOALS as readonly string[]).includes(g))
    : []

  const transferRaw = (p.transfer as Record<string, unknown> | undefined)?.structureTransferability
  const transferability = typeof transferRaw === 'string'
    && (TRANSFER_LEVELS as readonly string[]).includes(transferRaw)
    ? (transferRaw as 'high' | 'medium' | 'low') : null

  // Nothing structural was read — say so rather than emit an empty shape.
  if (!container && !hookMechanism && beatRoles.length === 0) return null

  return {
    container,
    hookMechanism,
    payoffType: enumValue(structure.payoffType, PAYOFF_TYPES),
    ctaMechanism: enumValue(structure.ctaMechanism, OBSERVED_CTA),
    beatRoles,
    beatCount: beatRoles.length,
    transferability,
    // ⚖️ THE DURATION COMES FROM THE ROW, NOT THE PROFILE JSON. It is a column
    // on `reference_content_profiles` because ffprobe measured it, not because
    // a model reported it — and keeping measured facts out of the model's
    // envelope is what lets the two be checked against each other.
    pacing: pacingBand(durationSec ?? null, beatRoles.length),
    goals,
  }
}

export interface ShapeStat {
  container: ContainerType
  count: number
  /** How many of these the assessor judged structurally transferable. */
  transferableHigh: number
  /** Median beat count, or null when no row carried beats. */
  medianBeats: number | null
}

/**
 * What shapes exist, and which of them travel.
 *
 * ⚠️ `transferableHigh` IS THE COLUMN THAT MATTERS, not the raw count. Measured
 * over the 900: `tutorial` (104) and `numbered_list` (92) are 100% high —
 * every single one — while `other` is the largest bucket at 260 and only 27%.
 * A library ranked on frequency alone would recommend `other`, which is not a
 * shape at all.
 */
export function shapeStats(rows: readonly ShapeRow[]): ShapeStat[] {
  const by = new Map<ContainerType, ShapeRow[]>()
  for (const r of rows) {
    if (!r.container) continue
    const list = by.get(r.container) ?? []
    list.push(r)
    by.set(r.container, list)
  }
  const out: ShapeStat[] = []
  for (const [container, list] of by) {
    const beats = list.map((r) => r.beatCount).filter((n) => n > 0).sort((a, b) => a - b)
    out.push({
      container,
      count: list.length,
      transferableHigh: list.filter((r) => r.transferability === 'high').length,
      medianBeats: beats.length === 0 ? null
        : beats.length % 2 === 1 ? beats[(beats.length - 1) / 2]
        : Math.round((beats[beats.length / 2 - 1] + beats[beats.length / 2]) / 2),
    })
  }
  return out.sort((a, b) => b.transferableHigh - a.transferableHigh || b.count - a.count)
}
