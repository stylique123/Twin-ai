// WHICH PRODUCT THIS VIDEO IS ABOUT, AND WHO GETS TO DECIDE.
//
// ⚠️ THE WRITER MUST NEVER CHOOSE, AND THAT IS THE WHOLE RULE. Picking among
// three products would have Twin infer commercial intent from nothing the
// creator said — the same entitlement `entryDoor.ts` keeps a mutation-tested
// clamp against. A creator who owns a course, a template pack and a coaching
// offer has not said which this video is for by owning all three.
//
// ⚠️ WHAT SHIPPED BEFORE THIS WAS OLDEST-FIRST, A LABELLED STOPGAP.
// `generate-blueprint` reads `.order('created_at').limit(1)` — deterministic,
// so the same creator gets the same product every time rather than whatever
// the planner returned, and still not "the one this video is about". Three of
// five real accounts own two things.
//
// ⚖️ SO THE CHOICE BECOMES AN INPUT. One product auto-selects because there is
// nothing to decide. Several means the creator says which, on the card that
// already asks what this video is for. A video that is not commercial gets
// none at all, whatever they own.

export type NoProductReason =
  /** They have not registered one. Not a failure; most videos sell nothing. */
  | 'no_products'
  /** Two or more, and nobody has asked yet. The writer does NOT break the tie. */
  | 'creator_has_not_chosen'
  /** Not a selling video. Owning something is not a reason to pitch it. */
  | 'not_a_commercial_video'
  /** An id that is not theirs. Never silently swapped for one that is. */
  | 'choice_not_theirs'
  /** They were asked and said none of them. An ANSWER — the card is finished
   *  and must not ask again. */
  | 'creator_chose_none'

export type ProductChoice =
  | { kind: 'auto'; productId: string }
  | { kind: 'chosen'; productId: string }
  /**
   * ⚠️⚠️ NAMED, NOT SOLD, AND IT IS A THIRD THING RATHER THAN A WEAKER `chosen`.
   *
   * A creator teaching her skincare routine, using her own serum, had NO WAY to
   * name it: the goal is `educate`, the focus is `advice`, so
   * `showsCommercialBlock` is false and the product was refused entirely with
   * `not_a_commercial_video`. The four-doors note already claims "mentioning a
   * product in an idea video is a different thing and stays available
   * everywhere" — it was not available anywhere, and this is what makes the
   * sentence true.
   *
   * ⚖️ IT CARRIES STRICTLY FEWER PERMISSIONS THAN `chosen`, NEVER MORE. The
   * writer may say its NAME. It may not make marketing claims, may not build
   * the script's substance on its facts, and may not ask for a sale — those all
   * belong to a video that decided it was about the product. `MENTION_RULES`
   * states this in one place and the prompt reads it.
   *
   * ⚠️ AND DISCLOSURE IS UNAFFECTED, WHICH IS THE WHOLE SAFETY ARGUMENT.
   * `disclosureRequiredFor` keys on the RELATIONSHIP, not on whether the video
   * sells, so a sponsored product named in an educational video still discloses
   * — and that case matters MORE than the selling one, because an ad that does
   * not look like an ad is the one a viewer cannot discount for themselves.
   */
  | { kind: 'mention'; productId: string }
  | { kind: 'none'; reason: NoProductReason }

/** What a mention may and may not do. One place, read by the client and
 *  mirrored into the prompt. */
export const MENTION_RULES = Object.freeze({
  mayName: true,
  mayMakeMarketingClaims: false,
  mayBuildSubstanceOnIt: false,
  mayAskForTheSale: false,
})

import { claimRulesFor, type EntityRelationship, type PersonalUse } from './productEntity'

export interface ProductSelectionInput {
  /** Ids this creator owns, in whatever order the store returned them. */
  ownedProductIds: readonly string[]
  /** What they picked for THIS video, if they were asked. */
  chosenId?: string | null
  /**
   * May this video carry a product at all? The caller decides — it is the
   * commercial determination the rest of the pipeline already makes, and
   * duplicating that judgement here would give it two homes.
   */
  mayUseAProduct: boolean
}

/**
 * ⚖️ THE ORDER OF THESE BRANCHES IS THE POLICY, not an implementation detail.
 *
 * The commercial gate comes FIRST, so an explicit choice cannot unlock a
 * product on a video that may not carry one — otherwise "I picked my course"
 * would quietly override the creative decision that this is not a selling
 * video, which is the CTA bug in a different costume.
 *
 * Membership is checked BEFORE any fallback, so an id that is not theirs is a
 * refusal rather than a different product. Substituting silently is how a
 * script comes back about something the creator never mentioned.
 */
export function selectProduct(input: ProductSelectionInput): ProductChoice {
  // THE NULL CHECK PRECEDES THE TRIM. null, undefined and '' all mean "not
  // asked or not answered", and none of them is an id.
  const chosen = typeof input.chosenId === 'string' ? input.chosenId.trim() : ''

  // ── THE COMMERCIAL GATE STILL COMES FIRST, AND STILL REFUSES ────────────
  //
  // ⚠️ THE ORIGINAL RULE IS UNCHANGED AND ITS REASON STILL HOLDS: an explicit
  // choice may not unlock a product as the SUBJECT of a video that decided it
  // was not selling — "I picked my course" overriding that is the CTA bug in a
  // different costume. Nothing below returns `chosen` or `auto` from here.
  //
  // ⚖️ WHAT CHANGES IS THAT REFUSAL IS NO LONGER THE ONLY ANSWER. An id the
  // creator TYPED, for a product she owns, becomes a `mention` — permitted to
  // be named and nothing else. Silence still yields nothing: `auto` is
  // deliberately unreachable here, because auto-selecting on a video with no
  // commercial intent would put a product in a script she never asked to
  // mention, and "the writer never picks which product" is a rule with a
  // mutation-tested clamp behind it.
  if (!input.mayUseAProduct) {
    if (chosen === '' || chosen === NO_PRODUCT_CHOICE) {
      return { kind: 'none', reason: 'not_a_commercial_video' }
    }
    return input.ownedProductIds.includes(chosen)
      ? { kind: 'mention', productId: chosen }
      : { kind: 'none', reason: 'choice_not_theirs' }
  }

  // ⚠️ "NEITHER" IS AN ANSWER AND MUST BE READ BEFORE MEMBERSHIP. Falling to
  // the id check would report `choice_not_theirs` — "that product is not in
  // your library" — for a creator who said they meant none of them, which
  // blames them for answering.
  if (chosen === NO_PRODUCT_CHOICE) return { kind: 'none', reason: 'creator_chose_none' }
  if (chosen !== '') {
    return input.ownedProductIds.includes(chosen)
      ? { kind: 'chosen', productId: chosen }
      : { kind: 'none', reason: 'choice_not_theirs' }
  }

  if (input.ownedProductIds.length === 0) return { kind: 'none', reason: 'no_products' }
  if (input.ownedProductIds.length === 1) {
    // ⚖️ AUTO IS NOT THE WRITER CHOOSING. With one product there is no tie to
    // break and no intent to infer — arithmetic, not judgement.
    return { kind: 'auto', productId: input.ownedProductIds[0] }
  }
  return { kind: 'none', reason: 'creator_has_not_chosen' }
}

/** Should the card ask? Read by V2Building, which builds the chips. */
export function mustAskWhichProduct(input: ProductSelectionInput): boolean {
  const choice = selectProduct(input)
  return choice.kind === 'none' && choice.reason === 'creator_has_not_chosen'
}

/** The field the answer travels under, named once so the screen that writes it
 *  and the send that reads it cannot disagree. */
export const PRODUCT_CHOICE_FIELD = 'selected_product'

/** Plain English for a creator, never a reason code on a screen. */
export const NO_PRODUCT_EXPLANATION: Record<NoProductReason, string> = {
  no_products: 'No product is in your library yet, so this script will not point at one.',
  creator_has_not_chosen: 'Pick which one this video is about.',
  creator_chose_none: 'You said this video is not about any of your products, so it will not name one.',
  not_a_commercial_video: 'This video is not selling anything, so it will not mention a product.',
  choice_not_theirs: 'That product is not in your library. Pick one that is.',
}

// ── "NEITHER" IS AN ANSWER, NOT AN UNANSWERED QUESTION ────────────────────
//
// ⚠️ WITHOUT IT THE CARD CANNOT BE FINISHED. `mustAskWhichProduct` asks while
// `chosenId` is empty, so a creator whose commercial video is about none of
// their three products had two ways out: pick one that is wrong, or abandon the
// build. A question with no honest answer is worse than no question.
//
// ⚖️ AND IT IS A DIFFERENT FACT FROM "NOT A SELLING VIDEO". That one is a
// creative determination made upstream; this is the creator saying "this one is
// commercial and it is about none of these". Collapsing them would report a
// decision they did not make.
export const NO_PRODUCT_CHOICE = 'none'

/** The plain sentence a creator reads beside each option, so the choice is not
 *  made blind.
 *
 *  ⚖️ DERIVED FROM `claimRulesFor`, NEVER RESTATED. This is a READER for the
 *  entitlement rule that already exists — if the rule changes, this sentence
 *  changes with it. A second copy of "what may this product claim" is exactly
 *  the two-derivations defect that the capability question just had. */
export function productChoiceConstraint(
  relationship: EntityRelationship,
  personalUse: PersonalUse = 'NOT_CONFIRMED',
): string {
  const rules = claimRulesFor(relationship, personalUse)
  const parts: string[] = []
  if (rules.disclosureRequired) parts.push('this one has to be disclosed as paid')
  if (!rules.creatorExperience) parts.push('you have not told us you use it, so the script cannot say what it did for you')
  if (rules.marketingClaims === 'forbidden') parts.push('no marketing claims about it')
  // ⚠️ `attributed`, NOT `attributed_only` — the compiler caught my fourth
  // invented enum value in this project (TS2367). The union is the authority
  // and typing this field loosely is what makes the mistake possible.
  else if (rules.marketingClaims === 'attributed') parts.push('claims about it must be attributed to the maker')
  if (parts.length === 0) return 'Yours, and you use it — the script can speak from experience.'
  return `${parts.join('; ')}.`.replace(/^./, (c) => c.toUpperCase())
}
