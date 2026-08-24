// THE ENTITY LIBRARY — one vocabulary for "the thing this video is about".
//
// §8's correction is the reason this file exists: an earlier design routed Q3 +
// Q4 to exactly ONE subtype for the whole creator. A person can be a founder
// with their own SaaS, an affiliate for other tools, a sponsor partner, and sell
// consulting — all at once, because humans insist on having multiple revenue
// streams. So the subtype is chosen PER ENTITY, and the creator holds a library.
//
// ── THE TWO AXES, AND WHY CONFLATING THEM IS THE BUG ──────────────────────
//
//   type          SAAS | PHYSICAL | SERVICE | DIGITAL      → WHICH SCHEMA
//   relationship  OWN_PRODUCT | OWN_SERVICE | AFFILIATE |
//                 SPONSOR | REVIEW_ONLY | NONE             → WHAT MAY BE CLAIMED
//
// An affiliated SaaS uses the SaaS schema AND the third-party ownership rules.
// Those are different questions, and one field cannot answer both without
// deciding one of them by accident.
//
// ── NO QUESTION MAY RE-ASK WHAT ANOTHER ANSWER IMPLIES ────────────────────
//
// Q3 ("what do you do") already determines ownership for four of its seven
// answers. A founder who has just said "Software" does not then need to be
// asked whether they have a product — so Q3 MINTS the owned entity, it is shown
// PRE-FILLED and correctable on confirm, and it is never asked again. That is
// the pattern `offer` already uses, and `mintFromWorkKind` is where it lives.
//
// Q4 is then free to ask the only thing still genuinely unknown: entities the
// creator does NOT own. See `relationshipForNonOwned`.
//
// ── PERSONAL USE IS NOT A COMMERCIAL RELATIONSHIP ─────────────────────────
//
// §12's correction, and the one rule in this file most likely to be "simplified"
// by a future reader: BEING AN AFFILIATE DOES NOT PROVE THE CREATOR HAS EVER
// USED THE PRODUCT. Treating a commercial arrangement as evidence of personal
// experience manufactures a testimonial out of a payment agreement.
//
// So `personalUse` is a SEPARATE axis with `NOT_CONFIRMED` as its default, and
// nothing in this module may promote it. Only the creator moves it, by saying so.

import type { ProductEvidence } from './productEvidence'
import { BRIEF_PROMOTES, type BriefWorkKind } from './preScriptBrief'
import type { OwnProductKind, OwnServiceKind } from './creatorProfileQuestions'

// ---------------------------------------------------------------------------
// THE VOCABULARY
// ---------------------------------------------------------------------------

/** WHICH SCHEMA the entity is described by (§9–§11). Never what may be claimed. */
// ⚠️ WIDENED WHILE THE TABLE WAS EMPTY, WHICH IS THE ONLY CHEAP MOMENT. Renaming
// a value costs one constraint change today and a data migration with a backfill
// the moment a creator registers a product.
//
// ⚖️ THE KINDS THAT LOOK REDUNDANT ARE NOT. A COURSE is not SaaS, a COMMUNITY is
// not a SERVICE, and an APP is distinct from SAAS for the only question this
// field decides — what can be put on camera. A phone screen and a desktop
// dashboard are different shots. `OTHER` exists so the enum never forces a
// misclassification: `inferShowability` reads this to tell the Director what it
// may ask for, so a WRONG kind is worse than an unspecific one.
export const ENTITY_TYPES = [
  'SAAS', 'APP', 'PHYSICAL_PRODUCT', 'DIGITAL_PRODUCT',
  'SERVICE', 'COURSE', 'COMMUNITY', 'MARKETPLACE', 'OTHER',
] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

/** WHAT MAY BE CLAIMED about the entity. Never which schema describes it.
 *
 *  `NONE` is a real member rather than a null: "this creator features nothing
 *  they do not own" is an answer the CTA rule acts on, and an absent
 *  relationship is merely a question not yet reached. Collapsing those two is
 *  how a creator who said "nothing" gets a purchase CTA anyway. */
export const ENTITY_RELATIONSHIPS = [
  'OWN_PRODUCT', 'OWN_SERVICE', 'AFFILIATE', 'SPONSOR', 'REVIEW_ONLY', 'NONE',
] as const
export type EntityRelationship = (typeof ENTITY_RELATIONSHIPS)[number]

/** Has the creator actually used it? Independent of every commercial fact.
 *
 *  `NOT_CONFIRMED` is the default and is NOT a gap to be filled by inference. */
export const PERSONAL_USE_STATES = ['CONFIRMED', 'NOT_CONFIRMED'] as const
export type PersonalUse = (typeof PERSONAL_USE_STATES)[number]

/**
 * CAN THIS PRODUCT BE PUT ON SCREEN, and how reliably?
 *
 * §5's Q4 conditionals, which the spec has always carried and no screen has ever
 * asked. They are NOT preference questions — they are PRODUCTION FACTS, and they
 * are what makes "hold the bottle beside your face" a legal instruction instead
 * of invented inventory (§5a finding 2, the renovated kitchen that did not
 * exist).
 *
 * ONE FIELD FOR WHAT LOOKED LIKE TWO QUESTIONS. The spec asks software creators
 * "talk about it · show it · both" and physical-product creators "usually have it
 * while filming · sometimes · no". Those are the same question — how dependably
 * can this thing appear on camera — asked in the vocabulary of two different
 * product types. Storing them as two fields would mean every downstream reader
 * branching on `type` before it could ask the only thing it wants to know, and
 * the second field would rot on whichever type was less common.
 *
 * So the FIELD is shared and only the WORDS differ per type; see the confirm
 * screen for the copy.
 *
 *   ALWAYS     it can be shown whenever the script wants it
 *   SOMETIMES  it can be shown, but a scene must not DEPEND on it
 *   NEVER      talking only — a shot of this product cannot be taken
 *
 * `UNKNOWN` is the fourth state and it is the load-bearing one, for exactly the
 * reason `can_record_screen` documents: a missing value read as NEVER silently
 * removes a scene type from everyone who was never asked, and read as ALWAYS
 * hands a shot instruction to someone who cannot take it. Neither is a default
 * anyone chose.
 */
export const SHOWABILITY_STATES = ['ALWAYS', 'SOMETIMES', 'NEVER', 'UNKNOWN'] as const
export type Showability = (typeof SHOWABILITY_STATES)[number]

/**
 * May a scene be written that DEPENDS on this product being visible?
 *
 * Only `ALWAYS` earns a yes. `SOMETIMES` is deliberately excluded: a script is
 * written once and filmed later, so a scene that depends on a product the
 * creator "sometimes" has is a scene that sometimes cannot be filmed — and the
 * creator discovers that standing in a room with a phone, which is the failure
 * §5a.4 records. Sometimes-available products may still be MENTIONED, and may
 * be shown by a scene that does not fall apart without them.
 *
 * `UNKNOWN` is a no, and that is not the same rule as `can_film_objects`. That
 * flag withholds SUGGESTIONS, so being permissive on silence costs an ignorable
 * tip. This decides whether a scene is written at all, so being permissive on
 * silence costs an unfilmable scene in a plan someone is holding a phone to
 * follow.
 */
export function mayShowOnScreen(showability: Showability): boolean {
  return showability === 'ALWAYS'
}

export function isShowability(v: unknown): v is Showability {
  return typeof v === 'string' && (SHOWABILITY_STATES as readonly string[]).includes(v)
}

/**
 * PRE-FILL showability from what the creator already told us. ADD NO QUESTION.
 *
 * The capability flags (0103) are three-state and already answered: can this
 * creator record a screen, can they put an object in front of the camera. A
 * product's showability is those same facts asked about a specific thing, so
 * asking again would re-ask what another answer implies — and would spend the
 * creator's attention on a question we can already answer.
 *
 * WHICH FLAG DEPENDS ON THE TYPE, and that is the whole mapping:
 *
 *   SAAS · DIGITAL  → `canRecordScreen`. Showing software means capturing a
 *                     screen; there is no object to hold.
 *   PHYSICAL        → `canFilmObjects`. Showing it means having it in the room.
 *   SERVICE         → NEVER, and not because of a flag. A service has no
 *                     physical referent to point a camera at — "show the
 *                     consulting" is not a shot. A coach's video is talking,
 *                     b-roll, or a screen, none of which is the service itself.
 *
 * THE RESULT IS `inferred`, NEVER `user_answer`. It is shown marked as inferred
 * and stays correctable, because a flag about the creator's setup is strong
 * evidence about a product and not a statement about it — someone who can film
 * objects may still not own the one being discussed.
 *
 * NO BACKFILL. An unanswered flag yields UNKNOWN rather than NEVER: 0103's rule
 * is that a missing value read as false silently removes a surface from everyone
 * who was never asked, and this is the same trap one layer up.
 */
export function inferShowability(
  type: EntityType,
  flags: { canRecordScreen?: boolean | null; canFilmObjects?: boolean | null } = {},
): Showability {
  // ⚖️ WHAT IS FILMABLE AT ALL. A service and a community have nothing to point
  // a camera at, so no capability answer can make them showable — that is a fact
  // about the kind, not a gap in what the creator told us.
  if (type === 'SERVICE' || type === 'COMMUNITY') return 'NEVER'
  // ⚠️ THE SPLIT IS "OBJECT IN THE ROOM" VERSUS "THING ON A SCREEN", NOT the
  // enum's alphabetical shape. A physical product needs `canFilmObjects`;
  // everything else that can be shown at all is shown through a screen. OTHER
  // takes the screen branch because it is the weaker permission of the two —
  // recording a screen is the capability more creators have.
  const flag = type === 'PHYSICAL_PRODUCT' ? flags.canFilmObjects : flags.canRecordScreen
  if (flag === true) return 'ALWAYS'
  if (flag === false) return 'NEVER'
  // Unanswered. Not a denial, and not a permission.
  return 'UNKNOWN'
}

/** The relationships that mean the creator owns the thing. Used in enough
 *  places that a second hand-written list would eventually disagree with this
 *  one — which is the drift bug this repo keeps catching. */
export const OWNED_RELATIONSHIPS: readonly EntityRelationship[] = ['OWN_PRODUCT', 'OWN_SERVICE']

export function isOwned(relationship: EntityRelationship): boolean {
  return (OWNED_RELATIONSHIPS as readonly string[]).includes(relationship)
}

// ---------------------------------------------------------------------------
// Q3 MINTS THE OWNED ENTITY
// ---------------------------------------------------------------------------

/**
 * What Q3 already told us about ownership — for the four answers where it told
 * us anything at all.
 *
 * FOUR OF SEVEN, and the three that mint nothing are deliberate:
 *
 *   `creator` — a product is the exception rather than the rule, so Q3 implies
 *               nothing and Q4 does double duty for them (see
 *               `q4AsksOwnership`).
 *   `brand`   — "Brand/Content Team" is as often a team making content FOR
 *               someone else's brand as it is the brand itself. Minting an
 *               owned product here would assert a commercial relationship the
 *               answer does not carry.
 *   `other`   — by construction unknown; `workKindOther` is free text and
 *               nothing may be routed off an unparsed sentence.
 *
 * A mint is a PRE-FILL, never a verdict: `userConfirmed` is false until the
 * creator has looked at it, and every caller must render it as correctable.
 */
export const WORK_KIND_MINT: Partial<Record<BriefWorkKind, { type: EntityType; relationship: EntityRelationship }>> = {
  saas: { type: 'SAAS', relationship: 'OWN_PRODUCT' },
  ecommerce: { type: 'PHYSICAL_PRODUCT', relationship: 'OWN_PRODUCT' },
  professional: { type: 'SERVICE', relationship: 'OWN_SERVICE' },
  local_service: { type: 'SERVICE', relationship: 'OWN_SERVICE' },
}

/** Does Q3 determine ownership for this answer? The inverse is exactly the set
 *  for which Q4 must also ask about ownership. */
export function mintsOwnedEntity(kind: BriefWorkKind | null | undefined): boolean {
  return !!kind && kind in WORK_KIND_MINT
}

/**
 * Must Q4 still ask whether the creator owns anything?
 *
 * ONLY where Q3 was uninformative. This is the executable form of the standing
 * rule "no question may re-ask what another answer implies" — a founder who has
 * just said "Software" is never asked whether they have a product, and a
 * `creator` still is, because for them nothing has been established.
 */
export function q4AsksOwnership(kind: BriefWorkKind | null | undefined): boolean {
  return !mintsOwnedEntity(kind)
}

/**
 * The entity Q3 implies, ready to be shown pre-filled on the confirm screen.
 *
 * Returns null where Q3 implies nothing — which is a different fact from "they
 * have nothing", and callers must not render it as one.
 */
export function mintFromWorkKind(
  kind: BriefWorkKind | null | undefined,
  opts: {
    name?: string | null
    now?: string
    /** The capability answers, so showability is PRE-FILLED rather than asked.
     *  Absent means unanswered, which yields UNKNOWN — never a denial. */
    flags?: { canRecordScreen?: boolean | null; canFilmObjects?: boolean | null }
    /** ⚠️ THE FINER ANSWER THEY ALREADY GAVE, which reached nothing until now.
     *  See `refinedEntityType`: a creator selling a course said so on the scan
     *  step and was minted SAAS anyway. */
    ownProductKind?: OwnProductKind | null
    ownServiceKind?: OwnServiceKind | null
  } = {},
): DraftEntity | null {
  const mint = kind ? WORK_KIND_MINT[kind] : undefined
  if (!mint) return null
  const name = (opts.name ?? '').trim()
  const type = refinedEntityType(mint.type, opts)
  return {
    name: name === '' ? null : name,
    type,
    relationship: mint.relationship,
    // The default, and nothing here may move it. A founder owning a product
    // does not establish that they use it — and for an owned product the
    // creator-experience claim is not the one that matters anyway.
    personalUse: 'NOT_CONFIRMED',
    // DERIVED, NOT ASKED. From the capability flags the creator already
    // answered — see `inferShowability`. UNKNOWN when they have not answered
    // them either, which is honest rather than convenient.
    showability: inferShowability(type, opts.flags),
    productUrl: null,
    affiliateUrl: null,
    evidence: null,
    restrictions: emptyRestrictions(),
    // INFERRED FROM AN ANSWER, not observed and not stated. The creator said
    // what they do; the ENTITY is our reading of what that implies, and the
    // confirm screen is where that reading gets checked.
    source: 'inferred',
    userConfirmed: false,
    updated: opts.now ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Q4 — ONLY ABOUT ENTITIES THEY DO NOT OWN
// ---------------------------------------------------------------------------

/**
 * Q4's answers, rewritten.
 *
 * The old Q4 asked "do you have a product", which is redundant exactly where Q3
 * was informative. This asks the residue: what do you feature that ISN'T yours?
 *
 * `none` is the answer that means ideas-only. For a `creator` — where Q3 implied
 * nothing — it additionally means NO PRODUCT DNA IS CREATED AT ALL, because for
 * them Q4 is the only ownership signal that exists.
 */
// THE SAME LIST AS THE STORAGE VOCABULARY, not a copy of it. `BRIEF_PROMOTES`
// is what `pre_script_brief.promotes` accepts; this is what the question offers.
// Two hand-written lists for one set is the drift bug this repo keeps catching —
// the day someone adds a fifth answer to one, the other cannot stay silent.
/** WHAT A CREATOR MUST ACTUALLY SAY to turn a mention into an entitlement.
 *
 *  ⚠️ EXTRACTION CANNOT PRODUCE THIS, WHICH IS THE ENTIRE POINT. The knowledge
 *  table can tell us a creator said "Peak Design Phone Tripod". It cannot tell
 *  us whether they own it, earn on it, or have ever held one — and those are the
 *  facts that decide whether a commercial CTA is permitted, whether disclosure
 *  is required, and whether a marketing claim may be put in their mouth. Every
 *  field here is an answer, never an inference.
 *
 *  ⚖️ `personalUse` IS ASKED SEPARATELY AND NEVER DERIVED FROM `relationship`.
 *  Owning a product does not establish having used it, and taking a commission
 *  establishes even less. The two questions look redundant and are not: one
 *  licenses commercial language, the other licenses "I use this every day". */
export interface EntityAttestation {
  relationship: EntityRelationship
  personalUse: PersonalUse
  type: EntityType
  name: string | null
  productUrl?: string | null
  flags?: { canRecordScreen?: boolean | null; canFilmObjects?: boolean | null }
  now?: string
}

/** Build the entity a creator has explicitly claimed.
 *
 *  ⚖️ `source` IS `user_answer` AND `userConfirmed` IS TRUE, because both are
 *  true — and neither may be set anywhere a creator has not actually answered.
 *  A Q3 mint writes `inferred` for exactly this reason. The pair is what later
 *  distinguishes "we worked this out" from "they told us", and `updated` carries
 *  when, so an entitlement can always be traced back to a moment. */
export function attestedEntity(a: EntityAttestation): DraftEntity {
  const name = (a.name ?? '').trim()
  const url = (a.productUrl ?? '').trim()
  return {
    name: name === '' ? null : name,
    type: a.type,
    relationship: a.relationship,
    personalUse: a.personalUse,
    // DERIVED FROM CAPABILITIES, NOT ASKED AGAIN — and UNKNOWN when they have
    // not answered those either. Never a denial inferred from silence.
    showability: inferShowability(a.type, a.flags ?? {}),
    productUrl: url === '' ? null : url,
    // ⚠️ A COMMERCIAL TIE IS ITS OWN ANSWER. `AFFILIATE` says a commission
    // exists; it does not supply the link, and inventing one here would put a
    // URL on screen that nobody gave us. `promoteToAffiliate` sets it when the
    // creator provides it.
    affiliateUrl: null,
    evidence: null,
    restrictions: emptyRestrictions(),
    source: 'user_answer',
    userConfirmed: true,
    updated: a.now ?? new Date().toISOString(),
  }
}

export const Q4_ANSWERS = BRIEF_PROMOTES
export type Q4Answer = (typeof Q4_ANSWERS)[number]

const Q4_TO_RELATIONSHIP: Record<Q4Answer, EntityRelationship> = {
  affiliate: 'AFFILIATE',
  sponsor: 'SPONSOR',
  review_only: 'REVIEW_ONLY',
  none: 'NONE',
}

export function relationshipForNonOwned(answer: Q4Answer): EntityRelationship {
  return Q4_TO_RELATIONSHIP[answer]
}

/**
 * READING A BRIEF WRITTEN BEFORE Q4 WAS SPLIT.
 *
 * The old vocabulary was `own_product | affiliate | nothing_to_sell`, and it
 * answered TWO questions at once. Under the split, each half has a new home:
 *
 *   ownership   → Q3 mints it. A stored value cannot improve on that and is
 *                 discarded for this purpose, NOT re-asked. This is safe
 *                 precisely because Q3 is the stronger source about existence.
 *   third party → maps onto the new Q4 unchanged.
 *
 * THE ONE THING THAT MUST SURVIVE. `nothing_to_sell` drives a live behaviour
 * today — `generate-blueprint` writes "do not write a purchase or signup CTA at
 * all". If Q3 now mints an owned entity for that same creator, they would start
 * receiving the sales CTAs they had explicitly switched off. So the old answer
 * is carried forward as a CTA SUPPRESSION, which is a preference, and never as
 * an ownership fact, which Q3 now owns. Facts may still be used; selling may
 * not resume without the creator saying so.
 *
 * ⚖️ Verified against production before this mapping was written: `brand_voices`
 * held 26 rows and NOT ONE had a stored `promotes` value, so no real creator is
 * migrated by this function today. It exists because the legacy value is still
 * writable by an older client, and a mapping that only appears once the first
 * row shows up is a mapping nobody reviews.
 */
export interface LegacyPromotesReading {
  q4: Q4Answer
  ctaSuppressed: boolean
}

export function readLegacyPromotes(value: string | null | undefined): LegacyPromotesReading | null {
  switch (value) {
    // Ownership is Q3's now. It said nothing about third parties, so `none`.
    case 'own_product': return { q4: 'none', ctaSuppressed: false }
    case 'affiliate': return { q4: 'affiliate', ctaSuppressed: false }
    case 'nothing_to_sell': return { q4: 'none', ctaSuppressed: true }
    default: return null
  }
}

// ---------------------------------------------------------------------------
// WHAT MAY BE SAID — the whole reason `relationship` exists
// ---------------------------------------------------------------------------

/**
 * What a script is permitted to write about an entity.
 *
 * Derived, never stored: a stored permission set is a second authority that
 * drifts from the relationship it was derived from, and then nobody knows which
 * one the script obeyed.
 */
export interface EntityClaimRules {
  /** "my product", "we built", "our roadmap". */
  ownershipLanguage: boolean
  /** Facts from the page / sheet / manual entry. */
  productFacts: boolean
  /** What the VENDOR asserts. `attributed` means only as "they say…". */
  marketingClaims: 'allowed' | 'attributed' | 'forbidden'
  /** "I've been using…" — gated on `personalUse`, never on the commercial tie. */
  creatorExperience: boolean
  /** A material connection the viewer must be told about. */
  disclosureRequired: boolean
  /**
   * MAY THE CTA ASK FOR A PURCHASE OR SIGNUP?
   *
   * THREE STATES, AND THE MIDDLE ONE IS THE CORRECTION. This was a boolean that
   * returned `true` for every owned entity, and a real generation proved it
   * wrong: Doctor Mike, answering `promotes: none`, was handed "check out my
   * podcast and merch". Owning something is a standing fact; SELLING IT IN THIS
   * VIDEO is a per-video decision (§16a).
   *
   * The evidence is not one script. ~85-95% of GaryVee's short-form sells
   * nothing — a default sales CTA would be wrong in nine posts out of ten for a
   * creator who genuinely owns several businesses. "They have a product"
   * therefore cannot imply "pitch it".
   *
   *   allowed            no permission needed beyond the relationship
   *   only_if_intended   permitted ONLY when this video's intent says to sell
   *   forbidden          no commercial tie exists to act on
   */
  commercialCta: 'allowed' | 'only_if_intended' | 'forbidden'
}

/** Whether THIS video intends to sell. Profile intent is a default; the video
 *  decides (§16a). Absent means nobody chose, and nobody choosing is not a sale.
 *
 *  ⚠️ RENAMED FROM `VideoIntent`, WHICH WAS WIDER THAN THE THING. It has exactly
 *  one reader — `mayWriteCommercialCta` — and it answers exactly one question:
 *  is this a selling video. The name now says that, and it stops colliding with
 *  the compiled per-video intent record in `videoIntent.ts`, which is a
 *  different concept that happened to want the same word. */
export type CommercialIntent = 'sell' | 'engage'

/**
 * May this script write a purchase or signup CTA?
 *
 * SILENCE IS NOT PERMISSION. An unset intent yields false for
 * `only_if_intended`, because the cost of withholding a pitch is one softer
 * video and the cost of adding one nobody asked for is a creator sounding like
 * an advert to their own audience.
 */
export function mayWriteCommercialCta(
  rules: EntityClaimRules,
  commercialIntent?: CommercialIntent | null,
): boolean {
  if (rules.commercialCta === 'forbidden') return false
  if (rules.commercialCta === 'allowed') return true
  return commercialIntent === 'sell'
}

export function claimRulesFor(
  relationship: EntityRelationship,
  personalUse: PersonalUse = 'NOT_CONFIRMED',
): EntityClaimRules {
  // THE ONE LINE THAT IS NOT PER-RELATIONSHIP. §12's correction in executable
  // form: personal experience is established by the creator alone, so every
  // relationship reads it from the same place and none of them may override it.
  const creatorExperience = personalUse === 'CONFIRMED'

  switch (relationship) {
    case 'OWN_PRODUCT':
    case 'OWN_SERVICE':
      return {
        ownershipLanguage: true,
        productFacts: true,
        // Their own claims to make, and their own liability for making them.
        // `restrictions.approvedClaims` still bounds this — see `entityStatus`.
        marketingClaims: 'allowed',
        creatorExperience,
        disclosureRequired: false,
        // NOT `allowed`. They own it; that does not mean this video sells it.
        commercialCta: 'only_if_intended',
      }

    case 'AFFILIATE':
      return {
        ownershipLanguage: false,
        productFacts: true,
        marketingClaims: 'attributed',
        creatorExperience,
        // DELIBERATELY TRUE, and worth arguing with rather than deleting. §12
        // attaches disclosure to SPONSOR explicitly and is silent on affiliate.
        // A paid link is a material connection all the same, so the safer
        // reading is encoded here; a script that discloses when it need not is
        // a smaller failure than one that does not when it must.
        disclosureRequired: true,
        commercialCta: 'only_if_intended',
      }

    case 'SPONSOR':
      return {
        ownershipLanguage: false,
        productFacts: true,
        marketingClaims: 'attributed',
        creatorExperience,
        // A property of the entity, not a per-video decision the writer may
        // weigh against pacing.
        disclosureRequired: true,
        commercialCta: 'only_if_intended',
      }

    case 'REVIEW_ONLY':
      return {
        ownershipLanguage: false,
        productFacts: true,
        // THE DISTINCTION THAT MAKES REVIEW_ONLY WORTH HAVING. A reviewer
        // repeating the vendor's marketing is an advertisement wearing a
        // review's clothes. Product facts and the creator's own experience are
        // the only two things a review may be built from.
        marketingClaims: 'forbidden',
        creatorExperience,
        // No commercial tie yet. Adding an affiliate URL promotes this entity
        // to AFFILIATE — see `promoteToAffiliate` — and disclosure arrives with
        // the relationship rather than being bolted on separately.
        disclosureRequired: false,
        commercialCta: 'forbidden',
      }

    case 'NONE':
      return {
        ownershipLanguage: false,
        productFacts: false,
        marketingClaims: 'forbidden',
        creatorExperience: false,
        disclosureRequired: false,
        commercialCta: 'forbidden',
      }
  }
}

// ---------------------------------------------------------------------------
// THE ENTITY ITSELF
// ---------------------------------------------------------------------------

/** `restrictions` is the one block that must never be optional, in any type
 *  (§8). An entity with no restrictions block is one whose compliance answer is
 *  "nobody asked", rendered as though it were "nothing applies". */
export interface EntityRestrictions {
  /** An outcome claim needs a permission that EXISTS, not merely the absence of
   *  a prohibition — §5a.5, the finance creator whose title claimed a replaced
   *  income that nothing had approved. */
  approvedClaims: string[]
  forbiddenClaims: string[]
  complianceNotes: string | null
}

/** Everything a script may not say about THIS entity, gathered from every level
 *  that has a say.
 *
 *  ⚠️ `restrictions` WAS WRITTEN ON EVERY ENTITY AND READ BY NOTHING. It appears
 *  exactly once in `generate-blueprint`, inside a comment. So a creator who
 *  recorded "do not say clinically proven" against a product had that stored,
 *  displayed back to them as saved, and then ignored by every generation — the
 *  worst kind of unread field, because the interface promised it was working.
 *
 *  ⚖️ THREE LEVELS, AND THEY ARE NOT INTERCHANGEABLE:
 *
 *      creator      "never promise guaranteed results" — applies to everything
 *                   this person says, regardless of product.
 *      entity       "do not say clinically proven" — a fact about THIS product,
 *                   often a legal one, and it outlives any single video.
 *      relationship "do not imply ownership" — derived from AFFILIATE/SPONSOR,
 *                   not stored, because storing it would let it drift out of
 *                   agreement with `claimRulesFor`.
 *
 *  The script receives the UNION. A restriction that only some levels know about
 *  is a restriction that some videos will break.
 *
 *  ⚠️ APPROVALS DO NOT UNION THE SAME WAY, AND THIS IS §5a.5. An outcome claim
 *  needs a permission that EXISTS, not merely the absence of a prohibition — the
 *  finance creator whose title claimed a replaced income nothing had approved.
 *  Only the ENTITY can approve a claim about itself; a creator-level setting
 *  cannot pre-approve claims about a product it has never heard of. So approvals
 *  come from one place while prohibitions come from three. */
export interface RestrictionUnion {
  forbidden: string[]
  approved: string[]
  disclosures: string[]
  complianceNotes: string | null
}

/** Prohibitions implied by the relationship itself. Derived rather than stored,
 *  so they cannot drift out of agreement with `claimRulesFor`. */
function relationshipRestrictions(relationship: EntityRelationship): {
  forbidden: string[]; disclosures: string[]
} {
  const rules = claimRulesFor(relationship, 'NOT_CONFIRMED')
  const forbidden: string[] = []
  const disclosures: string[] = []
  // ⚖️ READ OFF THE RULES RATHER THAN RE-ASSERTED. A second hand-written list
  // here would eventually disagree with the one the permissions block uses, and
  // the disagreement would be invisible until a script said something it should
  // not have.
  if (!rules.ownershipLanguage) {
    forbidden.push('Do not imply the creator owns, makes or sells this — they do not.')
  }
  if (rules.marketingClaims === 'forbidden') {
    forbidden.push("Do not repeat the product's marketing claims as though the creator were vouching for them.")
  } else if (rules.marketingClaims === 'attributed') {
    forbidden.push('Do not state a marketing claim flatly — attribute it to the company that makes it.')
  }
  if (rules.disclosureRequired) {
    disclosures.push('This is a paid or commissioned relationship and must be disclosed on screen.')
  }
  return { forbidden, disclosures }
}

export function restrictionUnion(input: {
  /** The creator's own standing restriction, free text as they typed it. */
  creatorForbidden?: string | null
  entity?: { relationship: EntityRelationship; restrictions?: EntityRestrictions | null } | null
}): RestrictionUnion {
  const forbidden: string[] = []
  const disclosures: string[] = []

  const creator = String(input.creatorForbidden ?? '').trim()
  // ⚠️ KEPT WHOLE, NOT SPLIT INTO ITEMS. This is a sentence the creator wrote;
  // chopping it on punctuation would turn "no guarantees, ever" into two
  // fragments and could invert a clause that depends on its second half.
  if (creator !== '') forbidden.push(creator)

  // ⚖️ NO ENTITY MEANS NO ENTITY RULES — and, importantly, no relationship rules
  // either. Deriving "do not imply ownership" with nothing to own would forbid
  // language about a product that is not in the video at all.
  if (input.entity) {
    const own = input.entity.restrictions
    for (const f of own?.forbiddenClaims ?? []) {
      const t = String(f ?? '').trim()
      if (t !== '') forbidden.push(t)
    }
    const rel = relationshipRestrictions(input.entity.relationship)
    forbidden.push(...rel.forbidden)
    disclosures.push(...rel.disclosures)
  }

  const approved = (input.entity?.restrictions?.approvedClaims ?? [])
    .map((a) => String(a ?? '').trim())
    .filter((a) => a !== '')

  return {
    // Deduped, because the same rule arriving from two levels should be said
    // once. Order is preserved so the creator's own words come first.
    forbidden: [...new Set(forbidden)],
    approved: [...new Set(approved)],
    disclosures: [...new Set(disclosures)],
    complianceNotes: input.entity?.restrictions?.complianceNotes ?? null,
  }
}

export function emptyRestrictions(): EntityRestrictions {
  return { approvedClaims: [], forbiddenClaims: [], complianceNotes: null }
}

/** An entity before it has an id — what a mint or a Q4 answer produces, and
 *  what the confirm screen edits. */
export interface DraftEntity {
  name: string | null
  type: EntityType
  relationship: EntityRelationship
  personalUse: PersonalUse
  /** How dependably this product can appear on camera. `UNKNOWN` until asked —
   *  never inferred, in either direction. */
  showability: Showability
  productUrl: string | null
  /** Present ⇒ there is a commercial tie. See `promoteToAffiliate`. */
  affiliateUrl: string | null
  /** The product itself — a link we READ or images of the thing. `'declined'`
   *  is a real answer ("there is nothing to show"); absent is not.
   *
   *  THIS IS WHERE `productEvidence` LIVES NOW. It used to float as a brief key
   *  belonging to the creator rather than to a thing, which meant a creator with
   *  two products had one slot for both. */
  evidence: ProductEvidence | 'declined' | null
  restrictions: EntityRestrictions
  /** `inferred` for a Q3 mint, `user_answer` once the creator has touched it.
   *  Reuses `dnaProvenance`'s vocabulary rather than inventing a second one. */
  source: 'user_answer' | 'inferred'
  userConfirmed: boolean
  updated: string
}

export interface ProductEntityRecord extends DraftEntity {
  id: string
  /** When the creator withdrew this from future videos. Null means live.
   *
   *  ⚖️ A DATE RATHER THAN A BOOLEAN, because "when did this stop" is a fact
   *  worth keeping — it dates the end of a sponsorship — and a flag cannot say
   *  it. Null is `live`, not `unknown`: the same three-state discipline `basis`
   *  uses, where the absent value is a real state rather than a missing one. */
  archivedAt: string | null
  /** What Twin read off a product page, each fact graded. Null = never
   *  extracted; [] = extracted and nothing usable found. Different answers. */
  knowledge: import('./productExtraction').ExtractedFact[] | null
  knowledgeExtractedAt: string | null
  knowledgeSourceUrl: string | null
}

/**
 * THE UPGRADE PATH, and the point of modelling REVIEW_ONLY at all.
 *
 * A creator reviews a tool, then joins its affiliate programme. Nothing about
 * the product changed — only the creator's relationship to it. So the same
 * entity is promoted in place: no new row, no re-capture, no schema change, and
 * every product fact already gathered survives.
 *
 * The rules that change are exactly the ones that should: marketing claims
 * become attributable, a commercial CTA becomes permitted, and disclosure
 * becomes required. `personalUse` is untouched, because taking a commission
 * still is not evidence of having used the thing.
 */
export function promoteToAffiliate<T extends DraftEntity>(entity: T, affiliateUrl: string, now?: string): T {
  const url = affiliateUrl.trim()
  if (url === '') return entity
  if (entity.relationship !== 'REVIEW_ONLY') return { ...entity, affiliateUrl: url }
  return {
    ...entity,
    relationship: 'AFFILIATE',
    affiliateUrl: url,
    // The creator supplied a commercial link; that is them speaking.
    source: 'user_answer',
    updated: now ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// STATUS — and "Missing information" is a HARD state
// ---------------------------------------------------------------------------

/**
 * §14's three statuses. `missing_information` is a STOP, not a warning: an
 * entity in that state may be MENTIONED but must not have claims generated
 * about it. Same principle as the reference hard stop already shipped — if
 * there is no substance, do not manufacture some.
 */
export type EntityStatus = 'ready' | 'needs_review' | 'missing_information'

export function entityStatus(entity: DraftEntity): EntityStatus {
  // NONE is not an under-filled entity; it is the absence of one, and it is
  // complete as an answer.
  if (entity.relationship === 'NONE') return 'ready'
  const hasName = (entity.name ?? '').trim() !== ''
  const hasEvidence = entity.evidence === 'declined'
    || (!!entity.evidence && typeof entity.evidence === 'object' && entity.evidence.sections.length > 0)
  if (!hasName || !hasEvidence) return 'missing_information'
  // Twin inferred something load-bearing and no human has confirmed it. The
  // entity is usable for facts and should be checked before it carries claims.
  if (!entity.userConfirmed || entity.source === 'inferred') return 'needs_review'
  return 'ready'
}

/** May a script generate CLAIMS about this entity? The hard half of §14. */
export function mayGenerateClaims(entity: DraftEntity): boolean {
  return entityStatus(entity) !== 'missing_information' && entity.relationship !== 'NONE'
}

// ---------------------------------------------------------------------------
// VALIDATION — nothing outside the vocabulary reaches a prompt
// ---------------------------------------------------------------------------

export function isEntityType(v: unknown): v is EntityType {
  return typeof v === 'string' && (ENTITY_TYPES as readonly string[]).includes(v)
}

export function isEntityRelationship(v: unknown): v is EntityRelationship {
  return typeof v === 'string' && (ENTITY_RELATIONSHIPS as readonly string[]).includes(v)
}

export function isPersonalUse(v: unknown): v is PersonalUse {
  return typeof v === 'string' && (PERSONAL_USE_STATES as readonly string[]).includes(v)
}

export function isQ4Answer(v: unknown): v is Q4Answer {
  return typeof v === 'string' && (Q4_ANSWERS as readonly string[]).includes(v)
}

// ---------------------------------------------------------------------------
// TONE IS BOUNDED BY THE CREATOR, NOT LAYERED OVER THEM
// ---------------------------------------------------------------------------

/** The delivery-energy setting the creator picks per video. */
export type ToneChoice = 'understated' | 'balanced' | 'punchy'

/**
 * What a creator's own voice REFUSES, whatever tone is selected.
 *
 * Derived from the DNA rather than typed by anyone: these are facts about how
 * the person actually speaks, and a slider must not be able to overrule them.
 */
export interface ToneBounds {
  /** Hype openers — "you won't believe", "this will blow your mind". A
   *  claim-first corrector and an optimistic explainer both refuse these, for
   *  different reasons and with equal force. */
  allowsClickbait: boolean
  /** Fear, doom and scarcity framing. */
  allowsFearHooks: boolean
  /** Manufactured certainty — the register a regulated professional cannot use
   *  even when the reference's mechanism depends on it. */
  allowsAbsoluteCertainty: boolean
}

export function defaultToneBounds(): ToneBounds {
  return { allowsClickbait: true, allowsFearHooks: true, allowsAbsoluteCertainty: true }
}

/**
 * CLAMP the requested tone to what this creator's voice permits.
 *
 * ⚠️ THE DEFECT THIS FIXES WAS MEASURED, not argued. With the real prohibition,
 * the beat plan and the full forbidden-claims block all present,
 * `tone: punchy` still produced — for a licensed physician —
 *
 *     "You won't believe what these 5 health gadgets PROMISE you!"
 *
 * His own voice is documented as "claim-first correction or curiosity gap, NOT
 * hype". So the tone setting was not colouring the delivery, it was overwriting
 * the creator. The same run at `balanced` for a different creator produced no
 * clickbait at all, which is what isolates tone as the cause.
 *
 * ⚖️ A SLIDER MAY NARROW A VOICE AND MUST NEVER WIDEN IT. `punchy` on a creator
 * who does not do hype degrades to `balanced` rather than unlocking a register
 * they never use — because the creator did not ask to sound like someone else,
 * they asked for more energy. `understated` is always reachable: dialling
 * energy DOWN cannot violate a voice.
 */
export function clampTone(requested: ToneChoice, bounds: ToneBounds): ToneChoice {
  if (requested !== 'punchy') return requested
  const punchyWouldViolate =
    !bounds.allowsClickbait || !bounds.allowsFearHooks || !bounds.allowsAbsoluteCertainty
  return punchyWouldViolate ? 'balanced' : 'punchy'
}

/** Why a tone was clamped, for the creator to read. Silence about an
 *  overridden setting is how a product looks broken rather than careful. */
export function toneClampReason(
  requested: ToneChoice, applied: ToneChoice, bounds: ToneBounds,
): string | null {
  if (requested === applied) return null
  const why = [
    !bounds.allowsClickbait ? 'hype openers' : '',
    !bounds.allowsFearHooks ? 'fear framing' : '',
    !bounds.allowsAbsoluteCertainty ? 'absolute certainty' : '',
  ].filter(Boolean)
  return `Kept at ${applied}: your voice does not use ${why.join(' or ')}, and more energy should not change who you sound like.`
}

// ── THE FINER ANSWER THEY ALREADY GAVE ────────────────────────────────────
//
// ⚠️ THE SAME FACT IS COLLECTED TWICE AND ONLY THE COARSE ONE COUNTS.
// `workKind` mints an entity type from four broad answers -- saas → SAAS,
// ecommerce → PHYSICAL_PRODUCT, professional and local_service → SERVICE. Then
// the scan step asks "What kind of thing do you sell?" with six finer options,
// and that answer reaches NOTHING. A creator selling a course says so, and the
// entity is typed SAAS.
//
// ⚠️ AND MEASURED, NOT ASSUMED — THE FIRST VERSION OF THIS COMMENT WAS WRONG.
// It claimed the type decides the show moments. It does not, today:
// productSceneGuidance returns BYTE-IDENTICAL direction for SAAS, COURSE,
// DIGITAL_PRODUCT, MARKETPLACE and OTHER — four screen_recording moments each.
// So refining SAAS→COURSE changes nothing a creator sees right now.
//
// ⚖️ IT IS STILL WORTH STORING CORRECTLY, and the reason is not the current
// prompt. The type is what the Library shows, what a future scene rule would
// branch on, and what anything reasoning about this product reads. A stored
// type the creator explicitly contradicted is a wrong fact whether or not
// today's prompt happens to consult it.
//
// ⚠️ THE ONE REFINEMENT THAT DOES CHANGE BEHAVIOUR IS `community` → COMMUNITY,
// because COMMUNITY takes the NEVER branch in inferShowability: a community has
// nothing to point a camera at. A creator running one was previously typed
// SERVICE — also NEVER — so even this is currently a wash. See
// SCENE_GUIDANCE_DOES_NOT_READ_THE_TYPE in knownLimitations.

/** ⚠️ `other` IS ABSENT ON PURPOSE, AND THE FIRST REASON I GAVE WAS FALSE.
 *
 *  I wrote that refining to OTHER would cost the creator every show moment.
 *  Measured: inferShowability puts OTHER on the SCREEN branch, exactly like
 *  SAAS, and productSceneGuidance('OTHER','ALWAYS') returns the same four
 *  moments as SAAS. It costs nothing of the sort.
 *
 *  ⚖️ THE REAL REASON IS NARROWER. "Other" says none of the listed kinds fit;
 *  it is not a claim that the product IS of type OTHER, and the coarse answer
 *  came from a different question they also really answered. Between two real
 *  answers, the one that names something wins over the one that names nothing.
 *  That is a judgement, not a measurement, and it is written here as one. */
const PRODUCT_KIND_TYPE: Partial<Record<OwnProductKind, EntityType>> = {
  software: 'SAAS',
  physical: 'PHYSICAL_PRODUCT',
  digital: 'DIGITAL_PRODUCT',
  course: 'COURSE',
  marketplace: 'MARKETPLACE',
}

/** ⚖️ MOST SERVICE KINDS ARE ALREADY SERVICE, so only the one that genuinely
 *  differs is listed. Consulting, coaching, an agency, freelance and training
 *  are all a person selling their time; a community is a place. */
const SERVICE_KIND_TYPE: Partial<Record<OwnServiceKind, EntityType>> = {
  community: 'COMMUNITY',
}

/**
 * The type to mint, given both answers.
 *
 * ⚠️ THE FINER ANSWER WINS WHERE IT SAYS SOMETHING, and the coarse one stands
 * everywhere else. Never the reverse: `workKind` is a fact about their BUSINESS
 * and these are facts about the THING, and the thing is what a scene has to show.
 */
export function refinedEntityType(
  coarse: EntityType,
  kinds: { ownProductKind?: OwnProductKind | null; ownServiceKind?: OwnServiceKind | null },
): EntityType {
  const p = kinds.ownProductKind ? PRODUCT_KIND_TYPE[kinds.ownProductKind] : undefined
  if (p) return p
  const s = kinds.ownServiceKind ? SERVICE_KIND_TYPE[kinds.ownServiceKind] : undefined
  if (s) return s
  return coarse
}
