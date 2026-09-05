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
export function projectShape(profile: unknown): ShapeRow | null {
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
