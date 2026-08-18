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

import type { Assessed } from './assessed'
import { unchecked, countObserved } from './assessed'
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
export interface ReferenceVisualProfile {
  primaryMode: Assessed<ProductionMode>
  people: {
    /** More than one person on camera is the single biggest recreation blocker
     *  for a solo creator, so it is its own field rather than folded into a
     *  score that can average it away. */
    count: Assessed<'one' | 'multiple'>
  }
  setting: {
    changes: Assessed<boolean>
    complexity: Assessed<'simple' | 'moderate' | 'complex'>
  }
  performance: {
    talkingHead: Assessed<boolean>
    walking: Assessed<boolean>
    acting: Assessed<boolean>
    productInteraction: Assessed<boolean>
    screenInteraction: Assessed<boolean>
  }
  camera: {
    framingChanges: Assessed<boolean>
    positionChanges: Assessed<boolean>
  }
  requirements: {
    physicalProduct: Assessed<boolean>
    secondPerson: Assessed<boolean>
    multipleLocations: Assessed<boolean>
    unusualProps: Assessed<boolean>
  }
  /** Whether frames were actually looked at, distinguishing "assessed and
   *  inconclusive" from "never sampled". */
  framesSampled: boolean
}

const FRAMES = 'a visual pass over sampled frames of the video'

export function emptyVisualProfile(): ReferenceVisualProfile {
  return {
    primaryMode: unchecked(FRAMES),
    people: { count: unchecked(FRAMES) },
    setting: { changes: unchecked(FRAMES), complexity: unchecked(FRAMES) },
    performance: {
      talkingHead: unchecked(FRAMES),
      walking: unchecked(FRAMES),
      acting: unchecked(FRAMES),
      productInteraction: unchecked(FRAMES),
      screenInteraction: unchecked(FRAMES),
    },
    camera: { framingChanges: unchecked(FRAMES), positionChanges: unchecked(FRAMES) },
    requirements: {
      physicalProduct: unchecked(FRAMES),
      secondPerson: unchecked(FRAMES),
      multipleLocations: unchecked(FRAMES),
      unusualProps: unchecked(FRAMES),
    },
    framesSampled: false,
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
    visual: countObserved([
      p.visual.primaryMode, p.visual.people.count,
      p.visual.setting.changes, p.visual.setting.complexity,
      p.visual.performance.talkingHead, p.visual.performance.walking,
      p.visual.performance.acting, p.visual.performance.productInteraction,
      p.visual.performance.screenInteraction,
      p.visual.camera.framingChanges, p.visual.camera.positionChanges,
      p.visual.requirements.physicalProduct, p.visual.requirements.secondPerson,
      p.visual.requirements.multipleLocations, p.visual.requirements.unusualProps,
    ]),
  }
}
