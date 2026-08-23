// WHAT A REFERENCE *IS*, SO THE GALLERY CAN STOP GUESSING FROM ITS NICHE LABEL.
//
// ⚠️ 9,504 CARDS CARRY SEVEN FIELDS BETWEEN THEM: niche, platform, creator,
// title, a marketing blurb, reach, a poster. From that the gallery can answer
// one question — "is this roughly your niche?" — and it answers the rest with
// `not_checked`. Meanwhile Twin knows the creator's audience, goals, formats,
// commercial relationship, products and voice. The intelligence exists on one
// side of the comparison and not the other.
//
// ⚖️ SO THE REFERENCE GETS A PROFILE TOO — AND IT IS TWO PROFILES, NOT ONE.
// What Twin HEARD and what Twin SAW are separate artifacts, produced by separate
// passes, answering separate questions:
//
//     ReferenceContentProfile   "is there a worthwhile, complete version
//     (from the transcript)      of this reference FOR ME?"
//
//     ReferenceVisualProfile    "can I physically shoot this?"
//     (from the frames)
//
//     ReferenceProfile = content + visual
//
// ⚠️ KEEPING THEM APART IS THE POINT, NOT TIDINESS. Merged into one record, a
// confident reading of the speech and an unassessed reading of the picture
// average into a card that looks half-known and is actually half-invented. Apart,
// every consumer can see which half it is standing on — and the gallery can rank
// on content long before a single frame has been looked at.

import { countObserved } from './assessed'
import type { ReferenceContentProfile } from './referenceContentProfile'
import { emptyContentProfile } from './referenceContentProfile'

export * from './assessed'
export * from './referenceContentProfile'

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
 *  creator realistically record this" is a judgement, and `difficult` is a word
 *  somebody can disagree with — `0.42` is not. */
export const FEASIBILITY = ['easy', 'reasonable', 'difficult', 'unsupported', 'not_checked'] as const
export type Feasibility = (typeof FEASIBILITY)[number]

/**
 * Everything Twin learned from LOOKING at the reference.
 *
 * ⚖️ THIS IS THE PASS-2 TARGET AND IT IS ENTIRELY UNASSESSED TODAY. It ships now,
 * empty, because the content pass needs somewhere to NOT put its findings — a
 * transcript that says "let me show you" is not a screen recording observed, and
 * without a separate home for the visual claim there is nowhere to draw that
 * line.
 */
/**
 * ⚠️ EVIDENCE IS PART OF THE FIELD, NOT METADATA BESIDE IT. An earlier draft put
 * the frame citation next to the claim, which is exactly how a claim gets read
 * without its proof: one destructuring, one `?? ` and the observation is loose
 * in the codebase with nothing attached. Making the value unreachable except
 * through the object that carries its frames means downstream code CANNOT
 * accidentally use a visual claim it has not been shown the basis for.
 */
export type FrameCitation = readonly [number] | readonly [number, number]

export interface VisualObservation<T> {
  value: T
  evidence: { frames: FrameCitation }
}

/**
 * ⚠️ WHAT A SINGLE STILL CAN AND CANNOT ESTABLISH. Without this, a model can cite
 * "frame 3" for "the creator walks toward the camera" — a claim no one frame can
 * support — and the citation check passes while the claim is fiction.
 *
 * ⚖️ `temporal` AND `transition` IMPOSE THE SAME ARITY TODAY, and the labels are
 * kept apart anyway because the CLAIMS differ and the checks will diverge the
 * moment frames carry timestamps: a transition needs two samples close enough
 * together for motion between them to be observable, and "changes location" does
 * not. Collapsing them now would mean re-deriving that distinction later from
 * field names, which is how a rule gets rebuilt wrong.
 */
export const CLAIM_CLASSES = ['static', 'temporal', 'transition'] as const
export type ClaimClass = (typeof CLAIM_CLASSES)[number]

/**
 * What the frames pass can answer.
 *
 * ⚠️ EVERY FIELD IS `VisualObservation<T> | null`, AND null MEANS NO KNOWLEDGE.
 * Not false, not "fine", not a default. A parser failure, a missing field and a
 * claim whose evidence did not support it all land here identically, because
 * they are the same fact downstream: we do not know.
 *
 * ⚖️ "NOTHING REQUIRED" IS A SUCCESSFUL ASSESSMENT, and it is the common case. A
 * `requirements.secondPerson` of `{ value: false, evidence: … }` is a real
 * finding that lets the gallery say a video IS recreatable — which is the only
 * reason this pass earns its cost.
 */
export interface ReferenceVisualProfile {
  primaryMode: VisualObservation<ProductionMode> | null
  people: {
    /** More than one person on camera is the single biggest recreation blocker
     *  for a solo creator, so it is its own field rather than folded into a
     *  score that can average it away. */
    count: VisualObservation<'one' | 'multiple'> | null
  }
  setting: {
    changes: VisualObservation<boolean> | null
    complexity: VisualObservation<'simple' | 'moderate' | 'complex'> | null
  }
  performance: {
    talkingHead: VisualObservation<boolean> | null
    walking: VisualObservation<boolean> | null
    acting: VisualObservation<boolean> | null
    productInteraction: VisualObservation<boolean> | null
    screenInteraction: VisualObservation<boolean> | null
  }
  camera: {
    framingChanges: VisualObservation<boolean> | null
    /** How close the framing is. Recorded ALONGSIDE performance.talkingHead,
     *  which stays deliberately loose about distance. */
    shotType: VisualObservation<'close' | 'medium' | 'wide'> | null
    positionChanges: VisualObservation<boolean> | null
  }
  requirements: {
    physicalProduct: VisualObservation<boolean> | null
    secondPerson: VisualObservation<boolean> | null
    multipleLocations: VisualObservation<boolean> | null
    unusualProps: VisualObservation<boolean> | null
  }
  // ── FOUR COUNTERS, BECAUSE "COMPLETED" AND "INFORMATIVE" ARE NOT THE SAME ──
  //
  // ⚠️ ONE `framesSampled: boolean` CONFLATED ALL OF THESE, and the conflation is
  // the bug: a pass that ran on four frames and could read nothing looks exactly
  // like a pass that ran well, and both look like a pass that never happened.
  /** The pass executed. Says nothing about what it learned. */
  visualPassRan: boolean
  /** How many frames the model was actually shown. `0` with `visualPassRan` true
   *  is a contradiction this type permits and `extractVisualProfile` never
   *  produces — no frames means the response is discarded. */
  framesSampled: number
  /** Fields that came back with a value AND evidence that supports it. */
  fieldsObserved: number
  /** Fields the response could not answer usably. Worth asking again. */
  fieldsUnreadable: number
  /** ⚖️ ASKED, AND THE FRAMES GENUINELY CANNOT SAY. Field paths the model
   *  explicitly reported as undeterminable. Separated from `fieldsUnreadable`
   *  because re-running these costs a call to reach the same nothing, and
   *  without the distinction the batch pays forever for questions already
   *  settled. */
  indeterminate: readonly string[]
}

export function emptyVisualProfile(): ReferenceVisualProfile {
  return {
    primaryMode: null,
    people: { count: null },
    setting: { changes: null, complexity: null },
    performance: {
      talkingHead: null,
      walking: null,
      acting: null,
      productInteraction: null,
      screenInteraction: null,
    },
    camera: { framingChanges: null, positionChanges: null, shotType: null },
    requirements: {
      physicalProduct: null,
      secondPerson: null,
      multipleLocations: null,
      unusualProps: null,
    },
    visualPassRan: false,
    framesSampled: 0,
    fieldsObserved: 0,
    fieldsUnreadable: 0,
    indeterminate: [],
  }
}

/**
 * Everything known about one reference.
 *
 * ⚠️ FRESHNESS IS ABSENT ON PURPOSE. There is no publication date and no
 * performance history in the scraped rows, so any "recency" field would be a
 * column filled to stop it looking empty. It stays dark until there is a real
 * source, and an empty database column is not a reason to invent one.
 */
export interface ReferenceProfile {
  referenceId: string
  content: ReferenceContentProfile
  visual: ReferenceVisualProfile
}

export function emptyReferenceProfile(
  referenceId: string,
  niche: string | null = null,
): ReferenceProfile {
  return {
    referenceId,
    content: emptyContentProfile(referenceId, niche),
    visual: emptyVisualProfile(),
  }
}

/** ⚠️ HOW ASSESSED IS THIS CARD, ANSWERED WITHOUT WALKING THE OBJECT. A profile
 *  with two observed fields and twenty unchecked ones must never read as
 *  assessed, and the batch needs this to report progress honestly rather than by
 *  counting rows it touched. */
export function observedFieldCount(p: ReferenceProfile): { content: number; visual: number } {
  const c = p.content
  return {
    content: countObserved([
      c.topic, c.subtopic, c.audience.likelySegment, c.audience.sophistication,
      c.likelyGoals, c.hook.mechanism, c.hook.promise,
      c.structure.containerType, c.structure.beats, c.structure.rehookPosition,
      c.structure.payoffType, c.structure.ctaMechanism,
      c.requirements.contentSlots, c.requirements.personalExperienceRequired,
      c.requirements.productsRequired, c.requirements.externalFactsRequired,
      c.transfer.topicDependence,
    ]),
    // ⚖️ READ OFF THE COUNTER RATHER THAN RECOUNTED. The visual pass computes
    // `fieldsObserved` at the moment it decides each field, where it also knows
    // WHY a field is absent. Walking the fields again here would be a second
    // implementation of the same question, free to disagree with the first —
    // and an observation with evidence is no longer an `Assessed`, so the old
    // shared counter cannot express it anyway.
    visual: p.visual.fieldsObserved,
  }
}
