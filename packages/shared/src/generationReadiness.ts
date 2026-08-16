// CAN TWIN CONFIDENTLY WRITE THIS VIDEO? ASKED BEFORE THE MONEY MOVES.
//
// ⚠️ THE DEFECT THIS EXISTS FOR, MEASURED. Replayed over a 112-run matrix, one
// generated script had 5 of its 6 beats replaced by questions addressed to the
// creator — "This beat needs a real detail about your product" — because the
// writer had declared a source that did not exist and the checks escalated it.
// Every one of those escalations was individually correct. The script was still
// a discovery interview accidentally formatted as content, and the creator paid
// a remix for it.
//
// ⚖️ BILLING SOMEONE TO DISCOVER OUR OWN MISSING INPUTS IS NOT A PRODUCT. The
// owner's rule, and now this file's: CLARIFICATION IS FREE, CREATION IS PAID.
// So the uncertainty is resolved BEFORE generation, by asking, rather than
// after it, by shipping a script full of holes.
//
// ⚖️ AND IT IS NOT A QUESTIONNAIRE. Re-asking onboarding before every video
// would be a worse product than the one this replaces. A field is only asked
// about when it is BOTH missing AND required FOR THIS VIDEO — a non-commercial
// explainer needs no product, no ownership relationship and no commercial CTA,
// so it is never asked for them. That per-video judgement is the whole reason
// this is a contract and not a form.

/** What the planner needs settled before it can make a creative decision. */
export const READINESS_FIELDS = [
  'goal',
  'audience',
  'angle',
  'offer',
  'relationship',
  'cta',
  'claims',
  'referenceTransfer',
] as const
export type ReadinessField = (typeof READINESS_FIELDS)[number]

/**
 * ⚖️ THREE STATES, THE SAME THREE THIS CODEBASE USES EVERYWHERE. `unset` is not
 * `false`, a guess is not a fact, and the middle state is the one that does the
 * work: most fields are safely inferable most of the time, and a system that
 * cannot say so degenerates into the questionnaire above.
 */
export type ReadinessState =
  /** The creator told us, or a prior confirmed step did. */
  | 'RESOLVED'
  /** Not stated, but derivable, and being wrong is cheap. An audience read from
   *  their own back catalogue is this: it shapes tone, and a miss costs a
   *  rewrite rather than a false claim. */
  | 'INFERRED_BUT_SAFE'
  /** Required for THIS video, not known, and guessing would put a claim in
   *  someone's mouth or point a viewer at something that does not exist. */
  | 'MISSING_REQUIRED'

export interface ReadinessInputs {
  /** What the creator wants this video to do. */
  goal?: string | null
  audience?: string | null
  /** The subject — the idea, or the reference note it is being adapted from. */
  angle?: string | null
  /** The thing being promoted, if anything is. */
  offer?: string | null
  /** The creator's commercial tie to `offer`. The enum, never prose. */
  relationship?: string | null
  /** What the viewer is asked to do. */
  cta?: string | null
  /** Facts about the offer that the script is allowed to state. `null` is
   *  unknown; `[]` is a stated absence. The distinction is load-bearing —
   *  see `substanceIssues`. */
  productFacts?: readonly string[] | null
  /** Did we actually read the reference, or are we guessing at its shape? */
  referenceRead?: boolean
  /** Anything at all on record about this creator, for inference. */
  hasCreatorKnowledge?: boolean
}

const present = (v: unknown): boolean =>
  typeof v === 'string' ? v.trim() !== '' && v.trim().toLowerCase() !== 'unspecified' : v != null

/** Goals that make the video a commercial act. Mirrors `goalWantsSale` in
 *  `generate-blueprint`; a video that sells needs more settled than one that
 *  explains, and that asymmetry is the reason this is per-video. */
const COMMERCIAL_GOALS = new Set(['sell', 'leads'])

/** ⚖️ THE ENUM, AND ONLY THE ENUM. Prose like "REVIEW_ONLY — nothing in the
 *  scan shows a tie" is research, not a permission, and must not satisfy a
 *  readiness check that gates a purchase CTA. */
const RELATIONSHIPS = new Set([
  'NONE', 'REVIEW_ONLY', 'AFFILIATE', 'SPONSOR', 'OWN_PRODUCT', 'OWN_SERVICE',
])

export interface FieldVerdict {
  field: ReadinessField
  state: ReadinessState
  /** Why, in the creator's language. Present only when MISSING_REQUIRED. */
  question: string | null
}

export interface ReadinessVerdict {
  fields: FieldVerdict[]
  /** True when generation must not run and must not charge. */
  blocked: boolean
  /** At most three, most decisive first. A creator asked eight questions
   *  abandons; a creator asked two answers them. */
  questions: string[]
}

/** The questions, written to be answerable in one line by someone holding a
 *  phone — never "provide your value proposition". */
/** ⚠️ TWO OF THESE READ AS THE SAME QUESTION, AND A CREATOR SAID SO. "What
 *  should this video actually do for you?" and "What does it actually do?" both
 *  parse as *what does the video do* — the second is asking about the PRODUCT,
 *  but "it" has no anchor on screen, so the form asked one question twice and
 *  got one answer twice.
 *
 *  ⚖️ SO EACH ONE NAMES ITS OWN SUBJECT. The goal question is about the
 *  creator's outcome; the claims question is about the offer, and says the word
 *  "offer" rather than leaning on a pronoun. `claimsAbout` puts the real name in
 *  when it is known, because "What does Acquisition.com's roadmap actually do"
 *  is answerable and "what does it do" is a riddle.
 *
 *  ⚠️ AND THE ANSWERS ARE LOAD-BEARING, WHICH IS WHY THE WORDING MATTERS. They
 *  are merged into the brief that builds THIS script — vague questions produce
 *  vague scripts, and this form is the only place some of these facts exist. */
const ASK: Record<ReadinessField, string> = {
  goal: 'What should this video do FOR YOU? (grow audience, get leads, sell something, build authority)',
  audience: 'Who is this video for?',
  angle: 'What is this video about?',
  offer: 'Which product or offer should this video point at?',
  relationship: 'What is your relationship to it — do you own it, earn from it, are you paid to feature it, or are you just covering it?',
  cta: 'What should viewers do after watching?',
  claims: 'What does the OFFER do? Specific features, numbers or outcomes this video is allowed to state.',
  referenceTransfer: '',
}

/** The claims question with the offer's real name in it, when we know it.
 *
 *  ⚖️ FALLS BACK TO THE GENERIC WORDING rather than inventing a name — a
 *  question naming the wrong product is worse than one naming none. */
export function claimsQuestionFor(offer?: string | null): string {
  const name = typeof offer === 'string' ? offer.trim() : ''
  if (!name || name.toLowerCase() === 'unspecified' || name.length > 60) return ASK.claims
  return `What does ${name} actually do? Specific features, numbers or outcomes this video is allowed to state.`
}

/**
 * Decide, per field, whether this specific video can be written confidently.
 *
 * ⚠️ THE ASYMMETRY THAT MAKES THIS SAFE: a field is only ever escalated to
 * MISSING_REQUIRED when guessing it would produce a CLAIM — something said in
 * the creator's voice about their product, their commercial tie, or what a
 * viewer should buy. Everything else degrades to INFERRED_BUT_SAFE, because a
 * wrong guess about tone costs a rewrite and a wrong guess about ownership
 * costs a disclosure violation.
 */
export function assessReadiness(input: ReadinessInputs): ReadinessVerdict {
  const goal = typeof input.goal === 'string' ? input.goal.toLowerCase() : ''
  const commercial = [...COMMERCIAL_GOALS].some((g) => goal.includes(g))
  // Something is being promoted if the creator named it, OR if the goal says a
  // sale is the point. The second half matters: "make a video selling this"
  // with no offer on file is precisely the case that must ask rather than write.
  const promoting = present(input.offer) || commercial

  const v: FieldVerdict[] = []
  const put = (field: ReadinessField, state: ReadinessState) =>
    v.push({ field, state, question: state === 'MISSING_REQUIRED' ? (ASK[field] || null) : null })

  // GOAL — always required. Everything below reads it, so a wrong guess here
  // mis-shapes every other decision rather than one line.
  put('goal', present(input.goal) ? 'RESOLVED' : 'MISSING_REQUIRED')

  // AUDIENCE — inferable when there is a back catalogue to infer from. Being
  // wrong costs register, not truth.
  put('audience', present(input.audience)
    ? 'RESOLVED'
    : input.hasCreatorKnowledge ? 'INFERRED_BUT_SAFE' : 'MISSING_REQUIRED')

  // ANGLE — the subject. Without it there is no video, and nothing else can
  // supply it: a reference gives a SHAPE, never a topic.
  put('angle', present(input.angle) ? 'RESOLVED' : 'MISSING_REQUIRED')

  // OFFER — only when something is being promoted. An explainer needs none, and
  // asking for one is the questionnaire this exists to avoid.
  put('offer', !promoting
    ? 'RESOLVED'
    : present(input.offer) ? 'RESOLVED' : 'MISSING_REQUIRED')

  // RELATIONSHIP — the field every claim rule reads. ⚖️ NEVER INFERRED. Silence
  // is not "no tie": an undisclosed affiliate link is a legal problem, and a
  // guess of REVIEW_ONLY would forbid a founder from mentioning their own
  // product. Both directions are expensive, so neither is guessed.
  put('relationship', !promoting
    ? 'RESOLVED'
    : RELATIONSHIPS.has(String(input.relationship ?? '')) ? 'RESOLVED' : 'MISSING_REQUIRED')

  // CTA — for a commercial video the ask IS the video, so a guess is a guess at
  // the point of it. Otherwise engagement is a safe, honest default.
  put('cta', present(input.cta)
    ? 'RESOLVED'
    : commercial ? 'MISSING_REQUIRED' : 'INFERRED_BUT_SAFE')

  // CLAIMS — what the script may say about the offer. `[]` is a real answer
  // ("nothing was supplied") and it is NOT sufficient to promote something:
  // that is the exact state that produced 70 invented product facts.
  put('claims', !promoting
    ? 'RESOLVED'
    : input.productFacts != null && input.productFacts.length > 0
      ? 'RESOLVED'
      : 'MISSING_REQUIRED')

  // REFERENCE TRANSFER — decidable by us, never by the creator, so it has no
  // question. It degrades rather than blocks: writing in the creator's own
  // shape is a legitimate product, and the caller already refuses an UNREAD
  // reference before this point.
  put('referenceTransfer', input.referenceRead === true ? 'RESOLVED' : 'INFERRED_BUT_SAFE')

  const missing = v.filter((f) => f.state === 'MISSING_REQUIRED')
  // ⚖️ ORDERED BY WHAT UNBLOCKS THE MOST. `goal` and `offer` change what every
  // other field means, so they are asked first; a creator who abandons after
  // two questions should have answered the two that mattered.
  const ORDER: ReadinessField[] = ['goal', 'offer', 'angle', 'relationship', 'cta', 'claims', 'audience']
  const questions = missing
    .slice()
    .sort((a, b) => ORDER.indexOf(a.field) - ORDER.indexOf(b.field))
    .map((f) => f.question)
    .filter((q): q is string => typeof q === 'string' && q !== '')
    .slice(0, 3)

  return { fields: v, blocked: missing.length > 0, questions }
}

// ── THE OTHER HALF: A QUESTION THAT SHOULD NEVER HAVE REACHED THE SCRIPT ─────
//
// ⚖️ THE DISTINCTION THAT MATTERS. A rhetorical question is the oldest hook in
// short-form; 26% of 1,436 real beat lines contain a question mark.
//
//     "Why are founders still paying for this?"      ← fine, and common
//     "What does your product actually do?"          ← the planner failed
//
// The second is addressed to the CREATOR about their own inputs.
//
// ⚠️ I TRIED TO DECIDE THAT LINGUISTICALLY AND IT DOES NOT WORK. The pattern
// was `(what|which|who) … your (product|audience|business) … ?`, and run over
// the same 1,436 lines it flagged exactly two, BOTH FALSE:
//
//     "What's the one AI tool you can't live without for your business?"
//     "So, how are you providing value in your business right now?"
//
// Those are engagement CTAs. "Your" is ambiguous between the viewer and the
// creator, and no amount of tightening fixes an ambiguity in the language
// itself — this is the sell-pattern mistake (`buy ` flagging "never buy this")
// arriving one layer up, and a false positive here REFUNDS A GOOD SCRIPT.
//
// ⚖️ SO IT IS DECIDED BY AUTHORSHIP, NOT BY GRAMMAR. Every discovery question
// that can appear in a script is one WE wrote — the escalation text below. A
// question the model invented is a hook. That is exact, it cannot drift, and it
// is the only version of this check that is true.

/** The escalation text this system itself writes. Exact, because we author it —
 *  and the ONLY way a discovery question can reach a script, now that the
 *  readiness check refuses to generate one when the inputs are missing. */
const OUR_ESCALATIONS: readonly string[] = [
  'this beat needs a real detail about your product',
  'this beat describes your product in a way the supplied details do not cover',
  'only you can supply this',
  'nothing on record supports this beat',
  'this beat only works as something you have personally done',
]

/**
 * Lines that ask the CREATOR for context the planner should already hold.
 *
 * ⚠️ NOT "questions in scripts". A hook that asks the VIEWER something is the
 * product working — 26% of real beat lines carry a question mark. What must
 * never ship is a line asking the creator what their own product does.
 */
export function discoveryQuestions(lines: readonly string[]): number[] {
  const out: number[] = []
  lines.forEach((raw, i) => {
    const s = String(raw ?? '')
    const lower = s.toLowerCase()
    if (OUR_ESCALATIONS.some((e) => lower.includes(e))) out.push(i)
  })
  return out
}

/**
 * Did generation produce something worth charging for?
 *
 * ⚖️ THE INCENTIVE THIS SETS, DELIBERATELY. Without it, engineering tolerates a
 * bad generation because the model returned tokens. The rule is that a script
 * the creator cannot film is not a delivery, whatever it cost us to produce.
 */
export function isBillableScript(
  lines: readonly string[],
  /** Beats the writer itself marked as unanswerable. */
  needsUserBeats = 0,
): { billable: boolean; reason: string | null; discovery: number[] } {
  const discovery = discoveryQuestions(lines)
  if (discovery.length > 0) {
    return { billable: false, reason: 'script_asks_creator_for_context', discovery }
  }
  // ⚖️ A THRESHOLD, NOT A ZERO. One beat the creator must personalise is a
  // reasonable script with a gap in it; half the beats is a form. 40% mirrors
  // the density the edge already logs as `script_mostly_questions`.
  if (lines.length > 0 && needsUserBeats / lines.length >= 0.4) {
    return { billable: false, reason: 'script_mostly_questions', discovery }
  }
  return { billable: true, reason: null, discovery }
}
