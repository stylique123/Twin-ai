// WHAT A REFERENCE *IS*, SO THE GALLERY CAN STOP GUESSING FROM ITS NICHE LABEL.
//
// ⚠️ 9,504 CARDS CARRY SEVEN FIELDS BETWEEN THEM: niche, platform, creator,
// title, a marketing blurb, reach, a poster. From that the gallery can answer
// one question — "is this roughly your niche?" — and it answers six others with
// `not_checked`. Meanwhile Twin knows the creator's audience, goals, formats,
// commercial relationship, products and voice. The intelligence exists on one
// side of the comparison and not the other.
//
// ⚖️ SO THE REFERENCE GETS A PROFILE TOO, AND THE GALLERY BECOMES A COMPARISON
// BETWEEN TWO KNOWN THINGS RATHER THAN A STRING MATCH. This file is the shape
// the batch assessment fills. Nothing here is computed from a niche label.
//
// ── EVERY FIELD CARRIES HOW IT WAS LEARNED ────────────────────────────────
//
// ⚠️ THE SAME THREE STATES THE REST OF TWIN RUNS ON, for the same reason: a
// value read off a transcript and a value guessed from a title are not the same
// claim, and a field nobody has looked at is not `false`. The gallery already
// pays for this distinction — `productionModeMatch` refuses to answer unless
// BOTH halves are explicitly known — and it can only keep that promise if the
// reference's half says which kind of knowledge it is.
//
// ⚖️ AND `not_checked` IS THE DEFAULT FOR EVERYTHING. A freshly scraped card is
// entirely unassessed, which is the truth about 9,504 rows today.

export const ASSESSMENT_BASIS = ['observed', 'inferred', 'not_checked'] as const
export type AssessmentBasis = (typeof ASSESSMENT_BASIS)[number]

/**
 * One assessed field.
 *
 * ⚠️ `observed` REQUIRES SOMETHING TO HAVE BEEN READ — a transcript, the frames,
 * the caption. `inferred` is a reading of the marketing prose, which is weaker
 * and must never be laundered into the first. The discriminated union makes the
 * evidence non-optional where it is claimed, exactly as `Provenanced<T>` does.
 */
export type Assessed<T> =
  | { value: T; basis: 'observed'; evidence: string; assessedAt: string }
  | { value: T; basis: 'inferred'; evidence: string; assessedAt: string }
  | { basis: 'not_checked'; needs: string }

/** ⚖️ HELPER FOR THE COMMON CASE — a field nobody has looked at, saying what
 *  would answer it. A bare `null` would lose that, and "what is missing" is the
 *  thing that makes an unbuilt signal one field away rather than an open
 *  question. */
export const unchecked = <T,>(needs: string): Assessed<T> => ({ basis: 'not_checked', needs })

export const isKnown = <T,>(a: Assessed<T>): a is Extract<Assessed<T>, { value: T }> =>
  a.basis !== 'not_checked'

// ── PRODUCTION: WHAT SHOOTING IT ACTUALLY TAKES ───────────────────────────

/** ⚠️ `other_unsupported` IS A REAL MEMBER AND NOT A FALLBACK. A cinematic
 *  multi-camera piece is not a mode Twin can help somebody recreate, and saying
 *  so is more useful than filing it under the nearest supported thing. */
export const PRODUCTION_MODES = [
  'talking_head', 'walk_and_talk', 'pov_skit', 'review_comparison',
  'product_led', 'screen_software', 'podcast_interview', 'other_unsupported',
] as const
export type ProductionMode = (typeof PRODUCTION_MODES)[number]

/** ⚖️ FOUR HONEST BANDS AND A FIFTH FOR SILENCE, rather than a number. "Can this
 *  creator realistically record this" is a judgement, and `DIFFICULT` is a word
 *  somebody can disagree with — `0.42` is not. */
export const FEASIBILITY = ['easy', 'reasonable', 'difficult', 'unsupported', 'not_checked'] as const
export type Feasibility = (typeof FEASIBILITY)[number]

export interface ProductionFacts {
  primaryMode: Assessed<ProductionMode>
  /** More than one person on camera is the single biggest recreation blocker for
   *  a solo creator, so it is its own field rather than folded into a score. */
  peopleOnCamera: Assessed<'one' | 'multiple'>
  propsRequired: Assessed<boolean>
  physicalProductRequired: Assessed<boolean>
  softwareDemoRequired: Assessed<boolean>
  actingRequired: Assessed<boolean>
  locationDependent: Assessed<boolean>
}

// ── STRUCTURE: THE PART THAT TRAVELS ──────────────────────────────────────

/** ⚠️ THE CONTAINER IS THE THING WORTH STEALING, and it is what the gallery
 *  cannot see today. "3 mistakes" and "before/after" are shapes a different
 *  creator can fill with entirely different content — which is precisely why a
 *  cross-niche reference can beat an on-niche one. */
export const CONTAINER_TYPES = [
  'numbered_list', 'mistakes', 'confession', 'before_after', 'unpopular_opinion',
  'tutorial', 'reaction', 'comparison', 'story', 'myth_busting',
  'problem_solution', 'prediction', 'framework', 'other',
] as const
export type ContainerType = (typeof CONTAINER_TYPES)[number]

export const TRANSFERABILITY = ['high', 'medium', 'low', 'not_checked'] as const
export type Transferability = (typeof TRANSFERABILITY)[number]

/**
 * ⚠️ A SLOT IS A HOLE THE SCRIPT MUST FILL, AND NAMING THEM IS WHAT MAKES
 * `content_availability` COMPUTABLE. "3 skincare products I regret" has three
 * item slots; whether Twin can fill them from the Product Library — without
 * inventing anything — predicts whether generation can actually finish.
 */
export interface ContentSlot {
  id: string
  /** What kind of thing goes here, so a filler can be looked for. */
  kind: 'product' | 'personal_experience' | 'claim' | 'example' | 'current_fact'
  /** ⚖️ A SLOT REQUIRING PERSONAL EXPERIENCE CANNOT BE FILLED FROM A LIBRARY.
   *  "My three biggest failures" needs something only the creator can assert,
   *  and a gallery that ranked it ready would be promising a video Twin cannot
   *  honestly write. */
  label: string
}

export interface StructureFacts {
  container: Assessed<ContainerType>
  slots: Assessed<readonly ContentSlot[]>
  /** How tied the content is to its original subject. High specificity means the
   *  shape does not survive a change of topic. */
  topicSpecificity: Assessed<'low' | 'medium' | 'high'>
  structureTransferability: Transferability
  crossNicheTransferability: Transferability
}

// ── CONTENT: WHAT IT IS ABOUT AND WHO FOR ─────────────────────────────────

/** ⚖️ WHAT THE PATTERN NATURALLY SERVES, which is not the same as what its
 *  original creator wanted. A confession structure builds authority whoever
 *  makes it; that is a property of the shape. */
export const LIKELY_GOALS = [
  'growth', 'authority', 'education', 'conversation', 'leads', 'sales', 'entertainment',
] as const
export type LikelyGoal = (typeof LIKELY_GOALS)[number]

export interface ContentFacts {
  /** The scraped label, kept as-is. It is the weakest field here and is no
   *  longer the only one. */
  niche: string | null
  subNiche: Assessed<string>
  topic: Assessed<string>
  intendedAudience: Assessed<string>
  likelyGoals: Assessed<readonly LikelyGoal[]>
}

/**
 * Everything known about one reference.
 *
 * ⚖️ NOTHING IN HERE IS REQUIRED. A freshly scraped card is a `ReferenceProfile`
 * with every field `not_checked`, which is exactly what 9,504 rows are today —
 * and the gallery must behave sanely on that shape, because for now it is the
 * only shape that exists.
 */
export interface ReferenceProfile {
  referenceId: string
  content: ContentFacts
  structure: StructureFacts
  production: ProductionFacts
  evidence: {
    transcriptAvailable: boolean
    visualAnalysisAvailable: boolean
    /** ⚠️ COUNTED, SO "HOW ASSESSED IS THIS CARD" IS ANSWERABLE without walking
     *  the object. A profile with two observed fields and twenty unchecked ones
     *  must not read as assessed. */
    observedFields: number
  }
}

/** An unassessed card, which is every card today.
 *
 *  ⚖️ EACH `needs` NAMES THE MEASUREMENT, so the batch job has its worklist
 *  written down in the type rather than in somebody's head. */
export function emptyReferenceProfile(referenceId: string, niche: string | null = null): ReferenceProfile {
  const TRANSCRIPT = 'a transcript or caption for this video'
  const FRAMES = 'a visual pass over the poster or the video itself'
  return {
    referenceId,
    content: {
      niche,
      subNiche: unchecked(TRANSCRIPT),
      topic: unchecked(TRANSCRIPT),
      intendedAudience: unchecked(TRANSCRIPT),
      likelyGoals: unchecked('the structure, classified — a shape implies what it serves'),
    },
    structure: {
      container: unchecked(TRANSCRIPT),
      slots: unchecked('the container, which is what says how many holes there are'),
      topicSpecificity: unchecked(TRANSCRIPT),
      structureTransferability: 'not_checked',
      crossNicheTransferability: 'not_checked',
    },
    production: {
      primaryMode: unchecked(FRAMES),
      peopleOnCamera: unchecked(FRAMES),
      propsRequired: unchecked(FRAMES),
      physicalProductRequired: unchecked(FRAMES),
      softwareDemoRequired: unchecked(FRAMES),
      actingRequired: unchecked(FRAMES),
      locationDependent: unchecked(FRAMES),
    },
    evidence: { transcriptAvailable: false, visualAnalysisAvailable: false, observedFields: 0 },
  }
}
