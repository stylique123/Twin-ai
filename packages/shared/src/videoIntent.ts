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

  /** ONE READER: the creative directive line in the prompt. Replaces GOAL_LINES. */
  goalDirective: string | null
  /** ONE READER: `sellIntent`. Never sufficient on its own — the commercial tie
   *  still decides, and this is only the creator's half of the question. */
  wantsSale: boolean
  /** ONE READER: the CTA payoff directive. */
  payoffDirective: string | null

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
}): VideoIntent {
  const goal = isGoal(answers.goal) ? answers.goal : null
  const focus = isFocus(answers.focus) ? answers.focus : null
  const outcome = isOutcome(answers.outcome) ? answers.outcome : null
  const resolutions: string[] = []

  let goalDirective = goal ? GOAL_DIRECTIVE[goal] : null
  let payoffDirective = outcome ? OUTCOME_PAYOFF[outcome] : null
  let substanceFloor = outcome ? OUTCOME_FLOOR[outcome] : DEFAULT_FLOOR
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
  if (substanceFloor < DEFAULT_FLOOR) {
    substanceFloor = DEFAULT_FLOOR
    resolutions.push('substance floor clamped to the system minimum')
  }

  return {
    goal,
    focus,
    outcome,
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
