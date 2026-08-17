// THE MODEL SUGGESTS. CODE CERTIFIES.
//
// ⚠️ A SCHEMA-VALID PLAN CAN STILL BE AN IMPOSSIBLE ONE. Structured output
// guarantees the SHAPE of what comes back and says nothing about whether it is
// allowed — a plan can name a product the creator never claimed, or instruct a
// pitch on a video that may not carry one, and satisfy every type in this file
// while doing it. So validation lives here, in code, and runs on the plan after
// the model has produced it.
//
// ⚖️ THIS IS THE BOUNDARY THE WHOLE ARCHITECTURE TURNS ON. Everything before the
// plan ESTABLISHES TRUTH — profile, products, reference, research. Everything
// after it EXECUTES DECISIONS — containers, writer, judge, director. A stage
// before the plan that makes a creative choice, or one after it that discovers a
// fact, is in the wrong place. That is testable rather than decorative.
//
// ⚠️ AND IT IS WHERE THE SELL/NO-OFFER CONTRADICTION BELONGS. Today a creator who
// picks "Sell something" with nothing claimed gets two instructions in one
// prompt: "SELL THE OFFER … Name it plainly at the end", and "NO COMMERCIAL CTA
// … whatever the stated goal". Both are correct in isolation and a model handed
// the pair picks one. Nobody decided which. `pipeline-scenarios.test.ts` pins
// that contradiction as it stands; the fix is to refuse the COMBINATION here,
// before a writer is called and before anybody is charged.

import type { VideoGoal, ContentFocus } from './videoIntent'
import type { CanonicalRelationship, PlannerView } from './profileAssembler'

/** What the video is for, decided once. */
export interface CreativeDecisionPlan {
  objective: VideoGoal
  focus: ContentFocus | null
  /** Product entity ids this video may speak about. Empty is a real answer. */
  products: readonly string[]
  /** ⚖️ THE PERMISSIONS, RESOLVED — not the evidence for them. Downstream stages
   *  obey these and never re-derive them from a relationship they would have to
   *  interpret, which is how two stages come to disagree. */
  ownershipLanguage: boolean
  commercialCta: boolean
  disclosureRequired: boolean
  /** The closing ask. Null means the plan did not settle one, which validation
   *  treats differently from an empty string. */
  cta: string | null
}

// ── WHAT MAKES A PLAN INVALID ─────────────────────────────────────────────

export const CDP_ERRORS = [
  'SELL_WITHOUT_COMMERCIAL_TARGET',
  'OWNERSHIP_WITHOUT_OWNED_PRODUCT',
  'COMMERCIAL_CTA_WITHOUT_RELATIONSHIP',
  'DISCLOSURE_MISSING_FOR_PAID_TIE',
] as const
export type CdpErrorCode = (typeof CDP_ERRORS)[number]

export interface CdpViolation {
  code: CdpErrorCode
  /** Plain English, addressed to the creator — this reaches a screen. */
  message: string
  /** What they can actually do about it. Never an instruction to "fix the plan". */
  remedies: readonly string[]
}

/**
 * ⚠️ `sell` IS THE ONLY GOAL THAT REQUIRES SOMETHING TO SELL, AND THIS LIST IS
 * WHY IT IS A SET RATHER THAN A BOOLEAN. `leads` is the trap: a coach, a
 * consultant, a realtor or a freelancer generates leads with nothing in the
 * product library — "DM me" and "book a call" need no product entity. Gating on
 * a `commercial === false` flag would block every one of them.
 *
 * ⚖️ SO THE RULE REASONS ABOUT WHAT THE GOAL ACTUALLY REQUIRES: `sell` asks the
 * viewer to buy a THING, and a thing that does not exist cannot be bought.
 */
const GOALS_REQUIRING_A_PRODUCT: ReadonlySet<VideoGoal> = new Set<VideoGoal>(['sell'])

const OWNING: ReadonlySet<CanonicalRelationship> = new Set<CanonicalRelationship>([
  'OWN_PRODUCT', 'OWN_SERVICE',
])
/** ⚖️ A COMMERCIAL ASK NEEDS A STAKE, AND THREE KINDS COUNT. An affiliate and a
 *  sponsor may tell people to go and get it; a reviewer with no tie may not,
 *  because there is nothing they are party to. */
const COMMERCIAL: ReadonlySet<CanonicalRelationship> = new Set<CanonicalRelationship>([
  'OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR',
])
/** A material connection the viewer is owed. */
const PAID: ReadonlySet<CanonicalRelationship> = new Set<CanonicalRelationship>([
  'AFFILIATE', 'SPONSOR',
])

/**
 * Certify a plan against the creator it was made for.
 *
 * ⚠️ RETURNS EVERY VIOLATION, NOT THE FIRST. A creator told to fix one thing,
 * who then hits the next, learns that the product cannot count. One pass, one
 * complete answer.
 *
 * ⚖️ AND IT TAKES THE PLANNER VIEW RATHER THAN THE PROFILE, so it physically
 * cannot consult a field the planner was not entitled to see. If validation
 * needed more, the view is what should change — visibly, in one place.
 */
export function validateCreativeDecisionPlan(
  plan: CreativeDecisionPlan,
  creator: PlannerView,
): CdpViolation[] {
  const out: CdpViolation[] = []
  const rel = creator.relationship
  const hasProduct = plan.products.length > 0

  // ⚠️ THE ONE THIS FILE WAS WRITTEN FOR. Refused here, so no writer is called
  // and nothing is charged — rather than softened in a prompt the model may
  // weigh against a contradicting instruction.
  if (GOALS_REQUIRING_A_PRODUCT.has(plan.objective) && !hasProduct) {
    out.push({
      code: 'SELL_WITHOUT_COMMERCIAL_TARGET',
      message: 'You asked for a video that sells, but nothing is selected to sell.',
      remedies: [
        'Pick a product or service for this video',
        'Add one to your Product Library',
        'Change what this video is for',
      ],
    })
  }

  // ⚠️ PERMISSION COMES FROM THE RELATIONSHIP. A goal may NARROW an existing
  // permission and may never GRANT one — the rule an unwired guard in this repo
  // already states, applied here where it can actually run.
  if (plan.ownershipLanguage && !(rel && OWNING.has(rel))) {
    out.push({
      code: 'OWNERSHIP_WITHOUT_OWNED_PRODUCT',
      message: 'This plan would say "we built this" about something you do not own.',
      remedies: ['Confirm you own it', 'Let the script talk about it without claiming it'],
    })
  }

  if (plan.commercialCta && !(rel && COMMERCIAL.has(rel))) {
    out.push({
      code: 'COMMERCIAL_CTA_WITHOUT_RELATIONSHIP',
      message: 'This plan would ask viewers to buy something you have no stake in.',
      remedies: ['Tell us your relationship to it', 'Ask for a follow or a comment instead'],
    })
  }

  // ⚖️ A PROPERTY OF THE ARRANGEMENT, NOT A PACING DECISION. A paid tie owes a
  // disclosure whether or not the plan found room for one.
  if (rel && PAID.has(rel) && !plan.disclosureRequired) {
    out.push({
      code: 'DISCLOSURE_MISSING_FOR_PAID_TIE',
      message: 'This is a paid or commissioned mention, so it has to be disclosed.',
      remedies: ['Keep the disclosure in the script'],
    })
  }

  return out
}

/** ⚖️ A PLAN IS EITHER CERTIFIED OR IT IS NOT. No "mostly valid" state, because a
 *  caller handed one would have to decide which violations it could live with —
 *  and that decision would then live in the caller, which is where this whole
 *  architecture is trying to stop decisions living. */
export function isCertified(
  plan: CreativeDecisionPlan,
  creator: PlannerView,
): boolean {
  return validateCreativeDecisionPlan(plan, creator).length === 0
}
