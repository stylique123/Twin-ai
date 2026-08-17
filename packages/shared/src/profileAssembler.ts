// ONBOARDING ANSWERS → ONE CANONICAL CREATOR, ASSEMBLED BY BORING CODE.
//
// ⚠️ THREE CONSUMERS WERE EACH RECONSTRUCTING THE CREATOR FROM RAW FIELDS. The
// profile meter read `commercialTies`, the suggestion filter read it again, and
// the writer was about to be handed `workKind: "saas"` directly. Three
// interpretations of one person is how a system drifts while every individual
// change is correct, tested and green — and the fourth consumer would have made
// it four.
//
// ⚖️ SO THE WRITER NEVER SEES AN ONBOARDING FIELD. It sees a projection of this
// object, and a UI change that renames a question can no longer require editing
// a generation prompt.
//
// ── WHAT IS AND IS NOT ALLOWED IN THIS PATH ───────────────────────────────
//
// ⚠️ NO MODEL TOUCHES A CONFIRMED ANSWER. Assembly may normalise REPRESENTATION —
// an enum member becomes a canonical one — and may never reinterpret MEANING. A
// paraphrased answer is a machine's reading wearing a person's authority, which
// is the single defect this codebase has now found in four separate places: an
// auto palette becoming a brand, a generated sentence becoming a CTA, a figure
// read off a photograph becoming a price, and an inferred relationship nearly
// becoming permission to say "our product".
//
// ⚖️ `rawValue` IS KEPT SO THAT CLAIM IS CHECKABLE RATHER THAN PROMISED. A test
// can assert the original survived; it cannot assert an intention.
//
// ⚠️ EVERY MAP IS A TOTAL `Record`, NEVER A LOOKUP WITH A FALLBACK. Adding an
// onboarding option must BREAK THE BUILD until somebody decides what it means
// canonically. `MECHANISM_FROM_GOAL` earned this rule days ago: written against
// an assumed goal list, an index signature would have returned undefined for
// every real goal and silently dropped the CTA from every video. The compiler
// caught it because the type was total.

import type {
  CreatorProfileAnswers, AudienceSegment, AudienceKnowledge, CommercialTie,
} from './creatorProfileQuestions'
import type { BriefWorkKind, BriefGoal } from './preScriptBrief'
import type { Provenanced } from './authority'

// ── THE CANONICAL VOCABULARY ──────────────────────────────────────────────
//
// ⚖️ DELIBERATELY SMALLER THAN THE ONBOARDING VOCABULARY. Onboarding asks what a
// creator recognises about themselves; this records what a downstream decision
// can act on. Ten work kinds collapse to four business types because the writer's
// behaviour genuinely branches four ways — and `primaryRole` keeps the
// distinction the collapse would otherwise throw away.

// ⚖️ CANONICALISATION MAY ADD ABSTRACTIONS. IT MUST NOT DISCARD DISTINCTIONS
// THAT HAVE NAMED DOWNSTREAM BEHAVIOUR.
//
// ⚠️ THIS MODULE BRIEFLY GOT THAT BACKWARDS. Ten work kinds were collapsed to
// four roles and the original thrown away — but the writer's ten `WORK_KIND_LINES`
// each change what gets written: a SaaS founder talks about users, workflows and
// adoption; an ecommerce founder about customers, orders and margins; a
// consultant about clients, engagements and outcomes. Those are different nouns,
// different examples and sometimes a different CTA, not cosmetics. Deleting the
// distinction here and hoping the writer recovers it later is asking a machine
// to un-lose information somebody deliberately dropped.
//
// ⚖️ SO BOTH ARE KEPT. `workKind` is the creator's confirmed answer at full
// resolution; `primaryRole` is the abstraction derived FROM it, for consumers
// that plan broadly. The test for any future field is the same: if two options
// behave differently anywhere downstream, they stay distinct in canonical truth.

export const CANONICAL_ROLES = ['creator', 'founder', 'service_provider', 'professional'] as const
export type CanonicalRole = (typeof CANONICAL_ROLES)[number]

export const CANONICAL_BUSINESS = ['none', 'software', 'physical', 'service'] as const
export type CanonicalBusiness = (typeof CANONICAL_BUSINESS)[number]

export const CANONICAL_LEVELS = ['beginner', 'intermediate', 'expert', 'mixed'] as const
export type CanonicalLevel = (typeof CANONICAL_LEVELS)[number]

export const CANONICAL_RELATIONSHIPS = [
  'OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR', 'REVIEW_ONLY', 'NONE',
] as const
export type CanonicalRelationship = (typeof CANONICAL_RELATIONSHIPS)[number]

/** ⚠️ TOTAL. A new work kind is a compile error until somebody decides which
 *  role it is — which is the cheapest place in the system to be made to think. */
const ROLE_OF: Record<BriefWorkKind, CanonicalRole> = {
  creator: 'creator',
  founder: 'founder',
  coach: 'service_provider',
  freelancer: 'service_provider',
  professional: 'professional',
  // ⚠️ SOMEBODY WHO RUNS A SHOP IS RUNNING A BUSINESS THEY BUILT. `founder` is
  // the broad bucket for "the commercial entity is theirs"; what they actually
  // sell stays in `workKind`, which is where the writer reads it.
  ecommerce: 'founder',
  // ⚠️ THE ONE MAPPING I AM LEAST SURE OF, AND IT IS FLAGGED RATHER THAN HIDDEN.
  // A brand account is not a person — not a founder speaking, not a practitioner
  // — and none of the four roles is really it. It sits here because the broad
  // question ("is the commercial entity theirs?") answers yes, and because
  // `workKind: 'brand'` still carries the instruction that actually matters:
  // write in the brand's voice, avoid first-person claims only a named person
  // could make. If the abstraction turns out to be load-bearing for a brand
  // team, the answer is a fifth role, not a quieter mapping.
  brand: 'founder',
  saas: 'founder',
  local_service: 'service_provider',
  // ⚖️ `other` CARRIES THE CREATOR'S OWN SENTENCE and the role cannot be derived
  // from a free-text answer. `creator` is the least-licensing bucket, which is
  // the right way to be wrong.
  other: 'creator',
}

/** ⚖️ WHAT KIND OF THING THEY SELL, WHICH IS NOT THE SAME QUESTION AS WHO THEY
 *  ARE. It decides whether a scene can physically show the product — a Director
 *  Plan question — and `other` is `none` because an unknown business is not a
 *  physical one, and guessing towards "showable" puts somebody in front of a
 *  camera holding something they may not own. */
const BUSINESS_OF: Record<BriefWorkKind, CanonicalBusiness> = {
  creator: 'none',
  founder: 'software',
  coach: 'service',
  freelancer: 'service',
  professional: 'service',
  ecommerce: 'physical',
  brand: 'physical',
  saas: 'software',
  local_service: 'service',
  other: 'none',
}

const LEVEL_OF: Record<AudienceKnowledge, CanonicalLevel> = {
  beginners: 'beginner',
  basics: 'intermediate',
  experienced: 'expert',
  mixed: 'mixed',
}

/** ⚠️ ORDERED BY WHAT EACH LICENSES, NOT ALPHABETICALLY, because the reducer
 *  below takes the FIRST match and the order therefore decides the answer. */
const RELATIONSHIP_OF: Record<CommercialTie, CanonicalRelationship> = {
  own_product: 'OWN_PRODUCT',
  own_service: 'OWN_SERVICE',
  affiliate: 'AFFILIATE',
  sponsor: 'SPONSOR',
  review: 'REVIEW_ONLY',
  none: 'NONE',
}

/** ⚖️ THE MOST PERMISSIVE TIE WINS, AND IT IS STATED RATHER THAN INCIDENTAL. A
 *  creator who owns a product AND has affiliate links is an owner; reducing them
 *  to `AFFILIATE` would forbid them from saying "we built this" about their own
 *  software. The reverse error — reading an affiliate as an owner — is the one
 *  that puts a false claim in somebody's mouth, so the order runs from most to
 *  least authority and never the other way. */
const TIE_PRECEDENCE: readonly CommercialTie[] = [
  'own_product', 'own_service', 'affiliate', 'sponsor', 'review', 'none',
]

// ── THE CANONICAL CREATOR ─────────────────────────────────────────────────

export interface CreatorProfile {
  /** ⚠️ THE CREATOR'S ANSWER AT FULL RESOLUTION, and the field the writer reads.
   *  Ten values, because ten of them change what a script says. */
  workKind: Provenanced<BriefWorkKind> | null
  /** ⚖️ DERIVED FROM `workKind`, NEVER ASKED. It carries `source: 'inferred'`
   *  with `derivedFrom: 'workKind'`, so a reader can tell a computed abstraction
   *  from something a person asserted — and recompute it if the answer changes. */
  role: Provenanced<CanonicalRole> | null
  businessType: Provenanced<CanonicalBusiness> | null
  audienceSegment: Provenanced<AudienceSegment> | null
  audienceLevel: Provenanced<CanonicalLevel> | null
  goals: Provenanced<readonly BriefGoal[]> | null
  /** ⚠️ ONE VALUE, NOT THE LIST. Permission is decided against a single
   *  relationship, and handing downstream code an array would make every reader
   *  re-derive which member counts — the drift this module exists to end. */
  relationship: Provenanced<CanonicalRelationship> | null
  /** The creator's own closing words, when they typed some. */
  defaultCta: Provenanced<string> | null
}

/** ⚠️ EVERY FIELD IS NULLABLE AND null MEANS UNANSWERED, NOT "no". The three-state
 *  rule this codebase runs on: an absent relationship is not `NONE`, and a
 *  creator who never reached the question has not said they sell nothing. */
export interface AssembleInput {
  answers?: CreatorProfileAnswers | null
  /** What the creator typed as their standing CTA, if anything. */
  defaultCta?: string | null
  /** Stamped on every field. Passed in so assembly stays a pure function —
   *  `Date.now()` inside would make the output untestable. */
  now: string
}

const confirmed = <T>(value: T, raw: unknown, now: string): Provenanced<T> => ({
  value, rawValue: raw, source: 'user_answer', updatedAt: now,
})

/** ⚖️ AN ABSTRACTION COMPUTED FROM AN ANSWER IS NOT ITSELF AN ANSWER. Stamping
 *  a derived role `user_answer` would let it authorise things the creator never
 *  said — the exact confusion `mayUseOwnershipLanguage` refuses one file over. */
const derived = <T>(value: T, from: string, now: string): Provenanced<T> => ({
  value, source: 'inferred', derivedFrom: from, updatedAt: now,
})

/**
 * Build the canonical creator from what the creator actually said.
 *
 * ⚖️ EVERY FIELD HERE ARRIVES `user_answer`, BECAUSE EVERY INPUT IS AN ANSWER.
 * Observed and inferred traits — tone, POV, recurring style — come from the DNA
 * extractor and are merged separately, carrying their own evidence. Mixing the
 * two paths in one function is how an inference acquires an assertion's
 * authority, so they stay apart.
 */
export function assembleCreatorProfile(input: AssembleInput): CreatorProfile {
  const a = input.answers ?? {}
  const now = input.now

  const workKind = a.workKind ?? null
  const knowledge = a.audienceKnowledge ?? null
  const ties = a.commercialTies ?? null
  const goals = a.contentGoals ?? null
  const cta = typeof input.defaultCta === 'string' ? input.defaultCta.trim() : ''

  // ⚠️ THE FIRST TIE IN PRECEDENCE ORDER, NOT THE FIRST THE CREATOR TAPPED. Tap
  // order is an accident of the interface and must never decide what a script
  // may claim.
  const tie = ties && ties.length > 0
    ? (TIE_PRECEDENCE.find((t) => ties.includes(t)) ?? null)
    : null

  return {
    workKind: workKind ? confirmed(workKind, workKind, now) : null,
    role: workKind ? derived(ROLE_OF[workKind], 'workKind', now) : null,
    businessType: workKind ? confirmed(BUSINESS_OF[workKind], workKind, now) : null,
    audienceSegment: a.audience ? confirmed(a.audience, a.audience, now) : null,
    audienceLevel: knowledge ? confirmed(LEVEL_OF[knowledge], knowledge, now) : null,
    // ⚖️ AN EMPTY LIST IS UNANSWERED, exactly as `[]` and absent are the same
    // fact everywhere else in this codebase.
    goals: goals && goals.length > 0 ? confirmed(goals, goals, now) : null,
    relationship: tie ? confirmed(RELATIONSHIP_OF[tie], tie, now) : null,
    defaultCta: cta !== '' ? confirmed(cta, input.defaultCta, now) : null,
  }
}

// ── PROJECTIONS: WHAT EACH STAGE IS ALLOWED TO KNOW ───────────────────────
//
// ⚠️ TWO FAILURES, ONE MECHANISM. Handing a prompt builder a `Provenanced<T>`
// interpolates as `[object Object]` — silently, in a codebase that builds most
// of its prompts by interpolation. And handing the writer the whole profile lets
// it read fields it has no authority over.
//
// ⚖️ A PROJECTION SOLVES BOTH: plain values, so there is nothing to interpolate
// wrongly, and only the permitted fields, so there is nothing to leak.

export interface WriterView {
  role: CanonicalRole | null
  /** ⚠️ THE HIGH-RESOLUTION ANSWER, BECAUSE THIS IS WHERE IT EARNS ITS KEEP. The
   *  role says founder-led rather than creator-led; the work kind decides whether
   *  the nouns are users and adoption, orders and margins, or clients and
   *  engagements. A writer given only the role writes generic founder copy. */
  workKind: BriefWorkKind | null
  audienceSegment: AudienceSegment | null
  audienceLevel: CanonicalLevel | null
}

/** ⚠️ NO RELATIONSHIP FIELD, DELIBERATELY. Whether a script may use ownership
 *  language is decided ONCE, by the planner, and reaches the writer as a
 *  restriction. A writer that could see the relationship would be a writer that
 *  could reason about it — the second interpretation this module abolishes. */
export function toWriterView(p: CreatorProfile): WriterView {
  return {
    role: p.role?.value ?? null,
    workKind: p.workKind?.value ?? null,
    audienceSegment: p.audienceSegment?.value ?? null,
    audienceLevel: p.audienceLevel?.value ?? null,
  }
}

export interface PlannerView {
  role: CanonicalRole | null
  businessType: CanonicalBusiness | null
  audienceSegment: AudienceSegment | null
  audienceLevel: CanonicalLevel | null
  goals: readonly BriefGoal[]
  relationship: CanonicalRelationship | null
  /** ⚖️ THE PERMISSION, NOT THE EVIDENCE FOR IT. The planner is told what it may
   *  authorise; it does not re-derive that from a provenance it would have to
   *  interpret. See `mayUseOwnershipLanguage` in `authority.ts`. */
  mayUseOwnershipLanguage: boolean
  defaultCta: string | null
}

export function toPlannerView(p: CreatorProfile): PlannerView {
  const rel = p.relationship
  return {
    role: p.role?.value ?? null,
    businessType: p.businessType?.value ?? null,
    audienceSegment: p.audienceSegment?.value ?? null,
    audienceLevel: p.audienceLevel?.value ?? null,
    goals: p.goals?.value ?? [],
    relationship: rel?.value ?? null,
    // ⚠️ THE SAME RULE `authority.ts` STATES, APPLIED TO THE CANONICAL VALUES.
    // An observed or inferred relationship authorises nothing, however strong.
    mayUseOwnershipLanguage: rel?.source === 'user_answer'
      && (rel.value === 'OWN_PRODUCT' || rel.value === 'OWN_SERVICE'),
    defaultCta: p.defaultCta?.value ?? null,
  }
}
