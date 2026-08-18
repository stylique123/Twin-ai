// WHAT TWIN LEARNED FROM WHAT THE REFERENCE *SAID*.
//
// ⚠️ THIS IS THE PASS-1 ARTIFACT, AND IT IS DELIBERATELY FROZEN BEFORE THE BATCH
// RUNS. 9,504 media-bearing calls produce a dataset that is expensive to redo,
// and the failure mode is not "the extraction was bad" — it is discovering
// afterwards that `containerType = 'numbered_list'` was never enough to support
// the decisions the gallery has to make. So the schema is written against the
// questions first, and proven on a pilot before anything is industrialised.
//
// ⚖️ IT ANSWERS "IS THERE A WORTHWHILE, COMPLETE VERSION OF THIS FOR ME?"
// That is the gallery's actual question, and it is answerable from speech alone.
// "How do I physically shoot this?" is a different question, it is answered by
// frames, and it lives in `ReferenceVisualProfile` so the two never blur.
//
// ── THE HIGHEST-LEVERAGE FIELD IS `contentSlots` ──────────────────────────
//
// ⚠️ IDENTIFYING THE CONTAINER IS NOT ENOUGH. `containerType = 'list'` tells the
// gallery nothing about whether Twin can finish the script. What has to be
// SUPPLIED to recreate it is the thing that decides:
//
//     "3 things I stopped buying after 30"   →  three item slots,
//                                               personal experience REQUIRED,
//                                               products optional
//
//     "3 AI tools every founder needs"       →  three recommendation slots,
//                                               products/tools REQUIRED (3),
//                                               current facts REQUIRED
//
// The first cannot be filled from a Product Library at all. The second can be
// answered exactly — "3 of 3 ready" — against what this creator actually
// promotes. That distinction is the difference between a recommendation and a
// niche label, and no amount of topic extraction produces it.

import type { Assessed } from './assessed'
import type { CtaMechanism } from './cta'
import { unchecked } from './assessed'

// ── WHO IT IS FOR ─────────────────────────────────────────────────────────

/** ⚖️ HOW MUCH THE VIEWER ALREADY KNOWS, which decides how much a script must
 *  explain before it can make its point. `mixed` is a real answer for broad
 *  content and not a refusal to choose. */
export const SOPHISTICATION = ['beginner', 'intermediate', 'advanced', 'mixed'] as const
export type Sophistication = (typeof SOPHISTICATION)[number]

export interface AudienceFacts {
  /** Plain description of who is being spoken to — "early-stage SaaS founders",
   *  not a taxonomy code. The comparison against the creator's own audience is
   *  made downstream; this half just records what was heard. */
  likelySegment: Assessed<string>
  sophistication: Assessed<Sophistication>
}

/** ⚖️ WHAT THE PATTERN NATURALLY SERVES, which is not the same as what its
 *  original creator wanted. A confession structure builds authority whoever
 *  makes it; that is a property of the shape, so it survives the transfer. */
export const LIKELY_GOALS = [
  'growth', 'authority', 'education', 'conversation', 'leads', 'sales', 'entertainment',
] as const
export type LikelyGoal = (typeof LIKELY_GOALS)[number]

// ── HOW IT OPENS ──────────────────────────────────────────────────────────

export const HOOK_MECHANISMS = [
  'question', 'negative_claim', 'curiosity_gap', 'contradiction', 'statistic',
  'promise', 'story_open', 'direct_address', 'demonstration', 'other',
] as const
export type HookMechanism = (typeof HOOK_MECHANISMS)[number]

export interface HookFacts {
  mechanism: Assessed<HookMechanism>
  /** What the opening implicitly promises the viewer will get. The payoff is
   *  checked against this, which is how "the hook wrote a cheque the video did
   *  not cash" becomes something a machine can notice. */
  promise: Assessed<string>
}

// ── THE SHAPE, AND WHERE ITS PARTS ARE ────────────────────────────────────

/** ⚠️ THE CONTAINER IS THE THING WORTH STEALING, and it is what the gallery
 *  cannot see today. "3 mistakes" and "before/after" are shapes a different
 *  creator fills with entirely different content — precisely why a cross-niche
 *  reference can beat an on-niche one. */
export const CONTAINER_TYPES = [
  'numbered_list', 'mistakes', 'confession', 'before_after', 'unpopular_opinion',
  'tutorial', 'reaction', 'comparison', 'story', 'myth_busting',
  'problem_solution', 'prediction', 'framework', 'recommendation', 'other',
] as const
export type ContainerType = (typeof CONTAINER_TYPES)[number]

export const BEAT_ROLES = [
  'hook', 'setup', 'item', 'turn', 'evidence', 'rehook', 'payoff', 'cta',
] as const
export type BeatRole = (typeof BEAT_ROLES)[number]

/**
 * One structural beat, with where it happens.
 *
 * ⚠️ THE TIMESTAMPS ARE WHY PASS 1 GOES FIRST. They are not decoration for a UI
 * — they tell the visual pass WHERE TO LOOK. Sampling five frames at fixed
 * percentages is guessing; sampling around the hook, the rehook and the payoff
 * is reading. Pass 1 therefore makes pass 2 both cheaper and better, which is
 * the whole argument for this order.
 *
 * ⚖️ AND THEY ARE NULLABLE, because a caption-only source has no clock. A beat
 * whose position is unknown is still a beat.
 */
export interface Beat {
  role: BeatRole
  startSec: number | null
  endSec: number | null
  /** One line of what happens here, in the reference's own terms. */
  summary: string
}

export const PAYOFF_TYPES = ['answer', 'reveal', 'summary', 'result', 'none'] as const
export type PayoffType = (typeof PAYOFF_TYPES)[number]

/**
 * ⚖️ THE CTA VOCABULARY IS `cta.ts`'s, NOT A RIVAL COPY. "What the viewer is
 * asked to do" is one idea, and Twin already owns the list for the scripts it
 * writes; a second enum here would drift from it the first time either changed.
 *
 * ⚠️ TWO STATES ARE ADDED, AND ONLY BECAUSE OBSERVING DEMANDS THEM. Twin's own
 * CTAs are always one of the real mechanisms — it would not write "none" — but a
 * reference genuinely may end without an ask, or leave it implied. Those are
 * findings about somebody else's video, which is why they belong here and not in
 * the module that decides Twin's.
 */
export type ObservedCta = CtaMechanism | 'implicit' | 'none'

export interface StructureFacts {
  containerType: Assessed<ContainerType>
  beats: Assessed<readonly Beat[]>
  /** Where attention is re-caught, as a beat index into `beats`. Its absence is
   *  a finding: plenty of videos never re-hook, and Twin's own teleprompter once
   *  deleted this beat silently. */
  rehookPosition: Assessed<number | null>
  payoffType: Assessed<PayoffType>
  ctaMechanism: Assessed<ObservedCta>
}

// ── WHAT RECREATING IT WOULD REQUIRE ──────────────────────────────────────

/** ⚖️ THREE STATES, BECAUSE `optional` IS THE COMMON AND USEFUL ONE. A slot that
 *  works better with a product but does not need one must not block a creator
 *  who has none. */
export const REQUIREMENT = ['required', 'optional', 'not_required'] as const
export type Requirement = (typeof REQUIREMENT)[number]

/** ⚠️ NOT `containerResolution`'s `SlotKind`, WHICH IS A DIFFERENT IDEA WEARING
 *  a similar word: that one classifies a bracketed span in a finished script,
 *  this one classifies what kind of thing must exist in the world to fill a hole
 *  in a container. Merging them would put "an unfilled bracket" and "a product
 *  the creator promotes" in one union. */
export const CONTENT_SLOT_KINDS = [
  'product', 'tool_or_software', 'personal_experience', 'claim', 'example', 'current_fact',
] as const
export type ContentSlotKind = (typeof CONTENT_SLOT_KINDS)[number]

/**
 * ⚠️ A SLOT IS A HOLE THE SCRIPT MUST FILL, AND NAMING THEM IS WHAT MAKES
 * `content_availability` COMPUTABLE. The label is the slot's ROLE in the
 * container — `relatable_item`, `surprising_item`, `strongest_item` — because a
 * three-item list is not three interchangeable holes, and a recommendation that
 * puts the weakest item last is a worse video than the reference it copied.
 *
 * ⚖️ AND `personal_experience` CAN NEVER BE FILLED FROM A LIBRARY. Something
 * only the creator can assert is not something Twin may supply, so a gallery
 * that counted it as ready would be promising a video Twin cannot honestly
 * write.
 */
export interface ContentSlot {
  id: string
  kind: ContentSlotKind
  /** The slot's role in the container, not a description of the original's
   *  content. `surprising_item`, not "the retinol serum". */
  label: string
  required: boolean
}

export interface RequirementFacts {
  contentSlots: Assessed<readonly ContentSlot[]>
  personalExperienceRequired: Assessed<Requirement>
  /** How many distinct products/tools the container needs. Zero is a real and
   *  common answer; `not_checked` is not the same as zero. */
  productsRequired: Assessed<number>
  /** Facts that go stale — prices, model names, "as of this year". A reference
   *  needing these is one Twin must research rather than recall. */
  externalFactsRequired: Assessed<Requirement>
}

// ── WHETHER THE SHAPE SURVIVES A CHANGE OF SUBJECT ────────────────────────

export const TRANSFERABILITY = ['high', 'medium', 'low', 'not_checked'] as const
export type Transferability = (typeof TRANSFERABILITY)[number]

export interface TransferFacts {
  structureTransferability: Transferability
  /** How tied the content is to its original subject. High dependence means the
   *  shape does not survive a change of topic, whatever its container says. */
  topicDependence: Assessed<'low' | 'medium' | 'high'>
  /** ⚖️ WHY, IN WORDS, so a creator reading the card gets a reason rather than a
   *  grade. An unexplained "low" is a number wearing a word's clothes. */
  reasons: readonly string[]
}

/**
 * Everything Twin learned from the spoken content of one reference.
 *
 * ⚖️ NOTHING HERE IS REQUIRED. A freshly scraped card is this object with every
 * field `not_checked` — which is what 9,504 rows are today, and the gallery must
 * behave sanely on that shape because for now it is the only shape there is.
 */
export interface ReferenceContentProfile {
  referenceId: string
  /** The scraped label, kept as-is and never inferred from. It is the weakest
   *  field here and, after the batch, no longer the only one. */
  niche: string | null
  topic: Assessed<string>
  subtopic: Assessed<string>
  audience: AudienceFacts
  likelyGoals: Assessed<readonly LikelyGoal[]>
  hook: HookFacts
  structure: StructureFacts
  requirements: RequirementFacts
  transfer: TransferFacts
  /** Whether a transcript was actually available. Distinguishes "assessed and
   *  quiet" from "never had a source", which the re-queue predicate needs. */
  transcriptAvailable: boolean
}

const TRANSCRIPT = 'a transcript or caption for this video'

/** An unassessed card, which is every card today.
 *
 *  ⚖️ EACH `needs` NAMES THE MEASUREMENT, so the batch's worklist is written in
 *  the type rather than in somebody's head. */
export function emptyContentProfile(
  referenceId: string,
  niche: string | null = null,
): ReferenceContentProfile {
  return {
    referenceId,
    niche,
    topic: unchecked(TRANSCRIPT),
    subtopic: unchecked(TRANSCRIPT),
    audience: {
      likelySegment: unchecked(TRANSCRIPT),
      sophistication: unchecked(TRANSCRIPT),
    },
    likelyGoals: unchecked('the structure, classified — a shape implies what it serves'),
    hook: {
      mechanism: unchecked(TRANSCRIPT),
      promise: unchecked(TRANSCRIPT),
    },
    structure: {
      containerType: unchecked(TRANSCRIPT),
      beats: unchecked(TRANSCRIPT),
      rehookPosition: unchecked('the beats, which is what a position indexes into'),
      payoffType: unchecked(TRANSCRIPT),
      ctaMechanism: unchecked(TRANSCRIPT),
    },
    requirements: {
      contentSlots: unchecked('the container, which is what says how many holes there are'),
      personalExperienceRequired: unchecked(TRANSCRIPT),
      productsRequired: unchecked(TRANSCRIPT),
      externalFactsRequired: unchecked(TRANSCRIPT),
    },
    transfer: {
      structureTransferability: 'not_checked',
      topicDependence: unchecked(TRANSCRIPT),
      reasons: [],
    },
    transcriptAvailable: false,
  }
}

/**
 * Where the visual pass should look, in seconds.
 *
 * ⚠️ THE READER THAT JUSTIFIES STORING TIMESTAMPS AT ALL. Without this, `Beat.
 * startSec` is a field with no consumer — the thing this codebase refuses to
 * add. With it, pass 2 samples the hook, the rehook and the payoff instead of
 * five arbitrary percentages, which is both cheaper and more informative.
 *
 * ⚖️ AND IT FALLS BACK HONESTLY. With no beats — or a caption-only source with
 * no clock — it returns nothing rather than a fabricated schedule, and the
 * caller does its own uniform sampling knowing that is what it is doing.
 */
export function frameSampleTargets(profile: ReferenceContentProfile): readonly number[] {
  const beats = profile.structure.beats
  if (beats.basis === 'not_checked' || beats.basis === 'indeterminate') return []
  const seconds = beats.value
    .map((b) => b.startSec)
    .filter((s): s is number => typeof s === 'number' && Number.isFinite(s) && s >= 0)
  // Sorted and de-duplicated: two beats sharing a second are one frame, and a
  // sampler should not be handed the same timestamp twice.
  return [...new Set(seconds)].sort((a, b) => a - b)
}
