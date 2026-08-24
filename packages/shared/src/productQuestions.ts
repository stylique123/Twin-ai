// THE ADAPTIVE ENGINE, FINALLY PLUGGED IN.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// `questionRegistry.ts` already encodes which product questions are relevant to
// which product, including the one that named the whole problem -- "NEVER FOR A
// BOOK... the reason the global version had to die". It has been correct and
// complete and CALLED BY NOTHING since it was written. The Product Library asks
// every question of every product instead: a consultant registering a service is
// asked whether they have personally used it, and a book gets the same form as a
// SaaS dashboard.
//
// ⚠️ THIS FILE IS AN ADAPTER, NOT A SECOND ENGINE. The rules stay in the
// registry. Re-deciding them here would produce exactly the drift the registry
// was written to prevent, and there would then be two answers to "is this asked"
// with nothing to say which wins.
//
// ⚖️ THE TWO VOCABULARIES ARE GENUINELY DIFFERENT, WHICH IS THE ONLY REASON A
// MAPPING IS NEEDED. The registry speaks in product kinds ('software',
// 'physical_product'); the database speaks in entity types (SAAS,
// PHYSICAL_PRODUCT). Neither is wrong; they were written for different jobs.

import {
  questionsToAsk, type AskContext, type ProductType, type Relationship,
} from './questionRegistry'
import type { EntityType, EntityRelationship } from './productEntity'
// The showability rule is the AUTHORITY on whether a screen answer is used.
import { inferShowability } from './productEntity'

/**
 * ⚠️ `MARKETPLACE` AND `OTHER` MAP TO NULL, AND THAT IS A DECISION RATHER THAN A
 * GAP LEFT OPEN. The registry has no kind for either, and inventing one --
 * calling a marketplace 'software' because both live on a screen -- would gate a
 * capability question on a guess. A null kind asks NOTHING, so showability stays
 * UNKNOWN and no scene is built on the product.
 *
 * ⚖️ WHICH IS THE SAFE DIRECTION, NOT MERELY THE CAUTIOUS ONE. An unasked
 * question costs a creator a later edit in the Product Library. A wrongly-asked
 * one costs them a scene they cannot film, discovered with a phone in their hand.
 */
const KIND: Record<EntityType, ProductType | null> = {
  SAAS: 'software',
  APP: 'mobile_app',
  PHYSICAL_PRODUCT: 'physical_product',
  DIGITAL_PRODUCT: 'digital_product',
  COURSE: 'course',
  SERVICE: 'service',
  COMMUNITY: 'community',
  MARKETPLACE: null,
  OTHER: null,
}

/** ⚖️ OWNING A THING IS NOT USING IT, and the registry already says so: personal
 *  use is asked only where a commission or a sponsorship makes "I use this" a
 *  claim somebody could be misled by. An owner may say "we built this" without
 *  ever answering it. */
const TIE: Record<EntityRelationship, Relationship | null> = {
  OWN_PRODUCT: 'owned',
  OWN_SERVICE: 'owned',
  AFFILIATE: 'affiliate',
  SPONSOR: 'sponsored',
  REVIEW_ONLY: 'independent_review',
  NONE: null,
}

export interface ProductFormContext {
  type: EntityType | null
  relationship: EntityRelationship | null
  /** True once a link has been supplied — the registry uses it to stop asking a
   *  human for a name the extractor can read. */
  hasSourceUrl?: boolean
  extractionSucceeded?: boolean | null
}

/** The question ids this product actually warrants, straight from the registry. */
export function productQuestionIds(c: ProductFormContext): string[] {
  const ctx: AskContext = {
    // ⚠️ REQUIRED, AND ITS ABSENCE WAS A REAL BUG THE REGISTRY DOCUMENTS: without
    // it a creator with nothing commercial was still "asked" for a product name.
    addingProduct: true,
    productType: c.type ? KIND[c.type] : null,
    relationship: c.relationship ? TIE[c.relationship] : null,
    hasSourceUrl: c.hasSourceUrl ?? false,
    extractionSucceeded: c.extractionSucceeded ?? null,
  }
  return questionsToAsk(ctx, 'PRODUCT_DNA').map((q) => q.id)
}

const has = (c: ProductFormContext, id: string) => productQuestionIds(c).includes(id)

/** Has this creator's answer made "have you used it?" a real question? */
export const asksPersonalUse = (c: ProductFormContext): boolean =>
  has(c, 'product_personal_use')

/** ⚠️ THE BOOK-AND-SCREEN-RECORDER QUESTION. */
export const asksScreenShow = (c: ProductFormContext): boolean =>
  has(c, 'product_screen_show')

/** Can they have the thing with them while filming? Objects only. */
export const asksPhysicalAvailability = (c: ProductFormContext): boolean =>
  has(c, 'product_physical_availability')

/** ⚖️ ONE CAPABILITY QUESTION AT MOST, AND NEVER BOTH. A thing is either an
 *  object in the room or a thing on a screen; asking both would reintroduce the
 *  universal form in a smaller costume. */
export function capabilityQuestion(c: ProductFormContext): 'screen' | 'physical' | null {
  if (asksPhysicalAvailability(c)) return 'physical'
  // ⚠️ THE SAME FACT WAS ASKABLE ON ONE SURFACE AND NOT THE OTHER, and that is
  // the "one question owns one fact" break rather than a missing question.
  // MEASURED 2026-08-24: `inferShowability` puts MARKETPLACE and OTHER on the
  // SCREEN branch and will turn `canRecordScreen: true` into ALWAYS for both --
  // so onboarding can and does collect that answer. The Library could not,
  // because `KIND` maps both to null and the registry therefore asks nothing.
  // One creator answered it on the scan screen; the identical creator arriving
  // through the Library was never given the chance.
  //
  // ⚖️ AND THE KIND MAP IS STILL RIGHT TO REFUSE. Its comment warns against
  // "calling a marketplace 'software' because both live on a screen" -- inventing
  // a registry TAXONOMY entry on a guess. That warning is about what KIND of
  // product this is. This is a different question: can you record a screen. The
  // fix is not to guess a kind, it is to stop deriving a capability question
  // from a taxonomy that was never meant to answer it, and ask the SAME
  // authority the showability rule asks.
  //
  // ⚖️ NOTHING NEW IS ASKED OF A CREATOR WHOSE ANSWER WOULD BE IGNORED. If
  // inferShowability cannot consume a screen answer for this type -- SERVICE and
  // COMMUNITY are NEVER whatever they say -- this still returns null.
  // ⚠️ AND IT CUTS BOTH WAYS, WHICH IS THE HALF I DID NOT EXPECT. COMMUNITY was
  // ASKED "can you record your screen to show it?" and inferShowability returns
  // NEVER for a community whatever they answer -- true, false, unset, all NEVER.
  // The answer was collected and discarded. That is the founding defect of this
  // whole rebuild, in miniature, and it was already shipped.
  if (c.type === null) return asksScreenShow(c) ? 'screen' : null
  return screenAnswerIsUsed(c.type) ? 'screen' : null
}

/** Would the showability rule actually CONSUME a `canRecordScreen` answer for
 *  this type? The single authority on that is `inferShowability` itself, asked
 *  rather than re-derived — a second hand-written list of screen types is
 *  exactly the drift this file already documents elsewhere. */
export function screenAnswerIsUsed(type: EntityType): boolean {
  // ⚠️ ONE CONDITION, BECAUSE THE SECOND ONE COULD NOT FAIL. This first read
  // `=== 'ALWAYS' && inferShowability(type, { canRecordScreen: false }) ===
  // 'NEVER'`, which looked more careful and was not: deleting that clause left
  // all 14 cases green, because no type answers ALWAYS to true without
  // answering NEVER to false. A verdict nothing can falsify is a failure -- the
  // rule this repo already ships under that name -- so the clause is gone rather
  // than kept as decoration that a reader would mistake for a tested guarantee.
  return inferShowability(type, { canRecordScreen: true }) === 'ALWAYS'
}

/** What the creator actually reads. Plain English, and the wording differs
 *  because the ACTION differs — "can you record your screen" and "can you have it
 *  with you" are not the same favour to ask of somebody. */
export const CAPABILITY_PROMPT: Record<'screen' | 'physical', string> = {
  screen: 'Can you record your screen to show it?',
  physical: 'Can you have it with you when you film?',
}
