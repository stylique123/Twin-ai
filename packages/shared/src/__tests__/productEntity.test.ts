// THE ENTITY LIBRARY — the two axes, and the rules that only work while they
// stay separate.
//
// Three things carry this file:
//
//   1. Q3 MINTS OWNERSHIP, so Q4 never re-asks it. The standing rule "no
//      question may re-ask what another answer implies", made executable.
//   2. A COMMERCIAL TIE IS NOT PERSONAL EXPERIENCE. §12's correction, and the
//      rule most likely to be "simplified" away by a future reader.
//   3. REVIEW_ONLY CARRIES NO MARKETING CLAIM. A reviewer repeating a vendor's
//      copy is an advertisement wearing a review's clothes.
import { describe, expect, it } from 'vitest'
import {
  ENTITY_TYPES, ENTITY_RELATIONSHIPS, PERSONAL_USE_STATES, Q4_ANSWERS,
  WORK_KIND_MINT, mintsOwnedEntity, q4AsksOwnership, mintFromWorkKind,
  relationshipForNonOwned, readLegacyPromotes, claimRulesFor, isOwned,
  promoteToAffiliate, entityStatus, mayGenerateClaims, emptyRestrictions,
  isEntityType, isEntityRelationship, isPersonalUse, isQ4Answer,
  SHOWABILITY_STATES, inferShowability, mayShowOnScreen, isShowability,
  type DraftEntity,
} from '../productEntity'
import { BRIEF_WORK_KINDS } from '../preScriptBrief'

const NOW = '2026-08-09T00:00:00.000Z'

const entity = (over: Partial<DraftEntity> = {}): DraftEntity => ({
  name: 'Twin AI',
  type: 'SAAS',
  relationship: 'OWN_PRODUCT',
  personalUse: 'NOT_CONFIRMED',
  showability: 'UNKNOWN',
  productUrl: null,
  affiliateUrl: null,
  evidence: 'declined',
  restrictions: emptyRestrictions(),
  source: 'user_answer',
  userConfirmed: true,
  updated: NOW,
  ...over,
})

describe('Q3 mints ownership, so Q4 never re-asks it', () => {
  it('mints for exactly the four work kinds that determine ownership', () => {
    // FOUR OF SEVEN is the whole premise of the split. If this number moves,
    // Q4's job changes with it and the question copy has to be rewritten — so
    // the count is pinned rather than left to be rediscovered.
    const minting = BRIEF_WORK_KINDS.filter((k) => mintsOwnedEntity(k))
    expect(minting).toEqual(['professional', 'ecommerce', 'saas', 'local_service'])
    expect(minting).toHaveLength(4)
  })

  it('the three that mint nothing are the three Q3 cannot speak for', () => {
    // `creator` — a product is the exception, not the rule.
    // `brand`   — as often a team making content FOR a brand as the brand.
    // `other`   — free text; nothing may be routed off an unparsed sentence.
    for (const k of ['creator', 'brand', 'other'] as const) {
      expect(mintsOwnedEntity(k)).toBe(false)
      expect(mintFromWorkKind(k)).toBeNull()
    }
  })

  it('Q4 asks about ownership EXACTLY where Q3 was uninformative', () => {
    // The two must be exact complements. If both could be true at once, some
    // creator gets asked what they already answered — the defect this exists
    // to remove.
    for (const k of BRIEF_WORK_KINDS) {
      expect(q4AsksOwnership(k)).toBe(!mintsOwnedEntity(k))
    }
  })

  it('software mints a SaaS product the creator owns', () => {
    const e = mintFromWorkKind('saas', { name: 'Twin AI', now: NOW })
    expect(e).toMatchObject({ type: 'SAAS', relationship: 'OWN_PRODUCT', name: 'Twin AI' })
  })

  it('the licensed professional and the local service mint a SERVICE they own', () => {
    expect(mintFromWorkKind('professional', { now: NOW })).toMatchObject({
      type: 'SERVICE', relationship: 'OWN_SERVICE',
    })
    expect(mintFromWorkKind('local_service', { now: NOW })).toMatchObject({
      type: 'SERVICE', relationship: 'OWN_SERVICE',
    })
  })

  it('a mint is a PRE-FILL, never a verdict', () => {
    // Shown pre-filled and correctable on confirm — the pattern `offer` uses.
    // A mint that arrived as `user_answer` would be the product answering on
    // the creator's behalf and then citing itself as the creator.
    const e = mintFromWorkKind('saas', { now: NOW })!
    expect(e.source).toBe('inferred')
    expect(e.userConfirmed).toBe(false)
  })

  it('minting never confirms personal use, even for an owned product', () => {
    for (const k of BRIEF_WORK_KINDS) {
      const e = mintFromWorkKind(k, { now: NOW })
      if (e) expect(e.personalUse).toBe('NOT_CONFIRMED')
    }
  })

  it('every mint is a member of both vocabularies', () => {
    for (const m of Object.values(WORK_KIND_MINT)) {
      expect(ENTITY_TYPES).toContain(m.type)
      expect(ENTITY_RELATIONSHIPS).toContain(m.relationship)
      expect(isOwned(m.relationship)).toBe(true)
    }
  })
})

describe('Q4 asks only about entities the creator does NOT own', () => {
  it('maps each answer to a non-owned relationship', () => {
    expect(relationshipForNonOwned('affiliate')).toBe('AFFILIATE')
    expect(relationshipForNonOwned('sponsor')).toBe('SPONSOR')
    expect(relationshipForNonOwned('review_only')).toBe('REVIEW_ONLY')
    expect(relationshipForNonOwned('none')).toBe('NONE')
  })

  it('no Q4 answer can produce an OWNED relationship', () => {
    // The structural guarantee. If Q4 could mint ownership, it would be
    // competing with Q3 for the same fact and the loser would be whichever
    // reader ran second.
    for (const a of Q4_ANSWERS) {
      expect(isOwned(relationshipForNonOwned(a))).toBe(false)
    }
  })
})

describe('reading a brief written before Q4 was split', () => {
  it('own_product no longer asserts ownership — Q3 owns that now', () => {
    expect(readLegacyPromotes('own_product')).toEqual({ q4: 'none', ctaSuppressed: false })
  })

  it('affiliate maps across unchanged', () => {
    expect(readLegacyPromotes('affiliate')).toEqual({ q4: 'affiliate', ctaSuppressed: false })
  })

  it('nothing_to_sell survives as a CTA SUPPRESSION, not an ownership fact', () => {
    // The behaviour that must not regress. `nothing_to_sell` drives "do not
    // write a purchase or signup CTA at all" in `generate-blueprint` today. If
    // Q3 now mints an owned entity for that same creator, dropping this flag
    // would start selling to someone who explicitly switched selling off.
    expect(readLegacyPromotes('nothing_to_sell')).toEqual({ q4: 'none', ctaSuppressed: true })
  })

  it('an unknown or absent value is not guessed', () => {
    for (const v of [null, undefined, '', 'sponsor', 'whatever']) {
      expect(readLegacyPromotes(v)).toBeNull()
    }
  })
})

describe('what may be claimed — the point of `relationship`', () => {
  it('only owned relationships may use ownership language', () => {
    for (const r of ENTITY_RELATIONSHIPS) {
      expect(claimRulesFor(r).ownershipLanguage).toBe(isOwned(r))
    }
  })

  it('REVIEW_ONLY carries product facts and never marketing claims', () => {
    const rules = claimRulesFor('REVIEW_ONLY')
    expect(rules.productFacts).toBe(true)
    expect(rules.marketingClaims).toBe('forbidden')
    expect(rules.ownershipLanguage).toBe(false)
    // No commercial tie yet, so no purchase CTA and nothing to disclose.
    expect(rules.commercialCta).toBe(false)
    expect(rules.disclosureRequired).toBe(false)
  })

  it('third-party relationships may only ATTRIBUTE the vendor’s claims', () => {
    for (const r of ['AFFILIATE', 'SPONSOR'] as const) {
      expect(claimRulesFor(r).marketingClaims).toBe('attributed')
      expect(claimRulesFor(r).ownershipLanguage).toBe(false)
    }
  })

  it('a material connection is always disclosed', () => {
    expect(claimRulesFor('SPONSOR').disclosureRequired).toBe(true)
    expect(claimRulesFor('AFFILIATE').disclosureRequired).toBe(true)
    // And never demanded where there is no connection to disclose.
    expect(claimRulesFor('OWN_PRODUCT').disclosureRequired).toBe(false)
    expect(claimRulesFor('REVIEW_ONLY').disclosureRequired).toBe(false)
  })

  it('NONE permits nothing at all', () => {
    const rules = claimRulesFor('NONE')
    expect(rules).toMatchObject({
      ownershipLanguage: false, productFacts: false,
      marketingClaims: 'forbidden', creatorExperience: false,
      commercialCta: false, disclosureRequired: false,
    })
  })

  // ── §12's correction, and the reason the axes are separate ───────────────
  it('being an affiliate does NOT establish personal experience', () => {
    // Treating a payment agreement as evidence of having used the product
    // manufactures a testimonial out of a commercial arrangement.
    expect(claimRulesFor('AFFILIATE', 'NOT_CONFIRMED').creatorExperience).toBe(false)
    expect(claimRulesFor('SPONSOR', 'NOT_CONFIRMED').creatorExperience).toBe(false)
  })

  it('NOT_CONFIRMED is the default when personal use is not stated', () => {
    for (const r of ENTITY_RELATIONSHIPS) {
      expect(claimRulesFor(r).creatorExperience).toBe(claimRulesFor(r, 'NOT_CONFIRMED').creatorExperience)
    }
  })

  it('personal use is read from ONE place by every relationship', () => {
    // No relationship may override it — that is what makes it an independent
    // axis rather than a field some branches happen to consult.
    for (const r of ENTITY_RELATIONSHIPS) {
      if (r === 'NONE') continue
      expect(claimRulesFor(r, 'CONFIRMED').creatorExperience).toBe(true)
      expect(claimRulesFor(r, 'NOT_CONFIRMED').creatorExperience).toBe(false)
    }
  })
})

describe('the upgrade path — a review becomes an affiliate, in place', () => {
  it('adding an affiliate URL promotes REVIEW_ONLY with no schema change', () => {
    const before = entity({ relationship: 'REVIEW_ONLY', name: 'Claude', type: 'SAAS' })
    const after = promoteToAffiliate(before, 'https://example.com/ref/123', NOW)
    expect(after.relationship).toBe('AFFILIATE')
    expect(after.affiliateUrl).toBe('https://example.com/ref/123')
    // Every product fact already gathered survives — that is the point of
    // promoting in place rather than creating a second entity.
    expect(after.name).toBe('Claude')
    expect(after.type).toBe('SAAS')
    expect(after.evidence).toBe(before.evidence)
  })

  it('the rules that change are exactly the ones that should', () => {
    const after = promoteToAffiliate(entity({ relationship: 'REVIEW_ONLY' }), 'https://x.test/ref', NOW)
    const rules = claimRulesFor(after.relationship, after.personalUse)
    expect(rules.marketingClaims).toBe('attributed')
    expect(rules.commercialCta).toBe(true)
    expect(rules.disclosureRequired).toBe(true)
    // And the one that must not: a commission is still not evidence of use.
    expect(after.personalUse).toBe('NOT_CONFIRMED')
  })

  it('an empty URL promotes nothing', () => {
    const before = entity({ relationship: 'REVIEW_ONLY' })
    expect(promoteToAffiliate(before, '   ', NOW)).toBe(before)
  })

  it('an owned entity is not turned into an affiliate by a URL', () => {
    const after = promoteToAffiliate(entity({ relationship: 'OWN_PRODUCT' }), 'https://x.test/ref', NOW)
    expect(after.relationship).toBe('OWN_PRODUCT')
  })
})

describe('status — "missing information" is a HARD state', () => {
  it('an entity with no evidence cannot have claims generated about it', () => {
    const e = entity({ evidence: null })
    expect(entityStatus(e)).toBe('missing_information')
    expect(mayGenerateClaims(e)).toBe(false)
  })

  it('an unnamed entity is missing information', () => {
    expect(entityStatus(entity({ name: null }))).toBe('missing_information')
    expect(entityStatus(entity({ name: '   ' }))).toBe('missing_information')
  })

  it('a capture that yielded no sections is an attempt, not an answer', () => {
    const e = entity({ evidence: { sections: [] } as never })
    expect(entityStatus(e)).toBe('missing_information')
  })

  it('an unconfirmed mint is needs_review — usable for facts, checked before claims', () => {
    const e = entity({ source: 'inferred', userConfirmed: false })
    expect(entityStatus(e)).toBe('needs_review')
    expect(mayGenerateClaims(e)).toBe(true)
  })

  it('NONE is complete as an answer, not an under-filled entity', () => {
    const e = entity({ relationship: 'NONE', name: null, evidence: null })
    expect(entityStatus(e)).toBe('ready')
    // But it still cannot carry claims — there is nothing to claim about.
    expect(mayGenerateClaims(e)).toBe(false)
  })

  it('a confirmed, named, evidenced entity is ready', () => {
    expect(entityStatus(entity())).toBe('ready')
    expect(mayGenerateClaims(entity())).toBe(true)
  })
})

describe('nothing outside the vocabulary reaches a prompt', () => {
  it('validates each axis independently', () => {
    expect(isEntityType('SAAS')).toBe(true)
    expect(isEntityType('OWN_PRODUCT')).toBe(false)
    expect(isEntityRelationship('OWN_PRODUCT')).toBe(true)
    expect(isEntityRelationship('SAAS')).toBe(false)
    expect(isPersonalUse('CONFIRMED')).toBe(true)
    expect(isPersonalUse('MAYBE')).toBe(false)
    expect(isQ4Answer('review_only')).toBe(true)
    expect(isQ4Answer('own_product')).toBe(false)
  })

  it('rejects non-strings without throwing', () => {
    for (const v of [null, undefined, 42, {}, []]) {
      expect(isEntityType(v)).toBe(false)
      expect(isEntityRelationship(v)).toBe(false)
      expect(isPersonalUse(v)).toBe(false)
      expect(isQ4Answer(v)).toBe(false)
    }
  })

  it('the two axes share no member — the conflation this file prevents', () => {
    for (const t of ENTITY_TYPES) expect(ENTITY_RELATIONSHIPS).not.toContain(t as never)
    for (const r of ENTITY_RELATIONSHIPS) expect(ENTITY_TYPES).not.toContain(r as never)
    expect(PERSONAL_USE_STATES).toHaveLength(2)
  })
})


describe('showability — derived from the capability answers, never asked again', () => {
  it('software and digital read the SCREEN flag', () => {
    // Showing software means capturing a screen. There is no object to hold.
    expect(inferShowability('SAAS', { canRecordScreen: true })).toBe('ALWAYS')
    expect(inferShowability('SAAS', { canRecordScreen: false })).toBe('NEVER')
    expect(inferShowability('DIGITAL', { canRecordScreen: true })).toBe('ALWAYS')
  })

  it('a physical product reads the OBJECT flag', () => {
    expect(inferShowability('PHYSICAL', { canFilmObjects: true })).toBe('ALWAYS')
    expect(inferShowability('PHYSICAL', { canFilmObjects: false })).toBe('NEVER')
  })

  it('reads the flag that matches the type, and not the other one', () => {
    // The mapping is the whole point. A creator who can film objects but not
    // record a screen cannot show their SaaS, and vice versa — crossing the
    // wires would hand a screen-capture instruction to someone holding a bottle.
    expect(inferShowability('SAAS', { canFilmObjects: true })).toBe('UNKNOWN')
    expect(inferShowability('PHYSICAL', { canRecordScreen: true })).toBe('UNKNOWN')
  })

  it('a SERVICE can never be shown, and no flag changes that', () => {
    // "Show the consulting" is not a shot. A service has no physical referent
    // to point a camera at, so this is a fact about the world rather than about
    // the creator's setup.
    expect(inferShowability('SERVICE', { canFilmObjects: true })).toBe('NEVER')
    expect(inferShowability('SERVICE', { canRecordScreen: true })).toBe('NEVER')
    expect(inferShowability('SERVICE')).toBe('NEVER')
  })

  it('NO BACKFILL — an unanswered flag is UNKNOWN, never NEVER', () => {
    // 0103's rule one layer up: a missing value read as false silently removes
    // a scene type from everyone who was never asked.
    expect(inferShowability('SAAS')).toBe('UNKNOWN')
    expect(inferShowability('SAAS', {})).toBe('UNKNOWN')
    expect(inferShowability('SAAS', { canRecordScreen: null })).toBe('UNKNOWN')
    expect(inferShowability('PHYSICAL', { canFilmObjects: null })).toBe('UNKNOWN')
  })

  it('the mint pre-fills showability instead of asking for it', () => {
    expect(mintFromWorkKind('saas', { flags: { canRecordScreen: true }, now: NOW })!.showability)
      .toBe('ALWAYS')
    expect(mintFromWorkKind('ecommerce', { flags: { canFilmObjects: false }, now: NOW })!.showability)
      .toBe('NEVER')
    // A licensed professional sells a service, which cannot be shown at all.
    expect(mintFromWorkKind('professional', { flags: { canFilmObjects: true }, now: NOW })!.showability)
      .toBe('NEVER')
    // And with nothing answered, nothing is claimed.
    expect(mintFromWorkKind('saas', { now: NOW })!.showability).toBe('UNKNOWN')
  })

  it('ONLY `ALWAYS` permits a scene that depends on the product being visible', () => {
    // A script is written once and filmed later, so a scene depending on a
    // product the creator SOMETIMES has is a scene that sometimes cannot be
    // filmed — discovered while standing in a room holding a phone.
    expect(mayShowOnScreen('ALWAYS')).toBe(true)
    expect(mayShowOnScreen('SOMETIMES')).toBe(false)
    expect(mayShowOnScreen('NEVER')).toBe(false)
    expect(mayShowOnScreen('UNKNOWN')).toBe(false)
  })

  it('validates the vocabulary', () => {
    expect([...SHOWABILITY_STATES]).toEqual(['ALWAYS', 'SOMETIMES', 'NEVER', 'UNKNOWN'])
    expect(isShowability('ALWAYS')).toBe(true)
    expect(isShowability('MAYBE')).toBe(false)
    expect(isShowability(null)).toBe(false)
  })
})
