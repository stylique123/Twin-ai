// WHAT THE SCAN CANNOT SEE, ASKED WHILE THE SCAN RUNS.
//
// ⚠️ THE SPLIT IS THE WHOLE DESIGN, AND IT IS NOT ABOUT PACING. The scan reads
// history: how this person sounds, what they hook with, their pacing, their
// vocabulary, what they have already made. It cannot read INTENT — who they want
// to reach, what they want content to do, what they want to make NEXT, what they
// sell, what they can physically put on camera. Those are the six questions, and
// none of them is a thing the scan is designed to extract.
//
// The inverse rule matters as much: nothing here asks about tone, hook style,
// vocabulary, pacing, current formats or brand colour. The scan does that better
// than self-report does, and asking a person to describe content we are actively
// reading is both wasted effort and less accurate — people mis-report their own
// format.
//
// ⚖️ SO ONBOARDING AND THE SCAN ANSWER DIFFERENT HALVES:
//
//     ONBOARDING           who they say they are · who they want to reach ·
//                          what they want · what they want to MAKE · what they
//                          sell · what they can film
//     SCAN                 how they sound · what they talk about · what they
//                          believe · what they have lived · hooks · pacing ·
//                          the formats they ALREADY make
//
// The pair that makes this worth building is `desiredFormats` against the scan's
// observed formats: what someone currently makes versus what they want help
// making is the difference the product exists to close, and until now nothing
// asked the second half.
//
// ⚖️ AND QUESTIONS 5 AND 6 ADAPT, BECAUSE AN IRRELEVANT QUESTION IS WORSE THAN A
// MISSING ONE. Asking a fitness creator with nothing to sell about screen
// recordings and affiliate relationships does not merely waste their time — it
// teaches them the questions are not serious, and that is how the one question
// that mattered gets clicked past too.

import type { BriefWorkKind, BriefGoal } from './preScriptBrief'

// ── Q2. WHO THEY WANT TO REACH ────────────────────────────────────────────
//
// ⚠️ A CHOOSER, WHERE THIS USED TO BE A TEXT BOX. The box produced "solo
// founders who post to sell" from the few who typed at all, and nothing from
// everyone else — and free text cannot be routed, compared against the scan, or
// used to pick a register. §8a.2(c) already warns that who your content READS as
// is not who your audience IS, so this is the answer the scan is least able to
// supply and the one most often left blank.
export const AUDIENCE_SEGMENTS = [
  'consumers', 'founders', 'professionals', 'creators', 'companies', 'students', 'enthusiasts', 'mixed',
] as const
export type AudienceSegment = (typeof AUDIENCE_SEGMENTS)[number]

/** ⚖️ ASKED SEPARATELY FROM WHO THEY ARE, because it changes different things.
 *  Segment decides the EXAMPLES and the stakes; knowledge decides how much may
 *  be assumed before a sentence stops making sense. A beginner audience of
 *  founders and an expert audience of founders need the same subject explained
 *  at opposite depths. */
export const AUDIENCE_KNOWLEDGE = ['beginners', 'basics', 'experienced', 'mixed'] as const
export type AudienceKnowledge = (typeof AUDIENCE_KNOWLEDGE)[number]

// ── Q4. WHAT THEY WANT TO MAKE ────────────────────────────────────────────
//
// ⚠️ THE ANSWER NOTHING WAS ASKING FOR. Every other field describes what a
// creator IS or has DONE; this is the only one that says what they want next.
// Without it the product can only ever propose more of what it already read,
// which makes it a mirror rather than a collaborator.
export const DESIRED_FORMATS = [
  'talking_head', 'educational', 'founder', 'review', 'product',
  'story', 'opinion', 'pov', 'trend', 'walking', 'recommend',
] as const
export type DesiredFormat = (typeof DESIRED_FORMATS)[number]

/**
 * How far from what they already make they want to go.
 *
 * ⚖️ SEPARATE FROM THE FORMAT LIST, AND NOT DERIVABLE FROM IT. Someone can pick
 * three formats they already make and still want to be pushed, or pick a new one
 * and want it handled conservatively. Reading exploration out of the overlap
 * between desired and observed formats would be a guess dressed as a preference.
 */
export const FORMAT_EXPLORATION = ['stay_close', 'fit_goals', 'try_new', 'mixed'] as const
export type FormatExploration = (typeof FORMAT_EXPLORATION)[number]

// ── Q5. WHAT THEY SELL, PROMOTE OR REVIEW ─────────────────────────────────
//
// ⚠️ MULTI-SELECT, BECAUSE THESE CO-EXIST IN ONE PERSON. A creator can have
// their own course, take sponsorships, and review other people's gear in the
// same month. The single-select this replaces forced them to pick the one that
// felt most true, and the two it discarded were exactly the ones that decide
// whether a disclosure is owed.
//
// ⚖️ THIS ESTABLISHES THE RELATIONSHIP AND NOTHING ELSE. It does not mint an
// entity, name a product or grant a claim — the Product Library does that,
// behind an attestation. A question during onboarding is a statement of what
// KIND of thing exists, and treating it as permission would be the escalation
// the entity contract exists to refuse.
export const COMMERCIAL_TIES = [
  'own_product', 'own_service', 'affiliate', 'sponsor', 'review', 'none',
  'unspecified',
] as const
export type CommercialTie = (typeof COMMERCIAL_TIES)[number]

/**
 * WHAT ONBOARDING STILL ASKS, AFTER THE THIRTEEN OPTIONS WENT AWAY.
 *
 * ⚠️ ONBOARDING NO LONGER ASKS WHICH KIND OF TIE. It asked six chips plus a
 * seven-chip service follow-up — thirteen taps — for facts the Product Library
 * already collects in full, behind an attestation, where they belong. The only
 * part onboarding legitimately owns is whether a commercial thing EXISTS AT
 * ALL, because that is what decides whether Twin ever offers a product scene.
 *
 * ⚖️ SO `unspecified` MEANS "SOMETHING EXISTS, KIND AND RELATIONSHIP UNKNOWN",
 * AND IT IS A DISTINCT STATE FROM ALL SIX OTHERS — not a synonym for any of
 * them. It must never be read as ownership: an unknown relationship licenses
 * nothing, which is why `RELATIONSHIP_OF` maps it to `null` and it is absent
 * from `TIE_PRECEDENCE`. The creator names the real relationship in the Product
 * Library, and until they do, the honest answer downstream is "we do not know".
 *
 * ⚖️ THE OTHER SIX ARE STILL READ AND STILL VALID. Onboarding stops WRITING
 * them; every reader keeps accepting them, because accounts already hold them
 * (two rows at the time of this change, both `own_service`). Stop writing, keep
 * reading — deleting the values in the same change is the failure mode this
 * codebase has a rule against.
 */
export const ONBOARDING_SELLS_ANSWERS = ['yes', 'not_right_now'] as const
export type OnboardingSellsAnswer = (typeof ONBOARDING_SELLS_ANSWERS)[number]

/**
 * THE COMMITTED OLD→NEW MAPPING FOR THE COLLAPSE.
 *
 * The yes/no the creator now taps is stored in the SAME `commercialTies` field
 * the thirteen options wrote, using this table and nothing else. It is exported
 * so the exhaustiveness test can prove every answer has a target and no answer
 * silently defaults.
 */
export const SELLS_ANSWER_TO_TIES: Record<OnboardingSellsAnswer, readonly CommercialTie[]> = {
  yes: ['unspecified'],
  not_right_now: ['none'],
}

/**
 * Read the stored ties back as the yes/no, so the collapsed question can show
 * the creator what they already answered — including answers written by the
 * thirteen-option question this replaced.
 *
 * ⚠️ `null` IS UNANSWERED AND IS NOT `not_right_now`. An empty list is somebody
 * who never reached the question; turning that into "nothing to sell" would
 * assert a commercial fact nobody stated.
 */
export function sellsAnswerOf(
  ties: readonly CommercialTie[] | null | undefined,
): OnboardingSellsAnswer | null {
  if (!Array.isArray(ties) || ties.length === 0) return null
  if (ties.length === 1 && ties[0] === 'none') return 'not_right_now'
  return 'yes'
}

/** Only asked when `own_product` is among the ties. Decides what may be filmed,
 *  which is why it is asked at all rather than inferred from the work kind. */
export const OWN_PRODUCT_KINDS = [
  'software', 'physical', 'digital', 'course', 'marketplace', 'other',
] as const
export type OwnProductKind = (typeof OWN_PRODUCT_KINDS)[number]

/** Only asked when `own_service` is among the ties. */
export const OWN_SERVICE_KINDS = [
  'consulting', 'coaching', 'agency', 'freelance', 'training', 'community', 'other',
] as const
export type OwnServiceKind = (typeof OWN_SERVICE_KINDS)[number]

// ── Q6. WHAT THEY CAN ACTUALLY PUT ON CAMERA ──────────────────────────────
//
// ⚠️ THREE STATES, NOT TWO, AND THE MIDDLE ONE IS THE COMMON ANSWER. "Sometimes"
// is what most people mean and neither of the other chips could express, so a
// yes/no pair pushed honest sometimes-answers into whichever lie was cheaper.
export const CAPABILITY_ANSWERS = ['yes', 'sometimes', 'no'] as const
export type CapabilityAnswer = (typeof CAPABILITY_ANSWERS)[number]

export interface CreatorProfileAnswers {
  workKind?: BriefWorkKind | null
  audience?: AudienceSegment | null
  audienceKnowledge?: AudienceKnowledge | null
  /** Up to two. More than two stops being a priority and becomes a wish list. */
  contentGoals?: readonly BriefGoal[] | null
  desiredFormats?: readonly DesiredFormat[] | null
  formatExploration?: FormatExploration | null
  commercialTies?: readonly CommercialTie[] | null
  ownProductKind?: OwnProductKind | null
  ownServiceKind?: OwnServiceKind | null
  canRecordScreen?: CapabilityAnswer | null
  canShowProduct?: CapabilityAnswer | null
}

/** The most goals one person may choose. */
export const MAX_CONTENT_GOALS = 2

const has = <T,>(list: readonly T[] | null | undefined, v: T): boolean =>
  Array.isArray(list) && list.includes(v)

/**
 * Does the screen-recording question apply to this person?
 *
 * ⚠️ NOT ASKED OF EVERYONE, WHICH IS THE DEFECT THIS FIXES. It was asked of
 * every creator including ones with nothing to demonstrate, and a question with
 * no possible bearing on someone's videos is how they learn to skip the set.
 *
 * ⚖️ IT APPLIES WHEN SOMETHING ON A SCREEN COULD BE SHOWN: software they own, or
 * formats that demonstrate or compare things. Both routes matter — a reviewer of
 * apps owns no software and still needs to record a screen.
 */
export function asksScreenCapability(a: CreatorProfileAnswers): boolean {
  if (has(a.commercialTies, 'own_product') && a.ownProductKind === 'software') return true
  if (a.workKind === 'saas') return true
  const demonstrates = has(a.desiredFormats, 'review') || has(a.desiredFormats, 'product')
  return demonstrates && !onlyNone(a)
}

/**
 * Does the show-the-product question apply?
 *
 * ⚖️ ANY relationship to a physical thing counts, owned or not. A sponsorship
 * and an affiliate link both put an object in someone's hands, and whether they
 * can hold it up is the same question in all three cases.
 */
export function asksProductCapability(a: CreatorProfileAnswers): boolean {
  if (onlyNone(a)) return false
  if (has(a.commercialTies, 'own_product') && a.ownProductKind === 'software') {
    // Software is shown on a screen, not held up — unless something else in
    // their mix is a physical thing.
    return has(a.commercialTies, 'affiliate') || has(a.commercialTies, 'sponsor') || has(a.commercialTies, 'review')
  }
  return has(a.commercialTies, 'own_product')
    || has(a.commercialTies, 'affiliate')
    || has(a.commercialTies, 'sponsor')
    || has(a.commercialTies, 'review')
    || has(a.desiredFormats, 'product')
}

/** ⚠️ "THEY SAID NONE" IS NOT "THEY HAVE NOT ANSWERED YET". Only an explicit,
 *  sole `none` suppresses the commercial branch; an empty list is somebody who
 *  has not reached the question, and suppressing on silence would skip Q6 for
 *  every creator who simply had not tapped yet. */
export function onlyNone(a: CreatorProfileAnswers): boolean {
  const ties = a.commercialTies
  return Array.isArray(ties) && ties.length === 1 && ties[0] === 'none'
}

/** Does the product-kind follow-up apply? */
export function asksOwnProductKind(a: CreatorProfileAnswers): boolean {
  return has(a.commercialTies, 'own_product')
}

/** Does the service-kind follow-up apply? */
export function asksOwnServiceKind(a: CreatorProfileAnswers): boolean {
  return has(a.commercialTies, 'own_service')
}

/**
 * WHICH OF THE FIVE APPLY TO THIS PERSON, in order.
 *
 * ⚖️ FOUR CORE QUESTIONS AND ONE THAT EARNS ITS PLACE. Five screens for
 * everybody would be a round number bought with irrelevant questions; a
 * fitness creator with nothing to sell answers four and is done, and the
 * follow-up appears only for the people it describes.
 *
 * ⚠️ `desiredFormats` WAS HERE AND IS NOT ANYMORE — D7 OF THE CONSOLIDATION
 * SPEC. "What kinds of videos do you want Twin to help you make?" asked a
 * creator to commit to a fixed answer before they had made anything with
 * Twin, at the one moment they had the least basis to answer it. The field
 * itself is untouched — `desiredFormats` and `formatExploration` are still
 * real, read fields (`compileCreatorProfile`, `DESIRED_FORMAT_PREMISE` in
 * generate-blueprint) — this only removes the ONBOARDING STEP that asked at
 * signup. It now surfaces as a filter on the Gallery, where a creator has
 * something to browse against and can change their mind on a return visit
 * rather than being locked into a day-one guess.
 */
// ⚠️ FOUR SCREENS BECAME TWO, AND `whoYouAre` IS WHY. `workKind`, `audience`
// and `commercialTies` were three separate screens asking three halves of one
// thought — who you are, who you are for, and whether you sell. Split across
// three taps they read as an interrogation; together they read as a single
// introduction, which is what they are. The knowledge level has always ridden
// with `audience` and still does: the same subject for beginners and for
// experts is two different videos, so it belongs beside the audience it
// qualifies rather than on a screen of its own.
//
// ⚖️ NO FIELD MOVED AND NONE WAS LOST. `workKind`, `audienceSeg`,
// `audienceKnowledge` and `commercialTies` are written exactly as before, to
// exactly the same keys, by exactly the same draft. This list names SCREENS,
// not fields, and grouping three screens into one changes where a question is
// asked and nothing about what is stored.
//
// ⚖️ `capabilities` STAYS LAST AND STAYS CONDITIONAL. It is the one question
// here that most creators should never see, and after the commercial-ties
// collapse most will not: it applies to somebody with software to screen-record
// or a physical thing to hold up, and it is asked only of them.
export const PROFILE_QUESTION_IDS = [
  'whoYouAre', 'contentGoals', 'capabilities',
] as const
export type ProfileQuestionId = (typeof PROFILE_QUESTION_IDS)[number]

export function profileQuestionsFor(a: CreatorProfileAnswers): ProfileQuestionId[] {
  return PROFILE_QUESTION_IDS.filter((id) => {
    if (id !== 'capabilities') return true
    return asksScreenCapability(a) || asksProductCapability(a)
  })
}

// ── WHAT THE ANSWERS DO ───────────────────────────────────────────────────
//
// ⚠️ AN ANSWER WITH NO READER IS A STORED OPINION. Every field above exists
// because it changes a sentence the writer is given or a decision the director
// makes; this is where that happens, so the claim is checkable rather than
// asserted. Anything that cannot be turned into a directive here should not have
// been asked.

/** Who the video is addressed to, in the words a writer can use. */
export const AUDIENCE_LINE: Record<AudienceSegment, string> = {
  consumers: 'ordinary people, not an industry audience',
  founders: 'founders and business owners',
  professionals: 'people who do this for a living',
  creators: 'other creators',
  companies: 'teams and the people who buy for them',
  students: 'people still learning the field',
  enthusiasts: 'hobbyists who follow this closely',
  mixed: 'a mixed audience, so nothing may assume a shared background',
}

/**
 * How much may be assumed before a sentence stops making sense.
 *
 * ⚖️ THIS IS A SUBSTANCE RULE, NOT A TONE RULE. "Explain simply" is a style note
 * a model will thank you for and ignore; "do not use a term before it has been
 * paid for" changes what a beat may contain. The measured lesson in this
 * codebase is that changing what reaches the writer works and changing how the
 * writer is instructed does not, so these are written as constraints on content.
 */
export const KNOWLEDGE_LINE: Record<AudienceKnowledge, string> = {
  beginners: 'Assume no prior knowledge: any term of art must be earned in the sentence that introduces it, and a beat that depends on an unexplained concept is not a beat.',
  basics: 'They know the basics. Do not re-explain fundamentals — spend the time on the part they have not seen.',
  experienced: 'They already do this. Skip the definitions entirely; unexplained fundamentals are a sign of respect here, and an obvious point costs their attention.',
  mixed: 'Mixed backgrounds: land each point so it works without the jargon, and let the terms follow the point rather than carry it.',
}

/** What they want their videos to make happen, at most two. */
export interface CreatorProfileDirectives {
  audienceLine: string | null
  knowledgeLine: string | null
  goals: readonly BriefGoal[]
  /** Formats to prefer when proposing what to make. */
  prefersFormats: readonly DesiredFormat[]
  /** True when Twin was told to propose things outside what it observed. */
  exploresBeyondObserved: boolean
  /** Whether a scene may depend on a screen capture, and on holding a thing up.
   *  `null` means UNANSWERED — never `false`. A capability nobody asked about
   *  must not read as one that was refused. */
  screen: CapabilityAnswer | null
  product: CapabilityAnswer | null
  /** Each resolution, in the order it was taken, for the audit trail. */
  resolutions: string[]
}

/**
 * Compile the six answers into the handful of things downstream actually reads.
 *
 * ⚠️ NULL SURVIVES. Every optional answer stays null rather than acquiring a
 * default, because each of these fields has a meaning for "unanswered" that
 * differs from every value it could take — an unasked screen question is not a
 * refusal, and an unstated audience is not "everyone".
 */
export function compileCreatorProfile(a: CreatorProfileAnswers): CreatorProfileDirectives {
  const resolutions: string[] = []

  const audienceLine = a.audience ? AUDIENCE_LINE[a.audience] : null
  if (audienceLine) resolutions.push(`audience ${a.audience} → addressed as ${audienceLine}`)
  const knowledgeLine = a.audienceKnowledge ? KNOWLEDGE_LINE[a.audienceKnowledge] : null
  if (knowledgeLine) resolutions.push(`knowledge ${a.audienceKnowledge} → depth constraint applied`)

  // ⚖️ TRUNCATED, NOT REFUSED. A creator who taps three goals has said something
  // true; taking the first two keeps the answer usable rather than throwing the
  // whole thing away, and the cap is what stops "priorities" becoming a list.
  const goals = (a.contentGoals ?? []).slice(0, MAX_CONTENT_GOALS)
  if ((a.contentGoals ?? []).length > MAX_CONTENT_GOALS) {
    resolutions.push(`${a.contentGoals!.length} goals chosen → first ${MAX_CONTENT_GOALS} kept`)
  }

  // ⚠️ 'recommend' IS AN ABSTENTION, NOT A FORMAT. "Let Twin recommend" means
  // the creator declined to constrain the list, so it must not become a
  // preference for a format called recommend — which is what a straight
  // pass-through would produce.
  const picked = (a.desiredFormats ?? []).filter((f) => f !== 'recommend')
  if (has(a.desiredFormats, 'recommend') && picked.length === 0) {
    resolutions.push('let-Twin-recommend → no format preference recorded')
  }

  const exploresBeyondObserved = a.formatExploration === 'try_new'
    || a.formatExploration === 'fit_goals'
  if (a.formatExploration) {
    resolutions.push(`exploration ${a.formatExploration} → ${exploresBeyondObserved ? 'may propose beyond observed formats' : 'stays close to observed formats'}`)
  }

  return {
    audienceLine,
    knowledgeLine,
    goals,
    prefersFormats: picked,
    exploresBeyondObserved,
    screen: a.canRecordScreen ?? null,
    product: a.canShowProduct ?? null,
    resolutions,
  }
}

/**
 * May a scene DEPEND on this capability?
 *
 * ⚖️ ONLY A CLEAR YES CARRIES A DEPENDENCY. "Sometimes" is a real and common
 * answer, and a script built around a shot somebody can sometimes get is a
 * script that sometimes cannot be filmed — so sometimes permits a MENTION and
 * never a dependency. Unanswered behaves like sometimes rather than like no:
 * silence withholds the guarantee without asserting a refusal.
 */
export function mayDependOn(answer: CapabilityAnswer | null | undefined): boolean {
  return answer === 'yes'
}

/** May it be suggested at all? Only an explicit no closes the door. */
export function maySuggest(answer: CapabilityAnswer | null | undefined): boolean {
  return answer !== 'no'
}
