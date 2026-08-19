// RANKING BY POLICY, NOT BY AVERAGE.
//
// ⚠️ A PERFECTLY ON-NICHE VIDEO TWIN CANNOT RECREATE MUST NOT BEAT A CROSS-NICHE
// ONE IT CAN TURN INTO A FINISHED SCRIPT TODAY. That sentence is the whole
// design, and it is not expressible as a weighted sum: averaging lets a strong
// niche score compensate for "this creator physically cannot shoot it", which is
// not a trade anybody would make on purpose.
//
// ⚖️ SO: HARD FILTERS FIRST, THEN LEXICOGRAPHIC PRIORITY GROUPS. A reference is
// either eligible or it is not; among the eligible, an earlier group decides
// before a later one is consulted at all. Reach never leaves last place.
//
// ── AND IT MUST DEGRADE TO TODAY'S BEHAVIOUR ──────────────────────────────
//
// ⚠️ ALL 9,504 CARDS ARE ENTIRELY UNASSESSED. A policy that treated `not_checked`
// as a failing grade would empty the gallery on the day it shipped; one that
// treated it as a pass would claim knowledge it does not have. Neither: an
// unknown is SKIPPED — it decides nothing, and the next group decides instead.
//
// ⚖️ WHICH MEANS AN UNASSESSED LIBRARY RANKS EXACTLY AS IT DOES TODAY, by niche
// then reach, and a test pins that. The batch does not change the rules; it fills
// the inputs the rules were already reading.

import type { CanonicalRelationship } from './profileAssembler'
import type { BriefGoal } from './preScriptBrief'
import {
  isKnown, type ReferenceProfile, type ProductionMode, type Feasibility, type Transferability,
} from './referenceProfile'
import { compareByFit, type GalleryFacts } from './galleryRank'

/**
 * What the gallery is allowed to know about the creator.
 *
 * ⚠️ A PROJECTION, NOT THE PROFILE. The gallery ranks references; it has no
 * business reading a CTA or a voice sample, and handing it the whole creator is
 * how a fifth interpretation of one person appears. Assembled from the canonical
 * profile, never from raw onboarding fields.
 */
export interface GalleryCreatorView {
  goals: readonly BriefGoal[]
  /** ⚖️ WHAT THEY WANT TWIN TO HELP THEM MAKE, which is not what they are
   *  physically capable of — those are different questions and the second one
   *  lives in the capability flags. */
  preferredFormats: readonly ProductionMode[]
  relationship: CanonicalRelationship | null
  /** How many live products the library holds. Zero is a real answer. */
  productCount: number
  canFilmObjects: boolean | null
  canRecordScreen: boolean | null
}

export const INELIGIBLE_REASONS = [
  'unsupported_production',
  'commercially_unavailable',
  'needs_personal_experience',
  'needs_ownership',
] as const

/** ⚖️ THE POSTURES THAT SPEAK AS AN OWNER. `SPONSOR` is deliberately absent: a
 *  sponsored video says "these people paid me", which an affiliate or a reviewer
 *  can say too. Only the two ownership claims cannot be borrowed. */
const OWNER_POSTURES: ReadonlySet<string> = new Set(['OWN_PRODUCT', 'OWN_SERVICE'])
export type IneligibleReason = (typeof INELIGIBLE_REASONS)[number]

export interface Eligibility {
  eligible: boolean
  /** Present only when refused, and always in words a creator could read. */
  reason?: IneligibleReason
  explain?: string
}

/**
 * Is this reference eligible for this creator at all?
 *
 * ⚠️ EVERY REFUSAL REQUIRES A KNOWN FACT ON BOTH SIDES. An unassessed card is
 * never ineligible — that would hide 9,504 references behind an absence — and a
 * creator who was never asked is never refused either. The same two-sided rule
 * `productionModeMatch` already runs on.
 */
export function eligibility(ref: ReferenceProfile, me: GalleryCreatorView): Eligibility {
  // ⚖️ `null` IS NOT A REFUSAL. An unassessed reference refuses nobody — the
  // same two-sided rule as everything else on this screen — and the visual pass
  // now says "no knowledge" with a bare null rather than an `Assessed` state.
  const mode = ref.visual.primaryMode
  if (mode !== null && mode.value === 'other_unsupported') {
    return {
      eligible: false,
      reason: 'unsupported_production',
      explain: 'This one needs a production Twin cannot help you recreate.',
    }
  }

  // ⚠️ THE OWNERSHIP REFUSAL. "Why we built this" is an OWNER's sentence, and an
  // affiliate recreating it puts a false ownership claim in their own mouth —
  // the founding defect in its purest form, since the script would be perfectly
  // in their voice and describe a company they do not have.
  //
  // ⚖️ REFUSED ONLY WHEN BOTH SIDES ARE KNOWN, which is the same two-sided rule
  // `productionModeMatch` runs on. An unassessed reference refuses nobody — that
  // is every card today — and a creator who was never asked about their
  // relationship is never refused either, because silence is not "I own
  // nothing".
  const posture = ref.content.commercial.posture
  if (isKnown(posture) && OWNER_POSTURES.has(posture.value)
      && me.relationship !== null && !OWNER_POSTURES.has(me.relationship)) {
    return {
      eligible: false,
      reason: 'needs_ownership',
      explain: 'This one only works if the product is yours — it is built around the person who made it.',
    }
  }

  const slots = ref.content.requirements.contentSlots
  if (isKnown(slots)) {
    const personal = slots.value.filter((s) => s.kind === 'personal_experience')
    // ⚠️ TWIN CANNOT INVENT A PERSONAL FAILURE, and a gallery that ranked "my
    // three biggest failures" as ready would be promising a video it cannot
    // honestly write. Refused only where the slots are KNOWN to need it.
    if (personal.length > 0) {
      return {
        eligible: false,
        reason: 'needs_personal_experience',
        explain: 'This one is built from personal stories only you can tell.',
      }
    }
    // ⚠️ BOTH COMMERCIAL SLOT KINDS, AND THE SECOND ONE WAS MISSED FOR A WHILE.
    // This read only `product` until the four-creator fixture caught it: adding
    // `tool_or_software` to the schema created a second way to need something to
    // sell, and a refusal that knows about one of two kinds is a refusal that
    // silently stopped covering half its cases. "3 AI tools every founder needs"
    // is exactly as unfinishable for somebody with nothing to sell as three
    // physical products would be.
    const commercialSlots = slots.value.filter(
      (s) => s.kind === 'product' || s.kind === 'tool_or_software')
    if (commercialSlots.length > 0 && me.productCount === 0 && me.relationship === 'NONE') {
      return {
        eligible: false,
        reason: 'commercially_unavailable',
        explain: 'This format is built around products, and you told us you sell nothing.',
      }
    }
  }

  return { eligible: true }
}

/** ⚠️ ORDER IS THE POLICY. Earlier groups decide before later ones are consulted,
 *  so "Twin can finish this" outranks "this is your niche" — the sentence this
 *  module was written for. */
export const PRIORITY_GROUPS = [
  'content_resolvable',
  'production_feasible',
  'goal_fit',
  'format_preference',
  'structure_transferability',
  'niche_relevance',
  'reach',
] as const
export type PriorityGroup = (typeof PRIORITY_GROUPS)[number]

const RANK_FEASIBILITY: Record<Feasibility, number> = {
  easy: 0, reasonable: 1, difficult: 2, unsupported: 3, not_checked: 99,
}
const RANK_TRANSFER: Record<Transferability, number> = {
  high: 0, medium: 1, low: 2, not_checked: 99,
}

/** ⚖️ `99` IS "SKIP", NOT "WORST". Two cards that are both unknown compare equal
 *  on that term and fall through to the next group, which is how an unassessed
 *  library keeps today's ordering instead of collapsing into an arbitrary one. */
const both = (a: number, b: number): number => (a === 99 || b === 99 ? 0 : a - b)

export interface RankableReference {
  profile: ReferenceProfile
  /** The facts today's comparator already reads — niche relation and reach. */
  facts: GalleryFacts
  /** How many content slots the creator can fill without inventing anything.
   *  `null` until something checks, which is every card today. */
  slotsFillable?: number | null
  slotsRequired?: number | null
  feasibility?: Feasibility
}

/**
 * Compare two references for one creator.
 *
 * ⚠️ NO SCORE IS PRODUCED, HERE OR ANYWHERE. This returns an ORDER — a claim that
 * one card comes before another — derived from stated comparisons rather than
 * from a weighted sum nobody can argue with.
 */
export function compareForCreator(
  a: RankableReference, b: RankableReference, me: GalleryCreatorView,
): number {
  // 1. CONTENT RESOLVABLE — can Twin fill it without inventing anything?
  const fillA = ratio(a), fillB = ratio(b)
  if (fillA !== null && fillB !== null && fillA !== fillB) return fillB - fillA

  // 2. PRODUCTION FEASIBLE
  const feas = both(RANK_FEASIBILITY[a.feasibility ?? 'not_checked'],
                    RANK_FEASIBILITY[b.feasibility ?? 'not_checked'])
  if (feas !== 0) return feas

  // 3. GOAL FIT
  const goal = both(goalRank(a.profile, me), goalRank(b.profile, me))
  if (goal !== 0) return goal

  // 4. FORMAT PREFERENCE
  const fmt = both(formatRank(a.profile, me), formatRank(b.profile, me))
  if (fmt !== 0) return fmt

  // 5. STRUCTURE TRANSFERABILITY
  const tr = both(RANK_TRANSFER[a.profile.content.transfer.structureTransferability],
                  RANK_TRANSFER[b.profile.content.transfer.structureTransferability])
  if (tr !== 0) return tr

  // 6 + 7. NICHE, THEN REACH — today's comparator, unchanged and last.
  return compareByFit(a.facts, b.facts)
}

/** Fraction of slots fillable, or null when either half is unknown. */
function ratio(r: RankableReference): number | null {
  if (typeof r.slotsFillable !== 'number' || typeof r.slotsRequired !== 'number') return null
  if (r.slotsRequired <= 0) return null
  return r.slotsFillable / r.slotsRequired
}

function goalRank(ref: ReferenceProfile, me: GalleryCreatorView): number {
  const g = ref.content.likelyGoals
  if (!isKnown(g) || me.goals.length === 0) return 99
  return g.value.some((x) => (me.goals as readonly string[]).includes(x)) ? 0 : 1
}

function formatRank(ref: ReferenceProfile, me: GalleryCreatorView): number {
  const m = ref.visual.primaryMode
  if (m === null || me.preferredFormats.length === 0) return 99
  return me.preferredFormats.includes(m.value) ? 0 : 1
}
