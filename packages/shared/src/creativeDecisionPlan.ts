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
import type { CanonicalRelationship, CanonicalLevel, PlannerView } from './profileAssembler'
import type { ContainerType, HookMechanism } from './referenceContentProfile'
import type { ProductionMode } from './referenceProfile'

/** How present the creator's own product is allowed to be.
 *
 *  ⚠️ THE SMALL FIELD THAT STOPS EVERY FOUNDER VIDEO BECOMING AN ADVERT. A
 *  product library is something the writer MAY use, not something it must
 *  mention; without this field the only signals are "products exist" and "the
 *  goal is not sell", and a model handed both writes a commercial anyway.
 *
 *  ⚖️ FOUR STEPS, BECAUSE "MENTION IT OR DO NOT" IS NOT THE REAL RANGE. A tool
 *  used as one example among three is a different video from one the whole
 *  script is about, and both are different from a passing credential. */
export const PRODUCT_ROLES = ['none', 'example', 'supporting', 'primary'] as const
export type ProductRole = (typeof PRODUCT_ROLES)[number]

/** What the video is for, decided once.
 *
 * ⚠️ EVERY FIELD HERE IS A DECISION, AND NONE OF THEM IS PROSE. The plan says
 * what is being made; it never says a sentence that could reach a viewer. A
 * string that turns up in the finished script would make this stage a writer,
 * and then two stages would be writing.
 *
 * ⚖️ CONTENT SOURCES ARE DELIBERATELY ABSENT. "Where does this fact come from"
 * is a property of a SLOT, not of a plan — slot 1 from the product library,
 * slot 3 research-required — and a plan-level list would have to be re-matched
 * to slots by whoever read it. The container resolver carries it per slot,
 * which is the only place the answer is unambiguous. */
export interface CreativeDecisionPlan {
  objective: VideoGoal
  focus: ContentFocus | null
  /** ⚠️ THIS CHANGES WORDING, NOT A LABEL IN A PROMPT. Beginner explains its
   *  terms; expert skips the introduction entirely. Null means unasked, and the
   *  writer is told to pitch for a mixed room rather than guessing. */
  audienceLevel: CanonicalLevel | null
  /** What the video is about, and the specific take on it. Both are short
   *  noun phrases decided by the premise selector — never a sentence. */
  topic: string | null
  angle: string | null
  /** How it will be made and roughly how long. `null` means undecided rather
   *  than "whatever the writer likes". */
  format: ProductionMode | null
  targetSeconds: number | null
  /** How this reference organises attention, and how it opens. Taken from the
   *  reference's own assessed structure rather than chosen freshly, which is
   *  what makes the adaptation a transfer instead of an imitation. */
  structure: ContainerType | null
  hookStrategy: HookMechanism | null
  /** ⚖️ HOW PRESENT THE PRODUCT MAY BE, decided before prose. */
  productRole: ProductRole
  /** Things this script may not do, in the creator's own terms — a claim they
   *  will not make, a competitor they will not name. Carried so the writer and
   *  the validator read the SAME list. */
  restrictions: readonly string[]
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
  'PRODUCT_ROLE_WITHOUT_PRODUCT',
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
 * A plan with every decision at its undecided value.
 *
 * ⚠️ SPREAD THIS RATHER THAN WRITING A LITERAL. A fixture or a caller that
 * builds a plan by hand silently omits every field added after it was written,
 * and an omitted DECISION reads as `undefined` at the point that obeys it —
 * which is how a new field ships enforced nowhere.
 *
 * ⚖️ `productRole` DEFAULTS TO `none`, not to whatever the products list
 * implies. Selecting a product makes it available to the writer; it does not
 * ask for a video about it.
 */
export function blankPlan(objective: VideoGoal): CreativeDecisionPlan {
  return {
    objective,
    focus: null,
    audienceLevel: null,
    topic: null,
    angle: null,
    format: null,
    targetSeconds: null,
    structure: null,
    hookStrategy: null,
    productRole: 'none',
    restrictions: [],
    products: [],
    ownershipLanguage: false,
    commercialCta: false,
    disclosureRequired: false,
    cta: null,
  }
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

  // ⚠️ A ROLE FOR A PRODUCT THAT IS NOT IN THE PLAN. The writer would be told
  // to build the video around something it was never given, and the most likely
  // repair is the worst one: inventing a product to fill the hole.
  // A plan that never settled a role has not asked for one — an absent
  // decision is not the same as a decision to feature something.
  if (plan.productRole && plan.productRole !== 'none' && !hasProduct) {
    out.push({
      code: 'PRODUCT_ROLE_WITHOUT_PRODUCT',
      message: 'This plan builds the video around a product, and none is selected.',
      remedies: [
        'Pick which product this video is about',
        'Let the script talk about the topic without a product',
      ],
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
