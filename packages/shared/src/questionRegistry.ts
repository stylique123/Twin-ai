// ONE QUESTION OWNS ONE FACT.
//
// Twin currently learns the same truth in four places with four wordings and
// four authorities: onboarding asks it, the DNA review asks it again, "what can
// appear in your videos" asks a third version, and the Product Library asks a
// fourth — and some of those answers are meaningless for the product type the
// creator actually picked. A consultant is asked whether they can screen-record
// a book.
//
// This module is the fix, and it is deliberately not a UI change. It is the
// registry every screen must consult:
//
//   • every fact has exactly ONE owning layer
//   • every question names the canonical field it writes
//   • every question names a DOWNSTREAM READER, or it does not exist
//   • every question states the condition under which it is even relevant
//   • an unanswered question is UNKNOWN, never a default
//
// ⚠️ THE PRUNING RULE, and it is the harshest one on purpose: a question with no
// named consumer is deleted, not kept "for later". Twin has shipped screens full
// of answers nothing reads — that is the inert-feature defect wearing a form.

/** The four things Twin learns, plus the per-video layer. A fact belongs to
 *  exactly one of them. */
export const LAYERS = [
  'CREATOR_PROFILE',   // who I am, who I speak to, what I want, what formats
  'CREATOR_DNA',       // how I communicate. OBSERVED, never asked.
  'PRODUCT_DNA',       // what one specific product is, and my relationship to it
  'PRODUCTION_PROFILE',// what I can physically film -- only where it is general
  'VIDEO_INTENT',      // what THIS video is for
] as const
export type Layer = (typeof LAYERS)[number]

/**
 * WHO WINS WHEN TWO LAYERS DISAGREE.
 *
 * ⚠️ THE ORDER IS THE POINT. A consultant who sells a physical book is not a
 * contradiction, and the only way it ever looked like one is that the creator's
 * JOB TYPE was allowed to imply what their PRODUCTS may be. It may not: identity
 * and product type are orthogonal, and the specific product's own confirmed
 * facts outrank any inference from the profile.
 */
export const AUTHORITY: Record<string, Layer> = {
  identity: 'CREATOR_PROFILE',
  audience: 'CREATOR_PROFILE',
  goals: 'CREATOR_PROFILE',
  desired_formats: 'CREATOR_PROFILE',
  voice: 'CREATOR_DNA',
  product_type: 'PRODUCT_DNA',
  product_relationship: 'PRODUCT_DNA',
  product_facts: 'PRODUCT_DNA',
  personal_use: 'PRODUCT_DNA',
  can_be_shown: 'PRODUCT_DNA',
  video_goal: 'VIDEO_INTENT',
  cta: 'VIDEO_INTENT',
  reference_use: 'VIDEO_INTENT',
}

/** ⚠️ CREATOR_DNA MAY OBSERVE, BUT IT MAY NOT OWN A COMMERCIAL FACT. It can say
 *  "often talks about offers"; it may never say "their product is X". The
 *  guessed-offer field on the DNA review screen was exactly that violation. */
export const OBSERVE_ONLY: Layer[] = ['CREATOR_DNA']

export type ProductType =
  | 'software' | 'mobile_app' | 'physical_product' | 'digital_product'
  | 'course' | 'service' | 'community'
export type Relationship = 'owned' | 'affiliate' | 'sponsored' | 'independent_review'

export interface AskContext {
  /** ⚠️ A LAYER-LEVEL PRECONDITION, not a per-question one. PRODUCT_DNA is asked
   *  once PER PRODUCT, so its questions exist only inside the add-product flow.
   *  Without this, a creator with nothing commercial was still "asked" for a
   *  product name, because the name question's own condition is about whether a
   *  URL extraction worked -- and no url is trivially true when there is no
   *  product at all. Scenario A caught it. */
  addingProduct?: boolean
  productType?: ProductType | null
  relationship?: Relationship | null
  commercialContentRelevant?: boolean | null
  hasSourceUrl?: boolean
  extractionSucceeded?: boolean | null
}

export interface Question {
  id: string
  /** The single field this question writes. Two questions may never share one. */
  canonicalField: string
  owner: Layer
  /** ⚠️ AT LEAST ONE, OR THE QUESTION IS DELETED. */
  consumers: string[]
  /** What changes in the output because of this answer. Prose, and it must name
   *  a behaviour -- "improves quality" is not a decision. */
  decisionChanged: string
  /** When this question is relevant at all. Absent means always. */
  askWhen?: (c: AskContext) => boolean
}

const SOFTWARE: ProductType[] = ['software', 'mobile_app']
const SHOWS_SCREENS: ProductType[] = ['digital_product', 'course', 'community']
/** ⚠️ OWNERSHIP ALREADY AUTHORISES "we built this". Asking an owner whether they
 *  have personally used their own product is not a permission question, it is
 *  noise -- and it appeared on every product regardless of type. */
const NEEDS_PERSONAL_USE: Relationship[] = ['affiliate', 'sponsored', 'independent_review']

export const QUESTIONS: readonly Question[] = Object.freeze([
  {
    id: 'creator_identity',
    canonicalField: 'CreatorProfile.identity.roles',
    owner: 'CREATOR_PROFILE',
    consumers: ['CreativeDecisionPlan'],
    // MULTI-SELECT. Forcing one identity is what produced the false
    // "consultant, therefore service-only" inference.
    decisionChanged: 'which authority language the writer may use about the creator',
  },
  {
    id: 'audience_who',
    canonicalField: 'CreatorProfile.audience.who',
    owner: 'CREATOR_PROFILE',
    consumers: ['CreativeDecisionPlan', 'Writer'],
    decisionChanged: 'who the script addresses and which examples land',
  },
  {
    id: 'audience_level',
    canonicalField: 'CreatorProfile.audience.level',
    owner: 'CREATOR_PROFILE',
    consumers: ['CreativeDecisionPlan'],
    decisionChanged: 'how much is explained before the payoff',
  },
  {
    id: 'content_goals',
    canonicalField: 'CreatorProfile.goals',
    owner: 'CREATOR_PROFILE',
    consumers: ['CreativeDecisionPlan', 'CTA'],
    decisionChanged: 'the payoff the script drives toward and the default CTA shape',
  },
  {
    id: 'desired_formats',
    canonicalField: 'CreatorProfile.desiredFormats',
    owner: 'CREATOR_PROFILE',
    consumers: ['ContainerResolution'],
    // ⚠️ OBSERVED FORMAT IS NOT PREFERENCE. What they already make is Creator
    // DNA's business; this is what they want NEXT.
    decisionChanged: 'which containers are eligible before ranking',
  },
  {
    id: 'format_adventurousness',
    canonicalField: 'CreatorProfile.formatAdventurousness',
    owner: 'CREATOR_PROFILE',
    consumers: ['ContainerResolution'],
    decisionChanged: 'how far a suggested container may sit from observed history',
  },
  {
    id: 'commercial_relevant',
    canonicalField: 'CreatorProfile.commercialContentRelevant',
    owner: 'CREATOR_PROFILE',
    consumers: ['SetupCompletion'],
    // ⚠️ A ROUTING FLAG, NOT AN INTERROGATION. The relationship itself belongs
    // to each product: one creator can own Twin, affiliate Claude, be sponsored
    // by Notion and review cameras independently, all at once. A single global
    // answer cannot represent that and must not try.
    decisionChanged: 'whether missing products count as an incomplete setup at all',
  },

  // ── PRODUCT_DNA. Asked once per product, never globally. ──────────────────
  {
    id: 'product_relationship',
    canonicalField: 'ProductDNA.relationship',
    owner: 'PRODUCT_DNA',
    consumers: ['ClaimEntitlement', 'Writer'],
    decisionChanged: 'which ownership and endorsement claims the writer may make',
  },
  {
    id: 'product_personal_use',
    canonicalField: 'ProductDNA.personalUse',
    owner: 'PRODUCT_DNA',
    consumers: ['ClaimEntitlement'],
    decisionChanged: 'whether the script may claim first-hand experience',
    askWhen: (c) => !!c.relationship && NEEDS_PERSONAL_USE.includes(c.relationship),
  },
  {
    id: 'product_screen_show',
    canonicalField: 'ProductDNA.production.screenShow',
    owner: 'PRODUCT_DNA',
    consumers: ['DirectorPlan'],
    decisionChanged: 'whether the director may request a screen demo',
    // ⚠️ NEVER FOR A BOOK. This is the question that made the whole flow look
    // careless, and it is the reason the global version had to die.
    askWhen: (c) => !!c.productType
      && (SOFTWARE.includes(c.productType) || SHOWS_SCREENS.includes(c.productType)),
  },
  {
    id: 'product_physical_availability',
    canonicalField: 'ProductDNA.production.physicalAvailability',
    owner: 'PRODUCT_DNA',
    consumers: ['DirectorPlan'],
    decisionChanged: 'whether the director may request a hold-the-product shot',
    askWhen: (c) => c.productType === 'physical_product',
  },
  {
    id: 'product_name',
    canonicalField: 'ProductDNA.name',
    owner: 'PRODUCT_DNA',
    consumers: ['Writer'],
    decisionChanged: 'what the product is called on screen and in the script',
    // ⚠️ DO NOT MAKE A HUMAN TYPE WHAT THE SYSTEM CAN EXTRACT. Asked only when
    // there is no URL, or the extraction actually failed.
    askWhen: (c) => !c.hasSourceUrl || c.extractionSucceeded === false,
  },
  {
    id: 'product_description',
    canonicalField: 'ProductDNA.description',
    owner: 'PRODUCT_DNA',
    consumers: ['Writer', 'ClaimEntitlement'],
    decisionChanged: 'what the script may say the thing actually is and does',
    askWhen: (c) => !c.hasSourceUrl || c.extractionSucceeded === false,
  },

  // ── VIDEO_INTENT. Per video, and it OVERRIDES the profile default. ────────
  {
    id: 'video_goal',
    canonicalField: 'VideoIntent.goal',
    owner: 'VIDEO_INTENT',
    consumers: ['CreativeDecisionPlan', 'CTA'],
    decisionChanged: 'the payoff and CTA of THIS video, without editing the profile',
  },
  {
    id: 'reference_use',
    canonicalField: 'VideoIntent.referenceUse',
    owner: 'VIDEO_INTENT',
    consumers: ['CreativeTransferPlan'],
    decisionChanged: 'how much of the reference structure is carried over',
  },
])

/** The adaptive engine: exactly the questions this context makes relevant. */
export function questionsToAsk(context: AskContext, layer?: Layer): Question[] {
  return QUESTIONS.filter((q) => (layer ? q.owner === layer : true))
    // The per-product layer does not exist outside a product.
    .filter((q) => q.owner !== 'PRODUCT_DNA' || context.addingProduct === true)
    .filter((q) => (q.askWhen ? q.askWhen(context) : true))
}

export const isAsked = (id: string, context: AskContext): boolean =>
  questionsToAsk(context).some((q) => q.id === id)

// ── the guards ───────────────────────────────────────────────────────────────

/** ⚠️ NO CONSUMER, NO QUESTION. */
export const questionsWithoutConsumer = (): string[] =>
  QUESTIONS.filter((q) => q.consumers.length === 0).map((q) => q.id)

/** ⚠️ TWO QUESTIONS WRITING ONE FIELD IS THE BUG THIS MODULE EXISTS FOR. */
export function fieldsAskedTwice(): string[] {
  const seen = new Map<string, string[]>()
  for (const q of QUESTIONS) seen.set(q.canonicalField, [...(seen.get(q.canonicalField) ?? []), q.id])
  return [...seen.entries()].filter(([, ids]) => ids.length > 1).map(([f]) => f)
}

/** ⚠️ AN OBSERVED LAYER MAY NOT OWN AN ASKED FACT. The guessed-offer input on
 *  the DNA review screen was Creator DNA claiming a commercial truth. */
export const questionsOwnedByAnObserver = (): string[] =>
  QUESTIONS.filter((q) => OBSERVE_ONLY.includes(q.owner)).map((q) => q.id)

/**
 * A skipped question is UNKNOWN.
 *
 * ⚠️ NOT FALSE, AND NOT A DEFAULT. Storing `beginner` for a skipped audience
 * level, or `cannot show` for a skipped capability, invents an answer the
 * creator never gave and then lets the director act on it.
 */
export const skipped = (): null => null
