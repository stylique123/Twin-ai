// WHAT THE CREATOR WANTS FROM THIS ONE VIDEO.
//
// ⚠️ THE DEFECT THIS REPLACES. `goal` reached the writer through exactly two
// channels: one interpolated sentence, and one boolean deciding whether a
// purchase CTA was allowed. Twelve other decisions — which concept, which angle,
// which knowledge is even retrieved, how deep the substance must go, how the
// video ends — were made without ever consulting what the video was FOR.
//
// ⚖️ THE GOVERNING PRINCIPLE, AND IT DECIDES WHAT MAY LIVE HERE. The creator
// tells Twin what they want from this video; Twin decides how to creatively
// achieve it. So these are three questions about INTENT, never about execution:
// nothing here asks the creator to design a script, and nothing here asks for a
// fact Twin already scraped, stored or can derive.
//
// ⚖️ AND THE ANSWERS ARE COMPILED, NOT CONCATENATED. `compileVideoIntent`
// returns a record whose every field has ONE named reader. A block of pasted
// labels would be a fourth prompt paragraph — and this repo has measured, twice,
// that changing what REACHES the writer works while changing how the writer is
// INSTRUCTED does not.

import type { EvidenceLevel } from './knowledgeResolver'
// ⚠️ IMPORTED, NEVER RESTATED. The first draft of this module wrote its own
// default floor of 4 while the selector's is 6 — so an UNANSWERED question
// would have quietly lowered the substance guarantee on every generation, which
// is precisely the failure the clamp below claims to prevent. The test passed,
// because it compared the module against its own wrong constant instead of
// against the system's. One definition, imported.
import { SUBSTANCE_FLOOR } from './knowledgeSelection'

// ── Q1 · WHAT DO YOU WANT THIS VIDEO TO ACHIEVE? ───────────────────────────
//
// ⚠️ `conversations` IS NEW, AND SPLITTING IT OUT FIXES A LIVE OVER-PERMISSION.
// "Start conversations" and "Get leads" were the SAME key (`leads`), and `leads`
// sets the sell half of the CTA permission. A creator asking for replies was
// granting themselves a pitch. They are different intents and now different
// values; `leads` keeps its name so no stored answer changes meaning.
export const VIDEO_GOALS = [
  'followers', 'authority', 'educate', 'conversations', 'leads', 'sell',
  'entertain', 'personal_brand',
] as const
export type VideoGoal = (typeof VIDEO_GOALS)[number]

export const VIDEO_GOAL_LABELS: Record<VideoGoal, string> = {
  followers: 'Grow my audience',
  authority: 'Build authority',
  educate: 'Teach something',
  conversations: 'Start conversations',
  leads: 'Get leads',
  sell: 'Sell something',
  entertain: 'Entertain',
  personal_brand: 'Build my personal brand',
}

// ── Q2 · WHAT DO YOU WANT THIS VIDEO TO FOCUS ON? ──────────────────────────
//
// ⚖️ THIS IS THE RETRIEVAL QUESTION, and it is the one the old single goal could
// not ask. Retrieval today ranks knowledge rows purely by keyword overlap with
// the angle text: an `experience` and a `covered` row compete on equal terms,
// and nothing expresses "this video should be built out of what I have DONE"
// rather than "what I have an opinion about". That is what this answers.
export const CONTENT_FOCUS = [
  'expertise', 'product', 'experience', 'opinion', 'review', 'story',
  'reference_adapted', 'trending',
] as const
export type ContentFocus = (typeof CONTENT_FOCUS)[number]

export const CONTENT_FOCUS_LABELS: Record<ContentFocus, string> = {
  expertise: 'My expertise or ideas',
  product: 'A product or service',
  experience: 'A personal experience',
  opinion: 'An opinion or hot take',
  review: 'A review or comparison',
  story: 'A story',
  reference_adapted: 'The reference idea, adapted to me',
  trending: 'Something trending or current',
}

// ── Q3 · WHAT SHOULD THE VIEWER LEAVE WITH? ────────────────────────────────
//
// ⚖️ NOT A TONE QUESTION. Every value here changes what the video must CONTAIN
// and how it must END — the substance floor and the payoff — rather than how it
// sounds. How it sounds is `tone`, which stays in Advanced Settings because it
// is an execution preference and this is not.
export const VIEWER_OUTCOMES = [
  'learn', 'change_mind', 'feel_inspired', 'remember_me', 'comment', 'share',
  'follow', 'check_out_offer', 'convert',
] as const
export type ViewerOutcome = (typeof VIEWER_OUTCOMES)[number]

// ── HOW MUCH OF THE REFERENCE THE CREATOR ACTUALLY WANTED ─────────────────
//
// ⚠️ THE ONLY QUESTION ON THE REMIX SCREEN THAT IS ABOUT THE REFERENCE. Goal,
// focus and outcome are all about the CREATOR, and they are the same three
// whether somebody pasted a three-item listicle or a personal story. So the
// amount of the reference to keep — the one thing that changes with every link
// — was the one thing nobody was asked, and the transfer layer had to guess what
// "remix this" meant.
//
// ⚖️ IT IS A DIAL, NOT A PERMISSION. No setting here lets the reference become
// an authority for product facts, unsupported claims, creator identity, lived
// experience, ownership or exact wording. Those are refused at every value,
// which is why `stay_close` can exist at all: it is the most faithful setting
// available and it is still bounded by what may be transferred.
export const REFERENCE_USE = ['structure', 'idea_structure', 'stay_close', 'inspiration'] as const
export type ReferenceUse = (typeof REFERENCE_USE)[number]

/** What each setting instructs the writer to carry across.
 *
 *  ⚖️ WRITTEN AS WHAT TO KEEP AND WHAT TO REPLACE, not as an adjective. "Stay
 *  close" tells a model nothing it can act on; "keep the beat order and the hook
 *  mechanism, replace every subject" is a decidable instruction. */
export const REFERENCE_USE_DIRECTIVE: Record<ReferenceUse, string> = {
  structure:
    'TAKE THE MECHANICS, NOT THE SUBJECT. Keep the beat order, the hook mechanism and the escalation, and replace what every beat is ABOUT with the creator\'s own material.',
  idea_structure:
    'TAKE THE CENTRAL IDEA AND THE MECHANICS. Keep what the reference is arguing and how it argues it, and re-ground every example, number and story in the creator\'s own world.',
  stay_close:
    'STAY AS CLOSE AS THE FACTS ALLOW. Preserve the format, the beat count and the topic where the creator can honestly speak to it — and the moment a beat would need a fact they do not have, re-ground that beat rather than borrowing the reference\'s.',
  inspiration:
    'TAKE ONLY THE STRONGEST MECHANIC. Use the one device that makes the reference work and build a freer video around it; the beat order and the topic are not binding.',
}

/** ⚖️ HOW MUCH TOPIC SURVIVES, as a separate question from how much STRUCTURE
 *  does. A creator asking to stay close is asking for both; one asking for the
 *  structure is explicitly asking for a different subject. Reading them as one
 *  dial is what made "use the structure" quietly keep the reference's topic. */
export const KEEPS_REFERENCE_TOPIC: Record<ReferenceUse, boolean> = {
  structure: false,
  idea_structure: true,
  stay_close: true,
  inspiration: false,
}

export const VIEWER_OUTCOME_LABELS: Record<ViewerOutcome, string> = {
  learn: 'Learn something useful',
  change_mind: 'Change their mind',
  feel_inspired: 'Feel inspired',
  remember_me: 'Remember me or my brand',
  comment: 'Want to comment',
  share: 'Want to share',
  follow: 'Want to follow',
  check_out_offer: 'Want to check out my product or service',
  convert: 'Want to buy, sign up or get in touch',
}

// ── THE COMPILED RECORD ────────────────────────────────────────────────────

/** Which knowledge kinds this video should be built out of, in preference
 *  order. Read by the retrieval ranking, and by nothing else. */
export type KnowledgePreference = readonly string[]

export interface VideoIntent {
  /** The three answers, kept verbatim so a reader can always see the input. */
  goal: VideoGoal | null
  focus: ContentFocus | null
  outcome: ViewerOutcome | null
  /** The fourth answer — how much of the reference to carry across. */
  referenceUse: ReferenceUse | null

  /** ONE READER: the creative directive line in the prompt. Replaces GOAL_LINES. */
  goalDirective: string | null
  /** ONE READER: `sellIntent`. Never sufficient on its own — the commercial tie
   *  still decides, and this is only the creator's half of the question. */
  wantsSale: boolean
  /** ONE READER: the CTA payoff directive. */
  payoffDirective: string | null
  /** ONE READER: the transfer instruction in the prompt's reference block. */
  referenceUseDirective: string | null
  /** ONE READER: the premise stage, which otherwise assumes the reference topic
   *  is available to adapt. False means the creator asked for a different
   *  subject, and keeping the reference's would be answering a question they
   *  did not ask. */
  keepsReferenceTopic: boolean

  /** ONE READER: the knowledge ranking. Kinds listed first are preferred when
   *  relevance ties; an empty list means "leave the ranking alone". */
  prefersKinds: KnowledgePreference
  /** ONE READER: `selectSpeakable`'s substance floor — how many of the selected
   *  slots must be real substance rather than coverage. */
  substanceFloor: number
  /** ONE READER: whether the product library should be read as a SOURCE for
   *  this video rather than only as a permission record. */
  wantsProductSubstance: boolean
  /** ONE READER: the premise-compatibility stage. True where the creator has
   *  asked for a video built on something they personally did. */
  wantsOwnExperience: boolean

  /** Every conflict this compilation resolved, named. Recorded on the
   *  generation so a surprising script can be explained rather than guessed at. */
  resolutions: readonly string[]
}

const GOAL_DIRECTIVE: Record<VideoGoal, string> = {
  followers: 'GROW THE AUDIENCE. Reach and shareability come first: pick the angle with the widest entry point, keep the required prior knowledge near zero, and earn a follow or a share rather than a purchase.',
  authority: 'BUILD AUTHORITY. The viewer must trust this creator more at the end than at the start. Go NARROW AND DEEP on one thing rather than broad across three, and prefer a specific they could not get from a summary.',
  educate: 'TEACH SOMETHING USABLE. The viewer should be able to DO the thing by the end. One complete idea beats three partial ones, and the steps must survive being followed by someone who is not watching twice.',
  conversations: 'START A CONVERSATION. The video should leave a real question open — a genuine disagreement, a choice, or an experience others will want to match. Do NOT resolve everything, and do NOT ask for a sale.',
  leads: 'OPEN A CONVERSATION THAT LEADS SOMEWHERE. Deliver enough that a next step is worth taking, and make the ask a step TOWARD the creator — a comment, a DM, a link — never a purchase on the spot.',
  sell: 'SELL THE OFFER. Earn it first: the offer must be the natural conclusion of value already delivered, not an interruption. Name it plainly at the end.',
  entertain: 'ENTERTAIN. Attention and rewatch are the point. Do not bolt a commercial ask onto a video whose job is to be enjoyed, and do not slow down to teach.',
  personal_brand: 'BUILD THE PERSON, not just the information. Carry their stance and their story. A generic explainer fails this goal even when every fact in it is correct.',
}

const FOCUS_PREFERS: Record<ContentFocus, readonly string[]> = {
  expertise: ['framework', 'opinion', 'claim'],
  product: ['product', 'claim', 'fact'],
  experience: ['experience', 'example'],
  opinion: ['opinion', 'claim'],
  review: ['product', 'experience', 'claim'],
  story: ['experience', 'example'],
  // ⚖️ EMPTY ON PURPOSE, AND IT IS NOT A GAP. "Adapt the reference idea to me"
  // says where the SHAPE comes from, not where the substance does — so it must
  // not tilt retrieval toward any kind. Tilting it would quietly answer a
  // question the creator did not ask.
  reference_adapted: [],
  trending: [],
}

// ── WHAT A GOAL IMPLIES WHEN NOBODY WAS ASKED ─────────────────────────────
//
// ⚠️ "What should the viewer leave with" LEFT THE SCREEN, AND ITS BEHAVIOUR DID
// NOT. It was the third of three questions and it was largely downstream of the
// first: somebody who wants to sell wants the viewer to act, somebody who wants
// to teach wants them to learn. Asking both made the creator answer the same
// thought twice — but the answer drives the CTA payoff and the substance floor,
// and deleting a question is not a licence to delete what it decided.
//
// ⚖️ SO THE GOAL IMPLIES AN OUTCOME, AND AN IMPLICATION IS NOT AN ANSWER. The
// derived value fills `payoffDirective` and `substanceFloor` — the two things
// that would otherwise silently fall back to the system default. It does NOT
// feed `wantsSale`, which stays computed from what the creator actually SAID.
// An inference must not create an obligation, and a pitch is the obligation
// that rule exists for: `sell` already carries its own selling intent, so
// nothing is lost by refusing to let a derived `convert` add one.
const GOAL_IMPLIES_OUTCOME: Record<VideoGoal, ViewerOutcome> = {
  followers: 'share',
  authority: 'remember_me',
  educate: 'learn',
  conversations: 'comment',
  leads: 'check_out_offer',
  sell: 'convert',
  entertain: 'feel_inspired',
  // ⚖️ RETIRED FROM THE SCREEN, STILL REACHABLE INTERNALLY — routed from
  // authority + a personal focus + remember/follow. Being remembered IS the
  // point of a personal-brand video, so it implies the outcome it was routed
  // from. The compiler refused this change until the value was decided, which
  // is the Record earning its place.
  personal_brand: 'remember_me',
}

const OUTCOME_PAYOFF: Record<ViewerOutcome, string> = {
  learn: 'END ON THE PAYOFF, NOT THE ASK. The last beat completes the thing being taught; the viewer must be able to act on it without rewatching.',
  change_mind: 'END ON THE TURN. The viewer arrived believing something else, so the last beat must name what changed and why it holds — a summary is not a turn.',
  feel_inspired: 'END ON THE POSSIBILITY, made concrete. Inspiration that names nothing specific is a mood, and moods do not survive the scroll.',
  remember_me: 'END ON WHAT ONLY THIS PERSON COULD HAVE SAID. The last line should be unmistakably theirs — their stance, their phrasing, their enemy.',
  comment: 'END ON A REAL QUESTION. Not "what do you think" — something with a genuine split in it, that a viewer has an answer to before they finish reading it.',
  share: 'END ON WHAT MAKES THE VIEWER LOOK GOOD FOR SENDING IT. A share is a social act: give them the line they would want attached to their name.',
  follow: 'END ON THE PROMISE OF MORE, and make it specific — what the next video does for them, not "follow for more".',
  check_out_offer: 'END BY POINTING AT THE OFFER WITHOUT ASKING FOR MONEY. Curiosity, not commitment: what it is and who it is for, then stop.',
  convert: 'END ON THE ASK, PLAINLY. Name the offer, name the step, and make the step small enough to take from a phone.',
}

/** ⚖️ THE SUBSTANCE FLOOR IS A PROPERTY OF THE PAYOFF, NOT OF THE GOAL. A video
 *  that must change a mind or teach a method cannot be built from coverage rows;
 *  one that must be enjoyed or remembered can be. The default floor is what the
 *  selector already used, so an unanswered question changes nothing. */
const OUTCOME_FLOOR: Record<ViewerOutcome, number> = {
  // Cannot be built from coverage rows: a method, a turned mind, or a decision
  // to spend money all need material the creator actually has.
  learn: 8,
  change_mind: 8,
  convert: 8,
  // Need a specific to land, but not a full method.
  remember_me: 7,
  check_out_offer: 7,
  // ⚖️ NO RAISE, AND THAT IS AN ANSWER RATHER THAN AN OVERSIGHT. A video meant
  // to be enjoyed, shared or replied to can rest on lighter material without
  // failing its own payoff, so it keeps the system's standing guarantee.
  feel_inspired: SUBSTANCE_FLOOR,
  comment: SUBSTANCE_FLOOR,
  share: SUBSTANCE_FLOOR,
  follow: SUBSTANCE_FLOOR,
}

const DEFAULT_FLOOR = SUBSTANCE_FLOOR

/** Which goals express a commercial ask. `conversations` is deliberately NOT
 *  one of them — that is the whole reason it was split from `leads`. */
const SELLING_GOALS: ReadonlySet<VideoGoal> = new Set<VideoGoal>(['sell', 'leads'])

/** Outcomes that ask for money or a signup. Same rule: the creator's half of the
 *  permission only. The commercial tie is decided elsewhere and always wins. */
const SELLING_OUTCOMES: ReadonlySet<ViewerOutcome> = new Set<ViewerOutcome>(['convert'])

const isGoal = (v: unknown): v is VideoGoal =>
  typeof v === 'string' && (VIDEO_GOALS as readonly string[]).includes(v)
const isFocus = (v: unknown): v is ContentFocus =>
  typeof v === 'string' && (CONTENT_FOCUS as readonly string[]).includes(v)
const isOutcome = (v: unknown): v is ViewerOutcome =>
  typeof v === 'string' && (VIEWER_OUTCOMES as readonly string[]).includes(v)

const isReferenceUse = (v: unknown): v is ReferenceUse =>
  typeof v === 'string' && (REFERENCE_USE as readonly string[]).includes(v)

/**
 * Turn three answers into one record with named readers.
 *
 * ⚠️ UNANSWERED IS NOT A DEFAULT ANSWER. Every unset field yields null or the
 * value the system already used, so a creator who skips all three gets exactly
 * today's behaviour. This is the three-state rule the rest of the codebase runs
 * on, and it is what makes the questions safe to add before the UI exists.
 *
 * ⚖️ NEVER THROWS. It runs inside a paid generation, and an intent compiler that
 * can fail is a new way to lose a script.
 */
export function compileVideoIntent(answers: {
  goal?: unknown
  focus?: unknown
  outcome?: unknown
  referenceUse?: unknown
}): VideoIntent {
  const goal = isGoal(answers.goal) ? answers.goal : null
  const focus = isFocus(answers.focus) ? answers.focus : null
  const outcome = isOutcome(answers.outcome) ? answers.outcome : null
  const referenceUse = isReferenceUse(answers.referenceUse) ? answers.referenceUse : null
  const resolutions: string[] = []

  let goalDirective = goal ? GOAL_DIRECTIVE[goal] : null
  // ⚠️ THE STATED ANSWER FIRST, ALWAYS. A creator who answered outranks any
  // implication of their goal — and `statedOutcome` is kept separate below so
  // the derived value can never be mistaken for something they said.
  const impliedOutcome = outcome ?? (goal ? GOAL_IMPLIES_OUTCOME[goal] : null)
  if (!outcome && impliedOutcome) {
    resolutions.push(`goal ${goal} → payoff and substance floor taken from ${impliedOutcome}`)
  }
  let payoffDirective = impliedOutcome ? OUTCOME_PAYOFF[impliedOutcome] : null
  let substanceFloor = impliedOutcome ? OUTCOME_FLOOR[impliedOutcome] : DEFAULT_FLOOR
  const prefersKinds = focus ? FOCUS_PREFERS[focus] : []

  // ── CONFLICTS, RESOLVED EXPLICITLY AND NAMED ──────────────────────────────
  //
  // ⚠️ THE COMBINATIONS ARE REAL AND A CREATOR WILL PICK THEM. Two answers can
  // pull in opposite directions, and silently letting the last one written win
  // would make the picker feel broken in a way nobody could describe.

  // SELL + a teaching focus + a learning outcome. The named case: teach first,
  // and let the commercial ending be soft rather than dropping it.
  if (goal === 'sell' && (focus === 'expertise' || focus === 'experience')
      && (outcome === 'learn' || outcome === 'change_mind')) {
    goalDirective = 'SELL THE OFFER, BUT TEACH FIRST AND TEACH FULLY. The creator has asked for a video that both sells and genuinely instructs, and the instruction is the part that earns the ask. Deliver the complete idea, then close softly: name the offer once, at the end, as the obvious next step for someone who wants more of exactly this. Do NOT interrupt the teaching to pitch.'
    payoffDirective = 'END ON THE COMPLETED LESSON, THEN ONE SOFT COMMERCIAL LINE. The viewer must be able to act on what they learned whether or not they ever look at the offer.'
    resolutions.push('sell+teaching_focus+learning_outcome → teach first, soft commercial close')
  }

  // ENTERTAIN + convert. Entertainment explicitly refuses a bolted-on ask, and
  // the outcome explicitly requests one. The outcome is the more specific
  // instruction about the ENDING, so it wins there and entertainment keeps the body.
  if (goal === 'entertain' && outcome === 'convert') {
    goalDirective = 'ENTERTAIN THROUGHOUT, AND CONVERT ONLY AT THE END. The body of this video earns its attention by being enjoyed, not by being useful. The creator has asked for a commercial ending anyway, so make the turn deliberate and quick rather than pretending the video was a pitch all along.'
    resolutions.push('entertain+convert → entertaining body, deliberate commercial turn at the end')
  }

  // A NON-COMMERCIAL GOAL WITH A COMMERCIAL OUTCOME. The creator asked for the
  // ask; the goal did not. Honour the ending without rewriting the body's job.
  if (goal && !SELLING_GOALS.has(goal) && outcome && SELLING_OUTCOMES.has(outcome)
      && goal !== 'entertain') {
    resolutions.push(`${goal}+convert → body serves the goal, ending carries the ask`)
  }

  // FOLLOWERS + a deep, narrow focus. Reach wants a wide entry point; expertise
  // and framework material is narrow. Say so rather than letting them fight.
  if (goal === 'followers' && focus === 'expertise') {
    goalDirective = 'GROW THE AUDIENCE WITH ONE SHARP IDEA. The creator has chosen their own expertise as the material, so do not water it down for reach — instead pick the single most surprising thing in it and make THAT the entry point. Depth is the hook here, not the obstacle.'
    resolutions.push('followers+expertise → one sharp idea as the wide entry point')
  }

  // ⚖️ THE FLOOR NEVER DROPS BELOW WHAT THE SELECTOR ALREADY GUARANTEED. An
  // answer may ask for MORE substance; none may ask for less, because no intent
  // a creator can express is a reason to hand them a thinner script than the
  // system would have written on its own.
  // ⚠️ `personal_brand` LEFT THE UI AND KEPT ITS DIRECTIVE. "Build my personal
  // brand" is marketing language a normal creator should not have to decode, so
  // it is no longer a visible option — but the behaviour it bought is real and
  // deleting it would have been an amputation rather than a simplification.
  //
  // ⚖️ SO IT IS ROUTED, NOT REMOVED. A creator asking to be trusted, out of
  // their own experience or opinion, and remembered or followed, is describing a
  // personal-brand video in plain English without using the phrase. That
  // combination now compiles to the directive the label used to select.
  if (goal === 'authority'
      && (focus === 'experience' || focus === 'opinion' || focus === 'story')
      && (outcome === 'remember_me' || outcome === 'follow')) {
    goalDirective = GOAL_DIRECTIVE.personal_brand
    resolutions.push('authority+personal_focus+remember → personal-brand directive')
  }

  if (substanceFloor < DEFAULT_FLOOR) {
    substanceFloor = DEFAULT_FLOOR
    resolutions.push('substance floor clamped to the system minimum')
  }

  // ⚠️ UNANSWERED IS NOT `structure`. A creator who never saw this question has
  // not asked for the subject to be replaced, and defaulting to any value would
  // put a transfer instruction in the prompt on their behalf. Null leaves the
  // reference block exactly as it was before this answer existed.
  if (referenceUse) {
    resolutions.push(`reference use ${referenceUse} → ${KEEPS_REFERENCE_TOPIC[referenceUse] ? 'topic may carry across' : 'subject is replaced'}`)
  }

  return {
    goal,
    focus,
    outcome,
    referenceUse,
    referenceUseDirective: referenceUse ? REFERENCE_USE_DIRECTIVE[referenceUse] : null,
    // ⚖️ TRUE WHEN UNANSWERED, because that is the behaviour every generation
    // has had until now: the premise stage has always been free to adapt the
    // reference's topic. Only an explicit answer narrows it.
    keepsReferenceTopic: referenceUse === null ? true : KEEPS_REFERENCE_TOPIC[referenceUse],
    goalDirective,
    // ⚖️ EITHER HALF OF THE CREATOR'S REQUEST COUNTS, and NEITHER is sufficient.
    // `sellIntent` still requires a commercial tie on record; this only says the
    // creator asked. Ownership never licensed a pitch and a goal never created a
    // tie — that rule is unchanged and this must not be read as changing it.
    wantsSale: (goal !== null && SELLING_GOALS.has(goal))
      || (outcome !== null && SELLING_OUTCOMES.has(outcome)),
    payoffDirective,
    prefersKinds,
    substanceFloor,
    // ⚖️ A FOCUS ON A PRODUCT MAKES THE LIBRARY A SOURCE, not merely a permission
    // record. Today it is only ever read to decide what may be SAID; this is the
    // one answer that asks for its facts to be built ON.
    wantsProductSubstance: focus === 'product' || focus === 'review',
    // ⚠️ THIS DOES NOT GRANT ANYTHING. It tells the premise stage what the
    // creator asked for, so an unsupported request can be steered BEFORE the
    // premise is chosen — which is the only place it is cheap. Creator-state and
    // entitlement still run afterwards, unchanged, and still decide.
    wantsOwnExperience: focus === 'experience' || focus === 'story',
    resolutions,
  }
}

/**
 * Q2'S ACTUAL READER — the one that makes the answer change RETRIEVAL rather
 * than the prompt.
 *
 * ⚠️ A STABLE PARTITION, NOT A SORT, and the distinction is the whole safety of
 * it. Relevance order is preserved WITHIN each group, so the caller's notion of
 * relevance still decides WHICH experience gets the slot — the focus only
 * decides that an experience gets one before a coverage row does. Re-sorting
 * would replace the caller's relevance with this module's, which is exactly what
 * `selectSpeakable` refuses to do and for the same reason.
 *
 * ⚖️ AN EMPTY PREFERENCE IS THE IDENTITY. `reference_adapted` and `trending` say
 * where the SHAPE comes from, not the substance, so they must leave the ranking
 * untouched rather than tilt it toward a kind nobody asked for.
 */
export function preferKinds<T extends { kind: string }>(
  ranked: readonly T[],
  prefers: KnowledgePreference,
): T[] {
  if (!prefers.length) return [...ranked]
  const rank = new Map(prefers.map((k, i) => [k, i]))
  const groups: T[][] = prefers.map(() => [])
  const rest: T[] = []
  for (const item of ranked) {
    const i = rank.get(item.kind)
    if (i === undefined) rest.push(item)
    else groups[i].push(item)
  }
  return [...groups.flat(), ...rest]
}

/** The substance the payoff demands, as an evidence level rather than a count.
 *  Read by the premise stage alongside `wantsOwnExperience`. */
export function outcomeEvidenceNeed(outcome: ViewerOutcome | null): EvidenceLevel | null {
  if (outcome === null) return null
  if (outcome === 'change_mind') return 'opinion'
  if (outcome === 'learn' || outcome === 'convert') return 'experience'
  return null
}

/**
 * The prompt block. Rendered ONLY from compiled fields, never from the raw
 * labels — a paragraph of chip text would be decoration, and this repo has
 * measured that decoration does not change output.
 *
 * ⚖️ EMITS NOTHING WHEN NOTHING WAS ASKED FOR. A block reading "no particular
 * intent" tells the model something nobody said.
 */
export function renderVideoIntent(intent: VideoIntent): string {
  // ⚠️ THE GOAL DIRECTIVE IS NOT RENDERED HERE, AND THAT IS THE CONTRACT.
  // `goalDirective` already has exactly one reader — the `- Goal:` line of the
  // CREATOR DNA block — and emitting it again would put the same instruction in
  // two places. Two copies of one instruction is how three copies of the CTA
  // rule agreed with each other while sixteen purchase CTAs shipped.
  if (!intent.payoffDirective) return ''
  return `\nHOW THIS VIDEO MUST END — the creator chose what the viewer should leave with, so this is a decision rather than a suggestion.\n- ${intent.payoffDirective}`
}

// ── WHAT THE CREATOR ACTUALLY READS ────────────────────────────────────────
//
// ⚠️ THE HARD RULE THIS SECTION EXISTS FOR. Every question and option is plain
// everyday English. A first-time creator with no marketing knowledge understands
// each choice in under two seconds. No internal product terms, no jargon, no
// options that need explanation to tell apart. The creator must never have to
// know what "authority", "content focus", "viewer outcome", "entitlement",
// "reference adaptation" or "product relationship" mean — those are Twin's
// problems. Ask human questions; map the answers to the internal modes here.
//
// ⚖️ SIMPLIFY THE LABELS, KEEP THE BEHAVIOUR. Several plain labels may point at
// one internal value, and an internal value may have no label at all — but a
// directive is never deleted just because its wording left the screen. Merge
// only where the downstream behaviour is genuinely identical; where it changes
// concept, hook, substance, payoff or CTA, the distinction survives underneath.
//
// ⚖️ WHAT IS DELIBERATELY NOT SHOWN, and why each one is safe:
//   personal_brand  routed from authority + a personal focus + remember/follow.
//   story           merges into "Something I've experienced" — both already
//                   prefer the same knowledge kinds, so the merge is free.
//   review          merges into the product option on screen, and survives as an
//                   internal mode because it prefers experience where plain
//                   `product` does not. Reachable when the system infers it.

export interface IntentOption {
  /** The internal value. */
  value: string
  /** Two to four plain words. */
  label: string
  /** One short sentence, only where it genuinely helps tell two apart. */
  hint?: string
  /** Sub-options revealed after this one is chosen. Used where several
   *  behaviours are worth keeping but not worth three top-level chips. */
  options?: readonly IntentOption[]
}

export interface IntentQuestion {
  field: 'video_goal' | 'content_focus' | 'viewer_outcome' | 'reference_use'
  question: string
  options: readonly IntentOption[]
}

export const INTENT_QUESTIONS: readonly IntentQuestion[] = [
  {
    field: 'video_goal',
    question: 'What do you want this video to do for you?',
    options: [
      { value: 'followers', label: 'Reach more people', hint: 'Get more views and grow your audience' },
      { value: 'authority', label: 'Show I know my stuff', hint: 'Build trust and credibility' },
      { value: 'educate', label: 'Teach something', hint: 'Help people learn something useful' },
      { value: 'conversations', label: 'Get people talking', hint: 'Start comments and conversations' },
      // ⚖️ KEPT APART ON PURPOSE. Making people interested and asking them to buy
      // now are different videos, and only the second may carry a purchase CTA.
      { value: 'leads', label: 'Get customers or leads', hint: 'Make people interested in buying or contacting you' },
      { value: 'sell', label: 'Sell something', hint: 'Ask people to buy or sign up now' },
      { value: 'entertain', label: 'Entertain people', hint: 'Make something fun, interesting or memorable' },
    ],
  },
  {
    field: 'content_focus',
    question: 'What should this video be about?',
    options: [
      { value: 'expertise', label: 'Something I know well', hint: 'My advice, expertise or ideas' },
      { value: 'experience', label: "Something I've experienced", hint: 'Something I did, learned, tried or went through' },
      { value: 'opinion', label: 'Something I believe', hint: 'My opinion, or something I disagree with' },
      { value: 'product', label: 'A product or service', hint: 'Something I sell, promote, review or work with' },
      { value: 'reference_adapted', label: 'This reference idea', hint: 'Keep the main idea, but make it fit me' },
      { value: 'trending', label: 'Something happening now', hint: 'A trend, new topic or recent update' },
    ],
  },
  // ⚠️ "WHAT SHOULD THE VIEWER LEAVE WITH" USED TO SIT HERE, AND ITS BEHAVIOUR
  // DID NOT LEAVE WITH IT. It was largely downstream of the goal — somebody who
  // wants to sell wants the viewer to act, somebody who wants to teach wants
  // them to learn — so asking both made a creator answer one thought twice on a
  // screen that was already too long.
  //
  // ⚖️ THE ENUM, THE PAYOFF DIRECTIVES AND THE SUBSTANCE FLOORS ALL SURVIVE.
  // `VIEWER_OUTCOMES` is still the vocabulary, `GOAL_IMPLIES_OUTCOME` supplies a
  // value when nobody was asked, and a caller that DOES state an outcome still
  // outranks the implication. A question can leave the screen without its
  // decisions leaving the system; deleting the behaviour would have been the
  // easy half and the wrong one.
  // ⚠️ THE ONLY QUESTION HERE THAT IS ABOUT THE REFERENCE. The three above are
  // about the creator and are identical whether somebody pasted a listicle or a
  // confession — so the amount of the reference to keep, the one thing that
  // changes with every link, was never asked and the transfer layer had to guess
  // what "remix this" meant.
  //
  // ⚖️ PLAIN ENGLISH, AND NO SETTING IS A PERMISSION. "Keep it close" is the
  // most faithful option available and it still may not carry the reference's
  // product facts, claims, identity, lived experience or exact words across —
  // those are refused at every value.
  {
    field: 'reference_use',
    question: 'How much of the original should Twin keep?',
    options: [
      {
        value: 'structure',
        label: 'Just how it is built',
        hint: 'Same shape and hook style, but about my own thing',
      },
      {
        value: 'idea_structure',
        label: 'The idea and how it is built',
        hint: 'Same point, made with my own examples',
      },
      {
        value: 'stay_close',
        label: 'Keep it close',
        hint: 'Stay near the original wherever I can honestly say it',
      },
      {
        value: 'inspiration',
        label: 'Just the good bit',
        hint: 'Take what makes it work and go my own way',
      },
    ],
  },
]

/** Every value a creator can reach on screen, including sub-options. */
export function reachableIntentValues(field: IntentQuestion['field']): string[] {
  const q = INTENT_QUESTIONS.find((x) => x.field === field)
  if (!q) return []
  return q.options.flatMap((o) => (o.options ? o.options.map((c) => c.value) : [o.value]))
}

// ── WHEN THE COMMERCIAL BLOCK IS WORTH SHOWING ────────────────────────────
//
// ⚠️ THE REMIX CARD ASKED EVERY CREATOR ABOUT THEIR OFFER. A relationship
// question, a claims question and "what does the OFFER do?" appeared on a card
// belonging to somebody whose stored answer was "nothing of anyone else's" —
// and the questionnaire is the thing that screen exists to avoid.
//
// ⚖️ TWO SIGNALS, AND EITHER IS ENOUGH. A goal of selling or generating leads
// means the video ends in an ask; a focus on a product or a review means the
// video is ABOUT a thing. Both need to know what is being promoted, and neither
// implies the other — somebody can review a product they do not sell, and sell
// without the video being about the product.
//
// ⚠️ IT DECIDES WHAT TO ASK, NEVER WHAT IS PERMITTED. Showing this block grants
// nothing: the entity's relationship still decides what a script may claim, and
// a creator who reaches it and picks nothing has said "no product", which is an
// answer. Hiding it likewise forbids nothing — it only declines to ask a
// question with no bearing on the video in front of them.
export function showsCommercialBlock(intent: Pick<VideoIntent, 'wantsSale' | 'wantsProductSubstance'>): boolean {
  return intent.wantsSale || intent.wantsProductSubstance
}
